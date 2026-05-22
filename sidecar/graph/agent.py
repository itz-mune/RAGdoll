"""LangGraph-based chat agent for RAGdoll — with plugin skill support and thinking extraction."""
import json
import operator
import re
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph


MAX_STYLE_ITERATIONS = 5
STYLE_PASS_SCORE = 0.86
_THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)


# ── State ────────────────────────────────────────────────────────────────────

class ChatState(TypedDict):
    """Mutable state threaded through every graph node."""

    messages: Annotated[list[BaseMessage], operator.add]
    has_style: bool
    style: str
    style_contract: str
    original_answer: str
    styled_answer: str
    final_answer: str
    thinking_content: str           # ← extracted thinking text (all formats)
    tool_calls_made: list           # ← names of tools that were called
    style_score: float
    style_feedback: str
    style_iteration: int
    max_style_iterations: int


# ── Style contracts ──────────────────────────────────────────────────────────

STYLE_CONTRACTS: dict[str, str] = {
    "concise": (
        "Style: Concise.\n"
        "RAG Instructions:\n"
        "- Prioritize high-salience document chunks that directly support the answer.\n"
        "- Filter out tangential retrieved passages; optimize for signal-to-noise ratio.\n"
        "- Include only citations where retrieval confidence is high.\n"
        "- Keep the answer focused on facts with direct empirical or documentary support.\n"
        "Hard requirements:\n"
        "- Keep the answer brief and direct.\n"
        "- Maximum 100 words unless the user explicitly asks for more.\n"
        "- Prefer 2-5 short sentences or a compact bullet list.\n"
        "- Avoid unnecessary context, examples, or caveats unless the question explicitly calls for them.\n"
        "- Avoid long tables if possible.\n"
        "- Include only the detail needed to answer the user.\n"
        "- No preamble unless it is necessary."
    ),
    "explanatory": (
        "Style: Explanatory.\n"
        "RAG Instructions:\n"
        "- Draw multi-sourced connections from retrieved documents to explain the 'why'.\n"
        "- Build semantic coherence across citations; show how evidence interlocks.\n"
        "- Weight document authority: prioritize high-confidence, well-sourced passages.\n"
        "- Include document context and cross-references where they strengthen comprehension.\n"
        "- Map the retrieval journey: show how evidence supports logical steps in reasoning.\n"
        "Hard requirements:\n"
        "- Give a fuller explanation with useful context.\n"
        "- Aim for at least 120 words when the question has substance.\n"
        "- Explain reasoning, tradeoffs, or steps when helpful.\n"
        "- Use clear structure and examples when they clarify the answer."
    ),
    "very-concise": (
        "Style: Very Concise.\n"
        "RAG Instructions:\n"
        "- Deliver only the highest-confidence retrieval result; single-source citation.\n"
        "- Maximize information density; every phrase must directly answer the query.\n"
        "- Cut all elaboration; focus on the fact's embedding-space proximity to the question.\n"
        "Hard requirements:\n"
        "- Maximum 20 words.\n"
        "- Avoid unnecessary context, examples, or caveats.\n"
        "- Avoid long tables.\n"
        "- Use 1-2 very short sentences unless the user explicitly asks for detail.\n"
        "- Include only the detail needed to answer the user.\n"
        "- Do not add examples, caveats, or extra explanation."
    ),
    "formal": (
        "Style: Formal.\n"
        "RAG Instructions:\n"
        "- Cite sources with formal precision: include document titles and dates where available.\n"
        "- Validate cross-document consistency; flag contradictions if retrieval surfaces them.\n"
        "- Use technical vocabulary aligned with domain authority.\n"
        "- Maintain academic or professional register throughout retrieved content integration.\n"
        "Hard requirements:\n"
        "- Use polished, professional English.\n"
        "- Avoid slang, casual phrasing, contractions, jokes, and emoji.\n"
        "- Keep structure clear and precise."
    ),
    "normal": (
        "Style: Normal.\n"
        "RAG Instructions:\n"
        "- Balance citation frequency and readability; ground key claims in retrieved documents.\n"
        "- Use natural language to integrate sources; avoid mechanical citation patterns.\n"
        "- Maintain semantic flow while incorporating multi-document evidence.\n"
        "- Prioritize high-salience retrieval results; omit low-confidence passages.\n"
        "Hard requirements:\n"
        "- Deliver balanced responses that blend clarity with natural conversational flow.\n"
        "- Reference attached documents when they provide relevant context or evidence.\n"
        "- Use citations to ground claims in retrieved sources, improving response credibility and traceability.\n"
        "- Maintain an accessible, engaging tone suitable for general audiences."
    ),
}


def get_style_contract(style: str | None) -> str:
    return STYLE_CONTRACTS.get((style or "normal").lower(), STYLE_CONTRACTS["normal"])


# ── LLM factory ──────────────────────────────────────────────────────────────

def get_llm(provider: str, api_key: str, model: str | None = None, streaming: bool = True):
    provider = provider.lower()

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(api_key=api_key, model=model or "gpt-4o", streaming=streaming)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=api_key,
            model=model or "claude-3-5-sonnet-20241022",
            streaming=streaming,
            model_kwargs={
                "extra_headers": {"anthropic-beta": "prompt-caching-2024-07-31"},
            },
        )

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(api_key=api_key, model=model or "llama-3.3-70b-versatile")

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model or "gemini-2.0-flash",
        )

    if provider == "huggingface":
        if not model:
            raise ValueError("Model ID required for HuggingFace")
        from langchain_huggingface import HuggingFaceEndpoint
        return HuggingFaceEndpoint(
            repo_id=model,
            huggingfacehub_api_token=api_key,
            task="text-generation",
        )

    if provider == "openrouter":
        if not model:
            raise ValueError("Model slug required for OpenRouter")
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model,
            base_url="https://openrouter.ai/api/v1",
            streaming=streaming,
            default_headers={
                "HTTP-Referer": "https://github.com/itz-mune/RAGdoll",
                "X-Title": "RAGdoll",
            },
        )

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(base_url=api_key, model=model or "mistral")

    raise ValueError(f"Unknown provider: {provider!r}")


# ── Thinking extraction helpers ───────────────────────────────────────────────

def _extract_thinking_from_content(content) -> tuple[str, str]:
    """
    Given an LLM message content (str or list of blocks), extract any thinking
    content and return (thinking_text, response_text).

    Handles:
      1. <think>...</think> tags embedded in text (DeepSeek, Qwen, local models)
      2. {"type": "thinking", "thinking": "..."} blocks (Claude extended thinking)
      3. {"type": "reasoning_content", ...} (OpenAI o1)
    """
    thinking_parts: list[str] = []
    text_parts: list[str] = []

    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "")
            if btype == "thinking":
                thinking_parts.append(block.get("thinking", ""))
            elif btype == "text":
                text = block.get("text", "")
                # also check for <think> tags inside text blocks
                thinks = _THINK_RE.findall(text)
                thinking_parts.extend(thinks)
                text_parts.append(_THINK_RE.sub("", text).strip())
            elif btype in ("reasoning_content", "reasoning"):
                thinking_parts.append(block.get("content", block.get("reasoning_content", "")))
    else:
        text = str(content or "")
        thinks = _THINK_RE.findall(text)
        thinking_parts.extend(thinks)
        text_parts.append(_THINK_RE.sub("", text).strip())

    return "\n\n".join(t.strip() for t in thinking_parts if t.strip()), \
           "\n".join(t for t in text_parts if t)


# ── Style scoring ────────────────────────────────────────────────────────────

def deterministic_style_feedback(text: str, style: str | None) -> tuple[float, str]:
    normalized = (style or "").lower()
    words = text.split()
    sentences = [s for s in text.replace("!", ".").replace("?", ".").split(".") if s.strip()]
    penalties: list[str] = []

    if normalized == "very-concise":
        if len(words) > 45:
            penalties.append("Too long: Very Concise must be at most 45 words.")
        if len(sentences) > 2:
            penalties.append("Too many sentences: Very Concise should be 1-2 sentences.")
    elif normalized == "concise":
        if len(words) > 120:
            penalties.append("Too long: Concise should stay under 120 words.")
    elif normalized == "explanatory":
        if len(words) < 90 and len(sentences) < 5:
            penalties.append("Too short: Explanatory needs more context and reasoning.")
    elif normalized == "formal":
        casual_markers = [
            " can't ", " won't ", " don't ", " it's ", " you're ", " gonna ",
            " kinda ", " yeah ", " cool ", " awesome ", " btw ", " lol ",
        ]
        padded = f" {text.lower()} "
        if any(marker in padded for marker in casual_markers):
            penalties.append("Too casual: Formal must avoid contractions and slang.")
    elif normalized == "normal":
        if len(words) < 10:
            penalties.append("Too brief: Normal should provide sufficient context.")

    score = max(0.0, 1.0 - (0.2 * len(penalties)))
    return score, "\n".join(penalties)


def parse_style_chain_output(raw: str) -> tuple[str, float, str]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        data = json.loads(cleaned)
        answer = str(data.get("answer", "")).strip()
        score = float(data.get("score", 0))
        feedback = data.get("feedback", "")
        if isinstance(feedback, list):
            feedback = "\n".join(str(item) for item in feedback if item)
        return answer or cleaned, max(0.0, min(score, 1.0)), str(feedback or "")
    except Exception:
        return cleaned, 0.55, "The style chain did not return valid JSON; retry."


# ── Tool execution helper ─────────────────────────────────────────────────────

async def _run_tool_loop(
    llm_with_tools,
    messages: list[BaseMessage],
    max_iterations: int = 5,
    event_queue=None,          # asyncio.Queue | None — receives {"type":"tool_use"} early
) -> tuple[str, str, list[BaseMessage], list[str]]:
    """
    Run an agentic tool-use loop.
    Returns (thinking, final_text, updated_messages, tool_names_used).

    When *event_queue* is provided, a {"type": "tool_use", "tools": [...]} dict is
    pushed into the queue the moment tool calls are identified — BEFORE the tools
    actually run.  This lets the SSE stream show "Using X…" immediately instead of
    only after the full graph finishes.
    """
    from langchain_core.messages import ToolMessage
    loop_messages = list(messages)
    thinking_parts: list[str] = []
    tool_names_used: list[str] = []

    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(loop_messages)
        loop_messages.append(response)

        # Extract thinking from this response
        thinking, text = _extract_thinking_from_content(response.content)
        if thinking:
            thinking_parts.append(thinking)

        # Check for tool calls
        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            # No more tool calls — done
            return "\n\n".join(thinking_parts), text or str(response.content), loop_messages, tool_names_used

        # Collect the names of every tool that's about to run
        for tc in tool_calls:
            tool_name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
            if tool_name and tool_name not in tool_names_used:
                tool_names_used.append(tool_name)

        # ↑ Signal the SSE queue NOW — tools haven't run yet but we know their names.
        # The frontend will immediately swap "..." → "Using Web Search…".
        if event_queue is not None:
            await event_queue.put({"type": "tool_use", "tools": list(tool_names_used)})

        # Execute each tool call
        for tc in tool_calls:
            tool_name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
            tool_args = tc.get("args", {}) if isinstance(tc, dict) else getattr(tc, "args", {})
            tool_id = tc.get("id", "") if isinstance(tc, dict) else getattr(tc, "id", "")
            result = f"Tool {tool_name!r} not found."
            try:
                from plugins.loader import get_enabled_skills
                # Attach the SSE queue to the event bus so tools can emit mid-stream events
                try:
                    from plugins.events import set_event_queue
                    set_event_queue(event_queue)
                except ImportError:
                    pass
                for skill in get_enabled_skills():
                    if getattr(skill, "name", None) == tool_name:
                        result = skill.invoke(tool_args)
                        break
            except Exception as exc:
                result = f"Tool error: {exc}"
            loop_messages.append(ToolMessage(content=str(result), tool_call_id=tool_id))

    # Max iterations reached — return what we have
    last = loop_messages[-1]
    _, text = _extract_thinking_from_content(getattr(last, "content", ""))
    return "\n\n".join(thinking_parts), text or str(getattr(last, "content", "")), loop_messages, tool_names_used


# ── Graph factory ─────────────────────────────────────────────────────────────

def build_chat_graph(
    provider: str,
    api_key: str,
    model: str | None = None,
    style: str | None = None,
    has_style: bool = False,
    tools: list | None = None,
    event_queue=None,          # asyncio.Queue | None — forwarded to _run_tool_loop
):
    """Build and compile the chat graph, optionally with plugin skill tools."""
    base_llm = get_llm(provider, api_key, model, streaming=False)
    answer_llm = (base_llm.bind_tools(tools) if tools else base_llm).with_config(tags=["normal_answer"])
    style_llm = get_llm(provider, api_key, model, streaming=False).with_config(tags=["style_chain"])
    style_contract = get_style_contract(style)
    has_tools = bool(tools)

    style_prompt = ChatPromptTemplate.from_messages([
        ("system",
         "ROLE: Style transformer and validator.\n"
         "You receive an original answer and must modify only style, not facts. "
         "Preserve citations, code, document references, and factual meaning. "
         "Return JSON only with exactly these keys: answer, score, feedback. "
         "score must be a number from 0 to 1 measuring compliance with the style contract."),
        ("system", "{style_contract}"),
        ("human",
         "Original answer:\n{original_answer}\n\n"
         "Previous styled answer, if any:\n{current_answer}\n\n"
         "Previous feedback:\n{style_feedback}\n\n"
         "Iteration: {style_iteration} of {max_style_iterations}\n\n"
         "Return only JSON."),
    ])
    style_chain = style_prompt | style_llm | StrOutputParser()

    async def normal_answer_node(state: ChatState) -> dict:
        if has_tools:
            thinking, text, updated_msgs, tool_names = await _run_tool_loop(
                answer_llm, state["messages"], event_queue=event_queue,
            )
            return {
                "original_answer": text,
                "final_answer": text,
                "thinking_content": thinking,
                "tool_calls_made": tool_names,
                "messages": [AIMessage(content=text)],
            }
        else:
            response = await answer_llm.ainvoke(state["messages"])
            thinking, text = _extract_thinking_from_content(response.content)
            content = text or (response.content if isinstance(response.content, str) else str(response.content))
            return {
                "original_answer": content,
                "final_answer": content,
                "thinking_content": thinking,
                "tool_calls_made": [],
                "messages": [AIMessage(content=content)],
            }

    def route_after_normal_answer(state: ChatState) -> str:
        return "style" if state["has_style"] else "publish"

    async def style_chain_node(state: ChatState) -> dict:
        current_answer = state["styled_answer"] or state["original_answer"]
        raw = await style_chain.ainvoke({
            "style_contract": state["style_contract"],
            "original_answer": state["original_answer"],
            "current_answer": current_answer,
            "style_feedback": state["style_feedback"] or "No previous feedback.",
            "style_iteration": state["style_iteration"] + 1,
            "max_style_iterations": state["max_style_iterations"],
        })
        answer, llm_score, llm_feedback = parse_style_chain_output(raw)
        deterministic_score, deterministic_feedback = deterministic_style_feedback(answer, state["style"])
        score = min(llm_score, deterministic_score)
        feedback = "\n".join(item for item in [llm_feedback, deterministic_feedback] if item)
        return {
            "styled_answer": answer,
            "final_answer": answer,
            "style_score": score,
            "style_feedback": feedback or "Style score passed.",
            "style_iteration": state["style_iteration"] + 1,
        }

    def route_after_style_chain(state: ChatState) -> str:
        if state["style_score"] >= STYLE_PASS_SCORE:
            return "publish"
        if state["style_iteration"] >= state["max_style_iterations"]:
            return "publish"
        return "retry"

    def publish_node(state: ChatState) -> dict:
        return {"messages": [AIMessage(content=state["final_answer"])]}

    builder: StateGraph = StateGraph(ChatState)
    builder.add_node("normal_answer", normal_answer_node)
    builder.add_node("style_chain", style_chain_node)
    builder.add_node("publish_answer", publish_node)
    builder.add_edge(START, "normal_answer")
    builder.add_conditional_edges(
        "normal_answer",
        route_after_normal_answer,
        {"style": "style_chain", "publish": "publish_answer"},
    )
    builder.add_conditional_edges(
        "style_chain",
        route_after_style_chain,
        {"retry": "style_chain", "publish": "publish_answer"},
    )
    builder.add_edge("publish_answer", END)

    return builder.compile()
