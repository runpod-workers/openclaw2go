import { cn } from '../lib/utils'
import type { OsPlatform } from '../lib/catalog'
import type { ReactNode } from 'react'
import { FaLinux, FaWindows, FaApple } from 'react-icons/fa'

function PlatformIcon({ os, className }: { os: OsPlatform; className?: string }): ReactNode {
  if (os === 'linux') return <FaLinux className={className} />
  if (os === 'windows') return <FaWindows className={className} />
  return <FaApple className={className} />
}

const OS_OPTIONS: { id: OsPlatform; label: string }[] = [
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
  { id: "mac", label: "macOS" },
]

const OS_ACTIVE_STYLES: Record<OsPlatform, string> = {
  linux: "bg-[#E8B931] text-[#1a1a1a]",
  windows: "bg-[#0078D4] text-white",
  mac: "bg-[#A2AAAD] text-[#1a1a1a]",
}

export { PlatformIcon }

export function OsPills({ os, onChange }: { os: OsPlatform | null; onChange: (os: OsPlatform) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {OS_OPTIONS.map((opt) => {
        const active = os === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-all duration-150",
              active
                ? OS_ACTIVE_STYLES[opt.id]
                : "text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground/70"
            )}
            title={opt.label}
          >
            <PlatformIcon os={opt.id} className="h-2.5 w-2.5" />
          </button>
        )
      })}
    </div>
  )
}

export default function PlatformSelector({
  os,
  onChange,
}: {
  os: OsPlatform | null
  onChange: (os: OsPlatform) => void
}) {
  return (
    <div className="flex shrink-0 border-b border-foreground/[0.06]">
      {OS_OPTIONS.map((opt) => {
        const active = os === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-2.5 font-mono text-[11px] font-medium tracking-wide transition-all duration-200",
              active
                ? OS_ACTIVE_STYLES[opt.id]
                : "text-foreground/70 hover:bg-foreground/[0.03] hover:text-foreground",
              opt.id !== "mac" && "border-r border-foreground/[0.06]"
            )}
          >
            <PlatformIcon os={opt.id} className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
