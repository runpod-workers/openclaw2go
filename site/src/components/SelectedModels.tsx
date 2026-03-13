import { useState, useEffect, useMemo, useRef } from 'react'
import { formatContext, formatVram, type CatalogModel, type GpuInfo, type OsPlatform } from '../lib/catalog'
import type { ModelGroup, ModelVariant } from '../lib/group-models'
import { findSiblingsWithOs } from '../lib/group-models'
import { PlatformIcon } from './PlatformSelector'
import { X, ExternalLink, HelpCircle } from 'lucide-react'
import { cn } from '../lib/utils'

const SLOTS: { type: 'llm' | 'image' | 'audio'; label: string; color: string }[] = [
  { type: 'llm', label: 'LLM', color: '#00e5ff' },
  { type: 'image', label: 'IMAGE', color: '#ec407a' },
  { type: 'audio', label: 'AUDIO', color: '#b388ff' },
]

/** Map internal engine IDs to human-friendly display names */
const ENGINE_DISPLAY: Record<string, string> = {
  'llamacpp': 'llama.cpp',
  'openclaw2go-llamacpp': 'llama.cpp',
  'ik-llamacpp': 'ik_llama.cpp',
  'image-gen': 'diffusers',
  'mlx': 'mlx-lm',
}

/** Label (1/4 mobile, 1/3 desktop) | visible divider | Value */
function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-1/4 lg:w-1/3 shrink-0 items-center justify-end px-2 lg:px-3 py-1.5 lg:py-2.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <span className="flex w-3/4 lg:w-2/3 items-center px-2 lg:px-3 py-1.5 lg:py-2.5 font-mono text-[11px] lg:text-[13px] font-bold tabular-nums text-foreground/80">
        {value}
      </span>
    </div>
  )
}

/** Info row with a clickable link */
function InfoBlockLink({ label, url, text }: { label: string; url: string; text: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-1/4 lg:w-1/3 shrink-0 items-center justify-end px-2 lg:px-3 py-1.5 lg:py-2.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-3/4 lg:w-2/3 items-center gap-1.5 px-2 lg:px-3 py-1.5 lg:py-2.5 font-mono text-[10px] lg:text-[12px] text-foreground/50 transition-colors hover:text-foreground/80"
      >
        <ExternalLink size={11} className="shrink-0" />
        <span className="truncate">{text}</span>
      </a>
    </div>
  )
}

const REPO_URL = 'https://github.com/runpod/openclaw2go'

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
      <span className="flex w-1/4 lg:w-1/3 shrink-0 items-center justify-end px-2 lg:px-3 py-1.5 lg:py-2.5 font-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-foreground/40">
        tps
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <div className="relative flex w-3/4 lg:w-2/3 items-center px-2 lg:px-3 py-1.5 lg:py-2.5 min-h-0 lg:min-h-[39.5px]">
        {tpsValue != null ? (
          <span className="font-mono text-[11px] lg:text-[13px] font-bold tabular-nums text-foreground/80">
            {tpsValue} tok/s · {gpuName}
          </span>
        ) : (
          <>
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 font-mono text-[12px] text-foreground/35 transition-colors hover:text-foreground/60"
            >
              <HelpCircle size={13} className="shrink-0" />
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

/** Tall labeled segment with patterned bar */
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
      <span className="inline-block h-6 lg:h-10 w-full" style={SEGMENT_PATTERNS[pattern](color)} />
      <div className="flex flex-col gap-0.5 px-1.5 py-1.5 lg:px-2.5 lg:py-2.5">
        <span className="whitespace-nowrap font-mono text-[12px] lg:text-[15px] font-bold tabular-nums text-foreground/80">{value}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/35">{label}</span>
      </div>
    </div>
  )
}

function VramBreakdownBar({
  modelMb,
  overheadMb,
  kvCacheMb,
  platformOs,
}: {
  modelMb: number
  overheadMb: number
  kvCacheMb: number
  platformOs?: OsPlatform[]
}) {
  const showRuntime = overheadMb > 0
  const totalMb = modelMb + overheadMb + kvCacheMb
  const isMac = platformOs?.includes('mac')
  const memLabel = isMac ? 'memory' : 'vram'

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
    <div className="flex flex-col gap-2 lg:gap-3">
      {/* Header: total */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/35">
          {memLabel}
        </span>
        <span className="font-mono text-sm lg:text-lg font-bold tabular-nums text-foreground/70">
          {formatVram(totalMb)}
        </span>
      </div>

      {/* Segment labels as proportional blocks — model → kv cache → runtime */}
      <div className="grid min-h-0 lg:min-h-[5.5rem]" style={{ gridTemplateColumns: cols }}>
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

function FilledSlotCard({
  model,
  group,
  visibleVariants,
  activeTabIndex,
  onTabSelect,
  accentColor,
  gpus,
  onRemove,
  macUnavailable,
  isMacTabActive,
  macSiblings,
  onSwapToSibling,
}: {
  model: CatalogModel
  group: ModelGroup | undefined
  visibleVariants: ModelVariant[]
  activeTabIndex: number
  onTabSelect: (os: OsPlatform) => void
  accentColor: string
  gpus: GpuInfo[]
  onRemove: () => void
  macUnavailable: boolean
  isMacTabActive: boolean
  macSiblings: ModelGroup[]
  onSwapToSibling: (group: ModelGroup) => void
}) {
  const activeTab = activeTabIndex
  const displayName = group?.displayName ?? model.name

  const showTabs = visibleVariants.length > 0
  const activeVariant = visibleVariants[activeTab] ?? visibleVariants[0]
  const v = activeVariant?.model ?? model

  const engine = ENGINE_DISPLAY[v.engine] ?? v.engine
  const quant = v.bits != null ? `${v.bits}bit` : '--'
  const repo = activeVariant?.repo ?? model.repo
  const kvCacheMb = (v.kvCacheMbPer1kTokens && v.contextLength)
    ? (v.contextLength / 1000) * v.kvCacheMbPer1kTokens
    : 0

  // TPS: pick the first entry and resolve GPU display name
  const tpsEntries = v.tps ? Object.entries(v.tps) : []
  const tpsEntry = tpsEntries.length > 0 ? tpsEntries[0] : null
  const tpsGpuName = tpsEntry ? (gpus.find((g) => g.id === tpsEntry[0])?.name ?? tpsEntry[0]) : null

  const singleTab = visibleVariants.length <= 1 && !macUnavailable

  return (
    <div
      className="group relative flex flex-1 flex-col gap-3 lg:gap-4 overflow-hidden border bg-foreground/[0.03] p-3 lg:p-5 text-left transition-all duration-150 animate-fade-in"
      style={{ borderColor: `color-mix(in srgb, ${accentColor} 20%, transparent)`, borderTopWidth: 4, borderTopColor: accentColor }}
    >
      {/* Model name + remove X */}
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex-1 font-mono text-base lg:text-2xl font-bold leading-tight truncate lg:line-clamp-2 lg:min-h-[3.75rem]"
          style={{ color: accentColor }}
          title={displayName}
        >
          {displayName}
        </span>
        <button
          onClick={onRemove}
          className="shrink-0 mt-0.5 p-1 text-foreground/30 transition-colors hover:text-foreground/70"
          title="remove model"
        >
          <X size={16} />
        </button>
      </div>

      {/* Platform tabs — always visible to confirm which platform variant is shown */}
      <div className="h-8 flex items-end gap-px">
        {showTabs && visibleVariants.map((vt, i) => (
          <button
            key={`${vt.model.id}-${vt.os.join(',')}`}
            onClick={() => onTabSelect(vt.os[0])}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full font-mono text-[10px] uppercase tracking-wider transition-all",
              i === activeTab && !isMacTabActive
                ? "text-foreground/80 border-b-2"
                : "text-foreground/30 hover:text-foreground/50",
              singleTab && "cursor-default"
            )}
            style={i === activeTab && !isMacTabActive ? { borderBottomColor: accentColor } : undefined}
          >
            {vt.os.map((o, idx) => (
              <span key={o} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-foreground/15 mr-1">·</span>}
                <PlatformIcon os={o} className="h-3.5 w-3.5" />
                <span>{o === 'mac' ? 'macOS' : o === 'windows' ? 'Windows' : 'Linux'}</span>
              </span>
            ))}
          </button>
        ))}

        {/* Synthetic macOS tab when no MLX variant exists */}
        {macUnavailable && (
          <button
            key="mac-unavailable"
            onClick={() => onTabSelect('mac')}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full font-mono text-[10px] uppercase tracking-wider transition-all",
              isMacTabActive
                ? "text-foreground/80 border-b-2"
                : "text-foreground/30 hover:text-foreground/50",
            )}
            style={isMacTabActive ? { borderBottomColor: accentColor } : undefined}
          >
            <PlatformIcon os="mac" className="h-3.5 w-3.5" />
            <span>macOS</span>
          </button>
        )}
      </div>

      {isMacTabActive ? (
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
                  const macV = s.variants.find((v) => v.os.includes('mac'))
                  if (!macV) return null
                  return (
                    <button
                      key={s.key}
                      onClick={() => onSwapToSibling(s)}
                      className="font-mono text-[11px] px-3 py-1.5 border border-foreground/10 text-foreground/60 hover:text-foreground/90 hover:border-foreground/30 transition-colors"
                    >
                      {macV.shortLabel} · {formatVram(macV.vramTotal)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* VRAM breakdown bar */}
          <VramBreakdownBar
            modelMb={v.vram.model}
            overheadMb={v.vram.overhead}
            kvCacheMb={kvCacheMb}
            platformOs={activeVariant?.os ?? model.os}
          />

          {/* Info table */}
          <div className="flex flex-col overflow-hidden border border-foreground/[0.08]">
            {model.type === 'llm' && (
              <>
                <InfoBlockTps tpsValue={tpsEntry ? tpsEntry[1] : null} gpuName={tpsGpuName} />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            {quant && quant !== '--' && (
              <>
                <InfoBlock label="quant" value={quant} />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            <InfoBlock label="engine" value={engine} />
            <div className="h-px bg-foreground/[0.06]" />

            {v.contextLength && (
              <>
                <InfoBlock label="context" value={`${formatContext(v.contextLength)} tokens`} />
                <div className="h-px bg-foreground/[0.06]" />
              </>
            )}

            <InfoBlockLink label="weights" url={`https://huggingface.co/${repo}`} text={repo} />
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
  gpus,
  os,
}: {
  models: CatalogModel[]
  onToggle: (model: CatalogModel) => void
  modelIdToGroup: Map<string, ModelGroup>
  gpus: GpuInfo[]
  os: OsPlatform | null
}) {
  // Shared OS tab state across all cards (independent of global OS selector)
  const [sharedOs, setSharedOs] = useState<OsPlatform | null>(os)

  // When global OS changes, reset shared tab state to match
  useEffect(() => {
    setSharedOs(os)
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
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}
    >
      {SLOTS.flatMap((slot) => {
        const m = models.find((model) => model.type === slot.type)
        if (!m) return []

        const group = modelIdToGroup.get(m.id)
        const allVariants = group?.variants ?? []
        // Filter variants by global OS if set
        const filtered = os
          ? allVariants.filter((vt) => vt.os.includes(os))
          : allVariants

        // Check if this group has no Mac variant at all
        const macUnavailable = !allVariants.some((vt) => vt.os.includes('mac'))
        const isMacTabActive = sharedOs === 'mac' && macUnavailable
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
          const macVariant = siblingGroup.variants.find((v) => v.os.includes('mac'))
          if (!macVariant) return
          onToggle(m) // remove current
          onToggle(macVariant.model) // add sibling's mac variant
        }

        return [(
          <div key={slot.type} className="flex flex-col gap-2">
            <span
              className="font-mono text-sm font-bold uppercase tracking-[0.2em]"
              style={{ color: slot.color }}
            >
              {slot.label}
            </span>

            <FilledSlotCard
              model={m}
              group={group}
              visibleVariants={filtered}
              activeTabIndex={activeIdx}
              onTabSelect={setSharedOs}
              accentColor={slot.color}
              gpus={gpus}
              onRemove={() => onToggle(m)}
              macUnavailable={macUnavailable}
              isMacTabActive={isMacTabActive}
              macSiblings={macSiblings}
              onSwapToSibling={handleSwapToSibling}
            />
          </div>
        )]
      })}
    </div>
  )
}
