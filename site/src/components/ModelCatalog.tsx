import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import CollapsibleSection from './CollapsibleSection'
import ModelSearch from './ModelSearch'
import ModelFilters, { type FilterState, type TaskChip, EMPTY_FILTERS } from './ModelFilters'
import CatalogEntryCard from './ModelPicker'
import SectionHeader from './SectionHeader'
import FrameworkSelector from './FrameworkSelector'
import DeviceSelector from './VramLegend'
import type { CatalogModel, DeviceInfo, DeviceCount, OsPlatform } from '../lib/catalog'
import type { AgentFramework } from '../lib/frameworks'
import { getFamilyEntrySummary, getVariantForOs, type FamilyEntry } from '../lib/group-models'

// ---------------------------------------------------------------------------
// GPU detection via WebGL
// ---------------------------------------------------------------------------

type DetectedBrand = 'nvidia' | 'apple'

interface GpuDetection {
  renderer: string
  brand: DetectedBrand | null
  chipHint: string | null
}

function detectGpuFromWebGL(): GpuDetection | null {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl || !(gl instanceof WebGLRenderingContext)) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return null
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string
    canvas.remove()
    if (!renderer) return null

    const lower = renderer.toLowerCase()
    if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('quadro') || lower.includes('tesla')) {
      return { renderer, brand: 'nvidia', chipHint: renderer.replace(/\/.*$/, '').trim() }
    }
    if (lower.includes('apple')) {
      const m = renderer.match(/Apple\s+(M\d+(?:\s+(?:Pro|Max|Ultra))?)/i)
      return { renderer, brand: 'apple', chipHint: m ? m[1] : null }
    }
    if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? '')) {
      return { renderer, brand: 'apple', chipHint: null }
    }
    return { renderer, brand: null, chipHint: null }
  } catch {
    return null
  }
}

function matchDevice(detection: GpuDetection, devices: DeviceInfo[]): DeviceInfo | null {
  if (!detection.brand) return null
  const pool = detection.brand === 'nvidia'
    ? devices.filter((d) => !d.os.includes('mac'))
    : devices.filter((d) => d.os.includes('mac'))

  if (detection.brand === 'nvidia') {
    const lower = detection.renderer.toLowerCase()
    for (const d of pool) { if (lower.includes(d.name)) return d }
  } else if (detection.brand === 'apple' && detection.chipHint) {
    const chip = detection.chipHint.toLowerCase()
    const hits = pool.filter((d) => d.name.includes(chip))
    if (hits.length === 1) return hits[0]
  }
  return null
}

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
  os,
  onOsChange,
  selectedModelIds,
  selectedModels,
  onToggleModel,
  remainingVramMb,
  effectiveVramMb,
  onClearModels,
  framework,
  onFrameworkSelect,
  devices,
  selectedDevice,
  onDeviceSelect,
  deviceCount,
  onDeviceCountChange,
  totalVramMb,
}: {
  familyEntries: FamilyEntry[]
  os: OsPlatform | null
  onOsChange: (os: OsPlatform) => void
  selectedModelIds: Set<string>
  selectedModels: CatalogModel[]
  onToggleModel: (model: CatalogModel) => void
  remainingVramMb: number
  effectiveVramMb: number
  onClearModels: () => void
  framework: AgentFramework
  onFrameworkSelect: (fw: AgentFramework) => void
  devices: DeviceInfo[]
  selectedDevice: DeviceInfo | null
  onDeviceSelect: (device: DeviceInfo) => void
  deviceCount: DeviceCount
  onDeviceCountChange: (count: DeviceCount) => void
  totalVramMb: number
}) {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' })

  // GPU detection — runs once on mount, button allows re-apply
  const autoDetectRan = useRef(false)
  const [detection, setDetection] = useState<GpuDetection | null>(null)

  useEffect(() => {
    const result = detectGpuFromWebGL()
    if (result) setDetection(result)
  }, [])

  // Auto-apply on mount (once, only if no device already selected from URL)
  useEffect(() => {
    if (autoDetectRan.current || !detection || selectedDevice) return
    autoDetectRan.current = true
    if (detection.brand) {
      const matched = matchDevice(detection, devices)
      if (matched) onDeviceSelect(matched)
    }
  }, [detection, devices, selectedDevice, onDeviceSelect])

  const handleDetect = useCallback(() => {
    const result = detection ?? detectGpuFromWebGL()
    if (!result?.brand) return
    const matched = matchDevice(result, devices)
    if (matched && matched.id !== selectedDevice?.id) onDeviceSelect(matched)
  }, [detection, devices, selectedDevice, onDeviceSelect])

  const toggleSort = useCallback((col: SortColumn) => {
    setSort((prev) => {
      if (prev.column === col) return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { column: col, direction: col === 'name' ? 'asc' : 'desc' }
    })
  }, [])

  const searchLower = search.toLowerCase().trim()

  const lockedTypes = useMemo(() => {
    const types = new Set<string>()
    for (const m of selectedModels) types.add(m.type)
    return types
  }, [selectedModels])

  const visibleTypes = useMemo(() => getVisibleTypes(filters.task), [filters.task])

  /** Pre-compute summaries for all family entries */
  const summaryMap = useMemo(() => {
    const map = new Map<string, { maxTps?: number; minVramMb: number }>()
    for (const fe of familyEntries) {
      map.set(fe.family, getFamilyEntrySummary(fe, os))
    }
    return map
  }, [familyEntries, os])

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
      let result = allFamilies.filter((fe) => fe.type === type)
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
    [searchLower, filters, visibleTypes]
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

      // Select: pick the first (smallest) entry, prefer smallest quant for current OS
      const firstEntry = fe.entries[0]
      if (!firstEntry) return

      const sv = firstEntry.subVariants[0]
      if (!sv) return

      // First group with a variant for current OS (smallest bits first)
      let bestGroup = sv.groups.find((g) =>
        g.variants.some((v) => !os || v.os.includes(os))
      )
      // Fall back to first group
      if (!bestGroup) bestGroup = sv.groups[0]
      if (!bestGroup) return

      const variant = getVariantForOs(bestGroup, os)
      onToggleModel(variant.model)
    },
    [os, selectedModelIds, onToggleModel]
  )

  const hasActiveFilters = selectedModels.length > 0 || os !== null || filters.task !== null || filters.contextMin !== null || search !== "" || sort.column !== 'name' || sort.direction !== 'asc'

  const handleReset = useCallback(() => {
    setSearch("")
    setFilters(EMPTY_FILTERS)
    setSort({ column: 'name', direction: 'asc' })
    onClearModels()
  }, [onClearModels])

  const modelsBadge = selectedModels.length > 0 ? (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 font-mono text-[10px] font-bold text-primary">
      {selectedModels.length}
    </span>
  ) : undefined

  return (
    <div className="flex w-full lg:w-[480px] shrink-0 flex-col overflow-visible lg:overflow-hidden border-r-0 lg:border-r border-foreground/[0.06]">
      {/* Agent */}
      <div className="border-b border-foreground/[0.06]">
        <SectionHeader>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            Agent
          </span>
        </SectionHeader>
        <FrameworkSelector selected={framework} onSelect={onFrameworkSelect} />
      </div>

      {/* Hardware */}
      <div className="border-b border-foreground/[0.06]">
        <SectionHeader>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            Hardware
          </span>
          {detection?.brand && (
            <button
              onClick={handleDetect}
              className="ml-auto shrink-0 font-mono text-[9px] font-medium lowercase tracking-widest text-foreground/40 transition-colors hover:text-foreground/70"
            >
              detect
            </button>
          )}
        </SectionHeader>
        <div className="px-2 py-2">
          <DeviceSelector
            devices={devices}
            selectedDevice={selectedDevice}
            onSelect={onDeviceSelect}
            deviceCount={deviceCount}
            onDeviceCountChange={onDeviceCountChange}
            totalVramMb={totalVramMb}
          />
        </div>
      </div>

      <CollapsibleSection title="Models" badge={modelsBadge} className="lg:flex-1 lg:min-h-0 flex flex-col">
        <SectionHeader className="hidden lg:flex">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            Models
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="ml-auto shrink-0 font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/40 transition-colors hover:text-foreground/70"
            >
              reset
            </button>
          )}
        </SectionHeader>
        <ModelSearch value={search} onChange={setSearch} />
        <ModelFilters
          filters={filters}
          onChange={setFilters}
          os={os}
          onOsChange={onOsChange}
        />

        {/* column headers */}
        <div className="flex shrink-0 items-center gap-2 border-b border-foreground/[0.04] px-3 py-1.5">
          <SortableColumnHeader column="name" label="Model" sort={sort} onToggle={toggleSort} className="flex-1 justify-start" />
          <SortableColumnHeader column="ctx" label="Ctx" sort={sort} onToggle={toggleSort} className="w-[36px] justify-end" />
          <SortableColumnHeader column="tps" label="TPS" sort={sort} onToggle={toggleSort} className="w-[36px] justify-end" />
          <SortableColumnHeader column="memory" label="Memory" sort={sort} onToggle={toggleSort} className="w-[52px] justify-end" />
        </div>

        {/* model list — scrollable on desktop, full-height on mobile */}
        <div className="overflow-y-auto py-1 max-h-[50vh] lg:max-h-none lg:flex-1" data-model-list>
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
              {section.items.map((fe) => {
                const selected = isFamilySelected(fe)
                const summary = summaryMap.get(fe.family) ?? { minVramMb: 0 }
                const wouldExceed =
                  effectiveVramMb > 0 &&
                  !selected &&
                  summary.minVramMb > remainingVramMb
                const dimmed = !selected && lockedTypes.has(fe.type)

                return (
                  <CatalogEntryCard
                    key={fe.family}
                    familyEntry={fe}
                    selected={selected}
                    onToggle={() => handleFamilyToggle(fe)}
                    wouldExceed={wouldExceed}
                    dimmed={dimmed}
                    os={os}
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
