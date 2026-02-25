import { useMemo, useCallback, useState } from 'react'
import SectionHeader from './SectionHeader'
import PlatformSelector from './PlatformSelector'
import ModelSearch from './ModelSearch'
import ModelFilters, { type FilterState, type TaskChip, EMPTY_FILTERS } from './ModelFilters'
import ModelGroupCard from './ModelPicker'
import type { CatalogModel, OsPlatform } from '../lib/catalog'
import { groupModels, getVariantForOs, groupHasOs } from '../lib/group-models'

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

export default function ModelCatalog({
  models,
  os,
  onOsChange,
  selectedModelIds,
  selectedModels,
  onToggleModel,
  remainingVramMb,
  effectiveVramMb,
}: {
  models: CatalogModel[]
  os: OsPlatform | null
  onOsChange: (os: OsPlatform) => void
  selectedModelIds: Set<string>
  selectedModels: CatalogModel[]
  onToggleModel: (model: CatalogModel) => void
  remainingVramMb: number
  effectiveVramMb: number
}) {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  const searchLower = search.toLowerCase().trim()

  const lockedTypes = useMemo(() => {
    const types = new Set<string>()
    for (const m of selectedModels) types.add(m.type)
    return types
  }, [selectedModels])

  const llmModels = useMemo(() => models.filter((m) => m.type === "llm"), [models])
  const imageModels = useMemo(() => models.filter((m) => m.type === "image"), [models])
  const audioModels = useMemo(() => models.filter((m) => m.type === "audio"), [models])

  const llmGroups = useMemo(() => groupModels(llmModels), [llmModels])
  const imageGroups = useMemo(() => groupModels(imageModels), [imageModels])
  const audioGroups = useMemo(() => groupModels(audioModels), [audioModels])

  const visibleTypes = useMemo(() => getVisibleTypes(filters.task), [filters.task])

  const filterGroups = useCallback(
    (groups: ReturnType<typeof groupModels>, type: SectionKey) => {
      if (!visibleTypes.has(type)) return []
      let result = groups
      if (searchLower) {
        result = result.filter(
          (g) =>
            g.displayName.toLowerCase().includes(searchLower) ||
            g.variants.some((v) => v.repo.toLowerCase().includes(searchLower))
        )
      }
      // Default to Linux when no OS selected — Mac-only groups only show on macOS tab
      result = result.filter((g) => groupHasOs(g, os ?? 'linux'))
      // Apply LLM-specific filters
      if (type === 'llm') {
        if (filters.contextMin !== null) {
          result = result.filter((g) => g.contextLength != null && g.contextLength >= filters.contextMin!)
        }
        if (filters.task === 'vision') {
          result = result.filter((g) => g.hasVision)
        }
      }
      return result
    },
    [searchLower, os, filters, visibleTypes]
  )

  const modelSections = useMemo(
    () =>
      [
        { key: "llm" as SectionKey, label: "LLM", items: filterGroups(llmGroups, 'llm'), color: SECTION_COLORS.llm },
        { key: "image" as SectionKey, label: "Image", items: filterGroups(imageGroups, 'image'), color: SECTION_COLORS.image },
        { key: "audio" as SectionKey, label: "Audio", items: filterGroups(audioGroups, 'audio'), color: SECTION_COLORS.audio },
      ].filter((s) => s.items.length > 0),
    [filterGroups, llmGroups, imageGroups, audioGroups]
  )

  /** Click a group → resolve to best variant for current OS, then toggle */
  const handleGroupToggle = useCallback(
    (group: ReturnType<typeof groupModels>[number]) => {
      // Check if any variant of this group is currently selected
      const selectedVariant = group.variants.find((v) =>
        selectedModelIds.has(v.model.id)
      )
      if (selectedVariant) {
        // Deselect
        onToggleModel(selectedVariant.model)
      } else {
        // Select the best variant for the current OS
        const variant = getVariantForOs(group, os)
        onToggleModel(variant.model)
      }
    },
    [os, selectedModelIds, onToggleModel]
  )

  return (
    <div className="flex w-[480px] shrink-0 flex-col overflow-hidden border-r border-foreground/[0.06]">
      <SectionHeader>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
          Operating System
        </span>
      </SectionHeader>

      <PlatformSelector os={os} onChange={onOsChange} />

      <SectionHeader>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
          Models
        </span>
      </SectionHeader>

      <ModelSearch value={search} onChange={setSearch} />
      <ModelFilters filters={filters} onChange={setFilters} />

      {/* column headers */}
      <div className="flex shrink-0 items-center gap-2 border-b border-foreground/[0.04] px-3 py-2">
        <span className="flex-1 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Model
        </span>
        <span className="shrink-0 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Quant
        </span>
        <span className="w-[36px] shrink-0 text-right font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Ctx
        </span>
        <span className="w-[30px] shrink-0 text-right font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/60">
          TPS
        </span>
        <span className="w-[48px] shrink-0 text-right font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Memory
        </span>
      </div>

      {/* scrollable model list */}
      <div className="flex-1 overflow-y-auto py-1" data-model-list>
        {modelSections.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-[10px] text-foreground/30">no models match</span>
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
            {section.items.map((group) => {
              const isSelected = group.variants.some((v) =>
                selectedModelIds.has(v.model.id)
              )
              const variant = getVariantForOs(group, os)
              const wouldExceed =
                effectiveVramMb > 0 &&
                !isSelected &&
                variant.vramTotal > remainingVramMb
              const dimmed = !isSelected && lockedTypes.has(group.type)

              return (
                <ModelGroupCard
                  key={group.key}
                  group={group}
                  selected={isSelected}
                  onToggle={() => handleGroupToggle(group)}
                  wouldExceed={wouldExceed}
                  dimmed={dimmed}
                  os={os}
                  accentColor={section.color}
                  hasVision={group.hasVision}
                  capabilities={group.capabilities}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
