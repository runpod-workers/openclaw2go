import { useState } from 'react'
import SectionHeader from './SectionHeader'
import CollapsibleSection from './CollapsibleSection'
import GpuSelector from './VramLegend'
import VramGauge from './VramSelector'
import SelectedModels from './SelectedModels'
import DeployCard from './DeployOutput'
import SecurityGuide from './SecurityGuide'
import type { CatalogModel, GpuInfo, GpuCount, OsPlatform } from '../lib/catalog'
import { VRAM_PRESETS } from '../lib/catalog'
import type { ModelGroup } from '../lib/group-models'
import { Link, TriangleAlert } from 'lucide-react'

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:text-foreground/80"
    >
      <Link size={10} />
      {copied ? 'copied' : 'copy link'}
    </button>
  )
}

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
  hasSelections,
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
  hasSelections: boolean
}) {
  const hasModels = selectedModels.length > 0

  const memoryBadge = totalVramGb > 0 ? (
    <span className="font-mono text-[9px] tabular-nums text-foreground/40">
      {totalVramGb.toFixed(1)} GB
    </span>
  ) : undefined

  const hardwareBadge = selectedGpu ? (
    <span className="font-mono text-[9px] text-foreground/40">
      {selectedGpu.name}
    </span>
  ) : undefined

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-visible lg:overflow-y-auto">
      {/* Memory — collapsible on mobile, inline on desktop */}
      <CollapsibleSection title="Memory" badge={memoryBadge}>
        {/* Desktop: toolbar grid row with Memory + Hardware + Logo */}
        <div className="hidden lg:block">
          <div className="border-b border-foreground/[0.06]">
            <div className="grid grid-cols-[1fr_1fr_auto]">
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
                className="flex w-[280px] shrink-0 items-center justify-center py-6 transition-opacity hover:opacity-80"
              >
                <div className="flex flex-col items-center">
                  <img
                    src={`${import.meta.env.BASE_URL}openclaw2go_logo_nobg.png`}
                    alt="openclaw2go"
                    width={200}
                    height={200}
                    className="-mb-4 h-40 w-40 object-contain"
                  />
                  <span className="font-mono text-[14px] font-bold tracking-tight text-foreground/70">
                    openclaw2go
                  </span>
                  <span className="font-mono text-[9px] text-foreground/30">
                    v{__APP_VERSION__}
                  </span>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Mobile: just Memory content */}
        <div className="lg:hidden p-5">
          <VramGauge
            usedGb={totalVramGb}
            selectedGb={selectedVramGb ?? (selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : null)}
            presets={VRAM_PRESETS}
            onSelectPreset={onVramPreset}
            maxGb={selectedGpu ? (selectedGpu.vramMb * gpuCount) / 1024 : null}
          />
        </div>
      </CollapsibleSection>

      {/* Hardware — collapsible on mobile only (desktop is rendered above inside the grid) */}
      <div className="lg:hidden">
        <CollapsibleSection title="Hardware" badge={hardwareBadge}>
          <div className="px-3 py-2.5">
            <GpuSelector
              gpus={gpus}
              selectedGpu={selectedGpu}
              onSelect={onGpuSelect}
              totalVramNeeded={totalVramMb}
              selectedVramGb={selectedVramGb}
            />
          </div>
        </CollapsibleSection>
      </div>

      {/* Selected Models — sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-foreground/[0.06]">
        <SectionHeader className="flex-wrap gap-y-1 justify-between">
          <div className="flex items-center gap-2 lg:gap-3">
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
          {hasSelections && (
            <div className="flex items-center gap-2 lg:gap-3">
              <CopyLinkButton />
              <span className="h-3 w-px bg-foreground/10" />
              <button
                onClick={onClearAll}
                className="font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:text-foreground/80"
              >
                clear all
              </button>
            </div>
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
          os={os}
        />
      </div>

      {/* Deploy — only when models are selected */}
      {hasModels && (
        <div className="flex-1 border-t border-foreground/[0.06]">
          <div
            className="grid h-full grid-cols-1 lg:grid-cols-[300px_1fr]"
          >
            {/* Before You Deploy — left column */}
            <div className="border-b lg:border-b-0 lg:border-r border-primary/40 bg-primary/[0.04] flex flex-col">
              <div className="h-[3px] bg-primary/60 shrink-0" />
              <SectionHeader>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                  <TriangleAlert size={12} />
                  Before You Deploy
                </span>
              </SectionHeader>
              <div className="p-4">
                <SecurityGuide />
              </div>
            </div>

            {/* Deploy — right column */}
            <div>
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
          </div>
        </div>
      )}
    </div>
  )
}
