"""Plugin loader — scans the plugins directory and dynamically loads skills and styles."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import traceback
from pathlib import Path

from .state import get_plugin_state, get_plugin_config, set_plugin_enabled
from .types import InstalledPlugin, PluginCategory, PluginManifest


# ── Plugin directory ──────────────────────────────────────────────────────────

def _plugins_dir() -> Path:
    base = os.environ.get("RAGDOLL_DATA_DIR", str(Path(__file__).parent.parent.parent))
    d = Path(base) / "ragdoll_plugins"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _preinstalled_ids() -> list[str]:
    try:
        from config import get_preinstalled_plugin_ids
        return get_preinstalled_plugin_ids()
    except Exception:
        return []


# ── Per-plugin Python dependency installation ─────────────────────────────────

# Track which plugin IDs have already had their deps verified this session
# so we don't re-run uv on every tool call.
_deps_verified: set[str] = set()


def _find_uv() -> str | None:
    """Return the path to the uv binary, or None if not found.

    Checks (in order):
    1. RAGDOLL_UV env var — set by lib.rs when spawning the sidecar
    2. System PATH
    """
    uv = os.environ.get("RAGDOLL_UV")
    if uv and Path(uv).exists():
        return uv
    return shutil.which("uv") or shutil.which("uv.exe")


def ensure_plugin_deps(plugin: InstalledPlugin) -> None:
    """Install any Python packages declared in manifest.dependencies.

    Uses ``uv pip install --python <current interpreter>`` which is near-instant
    if the packages are already installed and only runs once per plugin per session.
    """
    if plugin.manifest.id in _deps_verified:
        return
    _deps_verified.add(plugin.manifest.id)  # mark early to avoid re-entry

    deps = plugin.manifest.dependencies
    if not deps:
        return

    uv = _find_uv()
    if not uv:
        print(
            f"[Plugins] Warning: cannot install deps for '{plugin.manifest.id}' "
            "— uv binary not found. Set RAGDOLL_UV or add uv to PATH.",
            file=sys.stderr,
        )
        return

    print(f"[Plugins] Installing/verifying deps for '{plugin.manifest.id}': {deps}")
    try:
        result = subprocess.run(
            [uv, "pip", "install", "--python", sys.executable] + deps,
            capture_output=True,
            text=True,
            timeout=180,   # 3 min max — first-time download
        )
        if result.returncode == 0:
            print(f"[Plugins] Deps ready for '{plugin.manifest.id}'")
        else:
            print(
                f"[Plugins] Dep install failed for '{plugin.manifest.id}':\n"
                f"{result.stderr.strip()}",
                file=sys.stderr,
            )
    except subprocess.TimeoutExpired:
        print(
            f"[Plugins] Dep install timed out for '{plugin.manifest.id}'",
            file=sys.stderr,
        )
    except Exception as exc:
        print(
            f"[Plugins] Dep install error for '{plugin.manifest.id}': {exc}",
            file=sys.stderr,
        )


# ── In-memory caches ──────────────────────────────────────────────────────────

_loaded_plugins: dict[str, InstalledPlugin] = {}
_loaded_tools: dict[str, object] = {}   # plugin_id → LangChain BaseTool


# ── Core loader ───────────────────────────────────────────────────────────────

def load_all_plugins() -> dict[str, InstalledPlugin]:
    """Scan plugins_dir, parse manifests, return dict keyed by plugin id."""
    global _loaded_plugins, _loaded_tools
    plugins_dir = _plugins_dir()
    state = get_plugin_state()
    preinstalled = _preinstalled_ids()
    result: dict[str, InstalledPlugin] = {}

    for plugin_dir in sorted(plugins_dir.iterdir()):
        if not plugin_dir.is_dir():
            continue
        manifest_path = plugin_dir / "manifest.json"
        if not manifest_path.exists():
            print(f"[Plugins] Skipping {plugin_dir.name} — no manifest.json")
            continue
        try:
            with open(manifest_path, encoding="utf-8") as f:
                raw = json.load(f)
            manifest = PluginManifest.from_dict(raw)
            is_enabled = manifest.id not in state.disabled
            plugin = InstalledPlugin(
                manifest=manifest,
                path=plugin_dir,
                is_enabled=is_enabled,
                is_preinstalled=manifest.id in preinstalled,
                installed_at=manifest_path.stat().st_mtime,
            )
            result[manifest.id] = plugin
        except Exception as exc:
            print(f"[Plugins] Failed to load {plugin_dir.name}: {exc}")
            traceback.print_exc()

    _loaded_plugins = result
    _loaded_tools = {}  # reset tool cache on reload
    print(f"[Plugins] Loaded {len(result)} plugin(s)")
    return result


def _ensure_loaded() -> dict[str, InstalledPlugin]:
    if not _loaded_plugins:
        load_all_plugins()
    return _loaded_plugins


# ── Skill loading ─────────────────────────────────────────────────────────────

def load_skill(plugin: InstalledPlugin):
    """Dynamically import skill.py and call its register() function → BaseTool."""
    entry_path = plugin.path / plugin.manifest.entry
    if not entry_path.exists():
        print(f"[Plugins] Skill entry not found: {entry_path}")
        return None
    # Install any Python packages this plugin declared in manifest.dependencies
    ensure_plugin_deps(plugin)
    try:
        module_name = f"ragdoll_plugin_{plugin.manifest.id.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, entry_path)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        if not hasattr(module, "register"):
            print(f"[Plugins] {plugin.manifest.id} has no register() function — skipping")
            return None
        # Inject saved config into module._CONFIG if it exists
        if hasattr(module, "_CONFIG"):
            saved_cfg = get_plugin_config(plugin.manifest.id)
            module._CONFIG = saved_cfg
        tools = module.register()
        print(f"[Plugins] Loaded skill: {plugin.manifest.name} ({len(tools)} tool(s))")
        return tools
    except Exception as exc:
        print(f"[Plugins] Failed to load skill {plugin.manifest.id}: {exc}")
        traceback.print_exc()
        return None


# ── Style loading ─────────────────────────────────────────────────────────────

def load_style(plugin: InstalledPlugin) -> dict | None:
    """Load style.json from a style plugin directory."""
    entry_path = plugin.path / plugin.manifest.entry
    if not entry_path.exists():
        return None
    try:
        with open(entry_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        print(f"[Plugins] Failed to load style {plugin.manifest.id}: {exc}")
        return None


# ── Public accessors ──────────────────────────────────────────────────────────

def get_enabled_skills() -> list:
    """Return all enabled skill tools (dynamically loaded, cached per session)."""
    plugins = _ensure_loaded()
    tools = []
    for plugin in plugins.values():
        if not plugin.is_enabled:
            continue
        if plugin.manifest.category != PluginCategory.SKILL:
            continue
        if plugin.manifest.id not in _loaded_tools:
            plugin_tools = load_skill(plugin)
            if plugin_tools:
                _loaded_tools[plugin.manifest.id] = plugin_tools
        plugin_tools = _loaded_tools.get(plugin.manifest.id)
        if plugin_tools:
            # register() returns a list; extend, don't append
            if isinstance(plugin_tools, list):
                tools.extend(plugin_tools)
            else:
                tools.append(plugin_tools)
    return tools


def get_active_style() -> dict | None:
    """Return active style plugin config dict if one is set, else None."""
    state = get_plugin_state()
    if not state.active_style:
        return None
    plugins = _ensure_loaded()
    plugin = plugins.get(state.active_style)
    if not plugin or plugin.manifest.category != PluginCategory.STYLE:
        return None
    return load_style(plugin)


def get_all_plugins() -> list[InstalledPlugin]:
    return list(_ensure_loaded().values())


# ── Mutations ─────────────────────────────────────────────────────────────────

def enable_plugin(plugin_id: str) -> None:
    set_plugin_enabled(plugin_id, True)
    load_all_plugins()


def disable_plugin(plugin_id: str) -> None:
    set_plugin_enabled(plugin_id, False)
    _loaded_tools.pop(plugin_id, None)
    load_all_plugins()


def uninstall_plugin(plugin_id: str) -> None:
    plugin_path = _plugins_dir() / plugin_id
    if plugin_path.exists():
        shutil.rmtree(plugin_path)
    _loaded_plugins.pop(plugin_id, None)
    _loaded_tools.pop(plugin_id, None)


def install_plugin(plugin_id: str, files: list[dict]) -> None:
    """Write plugin files to disk from [{ path, content }] list, then reload."""
    plugin_path = _plugins_dir() / plugin_id
    plugin_path.mkdir(parents=True, exist_ok=True)
    for file_info in files:
        rel = file_info["path"]
        content = file_info["content"]
        target = plugin_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            target.write_bytes(content)
        else:
            target.write_text(str(content), encoding="utf-8")
    # Reload so the new plugin appears; dep installation happens on first load_skill call
    _deps_verified.discard(plugin_id)  # force re-check after fresh install
    load_all_plugins()
