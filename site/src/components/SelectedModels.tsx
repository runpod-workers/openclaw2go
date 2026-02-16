import { formatContext, formatVram, type CatalogModel, type OsPlatform } from '../lib/catalog'
import type { ModelGroup, ModelVariant } from '../lib/group-models'
import { PlatformIcon } from './PlatformSelector'
import { X, ExternalLink } from 'lucide-react'
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

/** Label (1/3) | visible divider | Value (2/3) */
function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-1/3 shrink-0 items-center justify-end px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <span className="flex w-2/3 items-center px-3 py-2.5 font-mono text-[13px] font-bold tabular-nums text-foreground/80">
        {value}
      </span>
    </div>
  )
}

/** Info row with a clickable link */
function InfoBlockLink({ label, url, text }: { label: string; url: string; text: string }) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-1/3 shrink-0 items-center justify-end px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <span className="w-px shrink-0 bg-foreground/[0.08]" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-2/3 items-center gap-1.5 px-3 py-2.5 font-mono text-[12px] text-foreground/50 transition-colors hover:text-foreground/80"
      >
        <ExternalLink size={11} className="shrink-0" />
        <span className="truncate">{text}</span>
      </a>
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
  detail,
  color,
  pattern = 'solid',
}: {
  label: string
  value: string
  detail?: string
  color: string
  pattern?: SegmentPattern
}) {
  return (
    <div className="flex flex-col">
      <span className="inline-block h-10 w-full" style={SEGMENT_PATTERNS[pattern](color)} />
      <div className="flex flex-col gap-0.5 px-2.5 py-2.5">
        <span className="font-mono text-[15px] font-bold tabular-nums text-foreground/80">{value}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/35">{label}</span>
        <span className="font-mono text-[9px] text-foreground/30">{detail || '\u00A0'}</span>
      </div>
    </div>
  )
}

function VramBreakdownBar({
  modelMb,
  overheadMb,
  kvCacheMb,
  contextLength,
  platformOs,
  engine,
}: {
  modelMb: number
  overheadMb: number
  kvCacheMb: number
  contextLength?: number
  platformOs?: OsPlatform[]
  engine?: string
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
    <div className="flex flex-col gap-3">
      {/* Header: total */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/35">
          {memLabel}
        </span>
        <span className="font-mono text-lg font-bold tabular-nums text-foreground/70">
          {formatVram(totalMb)}
        </span>
      </div>

      {/* Segment labels as proportional blocks — model → kv cache → runtime */}
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        <SegmentLabel label="weights" value={formatVram(modelMb)} color={segmentColor} pattern="solid" />
        {kvCacheMb > 0 && (
          <SegmentLabel
            label="kv cache"
            value={formatVram(kvCacheMb)}
            detail={contextLength ? `@ ${formatContext(contextLength)} ctx` : undefined}
            color={segmentColor}
            pattern="stripes"
          />
        )}
        {showRuntime && (
          <SegmentLabel label="runtime" value={formatVram(overheadMb)} detail={engine} color={segmentColor} pattern="dots" />
        )}
      </div>
    </div>
  )
}

function EmptySlotCard({ accentColor }: { accentColor: string }) {
  return (
    <div
      className="flex flex-1 flex-col border-2 border-dashed p-6"
      style={{ borderColor: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}
    />
  )
}

function FilledSlotCard({
  model,
  group,
  visibleVariants,
  accentColor,
  onRemove,
  onVariantSwitch,
}: {
  model: CatalogModel
  group: ModelGroup | undefined
  visibleVariants: ModelVariant[]
  accentColor: string
  onRemove: () => void
  onVariantSwitch: (os: OsPlatform) => void
}) {
  // Find which tab index matches the currently selected model
  const currentIndex = visibleVariants.findIndex((vt) => vt.model.id === model.id)
  const activeTab = currentIndex >= 0 ? currentIndex : 0
  const displayName = group?.displayName ?? model.name

  // Always show platform tab(s) so users can confirm which platform variant is active
  const showTabs = visibleVariants.length > 0
  const activeVariant = visibleVariants[activeTab] ?? visibleVariants[0]
  const v = activeVariant?.model ?? model

  const engine = ENGINE_DISPLAY[v.engine] ?? v.engine
  const quant = activeVariant?.quant
  const repo = activeVariant?.repo ?? model.repo
  const kvCacheMb = (v.kvCacheMbPer1kTokens && v.contextLength)
    ? (v.contextLength / 1000) * v.kvCacheMbPer1kTokens
    : 0

  return (
    <div
      className="group relative flex flex-1 flex-col gap-4 overflow-hidden border bg-foreground/[0.03] p-5 text-left transition-all duration-150 animate-fade-in"
      style={{ borderColor: `color-mix(in srgb, ${accentColor} 20%, transparent)`, borderLeftWidth: 4, borderLeftColor: accentColor }}
    >
      {/* Model name + remove X */}
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex-1 font-mono text-2xl font-bold leading-tight line-clamp-2 min-h-[3.75rem]"
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
            key={vt.model.id}
            onClick={() => {
              if (vt.model.id === model.id) return
              // Switch global OS — the first OS in the variant's list is the primary one
              const primaryOs = vt.os[0]
              if (primaryOs) onVariantSwitch(primaryOs)
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full font-mono text-[10px] uppercase tracking-wider transition-all",
              i === activeTab
                ? "text-foreground/80 border-b-2"
                : "text-foreground/30 hover:text-foreground/50",
              visibleVariants.length === 1 && "cursor-default"
            )}
            style={i === activeTab ? { borderBottomColor: accentColor } : undefined}
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
      </div>

      {/* VRAM breakdown bar */}
      <VramBreakdownBar
        modelMb={v.vram.model}
        overheadMb={v.vram.overhead}
        kvCacheMb={kvCacheMb}
        contextLength={v.contextLength}
        platformOs={activeVariant?.os ?? model.os}
        engine={engine}
      />

      {/* Info table */}
      <div className="flex flex-col overflow-hidden border border-foreground/[0.08]">
        <InfoBlock label="engine" value={engine} />
        <div className="h-px bg-foreground/[0.06]" />

        {quant && quant !== '--' && (
          <>
            <InfoBlock label="quant" value={quant} />
            <div className="h-px bg-foreground/[0.06]" />
          </>
        )}

        {v.contextLength && (
          <>
            <InfoBlock label="context" value={`${formatContext(v.contextLength)} tokens`} />
            <div className="h-px bg-foreground/[0.06]" />
          </>
        )}

        <InfoBlockLink label="weights" url={`https://huggingface.co/${repo}`} text={repo} />
      </div>
    </div>
  )
}

export default function SelectedModels({
  models,
  onToggle,
  modelIdToGroup,
  onVariantSwitch,
}: {
  models: CatalogModel[]
  onToggle: (model: CatalogModel) => void
  modelIdToGroup: Map<string, ModelGroup>
  onVariantSwitch: (os: OsPlatform) => void
}) {
  const byType = new Map(models.map((m) => [m.type, m]))

  return (
    <div className="grid h-full grid-cols-3 gap-3">
      {SLOTS.map((slot) => {
        const m = byType.get(slot.type)

        return (
          <div key={slot.type} className="flex flex-col gap-2">
            <span
              className="font-mono text-sm font-bold uppercase tracking-[0.2em]"
              style={{ color: slot.color }}
            >
              {slot.label}
            </span>

            {!m ? (
              <EmptySlotCard accentColor={slot.color} />
            ) : (
              <FilledSlotCard
                model={m}
                group={modelIdToGroup.get(m.id)}
                visibleVariants={modelIdToGroup.get(m.id)?.variants ?? []}
                accentColor={slot.color}
                onRemove={() => onToggle(m)}
                onVariantSwitch={onVariantSwitch}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
