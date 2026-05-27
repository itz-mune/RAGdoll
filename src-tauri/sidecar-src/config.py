"""Global app configuration loader for the RAGdoll sidecar.

Always use get_config() instead of hardcoding values like ports or URLs.
"""
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_config() -> dict:
    """Load and cache ragdoll.config.json.

    ragdoll.config.json lives in the same directory as this file (sidecar-src/).
    This works in both dev and production without any path guessing.
    """
    config_path = Path(__file__).parent / "ragdoll.config.json"
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
