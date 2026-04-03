import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export default function SectionHeader({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-8 shrink-0 items-center gap-2 border-b border-foreground/[0.06] bg-foreground/[0.03] px-4 py-1.5",
        className,
      )}
    >
      {children}
    </div>
  )
}
