"""LangGraph-based chat agent for RAGdoll."""
import json
import operator
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph


MAX_STYLE_ITERATIONS = 5
STYLE_PASS_SCORE = 0.86


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
    """Return a strict style contract for style-chain enforcement."""
    return STYLE_CONTRACTS.get((style or "normal").lower(), STYLE_CONTRACTS["normal"])


# ── LLM factory ──────────────────────────────────────────────────────────────

def get_llm(provider: str, api_key: str, model: str | None = None, streaming: bool = True):
    """Return a configured LangChain chat model for the given provider."""
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
                "HTTP-Referer": "https://github.com/ragdoll-app/ragdoll",
                "X-Title": "RAGdoll",
            },
        )

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(base_url=api_key, model=model or "mistral")

    raise ValueError(f"Unknown provider: {provider!r}")


# ── Style scoring ────────────────────────────────────────────────────────────

def deterministic_style_feedback(text: str, style: str | None) -> tuple[float, str]:
    """Cheap deterministic validation that contributes to the style score."""
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
        # Normal style has fewer restrictions; just ensure it's reasonably balanced
        if len(words) < 10:
            penalties.append("Too brief: Normal should provide sufficient context.")

    score = max(0.0, 1.0 - (0.2 * len(penalties)))
    return score, "\n".join(penalties)


def parse_style_chain_output(raw: str) -> tuple[str, float, str]:
    """Parse the style chain JSON; degrade gracefully if a model emits prose."""
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
        return cleaned, 0.55, "The style chain did not return valid JSON; retry with stricter formatting."


# ── Graph factory ─────────────────────────────────────────────────────────────

def build_chat_graph(
    provider: str,
    api_key: str,
    model: str | None = None,
    style: str | None = None,
    has_style: bool = False,
):
    """
    Build and compile the chat graph.

    Topology:
        START -> normal_answer
        normal_answer -> publish_original       when no style is selected
        normal_answer -> style_chain            when a style is selected
        style_chain -> publish_styled           when score is high enough or max iterations reached
        style_chain -> style_chain              while score is low and iterations < 5
    """
    answer_llm = get_llm(provider, api_key, model, streaming=False).with_config(tags=["normal_answer"])
    style_llm = get_llm(provider, api_key, model, streaming=False).with_config(tags=["style_chain"])
    style_contract = get_style_contract(style)

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
        response = await answer_llm.ainvoke(state["messages"])
        content = response.content if isinstance(response.content, str) else str(response.content)
        return {
            "original_answer": content,
            "final_answer": content,
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
