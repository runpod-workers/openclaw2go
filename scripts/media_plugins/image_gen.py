"""
Image generation plugin — FLUX.2 Klein via Diffusers + SDNQ.

Extracted from openclaw-image-server. Keeps model loaded in VRAM
for instant inference.
"""

import base64
import io
import json
import math
import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from media_plugins.base import MediaPlugin

# Reduce VRAM pressure from torch.compile/inductor
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
os.environ.setdefault("TORCHINDUCTOR_DISABLE", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


IMAGE_OUTPUT_DIR = os.environ.get("A2GO_IMAGE_OUTPUT_DIR",
                                  os.environ.get("OPENCLAW_IMAGE_OUTPUT_DIR",
                                                 "/workspace/a2go/images"))
IMAGE_PUBLIC_BASE_URL = os.environ.get("A2GO_IMAGE_PUBLIC_BASE_URL",
                                       os.environ.get("OPENCLAW_IMAGE_PUBLIC_BASE_URL"))
IMAGE_PUBLIC_BASE_URL_FILE = os.environ.get(
    "A2GO_IMAGE_PUBLIC_BASE_URL_FILE",
    os.environ.get("OPENCLAW_IMAGE_PUBLIC_BASE_URL_FILE",
                   "/workspace/a2go/image-base-url.txt"),
)


def _ensure_output_dir():
    os.makedirs(IMAGE_OUTPUT_DIR, exist_ok=True)


def _safe_basename(name):
    return os.path.basename(name)


def _build_image_name(seed, width, height):
    ts = int(time.time())
    return f"a2go-{ts}-{seed}-{width}x{height}.png"


def _get_public_base_url():
    if IMAGE_PUBLIC_BASE_URL:
        return IMAGE_PUBLIC_BASE_URL
    try:
        if os.path.isfile(IMAGE_PUBLIC_BASE_URL_FILE):
            with open(IMAGE_PUBLIC_BASE_URL_FILE, "r", encoding="utf-8") as f:
                value = f.read().strip()
            if value:
                return value
    except Exception:
        pass
    return None


def _round_to_multiple(value, multiple=8):
    return int(math.ceil(value / multiple) * multiple)


def _parse_aspect(aspect):
    if ":" in aspect:
        parts = aspect.split(":")
    elif "x" in aspect:
        parts = aspect.split("x")
    else:
        raise ValueError("Aspect ratio must be like 1:1 or 16:9.")
    w = float(parts[0])
    h = float(parts[1])
    if w <= 0 or h <= 0:
        raise ValueError("Aspect ratio values must be positive.")
    return w / h


def _resolve_size(width, height, aspect, long_side=1024):
    if width and height:
        w = width
        h = height
    elif aspect:
        ratio = _parse_aspect(aspect)
        if ratio >= 1:
            w = long_side
            h = long_side / ratio
        else:
            h = long_side
            w = long_side * ratio
    else:
        w = long_side
        h = long_side
    w = _round_to_multiple(max(256, int(w)))
    h = _round_to_multiple(max(256, int(h)))
    return w, h


class ImageGenPlugin(MediaPlugin):
    """FLUX.2 Klein image generation via Diffusers + SDNQ."""

    name = "image-gen"
    role = "image"

    def __init__(self):
        self._pipe = None
        self._device = None
        self._generator_device = None
        self._last_image_path = None
        self._server_port = 8001

    def load_model(self, config: dict) -> None:
        import torch
        import diffusers

        model_id = config.get("model", "Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic")

        # Import SDNQ for quantized models
        has_sdnq = False
        try:
            import sdnq  # noqa: F401
            from sdnq.loader import apply_sdnq_options_to_model
            from sdnq.quantizer import SDNQConfig, SDNQQuantizer, QuantizationMethod
            has_sdnq = True
        except ImportError:
            print("[ImageGen] WARNING: sdnq not installed, may not work with SDNQ models")

        print(f"[ImageGen] Loading model: {model_id}")
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._generator_device = self._device
        dtype = torch.bfloat16 if self._device == "cuda" else torch.float32

        # Register SDNQ quantizer with diffusers if available
        if has_sdnq:
            try:
                from diffusers.quantizers import auto as diff_auto
                diff_auto.AUTO_QUANTIZATION_CONFIG_MAPPING.setdefault(QuantizationMethod.SDNQ.value, SDNQConfig)
                diff_auto.AUTO_QUANTIZATION_CONFIG_MAPPING.setdefault(QuantizationMethod.SDNQ_TRAINING.value, SDNQConfig)
                diff_auto.AUTO_QUANTIZER_MAPPING.setdefault(QuantizationMethod.SDNQ.value, SDNQQuantizer)
                diff_auto.AUTO_QUANTIZER_MAPPING.setdefault(QuantizationMethod.SDNQ_TRAINING.value, SDNQQuantizer)
                print("[ImageGen] SDNQ quantizer registered with diffusers")
            except Exception as exc:
                print(f"[ImageGen] WARNING: failed to register SDNQ quantizer: {exc}")

        self._pipe = diffusers.Flux2KleinPipeline.from_pretrained(model_id, torch_dtype=dtype)

        # Apply SDNQ optimizations if available
        if has_sdnq:
            triton_available = False
            try:
                import triton  # noqa: F401
                triton_available = True
            except ImportError:
                pass

            use_quantized = triton_available and torch.cuda.is_available()
            try:
                self._pipe.transformer = apply_sdnq_options_to_model(
                    self._pipe.transformer, use_quantized_matmul=use_quantized)
                self._pipe.text_encoder = apply_sdnq_options_to_model(
                    self._pipe.text_encoder, use_quantized_matmul=use_quantized)
                print("[ImageGen] SDNQ optimizations applied")
            except Exception as e:
                print(f"[ImageGen] SDNQ optimization failed: {e}")

        self._pipe.to(self._device)
        if self._device == "cuda":
            try:
                self._pipe.enable_attention_slicing()
                self._pipe.enable_vae_slicing()
                self._pipe.enable_vae_tiling()
                print("[ImageGen] Enabled attention/vae slicing for lower VRAM")
            except Exception as exc:
                print(f"[ImageGen] WARNING: could not enable VRAM optimizations: {exc}")
        print(f"[ImageGen] Model loaded on {self._device}")

        if self._device == "cuda":
            allocated = torch.cuda.memory_allocated() / 1024**3
            print(f"[ImageGen] VRAM allocated: {allocated:.2f} GB")

    def health(self) -> dict:
        return {"status": "ok", "model_loaded": self._pipe is not None}

    def router(self) -> APIRouter:
        r = APIRouter()

        @r.get("/health")
        async def plugin_health():
            return self.health()

        @r.post("/generate")
        async def generate(request: Request):
            return await self._handle_generate(request)

        @r.get("/latest")
        async def latest():
            if self._last_image_path:
                return self._serve_file(self._last_image_path)
            return Response(status_code=404)

        @r.get("/images/{image_name}")
        async def serve_image(image_name: str):
            safe_name = _safe_basename(image_name)
            image_path = os.path.join(IMAGE_OUTPUT_DIR, safe_name)
            return self._serve_file(image_path)

        return r

    async def _handle_generate(self, request: Request) -> JSONResponse:
        try:
            data = await request.json()

            prompt = data.get("prompt", "")
            if not prompt:
                return JSONResponse(status_code=400, content={"error": "prompt required"})

            width = data.get("width")
            height = data.get("height")
            aspect = data.get("aspect")
            long_side = data.get("long_side", 1024)
            steps = data.get("steps", 4)
            guidance = data.get("guidance", 1.0)
            seed = data.get("seed", 0)

            w, h = _resolve_size(width, height, aspect, long_side)
            print(f"[ImageGen] Generating {w}x{h}: {prompt[:50]}...")

            import torch
            gen = torch.Generator(device=self._generator_device).manual_seed(seed)

            result = self._pipe(
                prompt=prompt,
                height=h,
                width=w,
                guidance_scale=guidance,
                num_inference_steps=steps,
                generator=gen,
            )

            img_buffer = io.BytesIO()
            result.images[0].save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()

            _ensure_output_dir()
            filename = data.get("filename") or data.get("name")
            if filename:
                filename = _safe_basename(filename)
            else:
                filename = _build_image_name(seed, w, h)
            image_path = os.path.join(IMAGE_OUTPUT_DIR, filename)
            with open(image_path, "wb") as f:
                f.write(img_bytes)
            self._last_image_path = image_path

            image_url = f"/images/{filename}"
            local_url = f"http://localhost:{self._server_port}{image_url}"
            proxy_url = None
            public_url = None
            public_base = _get_public_base_url()
            if public_base:
                public_base = public_base.rstrip("/")
                public_url = f"{public_base}{image_url}"
                proxy_url = public_url
            else:
                pod_id = os.environ.get("RUNPOD_POD_ID")
                if pod_id:
                    proxy_url = f"https://{pod_id}-{self._server_port}.proxy.runpod.net{image_url}"

            print(f"[ImageGen] Done, {len(img_bytes)} bytes")

            return JSONResponse(content={
                "image": base64.b64encode(img_bytes).decode(),
                "width": w,
                "height": h,
                "format": "png",
                "image_name": filename,
                "image_path": image_path,
                "image_url": image_url,
                "image_local_url": local_url,
                "image_proxy_url": proxy_url,
                "image_public_url": public_url,
            })

        except Exception as e:
            import traceback
            print(f"[ImageGen] Error: {e}")
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})

    def _serve_file(self, path: str) -> Response:
        real_root = os.path.realpath(IMAGE_OUTPUT_DIR)
        real_path = os.path.realpath(path)
        if not real_path.startswith(real_root + os.sep) and real_path != real_root:
            return Response(status_code=403)
        if not os.path.isfile(real_path):
            return Response(status_code=404)
        try:
            with open(real_path, "rb") as f:
                data = f.read()
            content_type = "image/png" if real_path.lower().endswith(".png") else "application/octet-stream"
            return Response(content=data, media_type=content_type)
        except Exception:
            return Response(status_code=500)
