"""Decide whether a message is worth storing in the vector DB."""
from __future__ import annotations

import re

_FILLER = frozenset([
    "ok", "sure", "thanks", "got it", "yes", "no", "okay",
    "sounds good", "great", "perfect", "cool", "alright", "yep", "nope",
    "thank you", "cheers",
])

_GREETINGS = frozenset([
    "hello", "hi", "hey", "good morning", "good afternoon",
    "good evening", "howdy", "sup",
])

_ALWAYS_PATTERNS = re.compile(
    r'\b(remember that|always|never|my name is|i prefer|i work at|i live in|'
    r'my password|my key|important|never forget|keep in mind|make sure)\b',
    re.IGNORECASE,
)

_FACTUAL_PATTERNS = re.compile(
    r'\b\d{4}\b|'                          # years / 4-digit numbers
    r'\b\d{1,3}/\d{1,2}/\d{2,4}\b|'       # dates
    r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b',     # proper names (FirstName LastName)
)


def storage_decision(text: str, role: str) -> dict:
    """
    Returns:
        should_store:       bool
        reason:             str
        importance_override: float | None
    """
    stripped = text.strip()
    lower = stripped.lower()

    # ── Always store ──────────────────────────────────────────────────────────
    if _ALWAYS_PATTERNS.search(stripped):
        return {
            "should_store": True,
            "reason": "explicit_memory_signal",
            "importance_override": 1.0,
        }

    if len(stripped) > 200:
        return {"should_store": True, "reason": "substantial_content", "importance_override": None}

    if role == "assistant" and len(stripped) > 100:
        return {"should_store": True, "reason": "assistant_response", "importance_override": None}

    if _FACTUAL_PATTERNS.search(stripped):
        return {"should_store": True, "reason": "factual_density", "importance_override": None}

    # ── Never store ───────────────────────────────────────────────────────────
    if len(stripped) < 30:
        return {"should_store": False, "reason": "too_short", "importance_override": None}

    if lower in _FILLER:
        return {"should_store": False, "reason": "filler", "importance_override": None}

    if lower in _GREETINGS:
        return {"should_store": False, "reason": "greeting", "importance_override": None}

    # Short clarification requests
    if re.match(r'^(what do you mean|can you explain|please clarify|could you clarify)', lower):
        return {"should_store": False, "reason": "clarification_request", "importance_override": None}

    if role == "user" and stripped.endswith("?") and len(stripped) < 80:
        return {"should_store": False, "reason": "short_question", "importance_override": None}

    return {"should_store": True, "reason": "default", "importance_override": None}
