import { cn } from '../lib/utils'
import type { OsPlatform } from '../lib/catalog'
import { formatVram, formatContext } from '../lib/catalog'
import type { ModelGroup } from '../lib/group-models'
import { getVariantForOs } from '../lib/group-models'

export default function ModelGroupCard({
  group,
  selected,
  onToggle,
  wouldExceed,
  dimmed,
  os,
  accentColor,
  hasVision,
  capabilities,
}: {
  group: ModelGroup
  selected: boolean
  onToggle: () => void
  wouldExceed: boolean
  dimmed: boolean
  os: OsPlatform | null
  accentColor: string
  hasVision?: boolean
  capabilities?: string[]
}) {
  const variant = getVariantForOs(group, os)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault()
          const list = (e.currentTarget as HTMLElement).closest('[data-model-list]')
          if (!list) return
          const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="button"]'))
          const idx = rows.indexOf(e.currentTarget as HTMLElement)
          if (idx < 0) return
          const next = e.key === "ArrowDown" ? rows[idx + 1] : rows[idx - 1]
          if (next) {
            next.focus()
            next.scrollIntoView({ block: 'nearest' })
            // Auto-swap only if the target's type already has a selected model
            const targetType = next.dataset.modelType
            if (
              targetType &&
              !next.hasAttribute('data-selected') &&
              list.querySelector(`[data-model-type="${targetType}"][data-selected]`)
            ) {
              next.click()
            }
          }
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center text-left transition-all duration-150",
        "h-9 px-3 gap-2",
        selected
          ? "bg-foreground/[0.07]"
          : "hover:bg-foreground/[0.03]",
        wouldExceed && !selected && "pointer-events-none opacity-20",
        dimmed && !selected && "opacity-35"
      )}
      data-model-type={group.type}
      data-selected={selected || undefined}
      style={selected ? { boxShadow: `inset 3px 0 0 ${accentColor}` } : undefined}
    >
      {/* model name */}
      <span
        className={cn(
          "flex-1 truncate font-mono text-[11px] font-medium leading-none",
          selected ? "text-foreground" : "text-foreground/90"
        )}
        title={group.displayName}
      >
        {group.displayName}
      </span>

      {/* vision badge */}
      {hasVision && (
        <span className="shrink-0 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[8px] font-medium text-foreground/50">
          vision
        </span>
      )}

      {/* capability badges (tts, stt) */}
      {capabilities?.map((cap) => (
        <span key={cap} className="shrink-0 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[8px] font-medium text-foreground/50">
          {cap}
        </span>
      ))}

      {/* quant badge */}
      <span className="shrink-0 bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-foreground/70">
        {variant.shortLabel}
      </span>

      {/* context */}
      <span className="w-[36px] shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/60">
        {group.contextLength ? formatContext(group.contextLength) : "--"}
      </span>

      {/* tps */}
      <span className="w-[30px] shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/60">
        {variant.tps && Object.keys(variant.tps).length > 0
          ? Math.max(...Object.values(variant.tps))
          : "--"}
      </span>

      {/* vram */}
      <span className={cn(
        "w-[48px] shrink-0 text-right font-mono text-[10px] tabular-nums",
        selected ? "text-foreground/80" : "text-foreground/60"
      )}>
        {formatVram(variant.vramTotal)}
      </span>
    </div>
  )
}
