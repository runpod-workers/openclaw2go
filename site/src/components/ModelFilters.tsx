import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '../lib/utils'
import { OsPills } from './PlatformSelector'
import type { OsPlatform } from '../lib/catalog'

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
  { label: '32k', value: 32_000 },
  { label: '100k', value: 100_000 },
  { label: '250k', value: 250_000 },
  { label: '500k', value: 500_000 },
  { label: '1m', value: 1_000_000 },
]

const TASK_LABELS: Record<TaskChip, string> = {
  llm: 'llm',
  vision: 'vis',
  image: 'img',
  audio: 'aud',
}

const TASK_CHIPS: TaskChip[] = ['llm', 'vision', 'image', 'audio']

/** Context tiers only make sense when LLM models are visible */
function showContextTiers(task: TaskChip | null): boolean {
  return task === null || task === 'llm' || task === 'vision'
}

const pillBase = 'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition-all duration-150'
const pillActive = 'bg-foreground/[0.07] text-foreground'
const pillInactive = 'text-foreground/50 hover:bg-foreground/[0.03] hover:text-foreground/70'

function ContextPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const activeLabel = CONTEXT_TIERS.find((t) => t.value === value)?.label

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className={cn(pillBase, value !== null ? pillActive : pillInactive)}>
          ctx{activeLabel ? ` ${activeLabel}` : ''}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 flex gap-0.5 rounded border border-foreground/[0.08] bg-background p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          {CONTEXT_TIERS.map((tier) => (
            <button
              key={tier.value}
              onClick={() => {
                onChange(value === tier.value ? null : tier.value)
                setOpen(false)
              }}
              className={cn(
                pillBase,
                value === tier.value ? pillActive : pillInactive,
              )}
            >
              {tier.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export default function ModelFilters({
  filters,
  onChange,
  os,
  onOsChange,
}: {
  filters: FilterState
  onChange: (filters: FilterState) => void
  os: OsPlatform | null
  onOsChange: (os: OsPlatform) => void
}) {
  const handleTaskClick = (chip: TaskChip) => {
    const nextTask = filters.task === chip ? null : chip
    const nextContext = showContextTiers(nextTask) ? filters.contextMin : null
    onChange({ task: nextTask, contextMin: nextContext })
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-foreground/[0.06] px-3 py-1.5">
      <OsPills os={os} onChange={onOsChange} />

      <div className="h-3.5 w-px shrink-0 bg-foreground/[0.08]" />

      {TASK_CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => handleTaskClick(chip)}
          className={cn(pillBase, filters.task === chip ? pillActive : pillInactive)}
          title={chip}
        >
          {TASK_LABELS[chip]}
        </button>
      ))}

      {showContextTiers(filters.task) && (
        <>
          <div className="h-3.5 w-px shrink-0 bg-foreground/[0.08]" />
          <ContextPicker
            value={filters.contextMin}
            onChange={(contextMin) => onChange({ ...filters, contextMin })}
          />
        </>
      )}

    </div>
  )
}
