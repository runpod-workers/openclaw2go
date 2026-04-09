---
"a2go": minor
---

feat: enable vae tiling for mflux, halving peak memory on mac

monkey-patches Flux2VAE.decode_packed_latents to use tiled decoding
with 512x512 tiles and cosine-blended overlap. measured results:

- peak memory: 14,032 MB -> 7,178 MB (49% reduction)
- generation speed: unchanged (~15s/step)
- image quality: no visible difference

updated mlx vram.overhead from 9,700 to 2,800 MB to match.
