import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  fetchCatalog,
  getTotalVram,
  getGpusForOs,
  getMinGpuCount,
  type CatalogModel,
  type GpuInfo,
  type OsPlatform,
} from './lib/catalog'
import { groupModels, getVariantForOs, type ModelGroup } from './lib/group-models'
import ModelCatalog from './components/ModelCatalog'
import ConfigPanel from './components/ConfigPanel'

function App() {
  const [allModels, setAllModels] = useState<CatalogModel[]>([])
  const [allGpus, setAllGpus] = useState<GpuInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [os, setOs] = useState<OsPlatform | null>(null)
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
  const [selectedGpu, setSelectedGpu] = useState<GpuInfo | null>(null)
  const [selectedVramGb, setSelectedVramGb] = useState<number | null>(null)

  useEffect(() => {
    fetchCatalog()
      .then(({ models, gpus }) => {
        setAllModels(models)
        setAllGpus(gpus)
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const allGroups = useMemo(() => groupModels(allModels), [allModels])

  const modelIdToGroup = useMemo(() => {
    const map = new Map<string, ModelGroup>()
    for (const group of allGroups) {
      for (const v of group.variants) {
        map.set(v.model.id, group)
      }
    }
    return map
  }, [allGroups])

  const filteredGpus = useMemo(() => getGpusForOs(os, allGpus), [os, allGpus])

  const selectedModels = useMemo(
    () => allModels.filter((m) => selectedModelIds.has(m.id)),
    [selectedModelIds, allModels]
  )

  const totalVramMb = useMemo(() => getTotalVram(selectedModels), [selectedModels])
  const totalVramGb = totalVramMb / 1024

  // GPU count is fully derived — auto-calculated from selected GPU + total VRAM
  const gpuCount = selectedGpu ? getMinGpuCount(totalVramMb, selectedGpu.vramMb) : 1

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
    },
    [allModels]
  )

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

  const effectiveVramGb = selectedVramGb ?? (selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : 0)
  const effectiveVramMb = effectiveVramGb * 1024
  const remainingVramMb = effectiveVramMb > 0 ? effectiveVramMb - totalVramMb : 0

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
    <div className="noise-bg flex h-screen w-screen overflow-hidden bg-background">
      <ModelCatalog
        models={allModels}
        os={os}
        onOsChange={handleOsChange}
        selectedModelIds={selectedModelIds}
        selectedModels={selectedModels}
        onToggleModel={toggleModel}
        remainingVramMb={remainingVramMb}
        effectiveVramMb={effectiveVramMb}
      />
      <ConfigPanel
        selectedModels={selectedModels}
        totalVramGb={totalVramGb}
        effectiveVramGb={effectiveVramGb}
        selectedVramGb={selectedVramGb}
        selectedGpu={selectedGpu}
        gpus={filteredGpus}
        totalVramMb={totalVramMb}
        gpuCount={gpuCount}
        onGpuSelect={handleGpuSelect}
        onVramPreset={handleVramPreset}
        onToggleModel={toggleModel}
        onClearAll={() => {
          setSelectedModelIds(new Set())
          setOs(null)
          setSelectedGpu(null)
          setSelectedVramGb(null)
        }}
        modelIdToGroup={modelIdToGroup}
        os={os}
      />
    </div>
  )
}

export default App
