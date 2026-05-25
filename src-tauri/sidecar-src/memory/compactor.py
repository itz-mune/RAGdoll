"""Background memory compaction: deduplication, pruning, summarisation."""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Optional

COMPACTION_MIN_CHUNKS = 20
COMPACTION_IDLE_SECS = 300   # 5 minutes idle before compacting
DEDUP_THRESHOLD = 0.92
PRUNE_IMPORTANCE_MAX = 0.2
PRUNE_AGE_DAYS = 30

# Tracks last-message timestamp and in-flight compaction tasks per conversation
_last_msg_time: dict[str, float] = {}
_in_flight: set[str] = set()


def record_message_time(conversation_id: str) -> None:
    _last_msg_time[conversation_id] = time.time()


async def maybe_compact(conversation_id: str) -> None:
    """Schedule compaction if not already running for this conversation."""
    if conversation_id in _in_flight:
        return
    _in_flight.add(conversation_id)
    asyncio.create_task(_delayed_compact(conversation_id))


async def _delayed_compact(conversation_id: str) -> None:
    await asyncio.sleep(COMPACTION_IDLE_SECS)
    try:
        await run_compaction_for_conversation(conversation_id)
    finally:
        _in_flight.discard(conversation_id)


async def run_compaction_for_conversation(conversation_id: str) -> dict:
    return await asyncio.to_thread(_compact_sync, conversation_id)


async def run_full_compaction() -> dict:
    """Compact all conversations. Called from the manual /memory/compact endpoint."""
    from memory.store import get_memory_by_conversation
    convs = await asyncio.to_thread(get_memory_by_conversation)
    total = {"conversations_compacted": 0, "duplicates_removed": 0, "pruned": 0}
    for row in convs:
        stats = await asyncio.to_thread(_compact_sync, row["conversation_id"])
        total["conversations_compacted"] += 1
        total["duplicates_removed"] += stats.get("duplicates_removed", 0)
        total["pruned"] += stats.get("pruned", 0)
    return total


def _compact_sync(conversation_id: str) -> dict:
    stats = {"duplicates_removed": 0, "pruned": 0}

    try:
        import numpy as np
        from memory.store import _get_sem_table, EMBED_DIM

        table = _get_sem_table()
        if table.count_rows() == 0:
            return stats

        # Fetch all un-compacted chunks for this conversation
        try:
            df = table.to_pandas()
            if conversation_id and conversation_id != "__all__":
                df = df[df["conversation_id"] == conversation_id]
            df = df[df["is_compacted"] == False]  # noqa: E712
        except Exception:
            return stats

        if len(df) < COMPACTION_MIN_CHUNKS:
            return stats

        now = time.time()
        prune_cutoff = now - PRUNE_AGE_DAYS * 86400

        # ── Pruning ───────────────────────────────────────────────────────────
        prune_mask = (
            (df["importance"] < PRUNE_IMPORTANCE_MAX) &
            (df["access_count"] == 0) &
            (df["created_at"] < prune_cutoff)
        )
        prune_ids = df.loc[prune_mask, "id"].tolist()
        for pid in prune_ids:
            try:
                table.delete(f"id = '{pid}'")
                stats["pruned"] += 1
            except Exception:
                pass

        remaining = df[~prune_mask].reset_index(drop=True)

        # ── Deduplication ─────────────────────────────────────────────────────
        if len(remaining) < 2:
            return stats

        try:
            vecs = np.array(remaining["vector"].tolist(), dtype=np.float32)
            norms = np.linalg.norm(vecs, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            normed = vecs / norms
            sim = normed @ normed.T

            to_delete: set[int] = set()
            for i in range(len(remaining)):
                if i in to_delete:
                    continue
                for j in range(i + 1, len(remaining)):
                    if j in to_delete:
                        continue
                    if sim[i, j] > DEDUP_THRESHOLD:
                        si = remaining.iloc[i]["importance"] + remaining.iloc[i]["access_count"] * 0.1
                        sj = remaining.iloc[j]["importance"] + remaining.iloc[j]["access_count"] * 0.1
                        to_delete.add(j if si >= sj else i)

            for idx in to_delete:
                chunk_id = remaining.iloc[idx]["id"]
                try:
                    table.delete(f"id = '{chunk_id}'")
                    stats["duplicates_removed"] += 1
                except Exception:
                    pass
        except Exception:
            pass

        print(
            f"[Compactor] {conversation_id[:16]}: "
            f"pruned={stats['pruned']} deduped={stats['duplicates_removed']}"
        )
    except Exception as exc:
        print(f"[Compactor] Error for {conversation_id}: {exc}")

    return stats
