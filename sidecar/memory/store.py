"""Vector store for RAGdoll memory — LanceDB + all-MiniLM-L6-v2."""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pyarrow as pa

EMBED_DIM = 384
SEMANTIC_TABLE = "semantic_memory"
DOCUMENT_TABLE = "document_memory"

# ── Singletons ────────────────────────────────────────────────────────────────
_model = None
_db = None
_sem_table = None
_doc_table = None


def get_embed_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _db_path() -> str:
    import os
    base = os.environ.get("RAGDOLL_DATA_DIR", str(Path(__file__).parent.parent))
    return str(Path(base) / "ragdoll_memory")


def _get_db():
    global _db
    if _db is None:
        import lancedb
        Path(_db_path()).mkdir(parents=True, exist_ok=True)
        _db = lancedb.connect(_db_path())
    return _db


def _semantic_schema() -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("conversation_id", pa.string()),
        pa.field("message_id", pa.string()),
        pa.field("text", pa.string()),
        pa.field("vector", pa.list_(pa.float32(), EMBED_DIM)),
        pa.field("role", pa.string()),
        pa.field("importance", pa.float32()),
        pa.field("created_at", pa.float64()),
        pa.field("last_accessed", pa.float64()),
        pa.field("access_count", pa.int32()),
        pa.field("is_compacted", pa.bool_()),
        pa.field("tags", pa.string()),
    ])


def _document_schema() -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("filename", pa.string()),
        pa.field("file_hash", pa.string()),
        pa.field("chunk_index", pa.int32()),
        pa.field("text", pa.string()),
        pa.field("vector", pa.list_(pa.float32(), EMBED_DIM)),
        pa.field("created_at", pa.float64()),
        pa.field("char_count", pa.int32()),
        pa.field("metadata", pa.string()),
    ])


def _get_sem_table():
    global _sem_table
    if _sem_table is not None:
        return _sem_table
    db = _get_db()
    try:
        _sem_table = db.open_table(SEMANTIC_TABLE)
    except Exception:
        _sem_table = db.create_table(SEMANTIC_TABLE, schema=_semantic_schema())
    return _sem_table


def _get_doc_table():
    global _doc_table
    if _doc_table is not None:
        return _doc_table
    db = _get_db()
    try:
        _doc_table = db.open_table(DOCUMENT_TABLE)
    except Exception:
        _doc_table = db.create_table(DOCUMENT_TABLE, schema=_document_schema())
    return _doc_table


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class MemoryChunk:
    id: str
    text: str
    score: float
    source: str          # 'conversation' | filename
    role: str = "assistant"
    importance: float = 0.5
    access_count: int = 0
    is_compacted: bool = False
    conversation_id: str = ""


# ── Embedding ─────────────────────────────────────────────────────────────────

def embed(texts: list[str]) -> list[list[float]]:
    model = get_embed_model()
    vecs = model.encode(texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True)
    return vecs.tolist()


def _dist_to_sim(l2_dist: float) -> float:
    """L2 distance of unit-norm vectors → cosine similarity."""
    return max(0.0, 1.0 - (l2_dist ** 2) / 2.0)


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
    """Sentence-aware chunking with 1-2 sentence overlap."""
    raw = re.split(r'(?<=[.!?])\s+|\n{2,}', text.strip())
    sentences = [s.strip() for s in raw if len(s.strip()) >= 10]
    if not sentences:
        t = text.strip()
        return [t] if len(t) >= 50 else []

    TARGET = 1400  # chars
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in sentences:
        if current_len + len(sent) > TARGET and current:
            body = " ".join(current)
            if len(body) >= 50:
                chunks.append(body)
            current = current[-2:]
            current_len = sum(len(s) for s in current)
        current.append(sent)
        current_len += len(sent)

    if current:
        body = " ".join(current)
        if len(body) >= 50:
            chunks.append(body)

    return chunks


# ── Importance scoring ────────────────────────────────────────────────────────

_IMPORTANCE_KEYWORDS = frozenset([
    "important", "remember", "always", "never", "key point", "summary",
    "conclusion", "critical", "must", "essential", "note that",
    "keep in mind", "my name is", "i prefer", "i work at", "i live in",
])


def compute_importance(text: str, role: str) -> float:
    score = 0.5
    if role == "assistant":
        score += 0.1
    score += min(len(text) / 2000 * 0.2, 0.2)
    lower = text.lower()
    if any(kw in lower for kw in _IMPORTANCE_KEYWORDS):
        score += 0.2
    if role == "user" and text.strip().endswith("?") and len(text) < 150:
        score -= 0.1
    return round(max(0.0, min(1.0, score)), 3)


# ── Write ─────────────────────────────────────────────────────────────────────

def write_memory(
    conversation_id: str,
    message_id: str,
    text: str,
    role: str,
    importance_override: Optional[float] = None,
) -> list[str]:
    chunks = chunk_text(text)
    if not chunks:
        return []

    table = _get_sem_table()
    embeddings = embed(chunks)
    now = time.time()
    ids: list[str] = []
    rows = []

    for chunk, vec in zip(chunks, embeddings):
        imp = importance_override if importance_override is not None else compute_importance(chunk, role)
        cid = str(uuid.uuid4())
        ids.append(cid)
        rows.append({
            "id": cid,
            "conversation_id": conversation_id,
            "message_id": message_id,
            "text": chunk,
            "vector": [float(v) for v in vec],
            "role": role,
            "importance": float(imp),
            "created_at": now,
            "last_accessed": now,
            "access_count": 0,
            "is_compacted": False,
            "tags": "[]",
        })

    table.add(rows)
    return ids


def write_document(filename: str, content: str, file_hash: str, is_temporary: bool = False) -> int:
    import traceback
    table = _get_doc_table()

    # Duplicate guard — if this hash already exists, either skip or upgrade temp→permanent.
    try:
        if table.count_rows() > 0:
            cols = ["file_hash", "metadata"]
            arrow_tbl = table.to_lance().to_table(columns=cols)
            existing_rows = [r for r in arrow_tbl.to_pylist() if r["file_hash"] == file_hash]
            if existing_rows:
                meta_str = (existing_rows[0].get("metadata") or "{}").replace(" ", "")
                currently_temp = '"temporary":true' in meta_str
                if currently_temp and not is_temporary:
                    # Upgrade: user is now storing this permanently
                    safe = file_hash.replace("'", "''")
                    table.update(where=f"file_hash = '{safe}'", values={"metadata": "{}"})
                    print(f"[Memory] Upgraded '{filename}' from temporary to permanent")
                else:
                    print(f"[Memory] '{filename}' already stored (hash match), skipping")
                return 0
    except Exception as exc:
        print(f"[Memory] Dedup check failed, proceeding: {exc}")

    chunks = chunk_text(content)
    if not chunks:
        print(f"[Memory] No chunks extracted from '{filename}' (content length={len(content)})")
        return 0

    print(f"[Memory] Embedding {len(chunks)} {'temporary ' if is_temporary else ''}chunks for '{filename}'…")
    try:
        embeddings = embed(chunks)
    except Exception as exc:
        print(f"[Memory] Embedding failed for '{filename}': {exc}")
        traceback.print_exc()
        return 0

    now = time.time()
    metadata = json.dumps({"temporary": True}) if is_temporary else "{}"
    rows = []
    for i, (chunk, vec) in enumerate(zip(chunks, embeddings)):
        rows.append({
            "id": str(uuid.uuid4()),
            "filename": filename,
            "file_hash": file_hash,
            "chunk_index": i,
            "text": chunk,
            "vector": [float(v) for v in vec],
            "created_at": now,
            "char_count": len(chunk),
            "metadata": metadata,
        })

    try:
        table.add(rows)
        print(f"[Memory] Stored {len(rows)} {'temporary ' if is_temporary else ''}chunks for '{filename}'")
    except Exception as exc:
        print(f"[Memory] table.add failed for '{filename}': {exc}")
        traceback.print_exc()
        return 0

    return len(rows)


def get_document_text(filename: str) -> Optional[dict]:
    """Reconstruct full document text from stored chunks, ordered by chunk_index."""
    try:
        table = _get_doc_table()
        if table.count_rows() == 0:
            return None
        cols = ["chunk_index", "text", "filename"]
        arrow_tbl = table.to_lance().to_table(columns=cols)
        rows = [r for r in arrow_tbl.to_pylist() if r["filename"] == filename]
        if not rows:
            return None
        rows.sort(key=lambda r: r.get("chunk_index", 0))
        text = "\n\n".join(r["text"] for r in rows)
        return {"filename": filename, "text": text, "chunk_count": len(rows)}
    except Exception as exc:
        print(f"[Memory] get_document_text failed: {exc}")
        return None


# ── Search ────────────────────────────────────────────────────────────────────

def search_memory(
    query: str,
    conversation_id: str,
    limit: int = 5,
    exclude_message_ids: Optional[list[str]] = None,
) -> list[MemoryChunk]:
    try:
        table = _get_sem_table()
        if table.count_rows() == 0:
            return []
        q_vec = embed([query])[0]
        results = table.search(q_vec).limit(limit * 3).to_list()
    except Exception:
        return []

    exclude_set = set(exclude_message_ids or [])
    chunks: list[MemoryChunk] = []

    for row in results:
        if row.get("message_id") in exclude_set:
            continue
        sim = _dist_to_sim(float(row.get("_distance", 1.0)))
        chunks.append(MemoryChunk(
            id=row["id"],
            text=row["text"],
            score=sim,
            source="conversation",
            role=row.get("role", "assistant"),
            importance=float(row.get("importance", 0.5)),
            access_count=int(row.get("access_count", 0)),
            is_compacted=bool(row.get("is_compacted", False)),
            conversation_id=row.get("conversation_id", ""),
        ))

    # Rank by combined score, deduplicate by near-identical text prefix
    seen: set[str] = set()
    unique: list[MemoryChunk] = []
    for c in sorted(chunks, key=lambda x: -(x.score * 0.7 + x.importance * 0.3)):
        key = c.text[:60]
        if key not in seen:
            seen.add(key)
            unique.append(c)
        if len(unique) >= limit:
            break

    return unique


def search_documents(query: str, limit: int = 3) -> list[MemoryChunk]:
    try:
        table = _get_doc_table()
        if table.count_rows() == 0:
            return []
        q_vec = embed([query])[0]
        results = table.search(q_vec).limit(limit * 2).to_list()
    except Exception:
        return []

    chunks = []
    for row in results:
        sim = _dist_to_sim(float(row.get("_distance", 1.0)))
        chunks.append(MemoryChunk(
            id=row["id"],
            text=row["text"],
            score=sim,
            source=row.get("filename", "document"),
            role="document",
            importance=0.7,
            access_count=0,
        ))

    return sorted(chunks, key=lambda x: -x.score)[:limit]


def search_all_memory(query: str, limit: int = 20) -> list[dict]:
    """Search semantic memory and return enriched dicts for the memory browser."""
    sem = search_memory(query, conversation_id="", limit=limit)
    docs = search_documents(query, limit=min(limit, 5))
    combined = sorted(sem + docs, key=lambda c: -c.score)[:limit]
    return [
        {
            "id": c.id,
            "text": c.text,
            "score": round(c.score, 3),
            "source": c.source,
            "role": c.role,
            "importance": c.importance,
            "access_count": c.access_count,
            "is_compacted": c.is_compacted,
            "conversation_id": c.conversation_id,
        }
        for c in combined
    ]


# ── Access tracking ───────────────────────────────────────────────────────────

def update_access_metadata(chunk_ids: list[str]) -> None:
    if not chunk_ids:
        return
    try:
        table = _get_sem_table()
        now = time.time()
        id_csv = "', '".join(chunk_ids)
        table.update(
            where=f"id IN ('{id_csv}')",
            values={"last_accessed": now},
        )
    except Exception:
        pass


# ── Delete ────────────────────────────────────────────────────────────────────

def delete_memory(chunk_id: str) -> None:
    try:
        _get_sem_table().delete(f"id = '{chunk_id}'")
    except Exception:
        pass


def delete_conversation_memory(conversation_id: str) -> None:
    try:
        _get_sem_table().delete(f"conversation_id = '{conversation_id}'")
    except Exception:
        pass


def delete_document(filename: str) -> None:
    try:
        safe = filename.replace("'", "''")
        _get_doc_table().delete(f"filename = '{safe}'")
    except Exception:
        pass


def clear_all_semantic_memory() -> None:
    try:
        _get_sem_table().delete("id IS NOT NULL")
    except Exception:
        pass


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_memory_stats() -> dict:
    try:
        sem_count = _get_sem_table().count_rows()
    except Exception:
        sem_count = 0
    try:
        doc_count = _get_doc_table().count_rows()
    except Exception:
        doc_count = 0

    db_path = Path(_db_path())
    total_bytes = sum(
        f.stat().st_size for f in db_path.rglob("*") if f.is_file()
    ) if db_path.exists() else 0

    return {
        "semantic_count": sem_count,
        "document_count": doc_count,
        "total_size_mb": round(total_bytes / (1024 * 1024), 2),
    }


def get_document_list() -> list[dict]:
    try:
        table = _get_doc_table()
        if table.count_rows() == 0:
            return []
        cols = ["id", "filename", "created_at", "char_count", "metadata"]
        arrow_tbl = table.to_lance().to_table(columns=cols)
        rows = arrow_tbl.to_pylist()
        from collections import defaultdict
        groups: dict = defaultdict(list)
        for r in rows:
            meta_str = (r.get("metadata") or "{}").replace(" ", "")
            if '"temporary":true' in meta_str:
                continue
            groups[r["filename"]].append(r)
        result = []
        for fname, chunks in groups.items():
            result.append({
                "filename": fname,
                "chunk_count": len(chunks),
                "created_at": float(min(r["created_at"] for r in chunks)),
                "total_chars": int(sum(r["char_count"] for r in chunks)),
            })
        return result
    except Exception as exc:
        print(f"[Memory] get_document_list failed: {exc}")
        return []


def cleanup_temp_documents() -> int:
    """Delete all temporary document chunks — called on sidecar startup."""
    try:
        table = _get_doc_table()
        if table.count_rows() == 0:
            return 0
        cols = ["id", "metadata"]
        arrow_tbl = table.to_lance().to_table(columns=cols)
        temp_ids = [
            r["id"] for r in arrow_tbl.to_pylist()
            if '"temporary":true' in (r.get("metadata") or "{}").replace(" ", "")
        ]
        if not temp_ids:
            return 0
        id_csv = "', '".join(temp_ids)
        table.delete(f"id IN ('{id_csv}')")
        print(f"[Memory] Cleaned up {len(temp_ids)} temporary document chunks from previous session")
        return len(temp_ids)
    except Exception as exc:
        print(f"[Memory] Temp doc cleanup failed: {exc}")
        return 0


def get_memory_by_conversation() -> list[dict]:
    try:
        table = _get_sem_table()
        if table.count_rows() == 0:
            return []
        cols = ["id", "conversation_id"]
        arrow_tbl = table.to_lance().to_table(columns=cols)
        rows = arrow_tbl.to_pylist()
        from collections import Counter
        counts: Counter = Counter(r["conversation_id"] for r in rows)
        return [
            {"conversation_id": cid, "chunk_count": count}
            for cid, count in counts.items()
        ]
    except Exception as exc:
        print(f"[Memory] get_memory_by_conversation failed: {exc}")
        return []


def get_recent_memories(limit: int = 20) -> list[dict]:
    """Return the most recently created semantic memory chunks (no query needed)."""
    import traceback
    try:
        table = _get_sem_table()
        if table.count_rows() == 0:
            return []
        # Use Lance native interface to select only display columns, skipping vectors
        import pyarrow.compute as pc
        cols = ["id", "text", "role", "importance", "created_at",
                "access_count", "is_compacted", "conversation_id"]
        arrow_tbl = table.to_lance().to_table(columns=cols)
        if arrow_tbl.num_rows == 0:
            return []
        # Sort descending by created_at and take top N
        idx = pc.sort_indices(arrow_tbl, sort_keys=[("created_at", "descending")])
        arrow_tbl = arrow_tbl.take(idx[:limit])
        rows = arrow_tbl.to_pylist()
        return [
            {
                "id": str(r["id"]),
                "text": str(r["text"]),
                "score": 1.0,
                "source": "conversation",
                "role": str(r.get("role") or "assistant"),
                "importance": float(r.get("importance") or 0.5),
                "access_count": int(r.get("access_count") or 0),
                "is_compacted": bool(r.get("is_compacted") or False),
                "conversation_id": str(r.get("conversation_id") or ""),
            }
            for r in rows
        ]
    except Exception as exc:
        print(f"[Memory] get_recent_memories failed: {exc}")
        traceback.print_exc()
        return []
