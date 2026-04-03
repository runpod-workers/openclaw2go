"""
Qwen3-TTS speech synthesis plugin.

Extracted from openclaw-tts-server. OpenAI-compatible /v1/audio/speech endpoint.
Keeps model loaded in VRAM for instant inference.
"""

import io
import json
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

# OpenAI-compatible voice names → Qwen3-TTS speaker names
# Qwen3-TTS CustomVoice speakers: aiden, dylan, eric, ono_anna, ryan, serena, sohee, uncle_fu, vivian
VOICE_MAP = {
    "alloy": "vivian",
    "echo": "eric",
    "fable": "serena",
    "onyx": "ryan",
    "nova": "aiden",
    "shimmer": "sohee",
}

CONTENT_TYPES = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "opus": "audio/opus",
    "flac": "audio/flac",
}


class Qwen3TTSPlugin(MediaPlugin):
    """Qwen3-TTS speech synthesis via qwen_tts."""

    name = "qwen3-tts"
    role = "tts"

    def __init__(self):
        self._model = None
        self._device = None

    def load_model(self, config: dict) -> None:
        import torch

        model_dir = config.get("model_dir")
        if not model_dir:
            raise ValueError("model_dir required for Qwen3-TTS plugin")

        print(f"[TTS] Loading Qwen3-TTS from: {model_dir}")
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if self._device == "cuda" else torch.float32

        from qwen_tts import Qwen3TTSModel

        kwargs = {}
        if self._device == "cuda":
            kwargs["device_map"] = "cuda:0"
            kwargs["dtype"] = dtype

        self._model = Qwen3TTSModel.from_pretrained(model_dir, **kwargs)

        print(f"[TTS] Model loaded on {self._device}")

        if self._device == "cuda":
            allocated = torch.cuda.memory_allocated() / 1024**3
            print(f"[TTS] VRAM allocated: {allocated:.2f} GB")

    def health(self) -> dict:
        return {"status": "ok", "model_loaded": self._model is not None}

    def router(self) -> APIRouter:
        r = APIRouter()

        @r.get("/health")
        async def plugin_health():
            return self.health()

        @r.post("/v1/audio/speech")
        async def speech(request: Request):
            return await self._handle_speech(request)

        return r

    async def _handle_speech(self, request: Request) -> Response:
        try:
            data = await request.json()

            text = data.get("input", "")
            if not text:
                return JSONResponse(status_code=400, content={"error": "input text required"})

            voice = data.get("voice", "alloy")
            response_format = data.get("response_format", "wav")

            # Map OpenAI voice name to speaker description
            speaker_desc = VOICE_MAP.get(voice, voice)

            print(f"[TTS] Synthesizing ({voice}): {text[:80]}...")
            t0 = time.time()

            audio_data = self._synthesize(text, speaker_desc)

            elapsed = time.time() - t0
            print(f"[TTS] Done in {elapsed:.2f}s, {len(audio_data)} bytes")

            content_type = CONTENT_TYPES.get(response_format, "audio/wav")

            return Response(
                content=audio_data,
                media_type=content_type,
                headers={"Content-Length": str(len(audio_data))},
            )

        except Exception as e:
            import traceback
            print(f"[TTS] Error: {e}")
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})

    def _synthesize(self, text: str, speaker: str) -> bytes:
        """Synthesize speech and return WAV bytes."""
        import soundfile as sf
        import numpy as np

        audio_arrays, sample_rate = self._model.generate_custom_voice(
            text=text,
            speaker=speaker,
        )

        if len(audio_arrays) > 1:
            audio_array = np.concatenate(audio_arrays)
        else:
            audio_array = audio_arrays[0]

        audio_array = audio_array.squeeze()

        buf = io.BytesIO()
        sf.write(buf, audio_array, sample_rate, format="WAV", subtype="PCM_16")
        return buf.getvalue()
