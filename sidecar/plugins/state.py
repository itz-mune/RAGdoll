"""Plugin enabled/disabled state and active style — persisted in plugin_state.json."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


def _state_path() -> Path:
    import os
    base = os.environ.get("RAGDOLL_DATA_DIR", str(Path(__file__).parent.parent.parent))
    return Path(base) / "ragdoll_memory" / "plugin_state.json"


def _load_raw() -> dict:
    path = _state_path()
    if not path.exists():
        return {"enabled": [], "disabled": [], "active_style": None, "plugin_config": {}}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"enabled": [], "disabled": [], "active_style": None, "plugin_config": {}}


def _save_raw(data: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


@dataclass
class PluginState:
    enabled: list[str]
    disabled: list[str]
    active_style: str | None
    plugin_config: dict


def get_plugin_state() -> PluginState:
    data = _load_raw()
    return PluginState(
        enabled=data.get("enabled", []),
        disabled=data.get("disabled", []),
        active_style=data.get("active_style", None),
        plugin_config=data.get("plugin_config", {}),
    )


def set_plugin_enabled(plugin_id: str, enabled: bool) -> None:
    data = _load_raw()
    enabled_list: list = data.get("enabled", [])
    disabled_list: list = data.get("disabled", [])
    if enabled:
        if plugin_id not in enabled_list:
            enabled_list.append(plugin_id)
        if plugin_id in disabled_list:
            disabled_list.remove(plugin_id)
    else:
        if plugin_id in enabled_list:
            enabled_list.remove(plugin_id)
        if plugin_id not in disabled_list:
            disabled_list.append(plugin_id)
    data["enabled"] = enabled_list
    data["disabled"] = disabled_list
    _save_raw(data)


def set_active_style(plugin_id: str | None) -> None:
    data = _load_raw()
    data["active_style"] = plugin_id
    _save_raw(data)


def set_plugin_config(plugin_id: str, config: dict) -> None:
    data = _load_raw()
    pc: dict = data.get("plugin_config", {})
    pc[plugin_id] = {**pc.get(plugin_id, {}), **config}
    data["plugin_config"] = pc
    _save_raw(data)


def get_plugin_config(plugin_id: str) -> dict:
    return _load_raw().get("plugin_config", {}).get(plugin_id, {})


def reset_plugin_config(plugin_id: str) -> None:
    data = _load_raw()
    pc: dict = data.get("plugin_config", {})
    pc.pop(plugin_id, None)
    data["plugin_config"] = pc
    _save_raw(data)
