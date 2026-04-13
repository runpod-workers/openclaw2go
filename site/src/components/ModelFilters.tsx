import { useState, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '../lib/utils'
import { PLATFORMS, ENGINES, ENGINE_META, type Engine, type Platform } from '../lib/catalog'
import type { FilterState, TaskChip } from '../lib/model-filters'
import { PlatformIcon } from './PlatformSelector'

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

const PLATFORM_LABELS: Record<Platform, string> = {
  mac: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
}

function showContextTiers(task: TaskChip | null): boolean {
  return task === null || task === 'llm' || task === 'vision'
}

const pillBase = 'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition-all duration-150 cursor-pointer'
const pillActive = 'bg-foreground/[0.12] text-foreground'
const pillDefault = 'text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground/90'

/** Labeled group with a border and the label sitting on the top edge */
function FilterGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative border border-foreground/[0.08] rounded px-1.5 pt-2.5 pb-1", className)}>
      <span className="absolute -top-1.5 left-1.5 bg-background px-1 font-mono text-[7px] uppercase tracking-[0.15em] text-foreground/30">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-0.5">
        {children}
      </div>
    </div>
  )
}

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
        <button className={cn(pillBase, value !== null ? pillActive : pillDefault)}>
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
                value === tier.value ? pillActive : pillDefault,
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
  platform,
  onPlatformChange,
}: {
  filters: FilterState
  onChange: (filters: FilterState) => void
  platform: Platform | null
  onPlatformChange: (platform: Platform | null) => void
}) {
  const handleTaskClick = (chip: TaskChip) => {
    const nextTask = filters.task === chip ? null : chip
    const nextContext = showContextTiers(nextTask) ? filters.contextMin : null
    onChange({ ...filters, task: nextTask, contextMin: nextContext })
  }

  const handlePlatformClick = (p: Platform) => {
    onPlatformChange(platform === p ? null : p)
  }

  const handleEngineClick = (engine: Engine) => {
    const current = filters.engines
    if (!current) {
      onChange({ ...filters, engines: [engine] })
    } else if (current.includes(engine)) {
      const next = current.filter((e) => e !== engine)
      onChange({ ...filters, engines: next.length === 0 ? null : next })
    } else {
      onChange({ ...filters, engines: [...current, engine] })
    }
  }

  const visibleEngines = ENGINES.filter((e) =>
    !platform || ENGINE_META[e].os.includes(platform)
  )

  return (
    <div className="flex shrink-0 flex-wrap items-start gap-1.5 border-b border-foreground/[0.06] px-3 py-2">
      <FilterGroup label="platform">
        {PLATFORMS.map((p) => {
          const isExplicit = platform === p
          return (
            <button
              key={p}
              onClick={() => handlePlatformClick(p)}
              className={cn(
                pillBase,
                "inline-flex items-center gap-1",
                isExplicit ? pillActive : pillDefault,
              )}
              title={PLATFORM_LABELS[p]}
            >
              <PlatformIcon os={p} className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{PLATFORM_LABELS[p]}</span>
            </button>
          )
        })}
      </FilterGroup>

      <FilterGroup label="engine">
        {visibleEngines.map((engine) => {
          const isExplicit = filters.engines !== null && filters.engines.includes(engine)
          return (
            <button
              key={engine}
              onClick={() => handleEngineClick(engine)}
              className={cn(pillBase, isExplicit ? pillActive : pillDefault)}
              title={ENGINE_META[engine].description}
            >
              {ENGINE_META[engine].label}
            </button>
          )
        })}
      </FilterGroup>

      <FilterGroup label="type">
        {TASK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleTaskClick(chip)}
            className={cn(pillBase, filters.task === chip ? pillActive : pillDefault)}
            title={chip}
          >
            {TASK_LABELS[chip]}
          </button>
        ))}
        {showContextTiers(filters.task) && (
          <ContextPicker
            value={filters.contextMin}
            onChange={(contextMin) => onChange({ ...filters, contextMin })}
          />
        )}
      </FilterGroup>
    </div>
  )
}
