---
"a2go": minor
---

feat: group same-family models into one card with size selector, add user-controlled device count

- Collapse models of the same family (e.g., Qwen 3.5) into a single catalog row with SIZE pill selector in the detail panel
- Replace auto-scaling GPU count (1–8) with a user-controlled device count stepper in the Hardware section header
- Rename URL params: `gpu` → `device`, add `deviceCount` for shareable configuration links
- Add TB formatting for VRAM values ≥ 1000 GB
- Unify SectionHeader component to consistently center inline controls (stepper, reset, copy link)
