# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the RAGdoll Python sidecar.
#
# Usage (from the sidecar/ directory):
#   uv run pyinstaller ragdoll-sidecar.spec --noconfirm
#
# Output: dist/ragdoll-sidecar(.exe)
# The CI workflow copies this to src-tauri/binaries/ with the Rust target
# triple appended so Tauri's externalBin bundler picks it up.

import sys
import os
from pathlib import Path

# ── Helpers ───────────────────────────────────────────────────────────────────

HERE = Path(SPECPATH)

# Collect all .py packages inside the sidecar so hidden imports are found
hidden_imports = [
    # FastAPI / Starlette internals not always auto-detected
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.off',
    'uvicorn.lifespan.on',
    # LangChain provider optional imports
    'langchain_openai',
    'langchain_anthropic',
    'langchain_groq',
    'langchain_google_genai',
    'langchain_huggingface',
    'langchain_ollama',
    # ONNX / sentence-transformers
    'onnxruntime',
    'sentence_transformers',
    # SQL
    'sqlmodel',
    'sqlalchemy',
    # PDF / DOCX
    'pypdf',
    'docx',
    # Misc
    'multipart',
    'dotenv',
]

# ── Analysis ──────────────────────────────────────────────────────────────────

a = Analysis(
    ['main.py'],
    pathex=[str(HERE)],
    binaries=[],
    datas=[
        # Include any local config / model files that live next to main.py
        # Extend this list if you add static assets to the sidecar.
        # Example: ('models/some-model.onnx', 'models'),
    ],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Strip heavy packages that are never used at runtime
        'tkinter',
        'matplotlib',
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
        'setuptools',
        'distutils',
        'test',
        'unittest',
    ],
    noarchive=False,
    optimize=2,
)

# ── PYZ (pure-Python archive) ─────────────────────────────────────────────────

pyz = PYZ(a.pure)

# ── EXE ──────────────────────────────────────────────────────────────────────

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ragdoll-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    # One-file bundle — no need to extract a directory tree on the target machine
    onefile=True,
    console=False,   # No console window on Windows
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,  # Use host arch; overridden by CI --target flag
    codesign_identity=None,
    entitlements_file=None,
)
