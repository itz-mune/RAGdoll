"""Sentence-level contextual compression for retrieved memory chunks.

Strips sentences that don't overlap with the query's vocabulary.
Skips compression when chunks are short (<800 chars total) or provider is Groq
(Groq has its own context window that's large enough not to need aggressive trimming).
"""
from __future__ import annotations

import dataclasses
import re

from memory.store import MemoryChunk

_MIN_CHARS = 800
_SENT_RE = re.compile(r'(?<=[.!?])\s+')
_WORD_RE = re.compile(r'[^\w\s]')


def _query_words(query: str) -> frozenset[str]:
    return frozenset(_WORD_RE.sub('', query.lower()).split())


def _compress_chunk(chunk: MemoryChunk, qwords: frozenset[str]) -> MemoryChunk:
    sentences = [s.strip() for s in _SENT_RE.split(chunk.text) if len(s.strip()) > 10]
    if len(sentences) <= 2:
        return chunk

    scored: list[tuple[float, str]] = []
    for sent in sentences:
        words = frozenset(_WORD_RE.sub('', sent.lower()).split())
        overlap = len(words & qwords) / max(len(qwords), 1)
        scored.append((overlap, sent))

    kept = [s for score, s in scored if score > 0]
    if not kept:
        return chunk  # no overlap — return unchanged

    compressed = " ".join(kept)
    if len(compressed) < 40:
        return chunk

    return dataclasses.replace(chunk, text=compressed)


def compress_chunks(
    chunks: list[MemoryChunk],
    query: str,
    provider: str = "",
) -> list[MemoryChunk]:
    """
    Return chunks with low-relevance sentences stripped out.

    Passes through unchanged when:
    - Total text < 800 chars (nothing to gain)
    - Provider is Groq (fast model, large context, not worth the CPU)
    - query_words is empty
    """
    if not chunks:
        return chunks

    total = sum(len(c.text) for c in chunks)
    if total < _MIN_CHARS or provider.lower() == "groq":
        return chunks

    qwords = _query_words(query)
    if not qwords:
        return chunks

    return [_compress_chunk(c, qwords) for c in chunks]
