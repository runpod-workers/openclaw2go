import { useMemo } from 'react'
import { cn } from '../lib/utils'
import type { GpuInfo, CatalogModel } from '../lib/catalog'
import { formatVram, getMinGpuCount } from '../lib/catalog'

function GpuButton({
  gpu,
  isSelected,
  disabled,
  count,
  effectiveVram,
  onSelect,
}: {
  gpu: GpuInfo
  isSelected: boolean
  disabled: boolean
  count: number
  effectiveVram: number
  onSelect: () => void
}) {
  return (
    <button
      onClick={() => !disabled && onSelect()}
      disabled={disabled && !isSelected}
      className={cn(
        "flex items-baseline px-3 py-1.5 font-mono text-[11px] transition-all duration-150",
        isSelected
          ? "bg-foreground/10 text-foreground"
          : "bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground",
        disabled && !isSelected && "opacity-20 pointer-events-none"
      )}
    >
      <span className="w-[20px] text-[9px] font-normal text-foreground/40 tabular-nums">
        {count}x
      </span>
      <span className="font-semibold uppercase tracking-wide">{gpu.name}</span>
      <span className="ml-1.5 w-[52px] text-right text-[9px] text-foreground/60 tabular-nums">
        {formatVram(effectiveVram)}
      </span>
    </button>
  )
}

export default function GpuSelector({
  gpus,
  selectedGpu,
  onSelect,
  totalVramNeeded,
  selectedVramGb,
  selectedModels,
}: {
  gpus: GpuInfo[]
  selectedGpu: GpuInfo | null
  onSelect: (gpu: GpuInfo) => void
  totalVramNeeded: number
  selectedVramGb: number | null
  selectedModels: CatalogModel[]
}) {
  const { nvidiaGpus, macGpus } = useMemo(() => {
    const nvidia = gpus.filter((g) => !g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    const mac = gpus.filter((g) => g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    return { nvidiaGpus: nvidia, macGpus: mac }
  }, [gpus])

  function renderGpu(gpu: GpuInfo) {
    const count = getMinGpuCount(totalVramNeeded, gpu.vramMb)
    const effectiveVram = gpu.vramMb * count
    const isSelected = selectedGpu?.id === gpu.id

    const cantFit = totalVramNeeded > 0 && gpu.vramMb * 8 < totalVramNeeded
    const fitsPreset = selectedVramGb ? effectiveVram >= selectedVramGb * 1024 : true

    const gpuOsSet = new Set(gpu.os)
    const osIncompatible = selectedModels.length > 0 && selectedModels.some(
      (m) => !m.os.some((modelOs) => gpuOsSet.has(modelOs))
    )

    const disabled = cantFit || !fitsPreset || osIncompatible

    return (
      <GpuButton
        key={gpu.id}
        gpu={gpu}
        isSelected={isSelected}
        disabled={disabled}
        count={count}
        effectiveVram={effectiveVram}
        onSelect={() => onSelect(gpu)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {nvidiaGpus.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-foreground/30">
            NVIDIA
          </span>
          <div className="flex flex-wrap gap-1.5">
            {nvidiaGpus.map(renderGpu)}
          </div>
        </div>
      )}
      {macGpus.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-foreground/30">
            Apple Silicon
          </span>
          <div className="flex flex-wrap gap-1.5">
            {macGpus.map(renderGpu)}
          </div>
        </div>
      )}
    </div>
  )
}
