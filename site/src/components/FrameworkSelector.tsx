import { cn } from '../lib/utils'
import type { AgentFramework } from '../lib/frameworks'
import { FRAMEWORKS, SUGGEST_AGENT_URL } from '../lib/frameworks'

export default function FrameworkSelector({
  selected,
  onSelect,
}: {
  selected: AgentFramework
  onSelect?: (fw: AgentFramework) => void
}) {
  const cols = 3
  const totalCells = FRAMEWORKS.length + 1 // frameworks + CTA
  const lastRowStart = Math.floor((totalCells - 1) / cols) * cols

  return (
    <div className="grid grid-cols-3">
      {FRAMEWORKS.map((fw, i) => {
        const active = fw.id === selected.id
        const isLastCol = (i + 1) % cols === 0
        const isLastRow = i >= lastRowStart
        return (
          <div
            key={fw.id}
            onClick={() => fw.available && onSelect?.(fw)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 border-foreground/[0.06] py-3',
              !isLastCol && 'border-r',
              !isLastRow && 'border-b',
              active
                ? 'bg-foreground/[0.07]'
                : 'bg-transparent',
              fw.available && !active
                ? 'cursor-pointer hover:bg-foreground/[0.04]'
                : !fw.available && 'cursor-default',
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
          </div>
        )
      })}

      {/* CTA: suggest an agent */}
      <a
        href={SUGGEST_AGENT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center py-3"
      >
        <svg className="w-3.5 h-3.5 text-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </a>
    </div>
  )
}

/** Compact inline selector for mobile header */
export function FrameworkPill({
  selected,
  onSelect,
}: {
  selected: AgentFramework
  onSelect?: (fw: AgentFramework) => void
}) {
  const availableFrameworks = FRAMEWORKS.filter((fw) => fw.available)

  return (
    <div className="flex items-center gap-1">
      {availableFrameworks.map((fw) => (
        <button
          key={fw.id}
          onClick={() => onSelect?.(fw)}
          className={cn(
            'font-mono text-[9px] font-medium tracking-tight px-1.5 py-0.5 transition-colors',
            fw.id === selected.id
              ? 'text-foreground/80 bg-foreground/[0.08]'
              : 'text-foreground/30 hover:text-foreground/50',
          )}
        >
          {fw.name}
        </button>
      ))}
      <a
        href={SUGGEST_AGENT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[9px] font-medium tracking-tight px-1.5 py-0.5 text-foreground/30 transition-colors hover:text-foreground/50"
      >
        +?
      </a>
    </div>
  )
}
