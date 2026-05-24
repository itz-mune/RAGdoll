"""Shared type definitions for the RAGdoll plugin system."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class PluginCategory(str, Enum):
    SKILL = "skill"
    STYLE = "style"
    ADDON = "addon"


@dataclass
class PluginManifest:
    id: str
    name: str
    version: str
    category: PluginCategory
    author: str
    description: str
    icon: str
    entry: str
    min_ragdoll_version: str
    tags: list[str] = field(default_factory=list)
    long_description: str = ""
    changelog: dict[str, str] = field(default_factory=dict)
    config_fields: list[dict] = field(default_factory=list)
    actions: list[dict] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "PluginManifest":
        return cls(
            id=data["id"],
            name=data["name"],
            version=data["version"],
            category=PluginCategory(data.get("category", "skill")),
            author=data.get("author", "unknown"),
            description=data.get("description", ""),
            icon=data.get("icon", "🔌"),
            entry=data.get("entry", "skill.py"),
            min_ragdoll_version=data.get("min_ragdoll_version", "0.1.0"),
            tags=data.get("tags", []),
            long_description=data.get("long_description", ""),
            changelog=data.get("changelog", {}),
            config_fields=data.get("config_fields", []),
            actions=data.get("actions", []),
        )


@dataclass
class InstalledPlugin:
    manifest: PluginManifest
    path: Path
    is_enabled: bool
    is_preinstalled: bool
    installed_at: float

    def to_dict(self) -> dict:
        return {
            "id": self.manifest.id,
            "name": self.manifest.name,
            "version": self.manifest.version,
            "category": self.manifest.category.value,
            "author": self.manifest.author,
            "description": self.manifest.description,
            "icon": self.manifest.icon,
            "entry": self.manifest.entry,
            "min_ragdoll_version": self.manifest.min_ragdoll_version,
            "tags": self.manifest.tags,
            "long_description": self.manifest.long_description,
            "changelog": self.manifest.changelog,
            "config_fields": self.manifest.config_fields,
            "actions": self.manifest.actions,
            "is_enabled": self.is_enabled,
            "is_preinstalled": self.is_preinstalled,
            "installed_at": self.installed_at,
        }
