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
}: {
  group: ModelGroup
  selected: boolean
  onToggle: () => void
  wouldExceed: boolean
  dimmed: boolean
  os: OsPlatform | null
  accentColor: string
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

      {/* context */}
      <span className="w-[36px] shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/60">
        {group.contextLength ? formatContext(group.contextLength) : "--"}
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
