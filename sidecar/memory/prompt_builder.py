"""Assemble the final system prompt from all memory layers."""
from __future__ import annotations

from datetime import date

from memory.retriever import RetrievalResult

MAX_PROMPT_CHARS = 6000

_BASE_SYSTEM = (
    "You are RAGdoll, a local AI assistant with access to the user's personal "
    "knowledge base and conversation history. "
    "Answer using the provided context when relevant. "
    "If the context is not relevant to the question, ignore it and answer from "
    "your general knowledge. "
    "Today is {date}."
)

_CITATION_INSTRUCTION = (
    "\nWhen you reference information from an attached document, cite it by "
    "filename in square brackets, e.g. [report.pdf]. Only cite files you actually used."
)


def build_system_prompt(
    retrieval: RetrievalResult,
    conversation_summary: str | None,
    response_style_suffix: str = "",
) -> str:
    parts: list[str] = [_BASE_SYSTEM.format(date=date.today().strftime("%B %d, %Y"))]

    has_docs = any(c.source != "conversation" for c in retrieval.chunks)
    if has_docs:
        parts.append(_CITATION_INSTRUCTION)

    # Memory context block
    if retrieval.chunks:
        parts.append(
            "\n\n[MEMORY CONTEXT]\n"
            "The following is relevant information from your knowledge base and past conversations:\n"
        )
        for chunk in retrieval.chunks:
            label = chunk.source if chunk.source != "conversation" else "conversation history"
            parts.append(
                f"---\nSource: {label}  Relevance: {chunk.score:.0%}\n{chunk.text}\n---"
            )

    # Conversation summary
    if conversation_summary:
        parts.append(
            f"\n\n[CONVERSATION SUMMARY]\n"
            f"Summary of earlier parts of this conversation:\n{conversation_summary}"
        )

    # Style suffix
    if response_style_suffix:
        parts.append(f"\n\n{response_style_suffix}")

    result = "\n".join(parts)

    # Trim to budget: drop lowest-scored memory chunks first
    if len(result) > MAX_PROMPT_CHARS:
        # Rebuild without memory context if over limit
        trimmed_parts: list[str] = [_BASE_SYSTEM.format(date=date.today().strftime("%B %d, %Y"))]
        if has_docs:
            trimmed_parts.append(_CITATION_INSTRUCTION)
        if conversation_summary:
            trimmed_parts.append(
                f"\n\n[CONVERSATION SUMMARY]\n{conversation_summary}"
            )
        if response_style_suffix:
            trimmed_parts.append(f"\n\n{response_style_suffix}")
        result = "\n".join(trimmed_parts)

    return result
