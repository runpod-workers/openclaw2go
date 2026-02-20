import { cn } from '../lib/utils'

export type TaskChip = 'llm' | 'vision' | 'image' | 'audio'

export interface FilterState {
  contextMin: number | null
  task: TaskChip | null
}

export const EMPTY_FILTERS: FilterState = {
  contextMin: null,
  task: null,
}

export const CONTEXT_TIERS = [
  { label: '32k+', value: 32_000 },
  { label: '100k+', value: 100_000 },
  { label: '200k+', value: 200_000 },
  { label: '1m+', value: 1_000_000 },
]

const TASK_CHIPS: TaskChip[] = ['llm', 'vision', 'image', 'audio']

/** Context tiers only make sense when LLM models are visible */
function showContextTiers(task: TaskChip | null): boolean {
  return task === null || task === 'llm' || task === 'vision'
}

function isFiltersEmpty(f: FilterState): boolean {
  return f.contextMin === null && f.task === null
}

export default function ModelFilters({
  filters,
  onChange,
}: {
  filters: FilterState
  onChange: (filters: FilterState) => void
}) {
  const handleTaskClick = (chip: TaskChip) => {
    const nextTask = filters.task === chip ? null : chip
    // Auto-clear context when switching to a non-LLM task
    const nextContext = showContextTiers(nextTask) ? filters.contextMin : null
    onChange({ task: nextTask, contextMin: nextContext })
  }

  return (
    <div className="flex shrink-0 flex-col border-b border-foreground/[0.06]">
      {/* task row */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          onClick={() => { if (!isFiltersEmpty(filters)) onChange(EMPTY_FILTERS) }}
          className={cn(
            'font-mono text-[8px] font-semibold uppercase tracking-[0.15em] transition-colors',
            isFiltersEmpty(filters)
              ? 'text-foreground/30'
              : 'text-foreground/50 hover:text-foreground/80 cursor-pointer'
          )}
        >
          task
        </button>
        {TASK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleTaskClick(chip)}
            className={cn(
              'flex-1 rounded px-2 py-0.5 font-mono text-[9px] font-medium transition-all duration-150',
              filters.task === chip
                ? 'bg-foreground/[0.07] text-foreground'
                : 'text-foreground/50 hover:bg-foreground/[0.03] hover:text-foreground/70'
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* context row — only when LLM models are visible */}
      {showContextTiers(filters.task) && (
        <div className="flex items-center gap-1.5 border-t border-foreground/[0.04] px-3 py-2">
          <button
            onClick={() => { if (filters.contextMin !== null) onChange({ ...filters, contextMin: null }) }}
            className={cn(
              'font-mono text-[8px] font-semibold uppercase tracking-[0.15em] transition-colors',
              filters.contextMin === null
                ? 'text-foreground/30'
                : 'text-foreground/50 hover:text-foreground/80 cursor-pointer'
            )}
          >
            ctx
          </button>
          {CONTEXT_TIERS.map((tier) => (
            <button
              key={tier.value}
              onClick={() =>
                onChange({
                  ...filters,
                  contextMin: filters.contextMin === tier.value ? null : tier.value,
                })
              }
              className={cn(
                'flex-1 rounded px-2 py-0.5 font-mono text-[9px] font-medium transition-all duration-150',
                filters.contextMin === tier.value
                  ? 'bg-foreground/[0.07] text-foreground'
                  : 'text-foreground/50 hover:bg-foreground/[0.03] hover:text-foreground/70'
              )}
            >
              {tier.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
