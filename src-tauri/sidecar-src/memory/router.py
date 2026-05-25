"""Route queries: skip retrieval for purely conversational queries, force for memory signals."""
from __future__ import annotations

import re
from typing import Literal

# Signals that almost certainly require retrieval from the knowledge base
_MEMORY_RE = re.compile(
    r"\b(remember|recall|earlier|last time|you said|we discussed|mentioned|"
    r"document|file|search|find|look up|what did|tell me about|know about|"
    r"context|history|notes|stored|saved|previously|before|showed|told|"
    r"according to|based on|from the|in the|my name|i am|i work|i live|"
    r"i prefer|my project|my code)\b",
    re.IGNORECASE,
)

# Pure conversational openers that need no retrieval
_CONVERSATIONAL_RE = re.compile(
    r"^(hi+|hello+|hey+|thanks?|thank you|ok(ay)?|got it|sure|"
    r"yes+|no+|yep|nope|great|cool|nice|awesome|perfect|alright|"
    r"what'?s up|how are you|who are you|what can you do|"
    r"help|help me|please help)\W*$",
    re.IGNORECASE,
)

RouteDecision = Literal["skip", "retrieve", "force"]


def route_query(query: str) -> RouteDecision:
    """
    Classify a user query for retrieval routing.

    Returns:
        "force"    — strong memory signal; always retrieve
        "retrieve" — normal path; retrieve with 1.5 s timeout
        "skip"     — conversational filler; skip retrieval entirely
    """
    stripped = query.strip()
    words = stripped.split()

    # Memory signal overrides everything
    if _MEMORY_RE.search(stripped):
        return "force"

    # Very short (≤3 words) — only retrieve if forced above
    if len(words) <= 3:
        return "skip"

    # Pure conversational pattern
    if _CONVERSATIONAL_RE.match(stripped):
        return "skip"

    return "retrieve"
