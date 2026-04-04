"""
a2go media plugins — registry mapping engine IDs to plugin classes.

To add a new media plugin:
1. Create a new module in this package implementing MediaPlugin
2. Add the engine ID → class path mapping below
"""

PLUGIN_REGISTRY = {
    "image-gen": "media_plugins.image_gen.ImageGenPlugin",
    "qwen3-tts": "media_plugins.tts_qwen3.Qwen3TTSPlugin",
    "lfm2-audio": "media_plugins.audio_lfm2.LFM2AudioPlugin",
}
