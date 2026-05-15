"""
Lightweight event bus that lets synchronous plugin tool code push SSE events
back into the active stream without needing async/await.

Usage inside a tool:
    from plugins.events import emit
    emit({"type": "plugin_install", "plugin_name": "Web Search", "plugin_id": "web-search"})

The queue is set by the agent's tool loop before each tool call and cleared after.
"""
import asyncio
from typing import Optional

_queue: Optional[asyncio.Queue] = None


def set_event_queue(q: Optional[asyncio.Queue]) -> None:
    """Called by the agent tool loop to attach/detach the active SSE queue."""
    global _queue
    _queue = q


def emit(event: dict) -> None:
    """Push an event dict into the SSE queue. No-op if no queue is attached."""
    if _queue is not None:
        try:
            _queue.put_nowait(event)
        except Exception:
            pass
