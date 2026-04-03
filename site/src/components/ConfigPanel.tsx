import { useState, useMemo, useEffect } from 'react'
import SectionHeader from './SectionHeader'
import CollapsibleSection from './CollapsibleSection'
import DeviceSelector, { DeviceCountStepper } from './VramLegend'
import VramGauge, { type VramSegment } from './VramSelector'
import SelectedModels from './SelectedModels'
import DeployCard from './DeployOutput'
import SecurityGuide from './SecurityGuide'
import type { CatalogModel, DeviceInfo, DeviceCount, OsPlatform } from '../lib/catalog'
import { VRAM_PRESETS } from '../lib/catalog'
import { getVariantForOs, type ModelGroup, type CatalogEntry, type FamilyEntry } from '../lib/group-models'
import type { AgentFramework } from '../lib/frameworks'
import { Link, TriangleAlert } from 'lucide-react'

/** Slot order + colors — must match SLOTS in SelectedModels.tsx */
const SLOT_ORDER: { type: 'llm' | 'image' | 'audio'; color: string }[] = [
  { type: 'llm', color: '#00e5ff' },
  { type: 'image', color: '#ec407a' },
  { type: 'audio', color: '#b388ff' },
]

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
  selectedVramGb,
  selectedDevice,
  devices,
  deviceCount,
  onDeviceCountChange,
  onDeviceSelect,
  onVramPreset,
  onToggleModel,
  onClearAll,
  modelIdToGroup,
  modelIdToEntry,
  modelIdToFamilyEntry,
  os,
  hasSelections,
  contextOverride,
  onContextChange,
  swapModelVariant,
  framework,
}: {
  selectedModels: CatalogModel[]
  selectedVramGb: number | null
  selectedDevice: DeviceInfo | null
  devices: DeviceInfo[]
  deviceCount: DeviceCount
  onDeviceCountChange: (count: DeviceCount) => void
  onDeviceSelect: (device: DeviceInfo) => void
  onVramPreset: (gb: number) => void
  onToggleModel: (model: CatalogModel) => void
  onClearAll: () => void
  modelIdToGroup: Map<string, ModelGroup>
  modelIdToEntry?: Map<string, CatalogEntry>
  modelIdToFamilyEntry?: Map<string, FamilyEntry>
  os: OsPlatform | null
  hasSelections: boolean
  contextOverride: number | null
  onContextChange: (ctx: number | null) => void
  swapModelVariant?: (oldModel: CatalogModel, newModel: CatalogModel) => void
  framework: AgentFramework
}) {
  const hasModels = selectedModels.length > 0

  // Track the active platform tab from SelectedModels (card-local, never affects global OS)
  const [sharedOs, setSharedOs] = useState<OsPlatform | null>(os)

  // Sync shared tab state when global OS is set; preserve user's tab selection when cleared
  useEffect(() => { if (os != null) setSharedOs(os) }, [os])

  // Per-type VRAM segments for the gauge bar — use the variant matching the active tab,
  // so switching platform tabs in a card immediately updates the memory gauge.
  const vramSegments: VramSegment[] = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const m of selectedModels) {
      const group = modelIdToGroup.get(m.id)
      const variant = group ? getVariantForOs(group, sharedOs) : null
      const v = variant?.model ?? m
      const ctxLen = (v.type === 'llm' && contextOverride != null) ? contextOverride : v.contextLength
      const kvCacheMb = (v.kvCacheMbPer1kTokens && ctxLen)
        ? (ctxLen / 1000) * v.kvCacheMbPer1kTokens
        : 0
      byType[v.type] = (byType[v.type] ?? 0) + v.vram.model + v.vram.overhead + kvCacheMb
    }
    return SLOT_ORDER
      .filter((slot) => (byType[slot.type] ?? 0) > 0)
      .map((slot) => ({
        type: slot.type,
        gb: byType[slot.type] / 1024,
        color: slot.color,
      }))
  }, [selectedModels, contextOverride, sharedOs, modelIdToGroup])

  // Variant-aware total VRAM — sum from vramSegments so it matches the gauge bar
  const displayVramGb = useMemo(
    () => vramSegments.reduce((sum, s) => sum + s.gb, 0),
    [vramSegments],
  )

  // When models are selected but no GPU/VRAM preset chosen, suggest the smallest fitting preset
  const suggestedGb = useMemo(() => {
    if (selectedVramGb != null || selectedDevice != null) return null
    if (displayVramGb <= 0) return null
    return VRAM_PRESETS.find((p) => p >= displayVramGb) ?? null
  }, [selectedVramGb, selectedDevice, displayVramGb])

  const memoryBadge = displayVramGb > 0 ? (
    <span className="font-mono text-[9px] tabular-nums text-foreground/40">
      {displayVramGb.toFixed(1)} GB
    </span>
  ) : undefined

  const hardwareBadge = selectedDevice ? (
    <span className="font-mono text-[9px] text-foreground/40">
      {selectedDevice.name}
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
              {/* Hardware */}
              <div className="border-r border-foreground/[0.06]">
                <SectionHeader>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                    Hardware
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="font-mono text-[9px] font-medium uppercase tracking-widest text-foreground/40">
                      count
                    </span>
                    <DeviceCountStepper count={deviceCount} onChange={onDeviceCountChange} />
                  </span>
                </SectionHeader>
                <div className="px-3 py-2.5">
                  <DeviceSelector
                    devices={devices}
                    selectedDevice={selectedDevice}
                    onSelect={onDeviceSelect}
                    deviceCount={deviceCount}
                  />
                </div>
              </div>

              {/* Memory */}
              <div className="border-r border-foreground/[0.06]">
                <SectionHeader>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                    Memory
                  </span>
                </SectionHeader>
                <div className="p-5">
                  <VramGauge
                    usedGb={displayVramGb}
                    selectedGb={selectedVramGb ?? (selectedDevice ? (selectedDevice.vramMb * deviceCount) / 1024 : suggestedGb)}
                    presets={VRAM_PRESETS}
                    onSelectPreset={onVramPreset}
                    maxGb={selectedDevice ? (selectedDevice.vramMb * deviceCount) / 1024 : null}
                    segments={vramSegments}
                  />
                </div>
              </div>

              {/* Logo */}
              <a
                href="https://github.com/runpod-labs/a2go"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-[180px] shrink-0 items-center justify-center py-6 transition-opacity hover:opacity-80"
              >
                <div className="flex flex-col items-center">
                  <img
                    src={`${import.meta.env.BASE_URL}a2go_logo_nobg.png`}
                    alt="agent2go"
                    width={200}
                    height={200}
                    className="mb-2 h-32 w-32 object-contain"
                  />
                  <span className="font-mono text-[14px] font-bold tracking-tight text-foreground/70">
                    agent2go
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
            usedGb={displayVramGb}
            selectedGb={selectedVramGb ?? (selectedDevice ? (selectedDevice.vramMb * deviceCount) / 1024 : suggestedGb)}
            presets={VRAM_PRESETS}
            onSelectPreset={onVramPreset}
            maxGb={selectedDevice ? (selectedDevice.vramMb * deviceCount) / 1024 : null}
            segments={vramSegments}
          />
        </div>
      </CollapsibleSection>

      {/* Hardware — collapsible on mobile only (desktop is rendered above inside the grid) */}
      <div className="lg:hidden">
        <CollapsibleSection title="Hardware" badge={hardwareBadge}>
          <div className="flex items-center gap-1 border-b border-foreground/[0.04] px-3 py-1.5">
            <span className="font-mono text-[8px] uppercase tracking-widest text-foreground/25">
              count
            </span>
            <DeviceCountStepper count={deviceCount} onChange={onDeviceCountChange} />
          </div>
          <div className="px-3 py-2.5">
            <DeviceSelector
              devices={devices}
              selectedDevice={selectedDevice}
              onSelect={onDeviceSelect}
              deviceCount={deviceCount}
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
                {displayVramGb.toFixed(1)} GB
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
          modelIdToEntry={modelIdToEntry}
          modelIdToFamilyEntry={modelIdToFamilyEntry}
          devices={devices}
          os={os}
          contextOverride={contextOverride}
          onContextChange={onContextChange}
          onSharedOsChange={setSharedOs}
          swapModelVariant={swapModelVariant}
        />
      </div>

      {/* Deploy — only when models are selected */}
      {hasModels && (
        <div className="flex-1 border-t border-foreground/[0.06]">
          <div
            className="grid h-full grid-cols-1 lg:grid-cols-[300px_1fr]"
          >
            {/* Before You Deploy — left column */}
            <div className="border-b lg:border-b-0 lg:border-r border-primary/40 bg-primary/[0.04] flex flex-col border-t border-t-primary/60">
              <SectionHeader>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                  <TriangleAlert size={12} />
                  Before You Deploy
                </span>
              </SectionHeader>
              <div className="p-4">
                <SecurityGuide framework={framework} />
              </div>
            </div>

            {/* Deploy — right column */}
            <div className="border-t border-t-transparent">
              <SectionHeader>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                  Deploy
                </span>
              </SectionHeader>
              <div className="p-4">
                <DeployCard
                  selectedModels={selectedModels}
                  modelIdToGroup={modelIdToGroup}
                  globalOs={os}
                  contextOverride={contextOverride}
                  onToggle={onToggleModel}
                  framework={framework}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
