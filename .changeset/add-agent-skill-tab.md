---
"a2go": patch
---

feat(site): add agent skill tab to deploy section

Adds "agent" as the first deploy tab, showing a 2-step flow to install and use the a2go skill via `npx skills add`. The prompt dynamically reflects selected models with clean labels (e.g. "glm-4.7-flash 4-bit as llm"). The agent tab is always visible regardless of OS filter.
