import { useMemo, useCallback, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Search, SlidersHorizontal } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '../lib/utils'
import CollapsibleSection from './CollapsibleSection'
import ModelFilters from './ModelFilters'
import CatalogEntryCard from './ModelPicker'
import SectionHeader from './SectionHeader'
import FrameworkSelector from './FrameworkSelector'
import type { CatalogModel, Platform } from '../lib/catalog'
import type { AgentFramework } from '../lib/frameworks'
import { EMPTY_FILTERS, type FilterState, type TaskChip } from '../lib/model-filters'
import { familyEntryHasOs, getFamilyEntrySummary, type FamilyEntry } from '../lib/group-models'
import { resolveVariantForPlatformEngine, getPreferredEngine } from '../lib/engine-resolver'

type SortColumn = 'name' | 'ctx' | 'tps' | 'memory'
type SortDirection = 'asc' | 'desc'
interface SortState { column: SortColumn; direction: SortDirection }

const SECTION_COLORS: Record<string, string> = {
  llm: '#00e5ff',
  image: '#ec407a',
  audio: '#b388ff',
}

type SectionKey = 'llm' | 'image' | 'audio'

/** Which section keys are visible for a given task chip */
function getVisibleTypes(task: TaskChip | null): Set<SectionKey> {
  switch (task) {
    case null:      return new Set(['llm', 'image', 'audio'])
    case 'llm':     return new Set(['llm'])
    case 'vision':  return new Set(['llm'])
    case 'image':   return new Set(['image'])
    case 'audio':   return new Set(['audio'])
  }
}

function SortableColumnHeader({
  column,
  label,
  sort,
  onToggle,
  className,
}: {
  column: SortColumn
  label: string
  sort: SortState
  onToggle: (col: SortColumn) => void
  className?: string
}) {
  const isDefault = sort.column === 'name' && sort.direction === 'asc'
  const active = sort.column === column && !isDefault
  const Icon = sort.direction === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={`flex shrink-0 items-center gap-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] transition-colors ${
        active ? 'text-foreground/90' : 'text-foreground/60 hover:text-foreground/80'
      } ${className ?? ''}`}
    >
      {label}
      {active && <Icon size={10} strokeWidth={2.5} />}
    </button>
  )
}

export default function ModelCatalog({
  familyEntries,
  platform,
  onPlatformChange,
  selectedModelIds,
  selectedModels,
  onToggleModel,
  remainingVramMb,
  effectiveVramMb,
  onClearAll,
  hasSelections,
  framework,
  onFrameworkSelect,
}: {
  familyEntries: FamilyEntry[]
  platform: Platform | null
  onPlatformChange: (platform: Platform | null) => void
  selectedModelIds: Set<string>
  selectedModels: CatalogModel[]
  onToggleModel: (model: CatalogModel) => void
  remainingVramMb: number
  effectiveVramMb: number
  onClearAll: () => void
  hasSelections: boolean
  framework: AgentFramework
  onFrameworkSelect: (fw: AgentFramework) => void
}) {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' })

  const toggleSort = useCallback((col: SortColumn) => {
    setSort((prev) => {
      if (prev.column === col) return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { column: col, direction: col === 'name' ? 'asc' : 'desc' }
    })
  }, [])

  const searchLower = search.toLowerCase().trim()

  const visibleTypes = useMemo(() => getVisibleTypes(filters.task), [filters.task])

  /** Pre-compute summaries for all family entries */
  const summaryMap = useMemo(() => {
    const map = new Map<string, { maxTps?: number; minVramMb: number }>()
    for (const fe of familyEntries) {
      map.set(fe.family, getFamilyEntrySummary(fe, platform))
    }
    return map
  }, [familyEntries, platform])

  /** Sort filtered entries by the active column/direction */
  const sortEntries = useCallback(
    (filtered: FamilyEntry[]): FamilyEntry[] => {
      if (sort.column === 'name') {
        const dir = sort.direction === 'asc' ? 1 : -1
        return [...filtered].sort((a, b) =>
          dir * a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
        )
      }
      const dir = sort.direction === 'asc' ? 1 : -1
      return [...filtered].sort((a, b) => {
        const sa = summaryMap.get(a.family)
        const sb = summaryMap.get(b.family)
        let va: number | undefined
        let vb: number | undefined
        if (sort.column === 'ctx') {
          va = a.maxContextLength
          vb = b.maxContextLength
        } else if (sort.column === 'tps') {
          va = sa?.maxTps
          vb = sb?.maxTps
        } else {
          va = sa?.minVramMb && sa.minVramMb > 0 ? sa.minVramMb : undefined
          vb = sb?.minVramMb && sb.minVramMb > 0 ? sb.minVramMb : undefined
        }
        // Entries without values sort to the bottom regardless of direction
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        return dir * (va - vb)
      })
    },
    [sort, summaryMap]
  )

  /** Check if any model in a family entry is currently selected */
  const isFamilySelected = useCallback(
    (fe: FamilyEntry) =>
      fe.entries.some((entry) =>
        entry.groups.some((g) => g.variants.some((v) => selectedModelIds.has(v.model.id)))
      ),
    [selectedModelIds]
  )

  const filterEntries = useCallback(
    (allFamilies: FamilyEntry[], type: SectionKey): FamilyEntry[] => {
      if (!visibleTypes.has(type)) return []
      let result = allFamilies.filter((fe) => fe.type === type && familyEntryHasOs(fe, platform))
      if (searchLower) {
        result = result.filter(
          (fe) =>
            fe.displayName.toLowerCase().includes(searchLower) ||
            fe.entries.some((entry) =>
              entry.displayName.toLowerCase().includes(searchLower) ||
              entry.groups.some((g) =>
                g.variants.some((v) => v.repo.toLowerCase().includes(searchLower))
              )
            )
        )
      }
      // Engine filter — keep family if any variant matches an active engine
      if (filters.engines) {
        const activeEngines = new Set(filters.engines)
        result = result.filter((fe) =>
          fe.entries.some((entry) =>
            entry.groups.some((g) =>
              g.variants.some((v) => activeEngines.has(v.model.engineCategory))
            )
          )
        )
      }
      // Apply LLM-specific filters
      if (type === 'llm') {
        if (filters.contextMin !== null) {
          result = result.filter((fe) => fe.maxContextLength != null && fe.maxContextLength >= filters.contextMin!)
        }
        if (filters.task === 'vision') {
          result = result.filter((fe) => fe.hasVision)
        }
      }
      return result
    },
    [searchLower, filters, visibleTypes, platform]
  )

  const modelSections = useMemo(
    () =>
      [
        { key: "llm" as SectionKey, label: "LLM", items: sortEntries(filterEntries(familyEntries, 'llm')), color: SECTION_COLORS.llm },
        { key: "image" as SectionKey, label: "Image", items: sortEntries(filterEntries(familyEntries, 'image')), color: SECTION_COLORS.image },
        { key: "audio" as SectionKey, label: "Audio", items: sortEntries(filterEntries(familyEntries, 'audio')), color: SECTION_COLORS.audio },
      ].filter((s) => s.items.length > 0),
    [filterEntries, sortEntries, familyEntries]
  )

  /** Click a family row → resolve to best variant for current OS and default quant, then toggle */
  const handleFamilyToggle = useCallback(
    (fe: FamilyEntry) => {
      // Check if any variant of any entry in this family is currently selected
      for (const entry of fe.entries) {
        for (const group of entry.groups) {
          const selectedVariant = group.variants.find((v) =>
            selectedModelIds.has(v.model.id)
          )
          if (selectedVariant) {
            // Deselect
            onToggleModel(selectedVariant.model)
            return
          }
        }
      }

      // Use central resolver: pick best variant based on platform + engine filter
      const preferredEngine = filters.engines?.length === 1
        ? filters.engines[0]
        : getPreferredEngine(platform)
      const resolved = resolveVariantForPlatformEngine(fe, platform, preferredEngine)
      if (!resolved) return
      onToggleModel(resolved)
    },
    [platform, selectedModelIds, onToggleModel, filters.engines]
  )

  const hasActiveFilters = hasSelections || filters.task !== null || filters.contextMin !== null || filters.engines !== null || search !== "" || sort.column !== 'name' || sort.direction !== 'asc'

  const handleReset = useCallback(() => {
    setSearch("")
    setFilters(EMPTY_FILTERS)
    setSort({ column: 'name', direction: 'asc' })
    onClearAll()
  }, [onClearAll])

  const modelsBadge = selectedModels.length > 0 ? (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 font-mono text-[10px] font-bold text-primary">
      {selectedModels.length}
    </span>
  ) : undefined

  return (
    <div className="flex w-full lg:w-[480px] shrink-0 flex-col overflow-visible lg:overflow-hidden border-r-0 lg:border-r border-foreground/[0.06]" style={{ '--catalog-width': '480px' } as React.CSSProperties}>
      {/* Agent */}
      <div className="border-b border-foreground/[0.06]">
        <SectionHeader>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            Agent
          </span>
        </SectionHeader>
        <FrameworkSelector selected={framework} onSelect={onFrameworkSelect} />
      </div>

      <CollapsibleSection title="Models" badge={modelsBadge} className="lg:flex-1 lg:min-h-0 flex flex-col">
        <SectionHeader className="hidden lg:flex">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            Models
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {hasActiveFilters && (
              <button
                onClick={handleReset}
                className="shrink-0 font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/40 transition-colors hover:text-foreground/70"
              >
                reset
              </button>
            )}

            {/* Search popover */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded transition-colors",
                    search
                      ? "bg-foreground/[0.12] text-foreground"
                      : "text-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground/60"
                  )}
                  title="Search models"
                >
                  <Search size={13} />
                </button>
              </Popover.Trigger>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={4}
                className="z-50 w-[var(--catalog-width,480px)] rounded border border-foreground/[0.08] bg-background shadow-lg animate-in fade-in-0 zoom-in-95"
                style={{ maxWidth: 'var(--catalog-width, 480px)' }}
              >
                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/40" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="search models..."
                    autoFocus
                    className="w-full rounded bg-transparent py-2 pl-8 pr-3 font-mono text-[11px] text-foreground placeholder:text-foreground/30 focus:outline-none"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-foreground/40 hover:text-foreground/70"
                    >
                      clear
                    </button>
                  )}
                </div>
              </Popover.Content>
            </Popover.Root>

            {/* Filter popover */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded transition-colors",
                    (platform !== null || filters.task !== null || filters.engines !== null || filters.contextMin !== null)
                      ? "bg-foreground/[0.12] text-foreground"
                      : "text-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground/60"
                  )}
                  title="Filter models"
                >
                  <SlidersHorizontal size={13} />
                </button>
              </Popover.Trigger>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={4}
                className="z-50 w-[var(--catalog-width,480px)] rounded border border-foreground/[0.08] bg-background shadow-lg animate-in fade-in-0 zoom-in-95"
                style={{ maxWidth: 'var(--catalog-width, 480px)' }}
              >
                <ModelFilters filters={filters} onChange={setFilters} platform={platform} onPlatformChange={onPlatformChange} />
              </Popover.Content>
            </Popover.Root>
          </div>
        </SectionHeader>

        {/* column headers */}
        <div className="flex shrink-0 items-center gap-2 border-b border-foreground/[0.04] px-3 py-1.5">
          <SortableColumnHeader column="name" label="Model" sort={sort} onToggle={toggleSort} className="flex-1 justify-start" />
          <SortableColumnHeader column="ctx" label="Ctx" sort={sort} onToggle={toggleSort} className="w-[36px] justify-end" />
          <SortableColumnHeader column="tps" label="TPS" sort={sort} onToggle={toggleSort} className="w-[36px] justify-end" />
          <SortableColumnHeader column="memory" label="Memory" sort={sort} onToggle={toggleSort} className="w-[52px] justify-end" />
        </div>

        {/* model list — scrollable on desktop, full-height on mobile */}
        <div className="overflow-y-scroll py-1 max-h-[50vh] lg:max-h-none lg:flex-1" data-model-list>
          {modelSections.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="font-mono text-[10px] text-foreground/30">
                {search || filters.task || filters.contextMin || filters.engines
                  ? 'no models match'
                  : platform ? `no models for ${platform} yet` : 'no models available'}
              </span>
            </div>
          )}
          {modelSections.map((section) => (
            <div key={section.key} className="flex flex-col">
              <div className="sticky top-0 z-10 bg-background/90 px-5 py-1.5 backdrop-blur-sm">
                <span
                  className="font-mono text-[8px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: section.color }}
                >
                  {section.label}
                </span>
              </div>
              {section.items.map((fe) => {
                const selected = isFamilySelected(fe)
                const summary = summaryMap.get(fe.family) ?? { minVramMb: 0 }
                const wouldExceed =
                  effectiveVramMb > 0 &&
                  !selected &&
                  summary.minVramMb > remainingVramMb
                return (
                  <CatalogEntryCard
                    key={fe.family}
                    familyEntry={fe}
                    selected={selected}
                    onToggle={() => handleFamilyToggle(fe)}
                    wouldExceed={wouldExceed}
                    os={platform}
                    accentColor={section.color}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}
