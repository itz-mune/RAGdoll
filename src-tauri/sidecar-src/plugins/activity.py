"""
RAGdoll activity tracker — aggregates daily message / token metrics from the DB
and exposes helpers used by the dashboard endpoints.
"""
from __future__ import annotations

import json
import time
from typing import Optional

from sqlmodel import Session, select, func, text
from db import MessageModel, ConversationModel, engine


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _day_bucket(ts_ms: int) -> str:
    """Convert a Unix-ms timestamp to a YYYY-MM-DD string (UTC)."""
    import datetime
    return datetime.datetime.utcfromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d")


def _today_midnight_ms() -> int:
    import datetime
    today = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return int(today.timestamp() * 1000)


# ── Dashboard stats endpoint ──────────────────────────────────────────────────

def get_stats(days: int = 30) -> dict:
    """
    Return aggregated dashboard statistics for the last `days` days.

    Shape returned:
    {
      "totalMessages": int,
      "totalConversations": int,
      "totalTokens": int,
      "avgResponseMs": int | null,
      "messagesPerDay": [{"date": "YYYY-MM-DD", "count": int}, ...],
      "tokensPerDay":   [{"date": "YYYY-MM-DD", "tokens": int}, ...],
      "topSkills": [{"name": str, "count": int}, ...],
      "avgTokensPerMessage": int | null,
    }
    """
    cutoff_ms = int(time.time() * 1000) - days * 86_400_000

    with Session(engine) as session:
        # All assistant messages in window
        msgs = session.exec(
            select(MessageModel)
            .where(MessageModel.role == "assistant")
            .where(MessageModel.created_at >= cutoff_ms)
            .order_by(MessageModel.created_at.asc())
        ).all()

        total_convs = session.exec(
            select(func.count(ConversationModel.id))
            .where(ConversationModel.created_at >= cutoff_ms)
        ).one()

        total_msgs_all = session.exec(
            select(func.count(MessageModel.id))
            .where(MessageModel.created_at >= cutoff_ms)
        ).one()

    # Aggregate per-day buckets
    msgs_per_day: dict[str, int] = {}
    tokens_per_day: dict[str, int] = {}
    total_tokens = 0
    total_response_ms = 0
    response_ms_count = 0
    skill_counter: dict[str, int] = {}

    for m in msgs:
        day = _day_bucket(m.created_at)
        msgs_per_day[day] = msgs_per_day.get(day, 0) + 1

        if m.tokens_used:
            total_tokens += m.tokens_used
            tokens_per_day[day] = tokens_per_day.get(day, 0) + m.tokens_used

        if m.response_time_ms:
            total_response_ms += m.response_time_ms
            response_ms_count += 1

        if m.tool_calls_made:
            try:
                for skill in json.loads(m.tool_calls_made):
                    skill_counter[skill] = skill_counter.get(skill, 0) + 1
            except Exception:
                pass

    # Build ordered date series for the last `days` days
    import datetime
    today = datetime.datetime.utcnow().date()
    date_series = [
        (today - datetime.timedelta(days=i)).isoformat()
        for i in range(days - 1, -1, -1)
    ]

    messages_per_day = [{"date": d, "count": msgs_per_day.get(d, 0)} for d in date_series]
    tokens_per_day_list = [{"date": d, "tokens": tokens_per_day.get(d, 0)} for d in date_series]

    top_skills = sorted(
        [{"name": k, "count": v} for k, v in skill_counter.items()],
        key=lambda x: -x["count"],
    )[:5]

    assistant_count = len(msgs)
    avg_tokens = (total_tokens // assistant_count) if assistant_count > 0 else None
    avg_resp_ms = (total_response_ms // response_ms_count) if response_ms_count > 0 else None

    return {
        "totalMessages": total_msgs_all,
        "totalConversations": total_convs,
        "totalTokens": total_tokens,
        "avgResponseMs": avg_resp_ms,
        "messagesPerDay": messages_per_day,
        "tokensPerDay": tokens_per_day_list,
        "topSkills": top_skills,
        "avgTokensPerMessage": avg_tokens,
    }


def get_recent_activity(limit: int = 20) -> list[dict]:
    """
    Return the most recent assistant messages as activity items.

    Shape: [{"id", "conversationId", "conversationTitle", "snippet", "createdAt", "toolCallsUsed"}, ...]
    """
    with Session(engine) as session:
        rows = session.exec(
            select(MessageModel, ConversationModel)
            .join(ConversationModel, MessageModel.conversation_id == ConversationModel.id)
            .where(MessageModel.role == "assistant")
            .order_by(MessageModel.created_at.desc())
            .limit(limit)
        ).all()

    result = []
    for msg, conv in rows:
        snippet = (msg.content or "")[:120].replace("\n", " ").strip()
        if len(msg.content or "") > 120:
            snippet += "…"
        tools: list[str] = []
        if msg.tool_calls_made:
            try:
                tools = json.loads(msg.tool_calls_made)
            except Exception:
                pass
        result.append({
            "id": msg.id,
            "conversationId": conv.id,
            "conversationTitle": conv.title,
            "snippet": snippet,
            "createdAt": msg.created_at,
            "toolCallsUsed": tools,
        })
    return result


def get_pinned_conversations(pinned_ids: list[str]) -> list[dict]:
    """Return full conversation objects for the given IDs (preserving order)."""
    if not pinned_ids:
        return []
    with Session(engine) as session:
        convs = session.exec(
            select(ConversationModel)
            .where(ConversationModel.id.in_(pinned_ids))
        ).all()
    by_id = {c.id: c for c in convs}
    result = []
    for pid in pinned_ids:
        c = by_id.get(pid)
        if c:
            result.append({
                "id": c.id,
                "title": c.title,
                "provider": c.provider,
                "model": c.model,
                "createdAt": c.created_at,
                "updatedAt": c.updated_at,
                "messageCount": c.message_count,
            })
    return result
