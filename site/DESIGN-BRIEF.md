# OpenClaw2Go — VRAM-First Dashboard Design Brief

## What This Is

A single-page dashboard for configuring GPU pod deployments. The user picks VRAM → picks a model → adjusts context → deploys. A 3D glass box visualizes VRAM usage in real-time. Everything is lowercase. Dark theme with neon cyan accents.

## Tech Stack

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 (using `@theme` directive)
- Three.js via `@react-three/fiber` + `@react-three/drei` (3D preview)
- Framer Motion (available, not heavily used yet)
- Fonts: JetBrains Mono (display/mono), Outfit (body)

---

## User Flow

```
1. pick platform → "windows & linux" (nvidia/docker) or "mac" (mlx)
2. pick vram → 8gb / 16gb / 24gb / 32gb / 48gb / 64gb / 80gb / 128gb / 192gb
3. pick llm model → only models that fit are clickable; others grayed with "needs X mb more"
4. (optional) toggle audio/image services → consumes more vram, updates 3d preview
5. (optional) adjust context slider → more context = more kv cache vram
6. copy deploy command → docker run (nvidia) or mlx setup (mac)
```

Platform switch resets everything. VRAM switch resets model selection. Model selection resets context.

---

## Grid Layout

### Desktop (>= 1024px) — 4 columns, 5 rows

```
+------------+------------------------------------------+
|    logo    |              platform                     |
+------------+------------------------------------------+
|            vram selector (full width)                  |
+------------+-------------------+-----------+-----------+
|            |                   |           |           |
|   model    |     model         |  preview  |  legend   |
|   cards    |     cards         |  (3d box) |           |
|            |                   |           +-----------+
|            +-------------------+           | services  |
|            |  context slider   |           +-----------+
+------------+-------------------+-----------+-----------+
|                    deploy (full width)                  |
+--------------------------------------------------------+
```

```css
grid-template-columns: 1fr 1fr 280px 220px;
grid-template-rows: auto auto 1fr auto auto;
grid-template-areas:
  "logo     platform platform platform"
  "vram     vram     vram     vram"
  "model    model    preview  legend"
  "model    model    preview  services"
  "deploy   deploy   deploy   deploy";
gap: 6px;
height: 100vh;
padding: 6px;
```

### Tablet (768–1023px) — 2 columns

```css
grid-template-columns: 1fr 1fr;
grid-template-areas:
  "logo     platform"
  "vram     vram"
  "model    model"
  "preview  legend"
  "services services"
  "deploy   deploy";
```

### Mobile (< 768px) — single column

```
logo → platform → vram → model → preview → legend → services → deploy
```

---

## UI Elements

### 1. Logo Card (`area-logo`)
- openclaw2go logo image (32–48px) + "openclaw2go" text with neon glow
- GitHub link icon below

### 2. Platform Selector (`area-platform`)
- Two large card-style buttons side by side
- "windows & linux" with Windows icon (nvidia platform)
- "mac" with Apple icon (mlx platform)
- Selected: cyan glow border + highlight
- Label: "platform" in cyan

### 3. VRAM Selector (`area-vram`)
- Horizontal row of clickable chips/pills
- Each chip shows: size label ("24 gb") + model count ("3 models")
- Chips with 0 models are dimmed (40% opacity) but still clickable
- Selected chip: cyan glow
- Label: "vram" in green

### 4. Model Cards (`area-model`, spans 2 columns, scrollable)
- Flex-wrap grid of cards, each card ~200–320px wide
- Each card contains:
  - Provider logo (32×32 svg, left side)
  - Model name (lowercase, prominent)
  - VRAM cost badge ("17,800 mb" in cyan)
  - KV cache rate ("kv:40/1k")
  - Status badge: "stable" (green) / "experimental" (yellow)
  - "default" badge (cyan, if applicable)
- **Disabled state**: when model doesn't fit available VRAM
  - 40% opacity, cursor-not-allowed
  - Red text: "needs X mb more"
- **Selected state**: cyan glow border + gradient top line
- Context slider appears below model cards (inside same card area) when model + vram selected
- Label: "llm model" in purple

### 5. Context Slider (inside model card area)
- Range slider with step labels
- Steps: 16k, 32k, 65k, 100k, 131k, 150k, 200k, 262k (filtered to max)
- Model default gets "default" sublabel
- Current value shown large in cyan
- Max value shown small
- Label: "context" in yellow

### 6. 3D Preview (`area-preview`)
- Three.js canvas with glass box (2×2×2 units)
- VRAM blocks stacked from bottom, colored by type
- Auto-rotating camera, orbit controls (no zoom/pan)
- Overflow: box edges turn red
- Empty state: HTML overlay text "select a model" (not 3D text)
- Black background, cyan edge glow

### 7. VRAM Legend (`area-legend`)
- Total used / available with progress bar
- Status: "fits" (green) / "tight fit" (yellow) / "does not fit" (red)
- Breakdown per model: colored swatch + name + vram
- KV cache shown separately with its own swatch
- Free VRAM amount
- Max context tokens
- "X mb over budget" warning when doesn't fit
- Label: "vram budget" in cyan

### 8. Services Card (`area-services`)
- Toggle switches for audio and image
- Each toggle: label + sublabel + toggle switch
- Toggling adds/removes service VRAM from budget
- Only shown when platform has services (nvidia has audio+image, mlx has none currently)
- Label: "services" in orange

### 9. Deploy Card (`area-deploy`, full width)
- Tabs: docker / config / runpod (nvidia) or mlx (mac)
- Docker tab: full `docker run` command with copy button
- Config tab: `OPENCLAW2GO_CONFIG` JSON with copy button
- Runpod tab: 3-step visual guide (create pod → set image → expose ports)
- MLX tab: `pip install mlx-lm` + `mlx_lm.server` command with copy button
- Label: "deploy" in green

---

## Color Theme

```
background:     #050608  (void)
card bg:        rgba(10, 12, 18, 0.85) with 1px cyan border at 12% opacity
code blocks:    #0a0c12  (abyss)
surface:        #111118
surface raised: #16161f
surface bright: #1e1e2a

cyan glow:      #00e5ff  (primary accent, selected states, neon text)
cyan mid:       #00b8d4  (llm block color)
cyan dim:       #006978  (borders, muted)
green glow:     #00e676  (stable badge, fits status)
yellow glow:    #ffea00  (experimental badge, tight fit, context label)
red glow:       #ff1744  (error, does not fit, over budget)
purple glow:    #b388ff  (model card accent, audio block color)
orange glow:    #ff6b00  (services label)
pink:           #ec407a  (image block color)
magenta:        #ff00e5  (kv cache 3d block)

text primary:   #e8e8ef
text secondary: #8888a0
text dim:       #55556a

border dim:     #1a1a25
border:         #252535
border bright:  #353548
```

### Card Accent Colors (top 2px border)
- model: purple (#b388ff)
- platform: cyan (#00e5ff)
- vram: green (#00e676)
- services: orange (#ff6b00)
- deploy: green (#00e676)
- legend: cyan (#00e5ff)
- logo: transparent (no border)
- preview: black bg, cyan border at 25%

### Glass Card States
- Default: gradient bg (dark), dim border
- Hover: slightly brighter gradient, visible border
- Selected: cyan-tinted gradient, cyan border, cyan glow shadow
- Disabled: 40% opacity, not-allowed cursor

---

## All Current Data

### NVIDIA Models (platform: nvidia / default)

| Model | ID | Type | Base VRAM | Overhead | Total | KV/1k | Default Ctx | Status | Default |
|---|---|---|---|---|---|---|---|---|---|
| GLM-4.7-Flash GGUF Q4_K_M | unsloth/glm47-flash-gguf | llm | 17,300 | 500 | 17,800 | 40 | 150k | stable | yes |
| GLM-4.7-Flash Claude Distill Q4_K_M | teichai/glm47-claude-distill-gguf | llm | 17,300 | 500 | 17,800 | 40 | 150k | experimental | no |
| Nemotron-3-Nano-30B Q4_K_XL | unsloth/nemotron3-nano-gguf | llm | 21,538 | 459 | 21,997 | 4 | 150k | stable | no |
| GPT-OSS-20B Q8_0 | unsloth/gpt-oss-20b-gguf | llm | 12,100 | 500 | 12,600 | 2 | 131k | experimental | no |
| Qwen3-Coder-Next Q3_K_M | unsloth/qwen3-coder-next-gguf | llm | 38,300 | 1,000 | 39,300 | 13 | 32k | experimental | no |
| Step-3.5-Flash Q2_K | bartowski/step35-flash-gguf | llm | 69,600 | 2,000 | 71,600 | 10 | 8k | experimental | no |
| LFM2.5-Audio-1.5B Q4_0 | liquidai/lfm25-audio | audio | 2,000 | 100 | 2,100 | — | — | stable | yes |
| FLUX.2 Klein 4B SDNQ | disty0/flux2-klein-sdnq | image | 3,500 | 500 | 4,000 | — | — | stable | yes |

### MLX Models (platform: mlx)

| Model | ID | Type | Base VRAM | Overhead | Total | KV/1k | Default Ctx | Status |
|---|---|---|---|---|---|---|---|---|
| GLM-4.7-Flash MLX 4-bit | mlx-community/glm47-flash-mlx | llm | 17,300 | 0 | 17,300 | 40 | 150k | experimental |
| Nemotron-3-Nano-30B MLX 4-bit | mlx-community/nemotron3-nano-mlx | llm | 21,538 | 0 | 21,538 | 4 | 150k | experimental |
| GPT-OSS-20B MLX 8-bit | mlx-community/gpt-oss-20b-mlx | llm | 12,100 | 0 | 12,100 | 2 | 131k | experimental |

### VRAM Tiers

| Label | MB | Typical Hardware |
|---|---|---|
| 8 gb | 8,192 | RTX 4060, M1/M2 base |
| 16 gb | 16,384 | RTX 4080, M1/M2 Pro |
| 24 gb | 24,576 | RTX 4090 |
| 32 gb | 32,768 | RTX 5090, M3/M4 Max |
| 48 gb | 49,152 | L40, M2/M4 Ultra |
| 64 gb | 65,536 | Mac Ultra |
| 80 gb | 81,920 | A100, H100 |
| 128 gb | 131,072 | Mac Ultra max config |
| 192 gb | 196,608 | B200 |

### Provider Logos (public/logos/*.svg)

| Provider | Color | Letter | Used By |
|---|---|---|---|
| unsloth | #0891b2 (cyan) | U | GLM-4.7, Nemotron, GPT-OSS, Qwen3 |
| liquidai | #7c3aed (purple) | L | LFM2.5 Audio |
| disty0 | #ec4899 (pink) | D | FLUX.2 Klein |
| teichai | #ea580c (orange) | T | GLM Claude Distill |
| bartowski | #16a34a (green) | B | Step-3.5 Flash |
| mlx-community | #6b7280 (gray) | M | all MLX models |

Currently simple colored circles with letter initial. Real logos would be better.

### GPUs (reference only, not user-facing)

| ID | Name | VRAM |
|---|---|---|
| rtx-4090 | NVIDIA RTX 4090 | 24 GB |
| rtx-5090 | NVIDIA RTX 5090 | 32 GB |
| l40 | NVIDIA L40 | 48 GB |
| a100-80gb | NVIDIA A100 80GB | 80 GB |
| h100-80gb | NVIDIA H100 80GB | 80 GB |
| b200-180gb | NVIDIA B200 180GB | 180 GB |

---

## VRAM Budget Logic

The system works like this:
1. Audio + image services are fixed VRAM cost (no KV cache)
2. LLM model = base VRAM + KV cache (scales with context length)
3. KV cache formula: `(contextLength / 1000) * kvCacheMbPer1kTokens`
4. Minimum 16k context required (OpenClaw won't work below this)
5. Max context = `(availableVram - baseVram) / kvRate * 1000`
6. A model "fits" if base + 16k KV cache fits in remaining VRAM

### Example: 32 GB (32,768 MB) with GLM-4.7 + Audio + Image

```
FLUX.2 Klein:    4,000 mb (3,500 + 500)
LFM2.5 Audio:    2,100 mb (2,000 + 100)
GLM-4.7 base:   17,800 mb (17,300 + 500)
Remaining:        8,868 mb
KV cache (150k): 6,000 mb (150 * 40)
Total:           29,900 mb
Free:             2,868 mb — fits!
```

### Context Steps

Predefined steps used by the slider:
`16k → 32k → 65k → 100k → 131k → 150k → 200k → 262k`

Filtered to only show steps that fit. Model default is highlighted.

---

## Current Issues / Design Opportunities

1. **Provider logos are placeholder circles** — real logos or more distinctive icons would help
2. **VRAM chips are small** — could be bigger / more visual for the key decision point
3. **Model cards are compact** — the plan calls for "big visual model cards" with prominent names
4. **No visual hierarchy** — all cards look the same weight. Platform + VRAM should feel like the primary decision flow, model cards secondary
5. **Services toggles are separate** — tucked in a small card, easy to miss
6. **Deploy card is always visible** — could be more prominent when config is complete, dimmed when incomplete
7. **3D preview is cool but static-feeling** — more dramatic transitions when adding/removing models would help
8. **Mobile layout needs love** — works but doesn't feel intentionally designed for small screens

---

## Files to Edit

```
src/App.tsx                        — main layout + state
src/index.css                      — grid, theme, card styles
src/components/PlatformSelector.tsx — platform toggle
src/components/VramSelector.tsx     — vram picker chips
src/components/ModelPicker.tsx      — model cards with logos
src/components/ContextSlider.tsx    — context range slider
src/components/VramLegend.tsx       — vram budget breakdown
src/components/DeployOutput.tsx     — deploy commands + tabs
src/components/PreviewCanvas.tsx    — 3d glass box
src/components/LogoHeader.tsx       — logo + github link
src/lib/vram.ts                    — vram budget computation
src/lib/vramSizes.ts               — vram tier config
src/lib/deploy.ts                  — deploy command generation
src/types/catalog.ts               — all typescript types
public/logos/*.svg                  — provider logos
```

---

## Constraints

- Everything lowercase (text, labels, badges)
- Dark theme only (void/abyss background)
- Neon aesthetic (glow effects, glass morphism cards, cyan primary)
- Must work at 1024px+ desktop, 768px tablet, <768px mobile
- 3D preview must not hang (no drei `<Text>` — use HTML overlay for text)
- Fonts: JetBrains Mono for display/code, Outfit for body text
