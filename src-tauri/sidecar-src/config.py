"""Global app configuration loader for the RAGdoll sidecar.

Always use get_config() instead of hardcoding values like ports or URLs.
"""
import json
import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_config() -> dict:
    """Load and cache ragdoll.config.json.

    Resolution order:
    1. RAGDOLL_CONFIG_PATH env var — set by lib.rs in dev builds so config.py
       doesn't need to guess the repo root (sidecar-src is now inside src-tauri/).
    2. parent.parent of this file — works in production where both
       ragdoll.config.json and sidecar-src/ land in the same resource_dir.
    """
    env_path = os.environ.get("RAGDOLL_CONFIG_PATH")
    if env_path:
        config_path = Path(env_path)
    else:
        # Production: __file__ is resource_dir/sidecar-src/config.py
        # ragdoll.config.json is resource_dir/ragdoll.config.json
        config_path = Path(__file__).parent.parent / "ragdoll.config.json"
    with open(config_path, encoding="utf-8") as f:
        return json.load(f)


def get_sidecar_port() -> int:
    return int(get_config()["sidecar"]["port"])


def get_sidecar_host() -> str:
    return get_config()["sidecar"]["host"]


def get_plugins_config() -> dict:
    return get_config()["plugins"]


def get_preinstalled_plugin_ids() -> list[str]:
    return get_config()["plugins"].get("preinstalled", [])
