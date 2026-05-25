"""Global app configuration loader for the RAGdoll sidecar.

Always use get_config() instead of hardcoding values like ports or URLs.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_config() -> dict:
    """Load and cache ragdoll.config.json.

    When running as a PyInstaller onefile bundle the process extracts itself
    into a temporary directory (sys._MEIPASS).  ragdoll.config.json is bundled
    at the root of that directory.  In development it sits two levels above
    this file (project root).
    """
    if hasattr(sys, '_MEIPASS'):
        # Bundled binary — config was included as a top-level datas entry
        config_path = Path(sys._MEIPASS) / "ragdoll.config.json"
    else:
        # Development — project root is two directories up from sidecar/
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
