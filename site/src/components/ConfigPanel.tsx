import SectionHeader from './SectionHeader'
import GpuSelector from './VramLegend'
import VramGauge from './VramSelector'
import SelectedModels from './SelectedModels'
import DeployCard from './DeployOutput'
import type { CatalogModel, GpuInfo, GpuCount, OsPlatform } from '../lib/catalog'
import { VRAM_PRESETS } from '../lib/catalog'
import type { ModelGroup } from '../lib/group-models'

export default function ConfigPanel({
  selectedModels,
  totalVramGb,
  effectiveVramGb: _effectiveVramGb,
  selectedVramGb,
  selectedGpu,
  gpus,
  totalVramMb,
  gpuCount,
  onGpuSelect,
  onVramPreset,
  onToggleModel,
  onClearAll,
  modelIdToGroup,
  os,
}: {
  selectedModels: CatalogModel[]
  totalVramGb: number
  effectiveVramGb: number
  selectedVramGb: number | null
  selectedGpu: GpuInfo | null
  gpus: GpuInfo[]
  totalVramMb: number
  gpuCount: GpuCount
  onGpuSelect: (gpu: GpuInfo) => void
  onVramPreset: (gb: number) => void
  onToggleModel: (model: CatalogModel) => void
  onClearAll: () => void
  modelIdToGroup: Map<string, ModelGroup>
  os: OsPlatform | null
}) {
  const hasModels = selectedModels.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Toolbar row: Memory + Hardware + Logo as CSS Grid */}
      <div className="shrink-0 border-b border-foreground/[0.06]">
        <div
          className="grid"
          style={{ gridTemplateColumns: '1fr 1fr auto' }}
        >
          {/* Memory */}
          <div className="border-r border-foreground/[0.06]">
            <SectionHeader>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                Memory
              </span>
            </SectionHeader>
            <div className="p-5">
              <VramGauge
                usedGb={totalVramGb}
                selectedGb={selectedVramGb ?? (selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : null)}
                presets={VRAM_PRESETS}
                onSelectPreset={onVramPreset}
                maxGb={selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : null}
              />
            </div>
          </div>

          {/* Hardware */}
          <div className="border-r border-foreground/[0.06]">
            <SectionHeader>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                Hardware
              </span>
            </SectionHeader>
            <div className="px-3 py-2.5">
              <GpuSelector
                gpus={gpus}
                selectedGpu={selectedGpu}
                onSelect={onGpuSelect}
                totalVramNeeded={totalVramMb}
                selectedVramGb={selectedVramGb}
              />
            </div>
          </div>

          {/* Logo */}
          <a
            href="https://github.com/runpod-workers/openclaw2go"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-[280px] shrink-0 flex-col items-center justify-center transition-opacity hover:opacity-80"
          >
            <img
              src={`${import.meta.env.BASE_URL}openclaw2go_logo_nobg.png`}
              alt="openclaw2go"
              width={200}
              height={200}
              className="-mb-4 h-48 w-48 object-contain"
            />
            <span className="font-mono text-[14px] font-bold tracking-tight text-foreground/70">
              openclaw2go
            </span>
            <span className="font-mono text-[9px] text-foreground/30">
              v{__APP_VERSION__}
            </span>
          </a>
        </div>
      </div>

      {/* Selected Models — sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-foreground/[0.06]">
        <SectionHeader className="justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
              Selected Models
            </span>
            {selectedModels.length > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-foreground/60">
                {selectedModels.length} model{selectedModels.length !== 1 ? "s" : ""}
                {" / "}
                {totalVramGb.toFixed(1)} GB
              </span>
            )}
          </div>
          {selectedModels.length > 0 && (
            <button
              onClick={onClearAll}
              className="font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:text-foreground/80"
            >
              clear all
            </button>
          )}
        </SectionHeader>
      </div>

      {/* Selected model cards */}
      <div className="p-4">
        <SelectedModels
          models={selectedModels}
          onToggle={onToggleModel}
          modelIdToGroup={modelIdToGroup}
          gpus={gpus}
        />
      </div>

      {/* Deploy — only when models are selected */}
      {hasModels && (
        <div className="shrink-0 border-t border-foreground/[0.06]">
          <SectionHeader>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
              Deploy
            </span>
          </SectionHeader>
          <div className="p-4">
            <DeployCard
              selectedModels={selectedModels}
              modelIdToGroup={modelIdToGroup}
              os={os}
            />
          </div>
        </div>
      )}
    </div>
  )
}
