import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  fetchCatalog,
  getTotalVram,
  getGpusForOs,
  getMinGpuCount,
  type CatalogModel,
  type GpuInfo,
  type OsPlatform,
} from './lib/catalog'
import { groupModels, buildCatalogEntries, getVariantForOs, type ModelGroup, type CatalogEntry } from './lib/group-models'
import { parseUrlState, syncUrlState, clearUrlState, type ModelParam } from './lib/url-state'
import ModelCatalog from './components/ModelCatalog'
import ConfigPanel from './components/ConfigPanel'
import { DEFAULT_FRAMEWORK } from './lib/frameworks'
import { FrameworkPill } from './components/FrameworkSelector'

function App() {
  const [allModels, setAllModels] = useState<CatalogModel[]>([])
  const [allGpus, setAllGpus] = useState<GpuInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [os, setOs] = useState<OsPlatform | null>(null)
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
  const [selectedGpu, setSelectedGpu] = useState<GpuInfo | null>(null)
  const [selectedVramGb, setSelectedVramGb] = useState<number | null>(null)
  const [contextOverride, setContextOverride] = useState<number | null>(null)
  const framework = DEFAULT_FRAMEWORK

  // Track whether URL state has been hydrated to avoid syncing before load
  const hydrated = useRef(false)

  useEffect(() => {
    fetchCatalog()
      .then(({ models, gpus }) => {
        setAllModels(models)
        setAllGpus(gpus)

        // Hydrate state from URL after catalog is available
        const url = parseUrlState()
        if (url.os) setOs(url.os)

        const ids = new Set<string>()
        for (const type of ['llm', 'image', 'audio'] as const) {
          const param = url[type]
          if (param) {
            const match = models.find((m) =>
              m.repo.toLowerCase() === param.repo.toLowerCase() &&
              (param.bits == null || m.bits === param.bits)
            )
            if (match) ids.add(match.id)
          }
        }
        if (ids.size > 0) setSelectedModelIds(ids)

        if (url.gpu) {
          const match = gpus.find((g) => g.id === url.gpu)
          if (match) setSelectedGpu(match)
        }
        if (url.vram != null) setSelectedVramGb(url.vram)
        if (url.ctx != null) setContextOverride(url.ctx)

        hydrated.current = true
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const allGroups = useMemo(() => groupModels(allModels), [allModels])

  const allEntries = useMemo(() => buildCatalogEntries(allGroups), [allGroups])

  const modelIdToGroup = useMemo(() => {
    const map = new Map<string, ModelGroup>()
    for (const group of allGroups) {
      for (const v of group.variants) {
        map.set(v.model.id, group)
      }
    }
    return map
  }, [allGroups])

  const modelIdToEntry = useMemo(() => {
    const map = new Map<string, CatalogEntry>()
    for (const entry of allEntries)
      for (const group of entry.groups)
        for (const v of group.variants)
          map.set(v.model.id, entry)
    return map
  }, [allEntries])

  const filteredGpus = useMemo(() => getGpusForOs(os, allGpus), [os, allGpus])

  const selectedModels = useMemo(() => {
    const byId = new Map<string, CatalogModel[]>()
    for (const m of allModels) {
      if (!selectedModelIds.has(m.id)) continue
      const arr = byId.get(m.id) ?? []
      arr.push(m)
      byId.set(m.id, arr)
    }
    return Array.from(byId.values()).map((variants) => {
      if (variants.length === 1 || !os) return variants[0]
      return variants.find((v) => v.os.includes(os)) ?? variants[0]
    })
  }, [selectedModelIds, allModels, os])

  const totalVramMb = useMemo(() => getTotalVram(selectedModels, contextOverride), [selectedModels, contextOverride])

  // GPU count is fully derived — auto-calculated from selected GPU + total VRAM
  const gpuCount = selectedGpu ? getMinGpuCount(totalVramMb, selectedGpu) : 1

  // Sync state to URL whenever selections change (after initial hydration)
  useEffect(() => {
    if (!hydrated.current) return
    function toModelParam(m: CatalogModel | undefined): ModelParam | null {
      if (!m) return null
      return { repo: m.repo, bits: m.bits ?? null }
    }
    const llm = selectedModels.find((m) => m.type === 'llm')
    const image = selectedModels.find((m) => m.type === 'image')
    const audio = selectedModels.find((m) => m.type === 'audio')
    syncUrlState({
      os,
      llm: toModelParam(llm),
      image: toModelParam(image),
      audio: toModelParam(audio),
      gpu: selectedGpu?.id ?? null,
      vram: selectedVramGb,
      ctx: contextOverride,
      fw: null,
    })
  }, [os, selectedModels, selectedGpu, selectedVramGb, contextOverride])

  const toggleModel = useCallback(
    (model: CatalogModel) => {
      setSelectedModelIds((prev) => {
        const next = new Set(prev)
        if (next.has(model.id)) {
          next.delete(model.id)
        } else {
          const sameCategoryIds = allModels
            .filter((m) => m.type === model.type)
            .map((m) => m.id)
          for (const id of sameCategoryIds) {
            next.delete(id)
          }
          next.add(model.id)
        }
        return next
      })
      if (model.type === 'llm') setContextOverride(null)
    },
    [allModels]
  )

  const swapModelVariant = useCallback((oldModel: CatalogModel, newModel: CatalogModel) => {
    setSelectedModelIds(prev => {
      const next = new Set(prev)
      next.delete(oldModel.id)
      next.add(newModel.id)
      return next
    })
  }, [])

  const handleGpuSelect = useCallback((gpu: GpuInfo) => {
    setSelectedGpu((prev) => (prev?.id === gpu.id ? null : gpu))
    setSelectedVramGb(null)
  }, [])

  const handleVramPreset = useCallback((gb: number) => {
    setSelectedVramGb((prev) => (prev === gb ? null : gb))
    setSelectedGpu(null)
  }, [])

  const handleOsChange = useCallback((newOs: OsPlatform) => {
    const nextOs = os === newOs ? null : newOs
    setOs(nextOs)

    setSelectedModelIds((prevIds) => {
      if (prevIds.size === 0) return prevIds
      const next = new Set<string>()
      for (const id of prevIds) {
        const group = modelIdToGroup.get(id)
        if (group) {
          const variant = getVariantForOs(group, nextOs)
          next.add(variant.model.id)
        }
      }
      return next
    })

    setSelectedGpu(null)
    setSelectedVramGb(null)
  }, [os, modelIdToGroup])

  const handleClearAll = useCallback(() => {
    setSelectedModelIds(new Set())
    setOs(null)
    setSelectedGpu(null)
    setSelectedVramGb(null)
    setContextOverride(null)
    clearUrlState()
  }, [])

  const effectiveVramGb = selectedVramGb ?? (selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : 0)
  const effectiveVramMb = effectiveVramGb * 1024
  const remainingVramMb = effectiveVramMb > 0 ? effectiveVramMb - totalVramMb : 0

  const hasSelections = selectedModels.length > 0 || os !== null || selectedGpu !== null || selectedVramGb !== null

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="font-mono text-sm text-destructive tracking-wider mb-2">error</div>
          <p className="text-foreground/40 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="font-mono text-foreground/20 text-xs tracking-wider animate-pulse-subtle">loading registry</p>
        </div>
      </div>
    )
  }

  return (
    <div className="noise-bg flex min-h-screen lg:h-screen w-screen flex-col lg:flex-row lg:overflow-hidden bg-background">
      {/* Mobile header — logo + framework pill */}
      <div className="flex lg:hidden shrink-0 items-center justify-between border-b border-foreground/[0.06] px-4 py-2">
        <a
          href="https://github.com/runpod-labs/a2go"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <img
            src={`${import.meta.env.BASE_URL}a2go_logo_nobg.png`}
            alt="agent2go"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-mono text-[11px] font-bold tracking-tight text-foreground/70">
            agent2go
          </span>
        </a>
        <FrameworkPill selected={framework} />
      </div>

      {/* On mobile: both panels render in a single scrollable column.
          On desktop (lg+): side-by-side layout as before. */}
      <ModelCatalog
        entries={allEntries}
        os={os}
        onOsChange={handleOsChange}
        selectedModelIds={selectedModelIds}
        selectedModels={selectedModels}
        onToggleModel={toggleModel}
        remainingVramMb={remainingVramMb}
        effectiveVramMb={effectiveVramMb}
        onClearAll={handleClearAll}
        hasSelections={hasSelections}
        framework={framework}
      />
      <ConfigPanel
        selectedModels={selectedModels}
        selectedVramGb={selectedVramGb}
        selectedGpu={selectedGpu}
        gpus={filteredGpus}
        gpuCount={gpuCount}
        onGpuSelect={handleGpuSelect}
        onVramPreset={handleVramPreset}
        onToggleModel={toggleModel}
        onClearAll={handleClearAll}
        modelIdToGroup={modelIdToGroup}
        modelIdToEntry={modelIdToEntry}
        os={os}
        hasSelections={hasSelections}
        contextOverride={contextOverride}
        onContextChange={setContextOverride}
        swapModelVariant={swapModelVariant}
        framework={framework}
      />
    </div>
  )
}

export default App
