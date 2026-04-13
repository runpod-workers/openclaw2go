import { cn } from '../lib/utils'
import type { OsPlatform } from '../lib/catalog'
import { formatVram, formatContext } from '../lib/catalog'
import type { FamilyEntry } from '../lib/group-models'
import { getFamilyEntrySummary } from '../lib/group-models'

export default function CatalogEntryCard({
  familyEntry,
  selected,
  onToggle,
  wouldExceed,
  dimmed,
  os,
  accentColor,
}: {
  familyEntry: FamilyEntry
  selected: boolean
  onToggle: () => void
  wouldExceed: boolean
  dimmed: boolean
  os: OsPlatform | null
  accentColor: string
}) {
  const summary = getFamilyEntrySummary(familyEntry, os)

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
        "h-8 px-3 gap-2",
        selected
          ? "bg-foreground/[0.07]"
          : "hover:bg-foreground/[0.03]",
        wouldExceed && !selected && "pointer-events-none opacity-20",
        dimmed && !selected && "opacity-35",
      )}
      data-model-type={familyEntry.type}
      data-selected={selected || undefined}
      style={selected ? { boxShadow: `inset 3px 0 0 ${accentColor}` } : undefined}
    >
      {/* model name */}
      <span
        className={cn(
          "flex-1 truncate font-mono font-medium leading-none",
          "text-[11px]",
          selected ? "text-foreground" : "text-foreground/90"
        )}
        title={familyEntry.displayName}
      >
        {familyEntry.displayName}
      </span>

      {/* vision badge */}
      {familyEntry.hasVision && (
        <span className="shrink-0 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[8px] font-medium text-foreground/50">
          vision
        </span>
      )}

      {/* capability badges (tts, stt) */}
      {familyEntry.capabilities?.map((cap) => (
        <span key={cap} className="shrink-0 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[8px] font-medium text-foreground/50">
          {cap}
        </span>
      ))}

      {/* context */}
      <span className="w-[36px] shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/60">
        {familyEntry.maxContextLength ? formatContext(familyEntry.maxContextLength) : "--"}
      </span>

      {/* tps */}
      <span className="w-[36px] shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/60">
        {summary.maxTps != null ? summary.maxTps : "--"}
      </span>

      {/* memory */}
      <span className={cn(
        "w-[52px] shrink-0 text-right font-mono text-[10px] tabular-nums",
        selected ? "text-foreground/80" : "text-foreground/60"
      )}>
        {summary.minVramMb > 0 ? formatVram(summary.minVramMb) : "--"}
      </span>
    </div>
  )
}
