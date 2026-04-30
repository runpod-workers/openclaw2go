---
"a2go": patch
---

fix: enable OpenClaw device pairing by default

Changed `A2GO_DISABLE_DEVICE_AUTH` default from `true` to `false` so device pairing is enabled out of the box. Users who want headless/automated access can opt in by setting `A2GO_DISABLE_DEVICE_AUTH=true`. Documented the env var and device pairing flow in the README, RunPod template readme, and add-model skill.
