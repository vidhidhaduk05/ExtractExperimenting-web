"""
ocr.py — OCR backend implementations including Baidu Unlimited-OCR and fallbacks.

Provides:
  * UnlimitedOCRBackend: In-process HuggingFace transformers model (baidu/Unlimited-OCR)
  * UnlimitedOCRServerBackend: SGLang / vLLM HTTP inference client
  * TesseractFallback: pytesseract client
  * NullOCRBackend: Deterministic mock for unit testing & non-GPU runs
"""
from __future__ import annotations
import base64
import os
from typing import Optional, Union, List


class OCRBackend:
    """Abstract interface for OCR backends: ocr(image_input) -> str."""
    name: str = "base_ocr"

    def ocr(self, image_input: Union[str, bytes]) -> str:
        """Process image file path or raw bytes and return extracted text/markdown."""
        raise NotImplementedError

    def ocr_batch(self, image_inputs: List[Union[str, bytes]]) -> List[str]:
        """Process a batch of images."""
        return [self.ocr(inp) for inp in image_inputs]


class NullOCRBackend(OCRBackend):
    """No-op OCR backend for unit tests or environments without OCR models."""
    name: str = "null_ocr"

    def ocr(self, image_input: Union[str, bytes]) -> str:
        return ""


class TesseractFallback(OCRBackend):
    """Fallback OCR using pytesseract."""
    name: str = "tesseract"

    def __init__(self, lang: str = "eng"):
        self.lang = lang

    def ocr(self, image_input: Union[str, bytes]) -> str:
        try:
            import pytesseract
            from PIL import Image
            import io
        except ImportError:
            return "[OCR Error: pytesseract or Pillow not installed]"

        try:
            if isinstance(image_input, bytes):
                img = Image.open(io.BytesIO(image_input))
            else:
                img = Image.open(image_input)
            return pytesseract.image_to_string(img, lang=self.lang).strip()
        except Exception as e:
            return f"[OCR Error: {e}]"


class UnlimitedOCRBackend(OCRBackend):
    """In-process inference using baidu/Unlimited-OCR (HuggingFace transformers).

    Requires CUDA GPU and packages: torch, transformers, Pillow, pymupdf.
    """
    name: str = "unlimited_ocr_local"

    def __init__(
        self,
        model_name: str = "baidu/Unlimited-OCR",
        config_type: str = "gundam",  # "gundam" (base_size=1024, image_size=640, crop_mode=True) or "base" (1024)
        device: str = "cuda",
        torch_dtype: str = "bfloat16",
    ):
        self.model_name = model_name
        self.config_type = config_type
        self.device = device
        self.torch_dtype = torch_dtype
        self._tokenizer = None
        self._model = None

    def _lazy_load(self):
        if self._model is not None:
            return
        import torch
        from transformers import AutoModel, AutoTokenizer

        dtype = getattr(torch, self.torch_dtype, torch.bfloat16)
        self._tokenizer = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
        self._model = AutoModel.from_pretrained(
            self.model_name,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=dtype,
        )
        self._model = self._model.eval().to(self.device)

    def ocr(self, image_input: Union[str, bytes]) -> str:
        try:
            self._lazy_load()
        except Exception as e:
            # Fall back if model loading fails (e.g. no GPU available)
            return f"[Unlimited-OCR Error: {e}]"

        import tempfile

        tmp_path = None
        if isinstance(image_input, bytes):
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                f.write(image_input)
                tmp_path = f.name
            image_file = tmp_path
        else:
            image_file = image_input

        try:
            out_dir = tempfile.mkdtemp(prefix="ocr_out_")
            if self.config_type == "gundam":
                kwargs = dict(base_size=1024, image_size=640, crop_mode=True)
            else:
                kwargs = dict(base_size=1024, image_size=1024, crop_mode=False)

            res = self._model.infer(
                self._tokenizer,
                prompt="<image>document parsing.",
                image_file=image_file,
                output_path=out_dir,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=128,
                save_results=True,
                **kwargs,
            )
            return str(res or "").strip()
        except Exception as e:
            return f"[Unlimited-OCR Infer Error: {e}]"
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


class UnlimitedOCRServerBackend(OCRBackend):
    """HTTP client connecting to a remote SGLang or vLLM server serving Unlimited-OCR."""
    name: str = "unlimited_ocr_server"

    def __init__(self, server_url: str = "http://127.0.0.1:10000", prompt: str = "document parsing."):
        self.server_url = server_url.rstrip("/")
        self.prompt = prompt

    def ocr(self, image_input: Union[str, bytes]) -> str:
        try:
            import requests
        except ImportError:
            return "[OCR Error: requests library not installed]"

        if isinstance(image_input, bytes):
            img_b64 = base64.b64encode(image_input).decode("utf-8")
            mime = "image/png"
        else:
            ext = os.path.splitext(image_input)[1].lower()
            mime = "image/jpeg" if ext in (".jpg", ".jpeg") else f"image/{ext.lstrip('.')}"
            with open(image_input, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")

        payload = {
            "model": "Unlimited-OCR",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self.prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
                    ],
                }
            ],
            "temperature": 0.0,
            "max_tokens": 4096,
        }

        try:
            resp = requests.post(f"{self.server_url}/v1/chat/completions", json=payload, timeout=120)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            return f"[OCR Server Error HTTP {resp.status_code}: {resp.text}]"
        except Exception as e:
            return f"[OCR Server Exception: {e}]"
