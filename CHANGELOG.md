# Changelog

All notable changes to RAGdoll are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.1.0] — 2026-05-23

### Added
- Initial public release
- Local-first RAG chat powered by LangGraph + LanceDB
- Support for OpenAI, Anthropic, Groq, Google Gemini, Ollama, HuggingFace, OpenRouter
- Model profile management (create, edit, switch, set default)
- Persistent vector memory with semantic search
- Document ingestion (PDF, DOCX, plain text)
- Web search and URL-scraping skills via plugins
- System tray integration — hide to tray on close, tray profile label sync
- Launch on system startup toggle
- Customisable accent colour with live preview
- Dark / light / system theme
- Keyboard shortcuts (Ctrl+N new chat, Ctrl+P switch profile, Ctrl+, settings, …)
- Pre-React HTML splash screen with accent-coloured logo
- ONNX-accelerated sentence embedder (all-MiniLM-L6-v2)
- Auto-updater via `tauri-plugin-updater` — silent background check, banner + modal UI
- PyInstaller sidecar bundling for zero-dependency installs
- GitHub Actions CI/CD — matrix builds for Windows x64, macOS Intel, macOS Apple Silicon, Linux x64

[Unreleased]: https://github.com/itz-mune/RAGdoll/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itz-mune/RAGdoll/releases/tag/v0.1.0
