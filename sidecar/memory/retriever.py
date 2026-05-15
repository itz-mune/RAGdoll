"""Advanced retrieval: parallel search + RRF + importance reranking."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from memory.store import MemoryChunk, search_memory, search_documents, update_access_metadata

RELEVANCE_THRESHOLD = 0.35
MAX_CHARS = 2000
RRF_K = 60


@dataclass
class RetrievalResult:
    chunks: list[MemoryChunk] = field(default_factory=list)
    semantic_count: int = 0
    document_count: int = 0
    was_truncated: bool = False


async def retrieve_context(query: str, conversation_id: str) -> RetrievalResult:
    """
    Full retrieval pipeline:
      1. Parallel vector search (semantic + documents)
      2. Reciprocal Rank Fusion merge
      3. Importance-weighted reranking
      4. Relevance threshold filter
      5. Token budget cap
      6. Async access metadata update
    """
    # Step 1 — parallel search
    sem_results, doc_results = await asyncio.gather(
        asyncio.to_thread(search_memory, query, conversation_id, 5),
        asyncio.to_thread(search_documents, query, 3),
    )

    if not sem_results and not doc_results:
        return RetrievalResult()

    # Step 2 — RRF merge
    rrf_scores: dict[str, float] = {}
    chunk_map: dict[str, MemoryChunk] = {}

    for rank, chunk in enumerate(sem_results):
        rrf_scores[chunk.id] = rrf_scores.get(chunk.id, 0.0) + 1.0 / (RRF_K + rank + 1)
        chunk_map[chunk.id] = chunk

    for rank, chunk in enumerate(doc_results):
        rrf_scores[chunk.id] = rrf_scores.get(chunk.id, 0.0) + 1.0 / (RRF_K + rank + 1)
        chunk_map[chunk.id] = chunk

    # Step 3 — importance-weighted reranking
    ranked = sorted(
        chunk_map.values(),
        key=lambda c: rrf_scores[c.id] * 0.7 + c.importance * 0.3,
        reverse=True,
    )

    # Step 4 — relevance threshold
    ranked = [c for c in ranked if c.score >= RELEVANCE_THRESHOLD]
    if not ranked:
        return RetrievalResult(
            semantic_count=len(sem_results),
            document_count=len(doc_results),
        )

    # Step 5 — token budget
    selected: list[MemoryChunk] = []
    total_chars = 0
    was_truncated = False
    for chunk in ranked:
        if total_chars + len(chunk.text) > MAX_CHARS:
            was_truncated = True
            break
        selected.append(chunk)
        total_chars += len(chunk.text)

    # Step 6 — fire-and-forget access metadata update
    sem_ids = [c.id for c in selected if c.source == "conversation"]
    if sem_ids:
        asyncio.create_task(asyncio.to_thread(update_access_metadata, sem_ids))

    return RetrievalResult(
        chunks=selected,
        semantic_count=sum(1 for c in selected if c.source == "conversation"),
        document_count=sum(1 for c in selected if c.source != "conversation"),
        was_truncated=was_truncated,
    )
