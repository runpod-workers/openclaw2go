import { cn } from '../lib/utils'

export interface VramSegment {
  type: 'llm' | 'image' | 'audio'
  gb: number
  color: string
}

export default function VramGauge({
  usedGb,
  selectedGb,
  presets,
  onSelectPreset,
  maxGb,
  segments,
}: {
  usedGb: number
  selectedGb: number | null
  presets: number[]
  onSelectPreset: (gb: number) => void
  maxGb?: number | null
  segments?: VramSegment[]
}) {
  const effectiveTotal = selectedGb ?? 0
  const overflows = usedGb > effectiveTotal && effectiveTotal > 0

  // Compute per-segment widths as percentage of effectiveTotal
  const segmentWidths = segments && effectiveTotal > 0
    ? segments
        .filter((s) => s.gb > 0)
        .map((s) => ({
          ...s,
          pct: Math.min((s.gb / effectiveTotal) * 100, 100),
        }))
    : []

  // Fallback: single bar if no segments provided
  const totalFillPct = effectiveTotal > 0 ? Math.min((usedGb / effectiveTotal) * 100, 100) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* usage readout */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-mono text-3xl font-bold tabular-nums tracking-tighter transition-colors",
              overflows ? "text-destructive" : usedGb > 0 ? "text-foreground" : "text-foreground/30"
            )}
          >
            {usedGb.toFixed(1)}
          </span>
          <span className="font-mono text-xs text-foreground/50">
            {effectiveTotal > 0 ? `/ ${effectiveTotal % 1 === 0 ? effectiveTotal : effectiveTotal.toFixed(1)} GB` : "GB used"}
          </span>
          {overflows && (
            <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive animate-pulse-subtle">
              exceeds memory
            </span>
          )}
        </div>

        {/* bar */}
        <div className="relative h-1.5 w-full overflow-hidden bg-foreground/[0.06]">
          {segmentWidths.length > 0 ? (
            // Multi-colored segments by model type
            <div className="absolute inset-y-0 left-0 flex h-full "
              style={{ width: effectiveTotal > 0 ? `${totalFillPct}%` : '0%' }}
            >
              {segmentWidths.map((seg) => {
                // Each segment's width is proportional to its share of total used
                const segShare = usedGb > 0 ? (seg.gb / usedGb) * 100 : 0
                return (
                  <div
                    key={seg.type}
                    className={cn(
                      "h-full ",
                      overflows && "bg-destructive"
                    )}
                    style={{
                      width: `${segShare}%`,
                      ...(!overflows ? { backgroundColor: seg.color } : {}),
                    }}
                  />
                )
              })}
            </div>
          ) : (
            // Fallback single bar
            <div
              className={cn(
                "absolute inset-y-0 left-0 ",
                overflows ? "bg-destructive" : "bg-primary/60"
              )}
              style={{ width: effectiveTotal > 0 ? `${totalFillPct}%` : "0%" }}
            />
          )}
          {/* tick marks at 25/50/75 */}
          {effectiveTotal > 0 && [25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute top-0 h-full w-px bg-foreground/[0.06]"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>

        {/* Legend dots — always reserve height to prevent layout shift */}
        <div className="flex items-center gap-3 h-4">
          {segmentWidths.map((seg) => (
            <div key={seg.type} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="font-mono text-[9px] uppercase tracking-wider text-foreground/40">
                {seg.type}
              </span>
              <span className="font-mono text-[9px] tabular-nums text-foreground/50">
                {seg.gb.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((gb) => {
          const isSelected = selectedGb === gb
          const exceedsDevice = maxGb != null && gb > maxGb

          return (
            <button
              key={gb}
              onClick={() => !exceedsDevice && onSelectPreset(gb)}
              disabled={exceedsDevice}
              className={cn(
                "px-2.5 py-1 font-mono text-[10px] font-medium tabular-nums transition-all duration-150",
                exceedsDevice
                  ? "text-foreground/15 cursor-not-allowed"
                  : isSelected
                    ? "bg-foreground/10 text-foreground"
                    : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground"
              )}
            >
              {gb}
            </button>
          )
        })}
      </div>
    </div>
  )
}
