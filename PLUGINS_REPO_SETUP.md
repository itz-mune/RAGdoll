# RAGdoll Plugins Repository Setup

This document explains how the RAGdoll plugin marketplace works and how to set up and publish the plugins repository.

---

## Repository Structure

The plugins repository (`RAGdoll-plugins` on GitHub) has this layout:

```
RAGdoll-plugins/
├── registry.json              ← Master plugin index (fetched by the Marketplace)
├── skills/
│   ├── web-search/
│   │   ├── manifest.json      ← Plugin metadata
│   │   ├── skill.py           ← Python entry point
│   │   └── README.md          ← Shown in Marketplace detail page
│   ├── image-viewer/
│   ├── url-fetcher/
│   ├── youtube-transcript/
│   ├── image-gen-dalle/
│   ├── image-gen-stability/
│   └── image-gen-comfyui/
└── styles/
    ├── pirate/
    │   ├── manifest.json
    │   ├── style.json
    │   └── README.md
    └── shakespeare/
        ├── manifest.json
        ├── style.json
        └── README.md
```

All files live in the `plugins-repo/` folder in this repository and must be pushed to the separate `itz-mune/RAGdoll-plugins` GitHub repo.

---

## Publishing the Plugins Repo

### One-time setup

```bash
# From the RAGdoll root
cd plugins-repo
git init
git remote add origin https://github.com/itz-mune/RAGdoll-plugins.git
git add .
git commit -m "Initial plugin registry"
git push -u origin main
```

### Updating a plugin

1. Edit the plugin files in `plugins-repo/skills/<id>/` or `plugins-repo/styles/<id>/`.
2. Bump the `version` in both `manifest.json` and `registry.json`.
3. Commit and push — the Marketplace will pick up the new version immediately (cache TTL is 5 minutes).

---

## `registry.json` Schema

The top-level file the Marketplace downloads. Every plugin entry must match this schema:

```json
{
  "id": "web-search",           // unique slug, matches folder name
  "name": "Web Search",         // display name
  "category": "skill",          // "skill" | "style" | "addon"
  "author": "RAGdoll",
  "version": "1.0.0",           // semver
  "description": "...",         // one-line summary shown in the grid card
  "icon": "🔍",                 // emoji icon
  "entry": "skill.py",          // entry file name (skill.py or style.json)
  "path": "skills/web-search",  // relative path inside the repo
  "min_ragdoll_version": "0.1.0",
  "tags": ["search", "web"],
  "preinstalled": true,         // auto-installed on first launch
  "stars": 0,
  "downloads": 0
}
```

---

## Plugin Types

### Skill plugins (`category: "skill"`)

- Entry file: `skill.py`
- Must expose a `register() -> list` function that returns a list of LangChain `@tool`-decorated callables.
- The sidecar dynamically imports `skill.py` and calls `register()` to get the tool list.
- Tools are passed to the LLM via `llm.bind_tools(tools)` in `agent.py`.

**Minimal `skill.py` template:**

```python
from langchain_core.tools import tool

@tool
def my_tool(input: str) -> str:
    """Description of what this tool does."""
    return f"Result for: {input}"

def register() -> list:
    return [my_tool]
```

**Using plugin config:**

```python
_CONFIG: dict = {}   # populated by loader.py after calling register()

@tool
def my_tool(input: str) -> str:
    api_key = _CONFIG.get("api_key", "")
    ...
```

The plugin loader sets `module._CONFIG = plugin_config` after importing.

### Style plugins (`category: "style"`)

- Entry file: `style.json`
- Must contain a `system_prompt_prefix` string.
- The sidecar prepends it to the system prompt on every chat completion when the style is active.

**`style.json` template:**

```json
{
  "system_prompt_prefix": "You always respond in the style of..."
}
```

Only one style can be active at a time. Activate/deactivate in the Marketplace → Installed tab.

### Add-on plugins (`category: "addon"`) — *coming soon*

Reserved for future UI extensions (custom panels, themes, etc.).

---

## `manifest.json` Schema

Lives inside each plugin folder. Contains the same fields as `registry.json` plus:

```json
{
  "long_description": "Markdown string shown in the detail page.",
  "changelog": {
    "1.0.0": "Initial release.",
    "1.1.0": "Added config option X."
  },
  "config_fields": [
    {
      "key": "api_key",
      "label": "API Key",
      "type": "password",
      "placeholder": "sk-...",
      "help": "Your API key."
    }
  ]
}
```

`config_fields` drives the settings UI in the plugin detail page. Supported types: `text`, `password`, `number`.

---

## Local Development & Testing

### Testing skill plugins locally

1. Create the plugin folder in `ragdoll_plugins/` (next to the sidecar):
   ```
   ragdoll_plugins/
   └── web-search/
       ├── manifest.json
       └── skill.py
   ```
2. Start the sidecar — it auto-discovers plugins in `ragdoll_plugins/` at startup.
3. Chat with the app; the skill will be available as a tool if enabled.

### Testing without the GitHub registry

In `src/lib/config.ts` (dev mode), temporarily point `registry_url` to a local server:

```bash
# Serve the plugins-repo folder locally
cd plugins-repo
npx serve . --cors --port 3001
```

Then in `ragdoll.config.json`:
```json
"registry_url": "http://localhost:3001/registry.json",
"raw_base": "http://localhost:3001"
```

### Installing plugins in dev mode

The Marketplace install flow works end-to-end in dev mode as long as the sidecar is running and can reach the registry URL.

---

## Pre-installed Plugin Auto-Install

On first launch (when `ragdoll_plugins/` is empty or missing a preinstalled plugin), the frontend calls `installPlugin()` for each plugin ID listed in `ragdoll.config.json` → `plugins.preinstalled`.

Currently preinstalled:
- `web-search`
- `image-viewer`
- `url-fetcher`
- `youtube-transcript`

These install automatically so users have useful skills out-of-the-box without needing to visit the Marketplace.

---

## Q&A

### Which Python packages does a skill need?

All packages in `sidecar/pyproject.toml` are available. For the built-in skills, the following were added:
- `duckduckgo-search` — web-search
- `trafilatura` — url-fetcher
- `youtube-transcript-api` — youtube-transcript
- `requests` — image-viewer, image-gen-stability, image-gen-comfyui
- `stability-sdk` — image-gen-stability (backup / legacy)
- `openai` — available via `langchain-openai`

Community plugins that need extra packages should document the `pip install` command in their README.

### Can plugins access the LanceDB memory store?

Not directly. Skills only receive a query string and return a string. If you need memory access, add a new sidecar endpoint and call it from the skill.

### How do I test the Thinking UI?

Use Claude 3.5+ or Claude 3 Opus with the extended thinking feature enabled. Alternatively, use any model that supports `<think>` tags (e.g., DeepSeek R1, Qwen QwQ). The sidecar extracts thinking content and sends it as a separate `thinking` SSE event.

### What order should I implement skills?

Recommended order from simplest to most complex:
1. `web-search` — no external API, great smoke test for the tool loop
2. `url-fetcher` — tests trafilatura extraction
3. `youtube-transcript` — tests async API call
4. `image-viewer` — tests base64 vision pipeline
5. `image-gen-dalle` — tests OpenAI Images API (requires API key)
6. `image-gen-stability` — tests Stability AI REST (requires API key)
7. `image-gen-comfyui` — tests local server polling (requires ComfyUI)
