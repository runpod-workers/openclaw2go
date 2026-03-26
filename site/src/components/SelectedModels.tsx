import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { formatContext, formatVram, type CatalogModel, type GpuInfo, type OsPlatform } from '../lib/catalog'
import type { ModelGroup, ModelVariant, CatalogEntry, SubVariant } from '../lib/group-models'
import { getVariantForOs, findSiblingsWithOs } from '../lib/group-models'
import { PlatformIcon } from './PlatformSelector'
import { X, ExternalLink, HelpCircle, Copy, Check } from 'lucide-react'
import { cn } from '../lib/utils'

const SLOTS: { type: 'llm' | 'image' | 'audio'; label: string; color: string }[] = [
  { type: 'llm', label: 'LLM', color: '#00e5ff' },
  { type: 'image', label: 'IMAGE', color: '#ec407a' },
  { type: 'audio', label: 'AUDIO', color: '#b388ff' },
]

/** Map internal engine IDs to human-friendly display names */
const ENGINE_DISPLAY: Record<string, string> = {
  'llamacpp': 'llama.cpp',
  'a2go-llamacpp': 'llama.cpp',
  'image-gen': 'diffusers',
  'mlx': 'mlx-lm',
}

/** Label (fixed narrow) | visible divider | Value (flex) */
function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <span className="flex flex-1 items-center px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[11px] lg:text-[13px] tabular-nums text-foreground/80">
        {value}
      </span>
    </div>
  )
}

/** Info row with a clickable link */
function InfoBlockLink({ label, url, text }: { label: string; url: string; text: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[11px] lg:text-[13px] tabular-nums text-foreground/80 transition-colors hover:text-foreground"
      >
        <span className="truncate">{text}</span>
      </a>
    </div>
  )
}

const REPO_URL = 'https://github.com/runpod/a2go'

/** TPS info row — shows value when available, or a "help us measure" CTA */
function InfoBlockTps({ tpsValue, gpuName }: { tpsValue: number | null; gpuName: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="flex items-stretch" ref={ref}>
      <span className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        tps
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <div className="relative flex flex-1 items-center px-2 lg:px-3 py-1 lg:py-1.5">
        {tpsValue != null ? (
          <span className="font-mono text-[11px] lg:text-[13px] tabular-nums text-foreground/80">
            {tpsValue} tps · {gpuName}
          </span>
        ) : (
          <>
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 font-mono text-[11px] lg:text-[13px] text-foreground/35 transition-colors hover:text-foreground/60"
            >
              <HelpCircle size={12} className="shrink-0" />
              <span>not yet measured</span>
            </button>
            {open && (
              <div className="absolute left-2 top-full z-50 mt-1 w-64 rounded border border-foreground/10 bg-[#141310] p-3 shadow-lg">
                <p className="font-mono text-[11px] leading-relaxed text-foreground/60">
                  help us measure this! run the model, benchmark it, and submit your results via a PR.
                </p>
                <a
                  href={`${REPO_URL}#contributing`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-primary/80 transition-colors hover:text-primary"
                >
                  <ExternalLink size={10} />
                  submit on github
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Generate discrete context steps: 16k, 32k, 64k, 128k... up to max (always included) */
function generateContextSteps(maxTokens: number): number[] {
  const MIN = 16384
  const steps: number[] = []
  let v = MIN
  while (v < maxTokens) {
    steps.push(v)
    v *= 2
  }
  // Always include the model's max even if it's not a power of 2
  if (steps[steps.length - 1] !== maxTokens) {
    steps.push(maxTokens)
  }
  return steps
}

/** Context slider control — standalone row in resources zone */
function ContextControl({
  contextLength,
  contextOverride,
  onContextChange,
}: {
  contextLength: number
  contextOverride: number | null
  onContextChange: (ctx: number | null) => void
}) {
  const steps = useMemo(() => generateContextSteps(contextLength), [contextLength])
  const effectiveCtx = contextOverride ?? contextLength
  // Find nearest step index for the slider
  const currentIdx = steps.reduce((best, s, i) =>
    Math.abs(s - effectiveCtx) < Math.abs(steps[best] - effectiveCtx) ? i : best, 0)
  return (
    <div className="flex items-stretch">
      <button
        onClick={() => onContextChange(null)}
        className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/60 transition-colors"
      >
        context
      </button>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <div className="flex flex-1 items-center gap-2 px-2 lg:px-3 py-1 lg:py-1.5">
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={currentIdx}
          onChange={(e) => {
            const val = steps[Number(e.target.value)]
            onContextChange(val === contextLength ? null : val)
          }}
          className="context-slider h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/10 accent-foreground/60
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/70
            [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground/70"
        />
        <span className="shrink-0 w-[4ch] text-right font-mono text-[11px] lg:text-[13px] font-bold tabular-nums text-foreground/80">
          {formatContext(effectiveCtx)}
        </span>
      </div>
    </div>
  )
}

/** CSS pattern presets for VRAM segment bars */
const SEGMENT_PATTERNS = {
  /** Solid fill — model weights (the heaviest, most tangible chunk) */
  solid: (color: string): React.CSSProperties => ({
    backgroundColor: color,
  }),
  /** Diagonal stripes — KV cache (structured, repeating memory) */
  stripes: (color: string): React.CSSProperties => ({
    backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)`,
    backgroundImage: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      ${color} 3px,
      ${color} 5px
    )`,
  }),
  /** Dot grid — runtime overhead (small, scattered cost) */
  dots: (color: string): React.CSSProperties => ({
    backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
    backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
    backgroundSize: '6px 6px',
  }),
} as const

type SegmentPattern = keyof typeof SEGMENT_PATTERNS

/** Compact labeled segment with patterned bar */
function SegmentLabel({
  label,
  value,
  color,
  pattern = 'solid',
}: {
  label: string
  value: string
  color: string
  pattern?: SegmentPattern
}) {
  return (
    <div className="flex flex-col">
      <span className="inline-block h-3 lg:h-5 w-full" style={SEGMENT_PATTERNS[pattern](color)} />
      <div className="flex flex-col gap-0.5 px-1 py-1 lg:px-1.5 lg:py-1.5">
        <span className="whitespace-nowrap font-mono text-[10px] lg:text-[13px] font-bold tabular-nums text-foreground/80">{value}</span>
        <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-widest text-foreground/35">{label}</span>
      </div>
    </div>
  )
}

function VramBreakdownBar({
  modelMb,
  overheadMb,
  kvCacheMb,
}: {
  modelMb: number
  overheadMb: number
  kvCacheMb: number
}) {
  const showRuntime = overheadMb > 0
  const totalMb = modelMb + overheadMb + kvCacheMb

  const segmentColor = 'rgba(255,255,255,0.18)'

  // Compute grid column fractions
  let cols: string
  if (showRuntime && kvCacheMb > 0) {
    const rightTotal = kvCacheMb + overheadMb
    const rawKv = (kvCacheMb / rightTotal) * 50
    const rawRuntime = (overheadMb / rightTotal) * 50
    const min = 50 * 0.35
    const adjKv = Math.max(rawKv, min)
    const adjRuntime = Math.max(rawRuntime, min)
    const sum = adjKv + adjRuntime
    cols = `50fr ${(adjKv / sum) * 50}fr ${(adjRuntime / sum) * 50}fr`
  } else if (kvCacheMb > 0) {
    cols = '50fr 50fr'
  } else if (showRuntime) {
    cols = '50fr 50fr'
  } else {
    cols = '1fr'
  }

  return (
    <div className="flex flex-col gap-1.5 lg:gap-2">
      {/* Header: total */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/35">
          memory
        </span>
        <span className="font-mono text-xs lg:text-base font-bold tabular-nums text-foreground/70">
          {formatVram(totalMb)}
        </span>
      </div>

      {/* Segment labels as proportional blocks — min-h keeps layout stable across platform switches */}
      <div className="grid min-h-[3.25rem] lg:min-h-[4.25rem]" style={{ gridTemplateColumns: cols }}>
        <SegmentLabel label="weights" value={formatVram(modelMb)} color={segmentColor} pattern="solid" />
        {kvCacheMb > 0 && (
          <SegmentLabel label="kv cache" value={formatVram(kvCacheMb)} color={segmentColor} pattern="stripes" />
        )}
        {showRuntime && (
          <SegmentLabel label="runtime" value={formatVram(overheadMb)} color={segmentColor} pattern="dots" />
        )}
      </div>
    </div>
  )
}

/** Resolve which sub-variant + quant indices match the currently selected model */
function resolveSelectedIndices(
  entry: CatalogEntry,
  selectedModelId: string,
): { svIdx: number; quantIdx: number } {
  for (let si = 0; si < entry.subVariants.length; si++) {
    const sv = entry.subVariants[si]
    for (let qi = 0; qi < sv.groups.length; qi++) {
      if (sv.groups[qi].variants.some((v) => v.model.id === selectedModelId)) {
        return { svIdx: si, quantIdx: qi }
      }
    }
  }
  return { svIdx: 0, quantIdx: 0 }
}

/** Get all unique quant levels across all sub-variant groups */
function getQuantGroups(sv: SubVariant): ModelGroup[] {
  return sv.groups
}

/** Check if a group has any variant for the given OS */
function groupAvailableForOs(group: ModelGroup, os: OsPlatform | null): boolean {
  if (!os) return true
  return group.variants.some((v) => v.os.includes(os))
}

function FilledSlotCard({
  model,
  entry,
  group,
  visibleVariants,
  activeTabIndex,
  onTabSelect,
  accentColor,
  gpus,
  onRemove,
  macUnavailable,
  macSiblings,
  onSwapToSibling,
  contextOverride,
  onContextChange,
  swapModelVariant,
}: {
  model: CatalogModel
  entry: CatalogEntry | undefined
  group: ModelGroup | undefined
  visibleVariants: ModelVariant[]
  activeTabIndex: number
  onTabSelect: (os: OsPlatform) => void
  accentColor: string
  gpus: GpuInfo[]
  onRemove: () => void
  macUnavailable: boolean
  macSiblings: ModelGroup[]
  onSwapToSibling: (group: ModelGroup) => void
  contextOverride: number | null
  onContextChange: (ctx: number | null) => void
  swapModelVariant?: (oldModel: CatalogModel, newModel: CatalogModel) => void
}) {
  const displayName = entry?.displayName ?? group?.displayName ?? model.name

  const [nameCopied, setNameCopied] = useState(false)

  // Resolve current sub-variant and quant from the selected model
  const { svIdx: initialSvIdx, quantIdx: initialQuantIdx } = useMemo(
    () => entry ? resolveSelectedIndices(entry, model.id) : { svIdx: 0, quantIdx: 0 },
    [entry, model.id]
  )

  const [activeSvIdx, setActiveSvIdx] = useState(initialSvIdx)
  const [activeQuantIdx, setActiveQuantIdx] = useState(initialQuantIdx)

  // Sync when model changes externally
  useEffect(() => {
    if (!entry) return
    const { svIdx, quantIdx } = resolveSelectedIndices(entry, model.id)
    setActiveSvIdx(svIdx)
    setActiveQuantIdx(quantIdx)
  }, [entry, model.id])

  const currentSv = entry?.subVariants[activeSvIdx] ?? entry?.subVariants[0]
  const quantGroups = currentSv ? getQuantGroups(currentSv) : []

  // ── Unified platform tabs: one array, one rendering path ──
  const platformTabs = useMemo(() => {
    const tabs: { key: string; os: OsPlatform; available: boolean; variant?: ModelVariant; osLabels: OsPlatform[] }[] = []
    for (const vt of visibleVariants) {
      tabs.push({
        key: `${vt.model.id}-${vt.os.join(',')}`,
        os: vt.os[0],
        available: true,
        variant: vt,
        osLabels: [...vt.os],
      })
    }
    if (macUnavailable) {
      tabs.push({
        key: 'mac-unavailable',
        os: 'mac',
        available: false,
        osLabels: ['mac' as OsPlatform],
      })
    }
    return tabs
  }, [visibleVariants, macUnavailable])

  // activeTabIndex is -1 when parent indicates the unavailable tab should be active
  const activeTabIdx = activeTabIndex === -1
    ? platformTabs.findIndex(t => !t.available)
    : Math.max(0, Math.min(activeTabIndex, platformTabs.length - 1))
  const isUnavailableActive = platformTabs[activeTabIdx]?.available === false

  // Auto-switch quant when current quant is unavailable on the active OS
  const activeOs: OsPlatform | null = isUnavailableActive
    ? 'mac'
    : visibleVariants[activeTabIndex]?.os[0] ?? null

  useEffect(() => {
    if (!currentSv || !swapModelVariant || !activeOs) return
    const currentGroup = currentSv.groups[activeQuantIdx]
    if (!currentGroup) return
    const hasVariant = currentGroup.variants.some((v) => v.os.includes(activeOs))
    if (hasVariant) return
    const nearestIdx = currentSv.groups.findIndex((g) =>
      g.variants.some((v) => v.os.includes(activeOs))
    )
    if (nearestIdx >= 0) {
      const variant = getVariantForOs(currentSv.groups[nearestIdx], activeOs)
      swapModelVariant(model, variant.model)
    }
  }, [activeOs, activeQuantIdx, currentSv, model, swapModelVariant])

  // Use the selected model directly — it always reflects the correct quant+platform after any swap
  const v = model

  const engine = ENGINE_DISPLAY[v.engine] ?? v.engine
  const repo = model.repo
  const effectiveCtx = (model.type === 'llm' && contextOverride != null) ? contextOverride : v.contextLength
  const kvCacheMb = (v.kvCacheMbPer1kTokens && effectiveCtx)
    ? (effectiveCtx / 1000) * v.kvCacheMbPer1kTokens
    : 0

  const tpsEntries = v.tps ? Object.entries(v.tps) : []
  const tpsEntry = tpsEntries.length > 0 ? tpsEntries[0] : null
  const tpsGpuName = tpsEntry ? (gpus.find((g) => g.id === tpsEntry[0])?.name ?? tpsEntry[0]) : null

  const singleTab = platformTabs.length <= 1

  const handleSubVariantChange = useCallback((newSvIdx: number) => {
    if (!entry || !swapModelVariant) return
    const newSv = entry.subVariants[newSvIdx]
    if (!newSv) return

    // Prefer smallest quant (groups sorted by bits ascending) for current OS
    let bestGroup = newSv.groups.find((g) =>
      g.variants.some((gv) => !activeOs || gv.os.includes(activeOs))
    )
    if (!bestGroup) bestGroup = newSv.groups[0]
    if (!bestGroup) return

    const variant = getVariantForOs(bestGroup, activeOs)
    swapModelVariant(model, variant.model)
  }, [entry, model, activeOs, swapModelVariant])

  const handleQuantChange = useCallback((newQuantIdx: number) => {
    if (!currentSv || !swapModelVariant) return
    const newGroup = currentSv.groups[newQuantIdx]
    if (!newGroup) return

    const variant = getVariantForOs(newGroup, activeOs)
    swapModelVariant(model, variant.model)
  }, [currentSv, model, activeOs, swapModelVariant])

  const hasMultipleSubVariants = (entry?.subVariants.length ?? 0) > 1

  const availableQuantCount = quantGroups.filter(qg => groupAvailableForOs(qg, activeOs)).length
  const showConfigZone = hasMultipleSubVariants || availableQuantCount >= 1

  return (
    <div
      className="group relative flex flex-1 flex-col gap-2 lg:gap-3 overflow-hidden border bg-foreground/[0.03] p-2.5 lg:p-4 text-left transition-all duration-150 animate-fade-in"
      style={{ borderColor: `color-mix(in srgb, ${accentColor} 20%, transparent)`, borderTopWidth: 4, borderTopColor: accentColor }}
    >
      {/* ── IDENTITY ZONE ── */}

      {/* Model name + remove X */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            navigator.clipboard.writeText(displayName)
            setNameCopied(true)
            setTimeout(() => setNameCopied(false), 1500)
          }}
          className="group/name flex flex-1 items-center gap-1.5 min-w-0 text-left"
          title={displayName}
        >
          <span
            className="truncate font-mono text-sm lg:text-lg font-bold leading-tight"
            style={{ color: accentColor }}
          >
            {displayName}
          </span>
          {nameCopied ? (
            <Check size={14} className="shrink-0 text-foreground/50" />
          ) : (
            <Copy size={14} className="shrink-0 opacity-0 group-hover/name:opacity-100 text-foreground/30 transition-opacity" />
          )}
        </button>
        <button
          onClick={onRemove}
          className="shrink-0 p-1 text-foreground/30 transition-colors hover:text-foreground/70"
          title="remove model"
        >
          <X size={16} />
        </button>
      </div>

      {/* Platform tabs — full-width bottom line, active tab highlighted with bg */}
      <div className="flex items-end border-b border-foreground/[0.08]">
        {platformTabs.map((tab, i) => {
          const isActive = i === activeTabIdx
          return (
            <button
              key={tab.key}
              onClick={() => onTabSelect(tab.os)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-8 font-mono text-[10px] uppercase tracking-wider transition-all",
                isActive
                  ? "text-foreground/80 bg-foreground/[0.08]"
                  : "text-foreground/30 hover:text-foreground/50",
                singleTab && "cursor-default"
              )}
            >
              {tab.osLabels.map((o, idx) => (
                <span key={o} className="inline-flex items-center gap-1">
                  {idx > 0 && <span className="text-foreground/15 mr-1">·</span>}
                  <PlatformIcon os={o} className="h-3.5 w-3.5" />
                  <span>{o === 'mac' ? 'macOS' : o === 'windows' ? 'Windows' : 'Linux'}</span>
                </span>
              ))}
            </button>
          )
        })}
      </div>

      {isUnavailableActive ? (
        /* No Mac variant message */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10">
          <span className="font-mono text-[11px] text-foreground/40">
            no macOS variant available for this quant
          </span>
          {macSiblings.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/25">
                available as
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {macSiblings.map((s) => {
                  const macV = s.variants.find((sv) => sv.os.includes('mac'))
                  if (!macV) return null
                  return (
                    <button
                      key={s.key}
                      onClick={() => onSwapToSibling(s)}
                      className="font-mono text-[11px] px-3 py-1.5 border border-foreground/10 text-foreground/60 hover:text-foreground/90 hover:border-foreground/30 transition-colors"
                    >
                      {s.displayName} · {macV.shortLabel} · {formatVram(macV.vramTotal)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── RESOURCES ZONE ── */}

          {/* VRAM breakdown bar */}
          <VramBreakdownBar
            modelMb={v.vram.model}
            overheadMb={v.vram.overhead}
            kvCacheMb={kvCacheMb}
          />

          {/* Section divider: resources → specs */}
          <div className="h-px bg-foreground/[0.08]" />

          {/* ── SPECS TABLE (config + info in one table) ── */}

          <div className="flex flex-col overflow-hidden">
            {/* Quant row */}
            {availableQuantCount >= 1 && showConfigZone && (
              <>
                <div className="flex items-stretch">
                  <span className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
                    quant
                  </span>
                  <span className="w-px shrink-0 bg-foreground/[0.08]" />
                  <div className="flex flex-1 items-center gap-1 px-2 lg:px-3 py-1 lg:py-1.5">
                    {quantGroups.map((qg, i) => {
                      if (!groupAvailableForOs(qg, activeOs)) return null
                      const bits = qg.variants[0]?.bits ?? qg.variants[0]?.model.bits
                      const label = bits != null ? `${bits}bit` : '--'
                      const isActive = i === activeQuantIdx

                      return (
                        <button
                          key={qg.key}
                          onClick={() => handleQuantChange(i)}
                          className={cn(
                            "h-5 px-1.5 font-mono text-[8px] lg:text-[9px] uppercase tracking-wider transition-all",
                            isActive
                              ? "border border-foreground/30 bg-foreground/10 text-foreground/90"
                              : "border border-foreground/[0.08] bg-foreground/[0.04] text-foreground/50 hover:text-foreground/70 hover:border-foreground/15"
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            {/* Context slider row (LLM) or static context row (non-LLM) */}
            {v.contextLength && model.type === 'llm' && (
              <>
                <ContextControl
                  contextLength={v.contextLength}
                  contextOverride={contextOverride}
                  onContextChange={onContextChange}
                />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}
            {v.contextLength && model.type !== 'llm' && (
              <>
                <InfoBlock label="context" value={`${formatContext(v.contextLength)} tokens`} />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            {model.type === 'llm' && (
              <>
                <InfoBlockTps tpsValue={tpsEntry ? tpsEntry[1] : null} gpuName={tpsGpuName} />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            {/* Variant row */}
            {hasMultipleSubVariants && entry && (
              <>
                <div className="flex items-stretch">
                  <span className="flex w-16 lg:w-20 shrink-0 items-center justify-end px-2 lg:px-3 py-1 lg:py-1.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
                    variant
                  </span>
                  <span className="w-px shrink-0 bg-foreground/[0.08]" />
                  <div className="flex flex-1 items-center gap-1 px-2 lg:px-3 py-1 lg:py-1.5">
                    {entry.subVariants.map((sv, i) => (
                      <button
                        key={sv.label || i}
                        onClick={() => handleSubVariantChange(i)}
                        className={cn(
                          "h-5 px-1.5 font-mono text-[9px] uppercase tracking-wider transition-all",
                          i === activeSvIdx
                            ? "border border-foreground/30 bg-foreground/10 text-foreground/90"
                            : "border border-foreground/[0.08] bg-foreground/[0.04] text-foreground/50 hover:text-foreground/70 hover:border-foreground/15"
                        )}
                      >
                        {sv.label || 'default'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            <InfoBlockLink label="weights" url={`https://huggingface.co/${repo}`} text={repo} />
            <div className="h-px bg-foreground/[0.06]" />

            <InfoBlock label="engine" value={engine} />
          </div>
        </>
      )}
    </div>
  )
}

export default function SelectedModels({
  models,
  onToggle,
  modelIdToGroup,
  modelIdToEntry,
  gpus,
  os,
  contextOverride,
  onContextChange,
  onSharedOsChange,
  swapModelVariant,
}: {
  models: CatalogModel[]
  onToggle: (model: CatalogModel) => void
  modelIdToGroup: Map<string, ModelGroup>
  modelIdToEntry?: Map<string, CatalogEntry>
  gpus: GpuInfo[]
  os: OsPlatform | null
  contextOverride: number | null
  onContextChange: (ctx: number | null) => void
  onSharedOsChange?: (os: OsPlatform | null) => void
  swapModelVariant?: (oldModel: CatalogModel, newModel: CatalogModel) => void
}) {
  // Shared OS tab state across all cards — card-local, never changes global OS filter.
  // Only controls which platform variant is displayed in the cards and VRAM gauge.
  const [sharedOs, setSharedOs] = useState<OsPlatform | null>(os)

  // When global OS changes to a specific value, sync shared tab state.
  // When cleared (null), preserve the user's last tab selection.
  useEffect(() => {
    if (os != null) setSharedOs(os)
  }, [os])

  // Deduplicated list of all groups for sibling lookup
  const allGroups = useMemo(
    () => [...new Map([...modelIdToGroup.values()].map((g) => [g.key, g])).values()],
    [modelIdToGroup],
  )

  if (models.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="font-mono text-[11px] text-foreground/30">
          select models from the catalog
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-4 lg:grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}
    >
      {SLOTS.flatMap((slot) => {
        const m = models.find((model) => model.type === slot.type)
        if (!m) return []

        const group = modelIdToGroup.get(m.id)
        const entry = modelIdToEntry?.get(m.id)

        // Collect all unique platform variants across the ENTIRE entry (not just current group)
        // so platform tabs remain visible even when the current quant is platform-exclusive.
        const entryVariants: ModelVariant[] = []
        const seenOs = new Set<string>()
        if (entry) {
          for (const g of entry.groups) {
            for (const v of g.variants) {
              const osKey = [...v.os].sort().join(',')
              if (!seenOs.has(osKey)) {
                seenOs.add(osKey)
                entryVariants.push(v)
              }
            }
          }
          // Sort: Linux/Windows first, Mac second
          entryVariants.sort((a, b) => {
            const aIsMac = a.os.includes('mac') ? 1 : 0
            const bIsMac = b.os.includes('mac') ? 1 : 0
            return aIsMac - bIsMac
          })
        } else {
          // Fallback to current group variants if no entry
          entryVariants.push(...(group?.variants ?? []))
        }

        // When a global OS filter is active, only show tabs for that OS
        const filtered = os
          ? entryVariants.filter((vt) => vt.os.includes(os))
          : entryVariants

        // Show macOS tab when entry has no mac variant (both with and without OS filter)
        const macUnavailable = (os === 'mac' || !os) && !entryVariants.some((vt) => vt.os.includes('mac'))
        const isMacTabActive = (sharedOs === 'mac' || os === 'mac') && macUnavailable
        const macSiblings = macUnavailable && group
          ? findSiblingsWithOs(group, allGroups, 'mac')
          : []

        // When the mac tab is active but unavailable, deselect real variant tabs
        const activeIdx = isMacTabActive
          ? -1
          : sharedOs
            ? Math.max(0, filtered.findIndex((vt) => vt.os.includes(sharedOs)))
            : 0

        const handleSwapToSibling = (siblingGroup: ModelGroup) => {
          // Prefer linux variant so model stays visible in catalog; fall back to mac
          const variant = siblingGroup.variants.find((sv) => sv.os.includes('linux'))
            ?? siblingGroup.variants.find((sv) => sv.os.includes('mac'))
          if (!variant) return
          onToggle(m) // remove current
          onToggle(variant.model) // add sibling variant
        }

        return [(
          <div key={slot.type} className="flex flex-col gap-1.5">
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: slot.color }}
            >
              {slot.label}
            </span>

            <FilledSlotCard
              model={m}
              entry={entry}
              group={group}
              visibleVariants={filtered}
              activeTabIndex={activeIdx}
              onTabSelect={(newOs) => {
                setSharedOs(newOs)
                onSharedOsChange?.(newOs)
                // Swap model to the variant matching the new platform
                if (swapModelVariant && entry) {
                  // Try current group first
                  const curVariant = group?.variants.find(v => v.os.includes(newOs))
                  if (curVariant && curVariant.model.id !== m.id) {
                    swapModelVariant(m, curVariant.model)
                  } else if (!curVariant) {
                    // Current group has no variant for this OS — find any group that does
                    for (const g of entry.groups) {
                      const v = g.variants.find(v => v.os.includes(newOs))
                      if (v) {
                        swapModelVariant(m, v.model)
                        break
                      }
                    }
                  }
                }
              }}
              accentColor={slot.color}
              gpus={gpus}
              onRemove={() => onToggle(m)}
              macUnavailable={macUnavailable}
              macSiblings={macSiblings}
              onSwapToSibling={handleSwapToSibling}
              contextOverride={contextOverride}
              onContextChange={onContextChange}
              swapModelVariant={swapModelVariant}
            />
          </div>
        )]
      })}
    </div>
  )
}
