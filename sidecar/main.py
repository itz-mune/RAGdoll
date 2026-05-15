"""RAGdoll sidecar — FastAPI server on localhost:8765."""
from contextlib import asynccontextmanager
import asyncio
import csv
import hashlib
import io
import json
import time
import uuid
from pathlib import Path
from typing import Optional, List

import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from db import ConversationModel, ConversationSummary, MessageModel, engine, init_db


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[RAGdoll] Sidecar starting on port 8765")
    init_db()
    print("[RAGdoll] Database initialised")
    # Delete temporary document chunks left over from the previous session
    asyncio.create_task(_cleanup_temp_docs())
    # Warm up embedding model in background so first request isn't slow
    asyncio.create_task(_warm_embed_model())
    yield
    print("[RAGdoll] Sidecar shutting down")


async def _cleanup_temp_docs():
    try:
        from memory.store import cleanup_temp_documents
        await asyncio.to_thread(cleanup_temp_documents)
    except Exception as exc:
        print(f"[RAGdoll] Temp doc cleanup failed: {exc}")


async def _warm_embed_model():
    try:
        await asyncio.to_thread(_load_embed_model)
        print("[RAGdoll] Embedding model ready")
    except Exception as exc:
        print(f"[RAGdoll] Embedding model load failed: {exc}")


def _load_embed_model():
    from memory.store import get_embed_model
    get_embed_model()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="RAGdoll Sidecar", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    display_message: Optional[str] = None
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    file_names: List[str] = []
    response_style: str = "normal"
    has_response_style: bool = False


class FileProcessRequest(BaseModel):
    store_permanently: bool = False


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
async def process_files(
    files: List[UploadFile] = File(...),
    store_permanently: bool = Query(default=False),
) -> dict:
    results = []
    for upload in files:
        filename = upload.filename or "unknown"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        raw_bytes = await upload.read()
        content: str = ""
        error: Optional[str] = None
        chunks_stored: int = 0

        try:
            if ext in ("txt", "md"):
                content = raw_bytes.decode("utf-8", errors="replace")
            elif ext == "pdf":
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(io.BytesIO(raw_bytes))
                    content = "\n\n".join(page.extract_text() or "" for page in reader.pages)
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

            if content and not error:
                # Always save raw bytes to disk so the document viewer can render the file.
                from memory.store import _db_path
                files_dir = Path(_db_path()) / "files"
                files_dir.mkdir(parents=True, exist_ok=True)
                (files_dir / filename).write_bytes(raw_bytes)

                # Always index chunks in LanceDB so RAG retrieval and source highlights work.
                # Chat attachments are marked is_temporary=True — they are excluded from the
                # Memory Browser document list and deleted on next sidecar startup.
                file_hash = hashlib.sha256(raw_bytes).hexdigest()
                from memory.store import write_document
                chunks_stored = await asyncio.to_thread(
                    write_document, filename, content, file_hash,
                    not store_permanently,  # is_temporary
                )

        except Exception as exc:
            error = str(exc)

        results.append({
            "filename": filename,
            "content": content,
            "char_count": len(content),
            "error": error,
            "chunks_stored": chunks_stored,
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
    # Also remove vector memory for this conversation
    try:
        from memory.store import delete_conversation_memory
        await asyncio.to_thread(delete_conversation_memory, conversation_id)
    except Exception:
        pass
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
# Memory endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/memory/stats")
async def memory_stats() -> dict:
    from memory.store import get_memory_stats
    return await asyncio.to_thread(get_memory_stats)


@app.get("/memory/search")
async def memory_search(
    q: str = Query(...),
    limit: int = Query(default=20, le=50),
) -> list:
    from memory.store import search_all_memory
    return await asyncio.to_thread(search_all_memory, q, limit)


@app.get("/memory/documents")
async def list_documents() -> list:
    from memory.store import get_document_list
    return await asyncio.to_thread(get_document_list)


@app.delete("/memory/chunks/{chunk_id}")
async def delete_memory_chunk(chunk_id: str) -> dict:
    from memory.store import delete_memory
    await asyncio.to_thread(delete_memory, chunk_id)
    return {"status": "deleted", "id": chunk_id}


@app.delete("/memory/documents/{filename}")
async def delete_document_endpoint(filename: str) -> dict:
    from memory.store import delete_document
    await asyncio.to_thread(delete_document, filename)
    return {"status": "deleted", "filename": filename}


@app.get("/memory/documents/{filename}/text")
async def get_document_text_endpoint(filename: str) -> dict:
    from memory.store import get_document_text, _db_path

    # Try LanceDB first (permanently stored docs have chunks there)
    result = await asyncio.to_thread(get_document_text, filename)
    if result:
        return result

    # Fall back to raw bytes saved during any /files/process call
    file_path = Path(_db_path()) / "files" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found on disk")

    try:
        raw_bytes = file_path.read_bytes()
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        content = ""

        if ext in ("txt", "md"):
            content = raw_bytes.decode("utf-8", errors="replace")
        elif ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw_bytes))
            content = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        elif ext == "docx":
            from docx import Document as DocxDocument
            doc = DocxDocument(io.BytesIO(raw_bytes))
            content = "\n".join(para.text for para in doc.paragraphs)
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
            content = json.dumps(json.loads(decoded), indent=2, ensure_ascii=False)

        if not content:
            raise HTTPException(status_code=422, detail=f"Could not extract text from .{ext} file")

        return {"filename": filename, "text": content, "chunk_count": 0}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {exc}")


@app.get("/memory/documents/{filename}/file")
async def get_document_file(filename: str) -> FileResponse:
    from memory.store import _db_path
    file_path = Path(_db_path()) / "files" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), filename=filename)


@app.get("/memory/recent")
async def memory_recent(limit: int = Query(default=20, le=50)) -> list:
    from memory.store import get_recent_memories
    return await asyncio.to_thread(get_recent_memories, limit)


@app.get("/memory/conversations")
async def memory_conversations() -> list:
    from memory.store import get_memory_by_conversation
    return await asyncio.to_thread(get_memory_by_conversation)


@app.post("/memory/compact")
async def compact_memory(background_tasks: BackgroundTasks) -> dict:
    from memory.compactor import run_full_compaction
    stats = await run_full_compaction()
    return {"status": "ok", "stats": stats}


@app.delete("/memory/all")
async def clear_all_memory() -> dict:
    from memory.store import clear_all_semantic_memory
    await asyncio.to_thread(clear_all_semantic_memory)
    return {"status": "cleared"}


# ══════════════════════════════════════════════════════════════════════════════
# Plugin endpoints
# ══════════════════════════════════════════════════════════════════════════════

class PluginInstallRequest(BaseModel):
    id: str
    files: list[dict]  # [{ path: str, content: str }]


class PluginConfigRequest(BaseModel):
    config: dict


@app.get("/plugins")
async def list_plugins() -> dict:
    from plugins.loader import get_all_plugins
    from plugins.state import get_plugin_state
    plugins = await asyncio.to_thread(get_all_plugins)
    state = await asyncio.to_thread(get_plugin_state)
    return {
        "plugins": [p.to_dict() for p in plugins],
        "active_style": state.active_style,
    }


@app.post("/plugins/{plugin_id}/enable")
async def enable_plugin_endpoint(plugin_id: str) -> dict:
    from plugins.loader import enable_plugin
    await asyncio.to_thread(enable_plugin, plugin_id)
    return {"status": "enabled", "id": plugin_id}


@app.post("/plugins/{plugin_id}/disable")
async def disable_plugin_endpoint(plugin_id: str) -> dict:
    from plugins.loader import disable_plugin
    await asyncio.to_thread(disable_plugin, plugin_id)
    return {"status": "disabled", "id": plugin_id}


@app.post("/plugins/{plugin_id}/uninstall")
async def uninstall_plugin_endpoint(plugin_id: str) -> dict:
    from plugins.loader import uninstall_plugin
    await asyncio.to_thread(uninstall_plugin, plugin_id)
    return {"status": "uninstalled", "id": plugin_id}


@app.post("/plugins/{plugin_id}/config")
async def set_plugin_config_endpoint(plugin_id: str, body: PluginConfigRequest) -> dict:
    from plugins.state import set_plugin_config
    await asyncio.to_thread(set_plugin_config, plugin_id, body.config)
    return {"status": "ok"}


@app.post("/plugins/style/{plugin_id}/activate")
async def activate_style(plugin_id: str) -> dict:
    from plugins.state import set_active_style
    await asyncio.to_thread(set_active_style, plugin_id)
    return {"status": "activated", "id": plugin_id}


@app.post("/plugins/style/clear")
async def clear_style() -> dict:
    from plugins.state import set_active_style
    await asyncio.to_thread(set_active_style, None)
    return {"status": "cleared"}


@app.post("/plugins/install")
async def install_plugin_endpoint(body: PluginInstallRequest) -> dict:
    try:
        from plugins.loader import install_plugin
        await asyncio.to_thread(install_plugin, body.id, body.files)
        return {"success": True, "error": None}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ══════════════════════════════════════════════════════════════════════════════
# Chat streaming
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/chat/stream")
async def chat_stream(request: ChatStreamRequest):
    async def generate():
        with Session(engine) as db:
            async for chunk in _stream_response(
                db=db,
                conversation_id=request.conversation_id,
                user_message=request.message,
                display_message=request.display_message,
                provider=request.provider,
                api_key=request.api_key or "",
                model=request.model,
                file_names=request.file_names,
                response_style=request.response_style,
                has_response_style=request.has_response_style,
            ):
                yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _store_memory(
    conversation_id: str,
    message_id: str,
    text: str,
    role: str,
    importance_override,
) -> None:
    try:
        from memory.store import write_memory
        ids = await asyncio.to_thread(
            write_memory, conversation_id, message_id, text, role, importance_override
        )
        print(f"[Memory] Stored {len(ids)} chunk(s) for {role} msg {message_id[:8]}")
    except Exception as exc:
        import traceback
        print(f"[Memory] write_memory failed ({role}): {exc}")
        traceback.print_exc()


async def _stream_response(
    db: Session,
    conversation_id: str,
    user_message: str,
    display_message: Optional[str],
    provider: str,
    api_key: str,
    model: Optional[str],
    file_names: List[str] = None,
    response_style: str = "normal",
    has_response_style: bool = False,
):
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    try:
        now = int(time.time() * 1000)
        conv = db.get(ConversationModel, conversation_id)
        if not conv:
            yield _sse({"type": "error", "message": f"Conversation {conversation_id!r} not found"})
            return

        # 1. History (last 10 turns before this message)
        history = db.exec(
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation_id)
            .order_by(MessageModel.created_at.desc())
            .limit(10)
        ).all()
        history.reverse()

        # 2. Save user message
        user_msg_id = str(uuid.uuid4())
        db.add(MessageModel(
            id=user_msg_id,
            conversation_id=conversation_id,
            role="user",
            content=user_message,
            display_content=display_message if display_message is not None else user_message,
            attached_file_names=json.dumps(file_names or []) if file_names else None,
            created_at=now,
        ))
        db.commit()

        # 3. Async write user message to memory (fire-and-forget)
        from memory.selective_storage import storage_decision
        user_storage = storage_decision(user_message, "user")
        if user_storage["should_store"]:
            asyncio.create_task(_store_memory(
                conversation_id, user_msg_id, user_message, "user",
                user_storage["importance_override"],
            ))

        # 4. Retrieve relevant context
        from memory.retriever import retrieve_context
        # Use the display message (user's typed question only) for retrieval —
        # user_message may contain thousands of chars of injected file content
        # which overwhelms the 512-token embedding and ruins similarity scores.
        retrieval_query = display_message if display_message else user_message
        retrieval = await retrieve_context(retrieval_query, conversation_id)

        # 5. Load conversation summary (if compacted)
        summary = _get_conversation_summary(db, conversation_id)

        # 6. Load plugin skills and style
        from plugins.loader import get_active_style, get_enabled_skills
        plugin_tools = await asyncio.to_thread(get_enabled_skills)
        active_style = await asyncio.to_thread(get_active_style)

        # 6b. Build system prompt
        from graph.agent import get_style_contract
        from memory.prompt_builder import build_system_prompt
        style_suffix = get_style_contract(response_style) if has_response_style else ""
        # Prepend style plugin prompt prefix if one is active
        if active_style and active_style.get("system_prompt_prefix"):
            style_suffix = active_style["system_prompt_prefix"] + "\n\n" + style_suffix
        system_prompt_text = build_system_prompt(retrieval, summary, style_suffix)

        # 7. Build LangChain message list
        known_files: list = file_names or []
        lc_messages = [SystemMessage(content=system_prompt_text)]
        for m in history:
            if m.role == "user":
                lc_messages.append(HumanMessage(content=m.content))
            elif m.role == "assistant":
                lc_messages.append(AIMessage(content=m.content))
        lc_messages.append(HumanMessage(content=user_message))

        # 8. Emit memory context event before the answer
        if retrieval.chunks:
            yield _sse({
                "type": "memory",
                "chunks": [
                    {
                        "id": c.id,
                        "text": c.text[:1400],
                        "score": round(c.score, 3),
                        "source": c.source,
                    }
                    for c in retrieval.chunks
                ],
                "semantic": retrieval.semantic_count,
                "docs": retrieval.document_count,
            })

        # 9. Build graph and run — concurrently drain an event_queue for early SSE signals
        from graph.agent import build_chat_graph, get_style_contract as _gsc
        event_queue: asyncio.Queue = asyncio.Queue()
        graph = build_chat_graph(
            provider, api_key, model, response_style, has_response_style,
            tools=plugin_tools if plugin_tools else None,
            event_queue=event_queue,
        )
        initial_state = {
            "messages": lc_messages,
            "has_style": has_response_style,
            "style": response_style,
            "style_contract": _gsc(response_style),
            "original_answer": "",
            "styled_answer": "",
            "final_answer": "",
            "thinking_content": "",
            "tool_calls_made": [],
            "style_score": 0.0,
            "style_feedback": "",
            "style_iteration": 0,
            "max_style_iterations": 5,
        }

        full_content = ""
        assistant_msg_id = str(uuid.uuid4())
        thinking_content = ""

        # Run graph as a background task so we can concurrently drain event_queue.
        # This lets tool_use SSE fire the moment the LLM decides to call a tool —
        # rather than waiting for the whole graph to finish.
        final_state_box: list = [initial_state]

        async def _run_graph():
            async for state in graph.astream(initial_state, stream_mode="values"):
                final_state_box[0] = state

        graph_task = asyncio.create_task(_run_graph())

        # Drain queue while graph runs; yield any early events (tool_use) immediately.
        while not graph_task.done():
            try:
                event = event_queue.get_nowait()
                yield _sse(event)
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.02)

        # Propagate any graph exception
        await graph_task

        # Drain any remaining events that arrived after graph_task finished
        while not event_queue.empty():
            yield _sse(event_queue.get_nowait())

        final_state = final_state_box[0]
        full_content = final_state.get("final_answer", "")
        thinking_content = final_state.get("thinking_content", "")
        tool_calls_made: list = final_state.get("tool_calls_made", [])
        if not full_content:
            messages_list = final_state.get("messages", [])
            if messages_list:
                last = messages_list[-1]
                raw = last.content if hasattr(last, "content") else ""
                full_content = _message_content_to_text(raw)

        # 9b. tool_use was already emitted early via event_queue above.
        # No need to emit again — skip duplicate emission.

        # 9c. Emit thinking content if present
        if thinking_content:
            yield _sse({"type": "thinking", "content": thinking_content, "is_partial": False})
            yield _sse({"type": "thinking_done"})

        # 10. Stream response chunks
        for content_chunk in _chunk_for_display(full_content):
            yield _sse({"type": "chunk", "content": content_chunk})
            await asyncio.sleep(0.015)

        # 11. Citations — always surface every attached file + doc-memory sources
        citation_set: set[str] = set(known_files or [])
        for c in retrieval.chunks:
            if c.source != "conversation":
                citation_set.add(c.source)
        citations = sorted(citation_set)

        if citations:
            yield _sse({"type": "citations", "citations": citations})

        # 12. Persist assistant message
        db.add(MessageModel(
            id=assistant_msg_id,
            conversation_id=conversation_id,
            role="assistant",
            content=full_content,
            created_at=int(time.time() * 1000),
            memory_chunks=json.dumps([
                {"id": c.id, "text": c.text[:1400], "score": c.score, "source": c.source}
                for c in retrieval.chunks
            ]) if retrieval.chunks else None,
            citations=json.dumps(citations) if citations else None,
            tool_calls_made=json.dumps(tool_calls_made) if tool_calls_made else None,
        ))
        conv.message_count += 2
        conv.updated_at = int(time.time() * 1000)
        db.add(conv)
        db.commit()

        # 13. Store assistant response in memory
        asst_storage = storage_decision(full_content, "assistant")
        if asst_storage["should_store"]:
            asyncio.create_task(_store_memory(
                conversation_id, assistant_msg_id, full_content, "assistant",
                asst_storage["importance_override"],
            ))

        # 14. Auto-title on first exchange
        if conv.message_count == 2 and conv.title in ("New conversation", ""):
            auto_title = await _generate_title(provider, api_key, model, user_message)
            if auto_title:
                conv.title = auto_title
                db.add(conv)
                db.commit()
                yield _sse({"type": "title", "title": auto_title})

        # 15. Schedule compaction check
        from memory.compactor import record_message_time, maybe_compact
        record_message_time(conversation_id)
        asyncio.create_task(maybe_compact(conversation_id))

        yield _sse({"type": "done", "messageId": assistant_msg_id})

    except Exception as exc:
        print(f"[RAGdoll] Stream error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _message_content_to_text(raw) -> str:
    if isinstance(raw, list):
        return "".join(
            block.get("text", "")
            for block in raw
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return raw if isinstance(raw, str) else str(raw or "")


def _chunk_for_display(text: str, target_size: int = 28):
    if not text:
        return
    start = 0
    while start < len(text):
        end = min(start + target_size, len(text))
        if end < len(text):
            boundary = max(text.rfind(" ", start, end), text.rfind("\n", start, end))
            if boundary > start + 8:
                end = boundary + 1
        yield text[start:end]
        start = end


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
        "displayContent": m.display_content,
        "attachedFileNames": json.loads(m.attached_file_names) if m.attached_file_names else None,
        "createdAt": m.created_at,
        "isStreaming": False,
        "memoryChunks": json.loads(m.memory_chunks) if m.memory_chunks else None,
        "citations": json.loads(m.citations) if m.citations else None,
        "toolCallsMade": json.loads(m.tool_calls_made) if m.tool_calls_made else None,
    }


def _get_conversation_summary(db: Session, conversation_id: str) -> Optional[str]:
    summary = db.exec(
        select(ConversationSummary)
        .where(ConversationSummary.conversation_id == conversation_id)
        .order_by(ConversationSummary.created_at.desc())
        .limit(1)
    ).first()
    return summary.summary_text if summary else None


async def _generate_title(
    provider: str, api_key: str, model: Optional[str], user_message: str
) -> str:
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
                    subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, timeout=5)
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
    from config import get_sidecar_host, get_sidecar_port
    port = get_sidecar_port()
    host = get_sidecar_host()
    _free_port(port)
    uvicorn.run(app, host=host, port=port, log_level="info")
