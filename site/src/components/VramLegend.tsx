import { useMemo } from 'react'
import { cn } from '../lib/utils'
import type { DeviceInfo, DeviceCount } from '../lib/catalog'
import { formatVram, DEVICE_COUNTS } from '../lib/catalog'

/** Always format as GB (no TB conversion) — used as invisible spacer for stable width */
function formatVramGbOnly(mb: number): string {
  const gb = mb / 1024
  return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} gb`
}

function DeviceButton({
  device,
  isSelected,
  isDeactivated,
  disabled,
  effectiveVramMb,
  maxVramMb,
  onSelect,
}: {
  device: DeviceInfo
  isSelected: boolean
  isDeactivated: boolean
  disabled: boolean
  effectiveVramMb: number
  maxVramMb: number
  onSelect: () => void
}) {
  return (
    <button
      onClick={() => !disabled && onSelect()}
      disabled={disabled && !isSelected}
      className={cn(
        "flex items-baseline px-1.5 py-0.5 font-mono text-[11px] transition-all duration-150",
        isSelected
          ? "bg-foreground/10 text-foreground"
          : "bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground",
        isDeactivated && !disabled && "opacity-30",
        disabled && !isSelected && "opacity-20 pointer-events-none"
      )}
    >
      <span className="font-semibold uppercase tracking-wide">{device.name}</span>
      {/* Invisible spacer reserves width for widest possible value; real value overlays it */}
      <span className="relative ml-1 text-[9px] tabular-nums">
        <span className="invisible whitespace-nowrap">{formatVramGbOnly(maxVramMb)}</span>
        <span className="absolute inset-0 whitespace-nowrap text-right text-foreground/60">{formatVram(effectiveVramMb)}</span>
      </span>
    </button>
  )
}

/** Compact stepper for device count — designed to sit inside a section header. */
export function DeviceCountStepper({
  count,
  onChange,
}: {
  count: DeviceCount
  onChange: (count: DeviceCount) => void
}) {
  const min = DEVICE_COUNTS[0]
  const max = DEVICE_COUNTS[DEVICE_COUNTS.length - 1]

  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[9px]">
      <button
        onClick={() => count > min && onChange((count - 1) as DeviceCount)}
        disabled={count <= min}
        className={cn(
          "font-medium transition-colors",
          count <= min
            ? "text-foreground/10 cursor-not-allowed"
            : "text-foreground/40 hover:text-foreground/70"
        )}
      >
        −
      </button>
      <span className="font-bold tabular-nums text-foreground/70">
        {count}x
      </span>
      <button
        onClick={() => count < max && onChange((count + 1) as DeviceCount)}
        disabled={count >= max}
        className={cn(
          "font-medium transition-colors",
          count >= max
            ? "text-foreground/10 cursor-not-allowed"
            : "text-foreground/40 hover:text-foreground/70"
        )}
      >
        +
      </button>
    </span>
  )
}

export default function DeviceSelector({
  devices,
  selectedDevice,
  onSelect,
  deviceCount,
  totalVramMb = 0,
}: {
  devices: DeviceInfo[]
  selectedDevice: DeviceInfo | null
  onSelect: (device: DeviceInfo) => void
  deviceCount: DeviceCount
  totalVramMb?: number
}) {
  const maxCount = DEVICE_COUNTS[DEVICE_COUNTS.length - 1]
  const { nvidiaDevices, macDevices } = useMemo(() => {
    const nvidia = devices.filter((g) => !g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    const mac = devices.filter((g) => g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    return { nvidiaDevices: nvidia, macDevices: mac }
  }, [devices])

  return (
    <div className="flex flex-col gap-2.5">
      {nvidiaDevices.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-foreground/30">
            NVIDIA
          </span>
          <div className="flex flex-wrap gap-1">
            {nvidiaDevices.map((device) => {
              const cantFit = totalVramMb > 0 && device.vramMb * deviceCount < totalVramMb
              const isSelected = selectedDevice?.id === device.id
              return (
                <DeviceButton
                  key={device.id}
                  device={device}
                  isSelected={isSelected}
                  isDeactivated={selectedDevice != null && !isSelected}
                  disabled={cantFit}
                  effectiveVramMb={device.vramMb * deviceCount}
                  maxVramMb={device.vramMb * maxCount}
                  onSelect={() => onSelect(device)}
                />
              )
            })}
          </div>
        </div>
      )}
      {macDevices.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-foreground/30">
            Apple Silicon
          </span>
          <div className="flex flex-wrap gap-1">
            {macDevices.map((device) => {
              const cantFit = totalVramMb > 0 && device.vramMb * deviceCount < totalVramMb
              const isSelected = selectedDevice?.id === device.id
              return (
                <DeviceButton
                  key={device.id}
                  device={device}
                  isSelected={isSelected}
                  isDeactivated={selectedDevice != null && !isSelected}
                  disabled={cantFit}
                  effectiveVramMb={device.vramMb * deviceCount}
                  maxVramMb={device.vramMb * maxCount}
                  onSelect={() => onSelect(device)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
