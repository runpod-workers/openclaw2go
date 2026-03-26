import { cn } from '../lib/utils'
import type { AgentFramework } from '../lib/frameworks'
import { FRAMEWORKS } from '../lib/frameworks'

export default function FrameworkSelector({
  selected,
}: {
  selected: AgentFramework
}) {
  const cols = 3
  const lastRowStart = Math.floor((FRAMEWORKS.length - 1) / cols) * cols

  return (
    <div className="grid grid-cols-3">
      {FRAMEWORKS.map((fw, i) => {
        const active = fw.id === selected.id
        const isLastCol = (i + 1) % cols === 0
        const isLastRow = i >= lastRowStart
        return (
          <div
            key={fw.id}
            className={cn(
              'flex flex-col items-center justify-center gap-1 border-foreground/[0.06] py-3',
              !isLastCol && 'border-r',
              !isLastRow && 'border-b',
              active
                ? 'bg-foreground/[0.07]'
                : 'bg-transparent',
              !fw.available && 'cursor-default',
            )}
          >
            <span
              className={cn(
                'font-mono text-[11px] font-semibold tracking-tight',
                active
                  ? 'text-foreground'
                  : fw.available
                    ? 'text-foreground/60'
                    : 'text-foreground/25',
              )}
            >
              {fw.name}
            </span>
            {!fw.available && (
              <span className="font-mono text-[7px] font-semibold uppercase tracking-[0.12em] text-foreground/15">
                coming soon
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Compact inline selector for mobile header */
export function FrameworkPill({
  selected,
}: {
  selected: AgentFramework
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[9px] font-medium tracking-tight text-foreground/60">
        {selected.name}
      </span>
      {FRAMEWORKS.some((fw) => !fw.available) && (
        <span className="font-mono text-[7px] text-foreground/15">
          +{FRAMEWORKS.filter((fw) => !fw.available).length} soon
        </span>
      )}
    </div>
  )
}
