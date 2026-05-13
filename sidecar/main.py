"""RAGdoll sidecar — FastAPI server on localhost:8765."""
from contextlib import asynccontextmanager
import asyncio
import csv
import io
import json
import time
import uuid
from typing import Optional, List

import uvicorn
from fastapi import Depends, FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

# Local imports — ALL at the top so route registration never fails
from db import ConversationModel, MessageModel, engine, init_db
# NOTE: graph.agent is imported lazily inside _stream_response so that any
# LangGraph/provider import error never blocks the REST endpoints.


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[RAGdoll] Sidecar starting on port 8765")
    init_db()
    print("[RAGdoll] Database initialised")
    yield
    print("[RAGdoll] Sidecar shutting down")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="RAGdoll Sidecar", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── DB dependency (safe for regular endpoints) ────────────────────────────────

def get_db():
    with Session(engine) as session:
        yield session


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SettingsValidationRequest(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None


class ConversationCreate(BaseModel):
    title: str
    provider: str
    model: str


class ConversationUpdate(BaseModel):
    title: str


class ChatStreamRequest(BaseModel):
    conversation_id: str
    message: str
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    file_names: List[str] = []


# ══════════════════════════════════════════════════════════════════════════════
# Health
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


# ══════════════════════════════════════════════════════════════════════════════
# Settings / API-key validation
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/settings/validate")
async def validate_settings(request: SettingsValidationRequest) -> dict:
    """Validate an API key by making a cheap test request to the provider."""
    provider = request.provider.lower()
    api_key = request.api_key
    model = request.model

    try:
        if provider == "openai":
            return await _validate_openai(api_key)
        elif provider == "anthropic":
            return await _validate_anthropic(api_key)
        elif provider == "groq":
            return await _validate_groq(api_key)
        elif provider == "google":
            return await _validate_google(api_key)
        elif provider == "huggingface":
            if not model:
                return {"valid": False, "error": "Model ID required for HuggingFace"}
            return await _validate_huggingface(api_key, model)
        elif provider == "openrouter":
            if not model:
                return {"valid": False, "error": "Model slug required for OpenRouter"}
            return await _validate_openrouter(api_key, model)
        elif provider == "ollama":
            return await _validate_ollama(api_key)
        else:
            return {"valid": False, "error": f"Unknown provider: {provider}"}
    except Exception as exc:
        return {"valid": False, "error": str(exc)}


async def _validate_openai(api_key: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
        if r.status_code == 200:
            return {"valid": True, "error": None}
        if r.status_code == 401:
            return {"valid": False, "error": "Invalid API key"}
        return {"valid": False, "error": f"OpenAI error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_anthropic(api_key: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                timeout=10,
            )
        if r.status_code == 200:
            return {"valid": True, "error": None}
        if r.status_code == 401:
            return {"valid": False, "error": "Invalid API key"}
        return {"valid": False, "error": f"Anthropic error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_groq(api_key: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
        if r.status_code == 200:
            return {"valid": True, "error": None}
        if r.status_code == 401:
            return {"valid": False, "error": "Invalid API key"}
        return {"valid": False, "error": f"Groq error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_google(api_key: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
                timeout=10,
            )
        if r.status_code == 200:
            return {"valid": True, "error": None}
        if r.status_code in (400, 401):
            return {"valid": False, "error": "Invalid API key"}
        return {"valid": False, "error": f"Google error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_huggingface(api_key: str, model: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://api-inference.huggingface.co/models/{model}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
        if r.status_code == 200:
            return {"valid": True, "error": None}
        if r.status_code == 401:
            return {"valid": False, "error": "Invalid HuggingFace token"}
        if r.status_code == 404:
            return {"valid": False, "error": "Model not found"}
        if r.status_code == 403:
            return {"valid": False, "error": "Model requires a Pro subscription"}
        return {"valid": False, "error": f"HuggingFace error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_openrouter(api_key: str, model: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
        if r.status_code == 401:
            return {"valid": False, "error": "Invalid OpenRouter key"}
        if r.status_code != 200:
            return {"valid": False, "error": f"OpenRouter error {r.status_code}"}
        model_ids = [m.get("id") for m in r.json().get("data", [])]
        if model not in model_ids:
            return {"valid": False, "error": "Model not found on OpenRouter"}
        return {"valid": True, "error": None}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


async def _validate_ollama(base_url: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{base_url}/api/tags", timeout=10)
        if r.status_code == 200:
            return {"valid": True, "error": None}
        return {"valid": False, "error": f"Ollama error {r.status_code}"}
    except Exception as exc:
        return {"valid": False, "error": f"Connection error: {exc}"}


# ══════════════════════════════════════════════════════════════════════════════
# File processing
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/files/process")
async def process_files(files: List[UploadFile] = File(...)) -> dict:
    """
    Accept multipart-uploaded files, extract plain text from each, and return
    the results.  Files are NOT persisted — extraction is in-memory only.
    Permanent embedding / storage happens in Task 5 (memory engine).

    Supported formats: .txt .md .pdf .docx .csv .json
    """
    results = []
    for upload in files:
        filename = upload.filename or "unknown"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        raw_bytes = await upload.read()
        content: str = ""
        error: Optional[str] = None

        try:
            if ext in ("txt", "md"):
                content = raw_bytes.decode("utf-8", errors="replace")

            elif ext == "pdf":
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(io.BytesIO(raw_bytes))
                    content = "\n\n".join(
                        page.extract_text() or "" for page in reader.pages
                    )
                except ImportError:
                    error = "pypdf not installed — run: uv add pypdf"

            elif ext == "docx":
                try:
                    from docx import Document
                    doc = Document(io.BytesIO(raw_bytes))
                    content = "\n".join(para.text for para in doc.paragraphs)
                except ImportError:
                    error = "python-docx not installed — run: uv add python-docx"

            elif ext == "csv":
                text = raw_bytes.decode("utf-8", errors="replace")
                reader_csv = csv.reader(io.StringIO(text))
                rows = list(reader_csv)
                if rows:
                    header = " | ".join(rows[0])
                    sep = " | ".join(["---"] * len(rows[0]))
                    body = "\n".join(" | ".join(row) for row in rows[1:])
                    content = f"{header}\n{sep}\n{body}"

            elif ext == "json":
                decoded = raw_bytes.decode("utf-8", errors="replace")
                parsed = json.loads(decoded)
                content = json.dumps(parsed, indent=2, ensure_ascii=False)

            else:
                error = f"Unsupported file type: .{ext}"

        except Exception as exc:
            error = str(exc)

        results.append({
            "filename": filename,
            "content": content,
            "char_count": len(content),
            "error": error,
        })

    return {"files": results}


# ══════════════════════════════════════════════════════════════════════════════
# Conversations
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/conversations")
async def create_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
) -> dict:
    now = int(time.time() * 1000)
    conv = ConversationModel(
        id=str(uuid.uuid4()),
        title=body.title,
        provider=body.provider,
        model=body.model,
        created_at=now,
        updated_at=now,
        message_count=0,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conv_dict(conv)


@app.get("/conversations")
async def list_conversations(db: Session = Depends(get_db)) -> list:
    convs = db.exec(
        select(ConversationModel).order_by(ConversationModel.updated_at.desc())
    ).all()
    return [_conv_dict(c) for c in convs]


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
) -> dict:
    conv = db.get(ConversationModel, conversation_id)
    if not conv:
        return {"error": "Not found"}
    msgs = db.exec(
        select(MessageModel).where(MessageModel.conversation_id == conversation_id)
    ).all()
    for m in msgs:
        db.delete(m)
    db.delete(conv)
    db.commit()
    return {"status": "deleted"}


@app.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
) -> list:
    msgs = db.exec(
        select(MessageModel)
        .where(MessageModel.conversation_id == conversation_id)
        .order_by(MessageModel.created_at)
    ).all()
    return [_msg_dict(m) for m in msgs]


@app.post("/conversations/{conversation_id}/title")
async def update_title(
    conversation_id: str,
    body: ConversationUpdate,
    db: Session = Depends(get_db),
) -> dict:
    conv = db.get(ConversationModel, conversation_id)
    if not conv:
        return {"error": "Not found"}
    conv.title = body.title
    conv.updated_at = int(time.time() * 1000)
    db.add(conv)
    db.commit()
    return {"status": "updated"}


# ══════════════════════════════════════════════════════════════════════════════
# Chat streaming  (LangGraph)
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = (
    "You are RAGdoll, a helpful AI assistant with access to the user's "
    "documents and conversation history. Provide clear, concise, and accurate responses."
)

SYSTEM_PROMPT_WITH_FILES = (
    "You are RAGdoll, a helpful AI assistant with access to the user's "
    "documents and conversation history. Provide clear, concise, and accurate responses. "
    "When you reference information from an attached document, you MUST cite it using "
    "the exact filename in square brackets — for example: [report.pdf] or [notes.txt]. "
    "Only cite documents you actually used. Place citations inline where relevant."
)


@app.post("/chat/stream")
async def chat_stream(request: ChatStreamRequest):
    """Stream a chat response via Server-Sent Events using a LangGraph agent."""

    async def generate():
        # Open a fresh DB session that lives for the entire stream duration.
        # Using Depends(get_db) on a StreamingResponse is unsafe — FastAPI
        # closes the injected session before the body is fully sent.
        with Session(engine) as db:
            async for chunk in _stream_response(
                db=db,
                conversation_id=request.conversation_id,
                user_message=request.message,
                provider=request.provider,
                api_key=request.api_key or "",
                model=request.model,
                file_names=request.file_names,
            ):
                yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_response(
    db: Session,
    conversation_id: str,
    user_message: str,
    provider: str,
    api_key: str,
    model: Optional[str],
    file_names: List[str] = None,
):
    """
    Core streaming generator.

    Flow:
      1. Fetch conversation history (pre-save)
      2. Save user message
      3. Build LangChain message list
      4. Run LangGraph graph, stream tokens via astream_events
      5. Save assistant message
      6. Auto-generate title on first exchange
      7. Emit SSE events: chunk | memory | title | done | error
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    try:
        now = int(time.time() * 1000)
        conv = db.get(ConversationModel, conversation_id)
        if not conv:
            yield _sse({"type": "error", "message": f"Conversation {conversation_id!r} not found"})
            return

        # 1. Grab the last 10 messages BEFORE saving the new one
        history = db.exec(
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation_id)
            .order_by(MessageModel.created_at.desc())
            .limit(10)
        ).all()
        history.reverse()

        # 2. Save the incoming user message
        user_msg_id = str(uuid.uuid4())
        db.add(MessageModel(
            id=user_msg_id,
            conversation_id=conversation_id,
            role="user",
            content=user_message,
            created_at=now,
        ))
        db.commit()

        # 3. Build LangChain message list
        memory_chunks: list = []
        known_files: list = file_names or []

        system_prompt = SYSTEM_PROMPT_WITH_FILES if known_files else SYSTEM_PROMPT
        lc_messages = [SystemMessage(content=system_prompt)]
        for m in history:
            if m.role == "user":
                lc_messages.append(HumanMessage(content=m.content))
            elif m.role == "assistant":
                lc_messages.append(AIMessage(content=m.content))
        lc_messages.append(HumanMessage(content=user_message))

        # 4. Build graph and stream tokens (lazy import keeps REST routes alive
        #    even if a provider package is missing)
        from graph.agent import build_chat_graph
        graph = build_chat_graph(provider, api_key, model)
        initial_state = {"messages": lc_messages}

        full_content = ""
        assistant_msg_id = str(uuid.uuid4())

        async for event in graph.astream_events(initial_state, version="v2"):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                raw = chunk.content if hasattr(chunk, "content") else ""

                # Some providers (e.g. Anthropic with content-block delimiters)
                # return content as a list of dicts instead of a plain string.
                # Extract the text, skipping non-text blocks.
                if isinstance(raw, list):
                    content = "".join(
                        block.get("text", "")
                        for block in raw
                        if isinstance(block, dict) and block.get("type") == "text"
                    )
                else:
                    content = raw

                if content:
                    full_content += content
                    yield _sse({"type": "chunk", "content": content})
                    await asyncio.sleep(0)  # yield control to event loop

        # 5. Extract citations from response
        import re
        citations: list = []
        if known_files and full_content:
            pattern = re.compile(r'\[([^\]]+)\]')
            mentioned = {m.lower() for m in pattern.findall(full_content)}
            citations = [f for f in known_files if f.lower() in mentioned]

        # 6. Emit memory / citations
        if memory_chunks:
            yield _sse({"type": "memory", "chunks": memory_chunks})
        if citations:
            yield _sse({"type": "citations", "citations": citations})

        # 7. Persist assistant message
        db.add(MessageModel(
            id=assistant_msg_id,
            conversation_id=conversation_id,
            role="assistant",
            content=full_content,
            created_at=int(time.time() * 1000),
            memory_chunks=json.dumps(memory_chunks) if memory_chunks else None,
            citations=json.dumps(citations) if citations else None,
        ))
        conv.message_count += 2  # user + assistant
        conv.updated_at = int(time.time() * 1000)
        db.add(conv)
        db.commit()

        # 8. Auto-generate title on first exchange using LLM
        if conv.message_count == 2 and conv.title in ("New conversation", ""):
            auto_title = await _generate_title(provider, api_key, model, user_message)
            if auto_title:
                conv.title = auto_title
                db.add(conv)
                db.commit()
                yield _sse({"type": "title", "title": auto_title})

        yield _sse({"type": "done", "messageId": assistant_msg_id})

    except Exception as exc:
        print(f"[RAGdoll] Stream error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _conv_dict(c: ConversationModel) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "provider": c.provider,
        "model": c.model,
        "createdAt": c.created_at,
        "updatedAt": c.updated_at,
        "messageCount": c.message_count,
    }


def _msg_dict(m: MessageModel) -> dict:
    return {
        "id": m.id,
        "conversationId": m.conversation_id,
        "role": m.role,
        "content": m.content,
        "createdAt": m.created_at,
        "isStreaming": False,
        "memoryChunks": json.loads(m.memory_chunks) if m.memory_chunks else None,
        "citations": json.loads(m.citations) if m.citations else None,
    }


async def _generate_title(
    provider: str, api_key: str, model: Optional[str], user_message: str
) -> str:
    """Ask the LLM for a short conversation title based on the first user message."""
    try:
        from graph.agent import get_llm
        from langchain_core.messages import HumanMessage, SystemMessage
        llm = get_llm(provider, api_key, model)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "Generate a concise 3-6 word title for a chat conversation "
                "based on the user's first message. Return only the title — "
                "no quotes, no period at the end."
            )),
            HumanMessage(content=user_message[:400]),
        ])
        raw = response.content
        if isinstance(raw, list):
            title = "".join(
                b.get("text", "") for b in raw
                if isinstance(b, dict) and b.get("type") == "text"
            )
        else:
            title = str(raw)
        return title.strip().strip('"').strip("'")[:60]
    except Exception as exc:
        print(f"[RAGdoll] Title generation failed: {exc}")
        return " ".join(user_message.strip().split()[:6])


# ── Entry point ───────────────────────────────────────────────────────────────

def _free_port(port: int) -> None:
    """
    Kill any process already listening on `port` before we bind to it.

    This prevents "address already in use" crashes when Tauri restarts the
    sidecar without successfully killing the previous one (e.g. after a crash).
    Uses only stdlib — no extra dependencies required.
    """
    import platform
    import subprocess

    system = platform.system()
    try:
        if system == "Windows":
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    pid = line.split()[-1]
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True, timeout=5,
                    )
                    print(f"[RAGdoll] Freed port {port} (killed PID {pid})")
        else:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True, timeout=5,
            )
            for pid in result.stdout.strip().splitlines():
                subprocess.run(["kill", "-9", pid], timeout=5)
                print(f"[RAGdoll] Freed port {port} (killed PID {pid})")
    except Exception as exc:
        print(f"[RAGdoll] Warning: could not free port {port}: {exc}")


if __name__ == "__main__":
    _free_port(8765)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
