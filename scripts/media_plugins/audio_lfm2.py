"""
LFM2.5-Audio speech plugin — TTS and STT via liquid-audio.

OpenAI-compatible /v1/audio/speech (TTS) and /v1/audio/transcriptions (STT).
Keeps model loaded in VRAM for instant inference.
"""

import io
import os
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import APIRouter, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response

from media_plugins.base import MediaPlugin

# Reduce VRAM pressure from torch.compile/inductor
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
os.environ.setdefault("TORCHINDUCTOR_DISABLE", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

# OpenAI-compatible voice names → LFM2 system prompt descriptions
VOICE_MAP = {
    "alloy": "US female",
    "echo": "US male",
    "fable": "UK female",
    "onyx": "UK male",
    "nova": "US female",
    "shimmer": "UK female",
}

SAMPLE_RATE = 24000


class LFM2AudioPlugin(MediaPlugin):
    """LFM2.5-Audio TTS/STT via liquid-audio."""

    name = "lfm2-audio"
    role = "audio"

    def __init__(self):
        self._model = None
        self._processor = None
        self._device = None

    def load_model(self, config: dict) -> None:
        model_dir = config.get("model_dir")
        if not model_dir:
            raise ValueError("model_dir required for LFM2-Audio plugin")

        # liquid-audio's from_pretrained accepts Path for local dirs, str for HF repos
        model_path = Path(model_dir) if os.path.isdir(model_dir) else model_dir

        print(f"[Audio] Loading LFM2.5-Audio from: {model_dir}")
        self._device = "cuda" if torch.cuda.is_available() else "cpu"

        from liquid_audio import LFM2AudioModel, LFM2AudioProcessor

        self._processor = LFM2AudioProcessor.from_pretrained(model_path).eval()
        self._model = LFM2AudioModel.from_pretrained(model_path).eval()

        if self._device == "cuda":
            self._model = self._model.to(self._device)

        print(f"[Audio] Model loaded on {self._device}")

        if self._device == "cuda":
            allocated = torch.cuda.memory_allocated() / 1024**3
            print(f"[Audio] VRAM allocated: {allocated:.2f} GB")

    def health(self) -> dict:
        return {"status": "ok", "model_loaded": self._model is not None}

    def router(self) -> APIRouter:
        r = APIRouter()

        @r.get("/health")
        async def plugin_health():
            return self.health()

        @r.post("/v1/audio/speech")
        async def tts(request: Request):
            return await self._handle_tts(request)

        @r.post("/v1/audio/transcriptions")
        async def stt(file: UploadFile = File(...), model: str = Form("")):
            return await self._handle_stt(file)

        return r

    async def _handle_tts(self, request: Request) -> Response:
        try:
            data = await request.json()

            text = data.get("input", "")
            if not text:
                return JSONResponse(status_code=400, content={"error": "input text required"})

            voice = data.get("voice", "echo")
            voice_desc = VOICE_MAP.get(voice, voice)

            print(f"[Audio] TTS ({voice_desc}): {text[:80]}...")
            t0 = time.time()

            wav_bytes = self._synthesize(text, voice_desc)

            elapsed = time.time() - t0
            print(f"[Audio] TTS done in {elapsed:.2f}s, {len(wav_bytes)} bytes")

            return Response(
                content=wav_bytes,
                media_type="audio/wav",
                headers={"Content-Length": str(len(wav_bytes))},
            )

        except Exception as e:
            import traceback
            print(f"[Audio] TTS error: {e}")
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})

    async def _handle_stt(self, file: UploadFile) -> JSONResponse:
        try:
            audio_bytes = await file.read()

            print(f"[Audio] STT: {file.filename or 'upload'} ({len(audio_bytes)} bytes)")
            t0 = time.time()

            text = self._transcribe(audio_bytes)

            elapsed = time.time() - t0
            print(f"[Audio] STT done in {elapsed:.2f}s")

            return JSONResponse(content={"text": text})

        except Exception as e:
            import traceback
            print(f"[Audio] STT error: {e}")
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})

    def _synthesize(self, text: str, voice_desc: str) -> bytes:
        """Synthesize speech and return WAV bytes."""
        from liquid_audio import ChatState

        chat = ChatState(self._processor)

        chat.new_turn("system")
        chat.add_text(f"Perform TTS. Use the {voice_desc} voice.")
        chat.end_turn()

        chat.new_turn("user")
        chat.add_text(text)
        chat.end_turn()

        chat.new_turn("assistant")

        audio_out = []
        with torch.no_grad():
            for t in self._model.generate_sequential(
                **chat,
                max_new_tokens=2048,
                audio_temperature=0.8,
                audio_top_k=64,
            ):
                if t.numel() > 1:
                    audio_out.append(t)

        if not audio_out:
            raise RuntimeError("Model produced no audio tokens")

        audio_codes = torch.stack(audio_out[:-1], 1).unsqueeze(0)
        waveform = self._processor.decode(audio_codes)

        audio_np = waveform.cpu().numpy().squeeze()
        buf = io.BytesIO()
        sf.write(buf, audio_np, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        return buf.getvalue()

    def _transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text."""
        from liquid_audio import ChatState

        buf = io.BytesIO(audio_bytes)
        wav_np, sr = sf.read(buf, dtype="float32")
        wav = torch.from_numpy(wav_np).unsqueeze(0)  # (1, samples)

        chat = ChatState(self._processor)

        chat.new_turn("system")
        chat.add_text("Perform ASR.")
        chat.end_turn()

        chat.new_turn("user")
        chat.add_audio(wav, sr)
        chat.end_turn()

        chat.new_turn("assistant")

        text_parts = []
        with torch.no_grad():
            for t in self._model.generate_sequential(**chat, max_new_tokens=512):
                if t.numel() == 1:
                    text_parts.append(self._processor.text.decode(t))

        return "".join(text_parts).strip()
