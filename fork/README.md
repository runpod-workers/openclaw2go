# a2go-llamacpp Fork Scaffolding

This directory contains templates and workflows for the `runpod-labs/a2go-llamacpp` fork.

## Setup (done)

Fork created at `runpod-labs/a2go-llamacpp`. Branch `main` has all cherry-picks applied.

Current base: **b8967** (tag: `b8967-openclaw.1`)

Merged PRs on `main`:
- PR #18039 (Eagle-3 speculative decoding)

Already merged upstream:
- PR #18641 (liquid-audio: TTS/STT for LFM2.5) — merged upstream, audio now in mtmd library
- PR #19460 (glm-dsa: GLM-5 MoE dynamic sparse attention)
- PR #20411 (Nemotron-3-Super support)

Dropped:
- PR #12794 (OuteTTS 1.0) — build was disabled, API stale vs current master

## Tag Convention

`{upstream-tag}-openclaw.{patch}` (e.g., `b4567-openclaw.1`)

## Maintenance

- The CI workflow checks daily for new upstream releases
- Clean rebases auto-create tags and update main
- Conflicting rebases create a PR for manual resolution
- If a PR gets merged upstream, drop the cherry-pick (less maintenance)
- If a cherry-pick can't be resolved: fall back to separate engine for that feature
