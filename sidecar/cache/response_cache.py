"""Semantic response cache: cosine similarity ≥ 0.92, 1-hour TTL, max 256 entries.

Key = md5(system_prompt) + "::" + user_query, embedded and compared by cosine distance.
Only enabled when retrieval was performed (skip-routed queries are unlikely to repeat identically).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

_THRESHOLD = 0.92
_TTL = 3600.0       # seconds
_MAX = 256


@dataclass
class CacheEntry:
    query_vec: list[float]
    response: str
    thinking: str
    tool_calls: list[str]
    ts: float = field(default_factory=time.monotonic)


_store: list[CacheEntry] = []


def _cosine(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 1e-9 else 0.0


def _evict() -> None:
    now = time.monotonic()
    global _store
    _store = [e for e in _store if now - e.ts < _TTL]


def _make_key(query: str, system_hash: str) -> str:
    return f"{system_hash}::{query[:512]}"


def lookup(query: str, system_hash: str) -> CacheEntry | None:
    """Return a cached entry if a semantically similar query exists, else None."""
    _evict()
    if not _store:
        return None
    try:
        from memory.embedder import embed
        vec = embed([_make_key(query, system_hash)])[0]
        now = time.monotonic()
        for entry in reversed(_store):
            if now - entry.ts >= _TTL:
                continue
            if _cosine(vec, entry.query_vec) >= _THRESHOLD:
                return entry
    except Exception:
        pass
    return None


def store(
    query: str,
    system_hash: str,
    response: str,
    thinking: str = "",
    tool_calls: list[str] | None = None,
) -> None:
    """Insert a completed response into the cache."""
    try:
        from memory.embedder import embed
        vec = embed([_make_key(query, system_hash)])[0]
        global _store
        _store.append(CacheEntry(
            query_vec=vec,
            response=response,
            thinking=thinking,
            tool_calls=list(tool_calls or []),
        ))
        if len(_store) > _MAX:
            _store = _store[-_MAX:]
    except Exception:
        pass


def clear() -> None:
    global _store
    _store = []


def stats() -> dict:
    _evict()
    return {"entries": len(_store), "max": _MAX, "ttl_s": _TTL}
