---
"a2go": patch
---

fix: show actionable errors when mlx model fails to start locally

when an mlx model (e.g. gemma 4) fails to start, the cli now:

- shows the last 20 lines of the log file inline (no more "check logs" dead end)
- detects common error patterns (ModuleNotFoundError, unsupported model type, OOM)
  and suggests the fix (e.g. "run 'a2go doctor' to upgrade")
- validates mlx models against the catalog before starting services (fast-fail)
- uses correct error messages ("LLM process exited" instead of "container exited")
