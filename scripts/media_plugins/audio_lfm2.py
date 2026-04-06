"""
LFM2.5-Audio plugin — TTS and STT via native llama-liquid-audio-server (GGUF).

Spawns llama-liquid-audio-server as a subprocess, loading 4 GGUF files (~2GB VRAM).
Proxies OpenAI-compatible TTS/STT requests through the native binary.
"""

import base64
import io
import json
import os
import signal
import subprocess
import time

import httpx
import numpy as np
import soundfile as sf
from fastapi import APIRouter, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response

from media_plugins.base import MediaPlugin

# Voice descriptions for LFM2.5 system prompts
VOICE_MAP = {
    "alloy": "US female",
    "echo": "US male",
    "fable": "UK female",
    "onyx": "UK male",
    "nova": "US female",
    "shimmer": "UK female",
}

SAMPLE_RATE = 24000
SUBPROCESS_PORT = 18401  # internal port for the native server


class LFM2AudioPlugin(MediaPlugin):
    """LFM2.5-Audio TTS/STT via native GGUF binary (~2GB VRAM)."""

    name = "lfm2-audio"
    role = "audio"

    def __init__(self):
        self._process = None
        self._base_url = f"http://127.0.0.1:{SUBPROCESS_PORT}"
        self._client = httpx.Client(timeout=120.0)

    def load_model(self, config: dict) -> None:
        model_dir = config.get("model_dir")
        if not model_dir:
            raise ValueError("model_dir required for LFM2-Audio plugin")

        # Find GGUF files
        gguf_dir = config.get("gguf_dir", model_dir)
        files = self._find_gguf_files(gguf_dir)
        if not files:
            raise FileNotFoundError(f"No GGUF files found in {gguf_dir}")

        binary = self._find_binary()
        print(f"[Audio] Binary: {binary}")
        print(f"[Audio] GGUF dir: {gguf_dir}")
        print(f"[Audio] Files: {files}")

        cmd = [
            binary,
            "-m", files["model"],
            "--mmproj", files["mmproj"],
            "-ngl", "999",
            "--host", "127.0.0.1",
            "--port", str(SUBPROCESS_PORT),
        ]
        if files.get("vocoder"):
            cmd.extend(["-mv", files["vocoder"]])
        if files.get("tokenizer"):
            cmd.extend(["--tts-speaker-file", files["tokenizer"]])

        env = os.environ.copy()
        lib_path = "/opt/engines/a2go-llamacpp/lib"
        existing = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = lib_path + (":" + existing if existing else "")

        print(f"[Audio] Starting native server on port {SUBPROCESS_PORT}...")
        self._log_file = open("/tmp/lfm2-audio-server.log", "w")
        self._process = subprocess.Popen(
            cmd, env=env, stdout=self._log_file, stderr=subprocess.STDOUT,
        )

        self._wait_for_ready(timeout=120)
        print(f"[Audio] Native server ready (PID {self._process.pid})")

    def _find_binary(self) -> str:
        """Find llama-liquid-audio-server binary."""
        path = "/opt/engines/a2go-llamacpp/bin/llama-liquid-audio-server"
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
        raise FileNotFoundError(f"llama-liquid-audio-server not found at {path}")

    def _find_gguf_files(self, model_dir: str) -> dict:
        """Locate the 4 GGUF files in the model directory."""
        result = {}
        if not os.path.isdir(model_dir):
            return result

        for f in os.listdir(model_dir):
            fl = f.lower()
            if not fl.endswith(".gguf"):
                continue
            path = os.path.join(model_dir, f)
            if "mmproj" in fl:
                result["mmproj"] = path
            elif "vocoder" in fl:
                result["vocoder"] = path
            elif "tokenizer" in fl:
                result["tokenizer"] = path
            elif "model" not in result:
                result["model"] = path

        return result

    def _wait_for_ready(self, timeout: int = 120) -> None:
        """Wait for the subprocess server to accept connections."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._process.poll() is not None:
                try:
                    with open("/tmp/lfm2-audio-server.log") as f:
                        out = f.read()[-2000:]
                except Exception:
                    out = "(no log)"
                raise RuntimeError(
                    f"llama-liquid-audio-server exited with code {self._process.returncode}\n{out}"
                )
            try:
                self._client.get(f"{self._base_url}/", timeout=2.0)
                return
            except (httpx.ConnectError, httpx.ReadTimeout):
                pass
            time.sleep(2)
        raise TimeoutError(f"llama-liquid-audio-server not ready after {timeout}s")

    def health(self) -> dict:
        alive = self._process is not None and self._process.poll() is None
        if alive:
            try:
                self._client.get(f"{self._base_url}/", timeout=2.0)
            except Exception:
                alive = False
        return {"status": "ok" if alive else "error", "model_loaded": alive}

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

            payload = {
                "messages": [
                    {"role": "system", "content": f"Perform TTS. Use the {voice_desc} voice."},
                    {"role": "user", "content": text},
                ],
                "modalities": ["audio"],
                "max_tokens": 2048,
                "stream": True,
                "reset_context": True,
            }

            audio_chunks = []
            sample_rate = SAMPLE_RATE

            with self._client.stream(
                "POST", f"{self._base_url}/v1/chat/completions",
                json=payload, timeout=120.0,
            ) as resp:
                for line in resp.iter_lines():
                    if not line.startswith("data: "):
                        continue
                    line = line[6:]
                    if line == "[DONE]":
                        break
                    try:
                        chunk = json.loads(line)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        audio_data = delta.get("audio", {})
                        if audio_data.get("data"):
                            audio_chunks.append(base64.b64decode(audio_data["data"]))
                            if audio_data.get("sample_rate"):
                                sample_rate = audio_data["sample_rate"]
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

            if not audio_chunks:
                return JSONResponse(status_code=500, content={"error": "No audio generated"})

            pcm_data = b"".join(audio_chunks)
            audio_np = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0

            buf = io.BytesIO()
            sf.write(buf, audio_np, sample_rate, format="WAV", subtype="PCM_16")
            wav_bytes = buf.getvalue()

            elapsed = time.time() - t0
            print(f"[Audio] TTS done in {elapsed:.2f}s, {len(wav_bytes)} bytes")

            return Response(
                content=wav_bytes, media_type="audio/wav",
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

            audio_b64 = base64.b64encode(audio_bytes).decode()

            payload = {
                "messages": [
                    {"role": "system", "content": "Perform ASR."},
                    {
                        "role": "user",
                        "content": [{
                            "type": "input_audio",
                            "input_audio": {"format": "wav", "data": audio_b64},
                        }],
                    },
                ],
                "modalities": ["text"],
                "max_tokens": 512,
                "stream": True,
                "reset_context": True,
            }

            text_parts = []
            with self._client.stream(
                "POST", f"{self._base_url}/v1/chat/completions",
                json=payload, timeout=120.0,
            ) as resp:
                for line in resp.iter_lines():
                    if not line.startswith("data: "):
                        continue
                    line = line[6:]
                    if line == "[DONE]":
                        break
                    try:
                        chunk = json.loads(line)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            text_parts.append(content)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

            text = "".join(text_parts).strip()
            elapsed = time.time() - t0
            print(f"[Audio] STT done in {elapsed:.2f}s: {text[:100]}...")

            return JSONResponse(content={"text": text})

        except Exception as e:
            import traceback
            print(f"[Audio] STT error: {e}")
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})

    def __del__(self):
        if self._process and self._process.poll() is None:
            self._process.send_signal(signal.SIGTERM)
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
