<div align="center">

<img src="public/main_logo.svg" width="80" alt="RAGdoll logo" />

# RAGdoll

**Local-first AI chat with retrieval-augmented generation.**  
Your conversations, your documents, your models — all on your machine.

[![Release](https://img.shields.io/github/v/release/itz-mune/RAGdoll?style=flat-square&color=7c3aed)](https://github.com/itz-mune/RAGdoll/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-7c3aed?style=flat-square)](https://github.com/itz-mune/RAGdoll/releases/latest)
[![License](https://img.shields.io/github/license/itz-mune/RAGdoll?style=flat-square&color=7c3aed)](LICENSE)

<!-- screenshot: drop a demo screenshot or GIF here -->
![RAGdoll screenshot](docs/Screenshot.png)

</div>

---

## What is RAGdoll?

RAGdoll is a desktop chat application that connects to the AI providers you already use while keeping every conversation and document stored **locally**. It automatically embeds your chat history and uploaded files into a private vector database, then retrieves the most relevant context for every message — no cloud, no telemetry, no subscriptions beyond your own API keys.

---

## ✨ Features

| | |
|---|---|
| 🤖 **Multi-provider** | OpenAI, Anthropic, Groq, Google Gemini, Ollama, HuggingFace, OpenRouter |
| 🧠 **Persistent memory** | Every message and document is embedded locally with ONNX-accelerated `all-MiniLM-L6-v2` |
| 📄 **Document ingestion** | PDF, DOCX, TXT, CSV, JSON — drag-drop or attach inline |
| 🔍 **Semantic search** | Full memory browser with search, filtering, and per-chunk management |
| 🧩 **Plugins** | Install community skills (web search, YouTube transcripts, image gen, response styles, …) |
| 👤 **Model profiles** | Named profiles per provider/model with separate API keys |
| 🖥️ **System tray** | Hide to tray, launch on startup, new chat from tray menu |
| 🔄 **Auto-updates** | Silent background check; banner + one-click install |
| 🎨 **Theming** | Dark / light / system, custom accent colour, font size & density |
| ⌨️ **Keyboard-first** | `Ctrl+N` new chat · `Ctrl+P` switch profile · `Ctrl+,` settings · and more |

---

## 📦 Installation

Download the latest installer for your platform from the [**Releases**](https://github.com/itz-mune/RAGdoll/releases/latest) page:

| Platform | File |
|---|---|
| **Windows** | `RAGdoll_x.x.x_x64-setup.exe` or `.msi` |
| **macOS (Apple Silicon)** | `RAGdoll_x.x.x_aarch64.dmg` |
| **macOS (Intel)** | `RAGdoll_x.x.x_x86_64.dmg` |
| **Linux** | `RAGdoll_x.x.x_amd64.AppImage` or `.deb` |

> **macOS note:** If Gatekeeper blocks the app, right-click → Open on first launch.

---

## 🚀 Build from source

### Prerequisites

| Tool | Version |
|---|---|
| [Rust](https://rustup.rs) | stable |
| [Node.js](https://nodejs.org) | 20+ |
| [pnpm](https://pnpm.io) | 9+ |
| [uv](https://docs.astral.sh/uv/) | latest |

### Steps

```bash
# 1. Clone
git clone https://github.com/itz-mune/RAGdoll.git
cd RAGdoll

# 2. Install frontend dependencies
pnpm install

# 3. Install Python sidecar dependencies
cd sidecar && uv sync && cd ..

# 4. Run in development mode
pnpm tauri dev
```

The first run downloads and converts the embedding model to ONNX (~1 min, one-time).

### Production build

```bash
pnpm tauri build
```

---

## 🏗️ Tech stack

| Layer | Technology |
|---|---|
| **Shell** | [Tauri v2](https://tauri.app) (Rust) |
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS v4 |
| **Sidecar** | Python · FastAPI · uvicorn |
| **AI** | [LangChain](https://langchain.com) · [LangGraph](https://langchain-ai.github.io/langgraph/) |
| **Memory** | [LanceDB](https://lancedb.com) · ONNX Runtime · `all-MiniLM-L6-v2` |
| **State** | Zustand · Tauri plugin-store |
| **Packaging** | PyInstaller · GitHub Actions (Win / macOS / Linux) |

---

## 🤝 Contributing

Pull requests are welcome. For major changes please open an issue first.

```bash
# Type-check frontend
pnpm tsc --noEmit

# Lint Rust
cd src-tauri && cargo clippy
```

See [RELEASING.md](RELEASING.md) for the release workflow.

---

## 📄 License

[MIT](LICENSE)

