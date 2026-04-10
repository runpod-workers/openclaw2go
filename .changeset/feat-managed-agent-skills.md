---
"a2go": minor
---

feat: fully own and refresh managed agent skills

a2go now owns the canonical agent skill set it ships. Instead of loading runtime
skills from the mutable local `~/.a2go/skills` directory, the CLI bundles the a2go
skills and regenerates managed skill directories for Hermes and OpenClaw on run.

This also fixes Hermes skill discovery by replacing the old symlink-based flow and
ensures stale managed skill entries are removed during refresh.
