---
"a2go": patch
---

fix: doctor skill download 404 — paths updated to a2go- prefix

Skills moved from config/workspace/skills/image-generate/ to
config/workspace/skills/a2go-image-generate/ (and similar for
text-to-speech, speech-to-text). Updated download paths, local
directory names, and removed unused FileWithReplace — the new
skills use `a2go tool` commands and no longer need path rewriting.
