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

# Pre-exported ONNX model — must exist before running PyInstaller.
# The CI workflow runs `python -c "from memory.embedder import ..."` first.
_ONNX_MODEL_DIR = HERE / "models" / "all-MiniLM-L6-v2-onnx"

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
    datas=(
        # Include the pre-exported ONNX model so the embedded binary can run
        # without needing PyTorch or an internet connection at first launch.
        # The CI workflow exports this model before invoking PyInstaller.
        ([(str(_ONNX_MODEL_DIR), "models/all-MiniLM-L6-v2-onnx")]
        if _ONNX_MODEL_DIR.exists()
        else [])
        # Bundle ragdoll.config.json at the root of _MEIPASS so config.py
        # can find it at runtime regardless of where the binary is launched from.
        + [(str(HERE.parent / "ragdoll.config.json"), ".")]
    ),
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Strip heavy packages that are never used at runtime.
        # NOTE: do NOT list setuptools or distutils here — PyInstaller has an
        # internal alias hook (distutils → setuptools._distutils) that raises
        # ValueError: "already imported as ExcludedModule" if they appear here.
        'tkinter',
        'matplotlib',
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
        'tensorboard',
        'torch.utils.tensorboard',
        # ── PyTorch ecosystem (~2-3 GB on Linux) ──────────────────────────────
        # The embedder uses ONNX Runtime at inference time; torch is only needed
        # for the one-time model export, which the CI workflow runs BEFORE
        # PyInstaller so the result is bundled as a datas entry above.
        'torch',
        'torchvision',
        'torchaudio',
        'triton',
        'flash_attn',
        # Training utilities inside transformers/optimum — not used at inference
        'optimum.exporters',
        'tensorflow',
        'keras',
        'jax',
        'flax',
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
    onefile=True,
    console=False,   # No console window on Windows
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,  # Use host arch; overridden by CI --target flag
    codesign_identity=None,
    entitlements_file=None,
)
