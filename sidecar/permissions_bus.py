"""
permissions_bus — shared async permission request/response bus.

Used by main.py (HTTP endpoint) and plugin skills (via SSE injection).
Module is importable from any code running in the sidecar process because
sidecar/ is always on sys.path (it's the working directory at startup).

Flow
----
1. Skill calls ``request_permission(files, is_critical)`` from inside _arun.
2. Module puts a ``permission_request`` event onto the per-request SSE queue
   (obtained via the ``permission_context`` ContextVar set in main.py before
   the LangGraph task is created — asyncio.create_task copies the context).
3. Frontend receives the SSE event and shows the inline permission dialog.
4. User approves or denies → frontend POSTs to ``/permissions/respond``.
5. ``respond_to_permission(id, approved)`` is called, sets the asyncio.Event.
6. ``request_permission`` unblocks and returns True (approved) or False.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

# ── Context variable ──────────────────────────────────────────────────────────
# main.py sets this to the request's event_queue *before* create_task so that
# the task inherits it via asyncio's automatic context copy.
permission_context: ContextVar[asyncio.Queue] = ContextVar("permission_context")

# ── Pending requests ──────────────────────────────────────────────────────────

@dataclass
class PermissionRequest:
    id: str
    files: list[str]
    is_critical: bool
    created_at: float
    event: asyncio.Event = field(default_factory=asyncio.Event)
    result: bool | None = None


_pending: dict[str, PermissionRequest] = {}

# ── Public API ────────────────────────────────────────────────────────────────

async def request_permission(
    files: list[str],
    is_critical: bool = False,
    timeout: float = 60.0,
) -> bool:
    """
    Called from within a skill's _arun to pause and request file access.
    Suspends the coroutine until the user approves/denies in the frontend.

    Returns True if approved, False if denied or timed out.
    Auto-approves (returns True) when running outside an SSE stream context
    (e.g. unit tests, CLI usage).
    """
    try:
        queue = permission_context.get()
    except LookupError:
        # No active SSE context — running in tests or non-streaming mode.
        return True

    req = PermissionRequest(
        id=str(uuid.uuid4()),
        files=files,
        is_critical=is_critical,
        created_at=time.time(),
    )
    _pending[req.id] = req

    # Inject the event into the live SSE stream so the frontend renders the dialog.
    await queue.put({
        "type": "permission_request",
        "id": req.id,
        "files": files,
        "is_critical": is_critical,
        "file_count": len(files),
    })

    try:
        await asyncio.wait_for(req.event.wait(), timeout=timeout)
        return bool(req.result)
    except asyncio.TimeoutError:
        _pending.pop(req.id, None)
        return False


def respond_to_permission(request_id: str, approved: bool) -> bool:
    """
    Called by the POST /permissions/respond HTTP endpoint.
    Returns True if the request was found and resolved, False if it already
    expired or doesn't exist.
    """
    req = _pending.pop(request_id, None)
    if req is None:
        return False
    req.result = approved
    req.event.set()
    return True
