import { useState, useEffect, useMemo, useCallback } from 'react'
import { cn } from '../lib/utils'
import type { DeviceInfo, DeviceCount } from '../lib/catalog'
import { formatVram, DEVICE_COUNTS } from '../lib/catalog'
import { ChevronDown, Minus, Plus } from 'lucide-react'

type Brand = 'nvidia' | 'apple'

export default function DeviceSelector({
  devices,
  selectedDevice,
  onSelect,
  deviceCount,
  onDeviceCountChange,
  totalVramMb = 0,
}: {
  devices: DeviceInfo[]
  selectedDevice: DeviceInfo | null
  onSelect: (device: DeviceInfo) => void
  deviceCount: DeviceCount
  onDeviceCountChange: (count: DeviceCount) => void
  totalVramMb?: number
}) {
  const { nvidiaDevices, macDevices } = useMemo(() => {
    const nvidia = devices.filter((g) => !g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    const mac = devices.filter((g) => g.os.includes('mac')).sort((a, b) => a.vramMb - b.vramMb)
    return { nvidiaDevices: nvidia, macDevices: mac }
  }, [devices])

  const availableBrands = useMemo(() => {
    const brands: Brand[] = []
    if (nvidiaDevices.length > 0) brands.push('nvidia')
    if (macDevices.length > 0) brands.push('apple')
    return brands
  }, [nvidiaDevices, macDevices])

  const [brand, setBrand] = useState<Brand | null>(() => {
    if (selectedDevice) return selectedDevice.os.includes('mac') ? 'apple' : 'nvidia'
    return null
  })

  useEffect(() => {
    if (selectedDevice) {
      setBrand(selectedDevice.os.includes('mac') ? 'apple' : 'nvidia')
    }
  }, [selectedDevice])

  useEffect(() => {
    if (brand && !availableBrands.includes(brand)) {
      setBrand(availableBrands.length === 1 ? availableBrands[0] : null)
    } else if (!brand && availableBrands.length === 1) {
      setBrand(availableBrands[0])
    }
  }, [availableBrands, brand])

  const brandDevices = brand === 'nvidia' ? nvidiaDevices : brand === 'apple' ? macDevices : []

  const handleBrandChange = useCallback((newBrand: Brand | null) => {
    setBrand(newBrand)
    if (selectedDevice) {
      const currentBrand = selectedDevice.os.includes('mac') ? 'apple' : 'nvidia'
      if (currentBrand !== newBrand) onSelect(selectedDevice)
    }
  }, [selectedDevice, onSelect])

  const handleDeviceChange = useCallback((deviceId: string) => {
    if (deviceId === '') {
      if (selectedDevice) onSelect(selectedDevice)
      return
    }
    const device = devices.find((d) => d.id === deviceId)
    if (device && device.id !== selectedDevice?.id) onSelect(device)
  }, [devices, onSelect, selectedDevice])

  const min = DEVICE_COUNTS[0]
  const max = DEVICE_COUNTS[DEVICE_COUNTS.length - 1]

  const selectClass = cn(
    "w-full appearance-none border border-foreground/[0.08] bg-foreground/[0.03]",
    "h-8 px-2 pr-6 font-mono text-[11px]",
    "text-foreground/80 transition-all duration-150",
    "hover:border-foreground/15 hover:bg-foreground/[0.05]",
    "focus:border-foreground/25 focus:outline-none",
  )

  return (
    <div className="flex items-center gap-1.5">
      {/* Brand */}
      <div className="relative flex-1 min-w-0">
        <select
          value={brand ?? ''}
          onChange={(e) => handleBrandChange(e.target.value ? (e.target.value as Brand) : null)}
          className={cn(selectClass, "font-semibold")}
        >
          <option value="">brand?</option>
          {availableBrands.map((b) => (
            <option key={b} value={b}>
              {b === 'nvidia' ? 'NVIDIA' : 'Apple'}
            </option>
          ))}
        </select>
        <ChevronDown
          size={10}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground/25"
        />
      </div>

      {/* Device */}
      <div className="relative flex-[1.4] min-w-0">
        <select
          value={selectedDevice?.id ?? ''}
          onChange={(e) => handleDeviceChange(e.target.value)}
          disabled={!brand}
          className={cn(
            selectClass,
            !brand && "opacity-25 pointer-events-none",
          )}
        >
          <option value="">device?</option>
          {brandDevices.map((d) => {
            const cantFit = totalVramMb > 0 && d.vramMb * deviceCount < totalVramMb
            return (
              <option key={d.id} value={d.id} disabled={cantFit}>
                {d.name} — {formatVram(d.vramMb * deviceCount)}
              </option>
            )
          })}
        </select>
        <ChevronDown
          size={10}
          className={cn(
            "pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground/25",
            !brand && "opacity-25",
          )}
        />
      </div>

      {/* Count stepper */}
      <div className="flex items-center shrink-0 border border-foreground/[0.08] bg-foreground/[0.03]">
        <button
          onClick={() => deviceCount > min && onDeviceCountChange((deviceCount - 1) as DeviceCount)}
          disabled={deviceCount <= min}
          className={cn(
            "flex items-center justify-center w-8 h-8 transition-colors",
            deviceCount <= min
              ? "text-foreground/10 cursor-not-allowed"
              : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.05]",
          )}
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <span className="font-mono text-[12px] font-bold tabular-nums text-foreground/70 w-6 text-center">
          {deviceCount}x
        </span>
        <button
          onClick={() => deviceCount < max && onDeviceCountChange((deviceCount + 1) as DeviceCount)}
          disabled={deviceCount >= max}
          className={cn(
            "flex items-center justify-center w-8 h-8 transition-colors",
            deviceCount >= max
              ? "text-foreground/10 cursor-not-allowed"
              : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.05]",
          )}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
