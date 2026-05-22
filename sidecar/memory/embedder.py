"""ONNX Runtime INT8 embedder with 2048-entry MD5-keyed LRU cache.

Falls back to SentenceTransformer automatically if ONNX/optimum is not installed.
On first run with ONNX available, exports + quantizes the model to disk (~one minute).
"""
from __future__ import annotations

import hashlib
import os
import warnings
from collections import OrderedDict
from pathlib import Path

import numpy as np

# Suppress HF Hub "unauthenticated" nag — all-MiniLM-L6-v2 is public, no token needed
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
warnings.filterwarnings("ignore", message=".*unauthenticated.*")
warnings.filterwarnings("ignore", message=".*HF_TOKEN.*")

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
_ONNX_DIR = Path(__file__).parent.parent / "models" / "all-MiniLM-L6-v2-onnx"
_LRU_MAX = 2048

# LRU cache: MD5(text) → normalized float32 list
_embed_lru: OrderedDict[str, list[float]] = OrderedDict()

# Lazy singletons — exactly one of (_session, _fallback) will be set after _load()
_session = None    # onnxruntime.InferenceSession
_tokenizer = None  # transformers.AutoTokenizer
_fallback = None   # sentence_transformers.SentenceTransformer


def _md5(text: str) -> str:
    return hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()


def _lru_get(k: str) -> list[float] | None:
    if k in _embed_lru:
        _embed_lru.move_to_end(k)
        return _embed_lru[k]
    return None


def _lru_put(k: str, v: list[float]) -> None:
    if k in _embed_lru:
        _embed_lru.move_to_end(k)
    _embed_lru[k] = v
    if len(_embed_lru) > _LRU_MAX:
        _embed_lru.popitem(last=False)


def _load() -> None:
    global _session, _tokenizer, _fallback
    if _session is not None or _fallback is not None:
        return

    try:
        import onnxruntime as ort  # noqa: F401
        from transformers import AutoTokenizer

        if not _ONNX_DIR.exists():
            _export_onnx()

        # Prefer quantized model; fall back to base ONNX export
        candidates = sorted(_ONNX_DIR.glob("model_quantized.onnx")) or sorted(_ONNX_DIR.glob("model.onnx"))
        if not candidates:
            raise FileNotFoundError("No ONNX model found in " + str(_ONNX_DIR))

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 4
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(str(candidates[0]), sess_options=opts)
        _tokenizer = AutoTokenizer.from_pretrained(str(_ONNX_DIR))
        print(f"[Embedder] ONNX session ready ({candidates[0].name})")

    except Exception as exc:
        print(f"[Embedder] ONNX unavailable ({exc}), falling back to SentenceTransformer")
        from sentence_transformers import SentenceTransformer
        _fallback = SentenceTransformer(MODEL_ID)


def _export_onnx() -> None:
    """Export the model to ONNX + INT8-quantize. Runs once; result cached to disk."""
    print("[Embedder] Exporting to ONNX (one-time setup, ~1 min)…")
    _ONNX_DIR.mkdir(parents=True, exist_ok=True)
    try:
        from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
        from transformers import AutoTokenizer

        model = ORTModelForFeatureExtraction.from_pretrained(MODEL_ID, export=True)
        model.save_pretrained(str(_ONNX_DIR))
        AutoTokenizer.from_pretrained(MODEL_ID).save_pretrained(str(_ONNX_DIR))

        quantizer = ORTQuantizer.from_pretrained(str(_ONNX_DIR))
        # Try AVX-512 VNNI first (best on modern x86), fall back to generic ARM/generic
        try:
            qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
        except Exception:
            try:
                qconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
            except Exception:
                from optimum.onnxruntime.configuration import QuantizationConfig, QuantFormat, QuantizationMode
                qconfig = QuantizationConfig(
                    is_static=False,
                    format=QuantFormat.QOperator,
                    mode=QuantizationMode.IntegerOps,
                    per_channel=False,
                )
        quantizer.quantize(save_dir=str(_ONNX_DIR), quantization_config=qconfig)
        print("[Embedder] INT8 model exported successfully")

    except Exception as exc:
        import shutil
        shutil.rmtree(_ONNX_DIR, ignore_errors=True)
        raise RuntimeError(f"ONNX export failed: {exc}") from exc


def _mean_pool(token_embeds: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Mean-pool token embeddings weighted by the attention mask."""
    mask = attention_mask[:, :, None].astype(np.float32)
    return (token_embeds * mask).sum(axis=1) / mask.sum(axis=1).clip(min=1e-9)


def embed(texts: list[str]) -> list[list[float]]:
    """Return L2-normalized float32 embeddings, using LRU cache for already-seen texts."""
    if not texts:
        return []
    _load()

    keys = [_md5(t) for t in texts]
    results: list[list[float] | None] = [_lru_get(k) for k in keys]
    uncached_indices = [i for i, r in enumerate(results) if r is None]

    if uncached_indices:
        batch = [texts[i] for i in uncached_indices]

        if _fallback is not None:
            vecs: list[list[float]] = _fallback.encode(
                batch, batch_size=32, show_progress_bar=False, normalize_embeddings=True
            ).tolist()
        else:
            enc = _tokenizer(
                batch, padding=True, truncation=True, max_length=128, return_tensors="np"
            )
            valid_names = {inp.name for inp in _session.get_inputs()}
            ort_input = {k: v for k, v in enc.items() if k in valid_names}
            token_embeds = _session.run(None, ort_input)[0]
            pooled = _mean_pool(token_embeds, enc["attention_mask"])
            norms = np.linalg.norm(pooled, axis=1, keepdims=True).clip(min=1e-9)
            vecs = (pooled / norms).tolist()

        for list_idx, vec in zip(uncached_indices, vecs):
            _lru_put(keys[list_idx], vec)
            results[list_idx] = vec

    return results  # type: ignore[return-value]


def warmup() -> None:
    """Pre-load the model and run a dummy inference to compile any lazy JIT paths."""
    _load()
    embed(["warmup ping — ignore this"])


def lru_stats() -> dict:
    return {"lru_size": len(_embed_lru), "lru_max": _LRU_MAX}
