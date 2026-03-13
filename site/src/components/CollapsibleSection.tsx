import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Section that is collapsible on mobile (<lg), always expanded on desktop (lg+).
 * Renders a clickable header on mobile with a chevron toggle.
 * On desktop the header is hidden and children are always visible.
 */
export default function CollapsibleSection({
  title,
  badge,
  children,
  defaultOpen = false,
  className,
}: {
  title: string
  badge?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`border-b border-foreground/[0.06] ${className ?? ''}`}>
      {/* Mobile toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex lg:hidden w-full items-center justify-between px-4 py-2.5"
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {badge}
          <ChevronDown
            size={14}
            className={`text-foreground/40 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Content: toggled on mobile, always visible on desktop */}
      <div className={`${open ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 flex-1`}>
        {children}
      </div>
    </div>
  )
}
