"""CI helper: export the ONNX embedding model before PyInstaller runs.

Run from the sidecar/ directory:
    uv run python export_onnx_model.py
"""
import os
import sys

sys.path.insert(0, ".")
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"

from memory.embedder import _ONNX_DIR, _export_onnx  # noqa: E402

if _ONNX_DIR.exists():
    print(f"[CI] ONNX model already present at {_ONNX_DIR} — skipping export")
else:
    print(f"[CI] Exporting ONNX model to {_ONNX_DIR} …")
    _export_onnx()
    print("[CI] Export complete")
