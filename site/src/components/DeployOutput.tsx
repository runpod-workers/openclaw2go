import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import type { CatalogModel, GpuInfo, GpuCount, OsPlatform } from '../lib/catalog'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "shrink-0 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all duration-150",
        copied
          ? "text-primary"
          : "bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground"
      )}
    >
      {copied ? "copied" : "copy"}
    </button>
  )
}

function RunpodIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.78 2h10.61a2.4 2.4 0 0 1 2.08 1.2l5.3 9.18a2.4 2.4 0 0 1 0 2.4l-2.9 5.02a2.4 2.4 0 0 1-2.08 1.2H12.2L17.4 12 12.2 2.84H7.68L12.88 12l-5.2 9H4.78a2.4 2.4 0 0 1-2.08-1.2L.23 14.78a2.4 2.4 0 0 1 0-2.4L4.78 2Z" />
    </svg>
  )
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4.5 6 7 8l-2.5 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10h3" strokeLinecap="round" />
    </svg>
  )
}

export default function DeployCard({
  selectedModels,
  gpu,
  gpuCount,
  vramGb,
  os,
}: {
  selectedModels: CatalogModel[]
  gpu: GpuInfo | null
  gpuCount: GpuCount
  vramGb: number
  os: OsPlatform | null
}) {
  const isMacOs = os === 'mac'
  const isMacGpu = gpu?.os.includes('mac') ?? false

  const cliCommand = useMemo(() => {
    const lines: string[] = []
    lines.push("openclaw2go run \\")
    selectedModels.forEach((m, i) => {
      const isLast = i === selectedModels.length - 1 && !gpu && vramGb <= 0
      lines.push(`  --model ${m.repo}${isLast ? "" : " \\"}`)
    })
    if (gpu) {
      const gpuArg = gpuCount > 1 ? `${gpuCount}x${gpu.id}` : gpu.id
      const isLast = vramGb <= 0
      lines.push(`  --gpu ${gpuArg}${isLast ? "" : " \\"}`)
    }
    if (vramGb > 0) {
      lines.push(`  --vram ${vramGb}gb`)
    }
    return lines.join("\n")
  }, [selectedModels, gpu, gpuCount, vramGb])

  const runpodUrl = useMemo(() => {
    const params = new URLSearchParams()
    params.set("models", selectedModels.map((m) => m.repo).join(","))
    if (gpu) {
      params.set("gpu", gpuCount > 1 ? `${gpuCount}x${gpu.id}` : gpu.id)
    }
    if (vramGb > 0) params.set("vram", String(vramGb))
    return `https://runpod.io/deploy?${params.toString()}`
  }, [selectedModels, gpu, gpuCount, vramGb])

  const isEmpty = selectedModels.length === 0
  // RunPod can only deploy Linux — if Mac is selected with a Mac GPU, cloud deploy is not available
  const cloudUnavailable = isMacOs && isMacGpu

  return (
    <div className={cn("grid h-[140px] grid-cols-2 gap-3", isEmpty && "opacity-30 pointer-events-none")}>
      {/* LOCAL */}
      <div className="flex flex-col overflow-hidden border border-foreground/[0.06]">
        <div className="flex shrink-0 items-center gap-2 border-b border-foreground/[0.04] px-3 py-2">
          <TerminalIcon className="h-3.5 w-3.5 text-foreground/60" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/70">
            Local
          </span>
          {!isEmpty && (
            <div className="ml-auto">
              <CopyButton text={cliCommand} />
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center overflow-auto px-3 py-3">
          {isEmpty ? (
            <span className="font-mono text-[10px] text-foreground/40">
              select models to generate cli command
            </span>
          ) : (
            <pre className="font-mono text-[10px] leading-relaxed text-foreground/90">
              <code>{cliCommand}</code>
            </pre>
          )}
        </div>
      </div>

      {/* CLOUD */}
      <div className="flex flex-col overflow-hidden border border-foreground/[0.06]">
        <div className="flex shrink-0 items-center gap-2 border-b border-foreground/[0.04] px-3 py-2">
          <RunpodIcon className="h-3.5 w-3.5 text-foreground/60" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/70">
            Cloud
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          {cloudUnavailable ? (
            <span className="text-center font-mono text-[10px] leading-relaxed text-foreground/40">
              cloud deploy requires a linux gpu. select a linux gpu or use the cli for local mac deployment.
            </span>
          ) : (
            <>
              <span className="text-center font-mono text-[10px] leading-relaxed text-foreground/60">
                {isEmpty
                  ? "configure your box to enable cloud deployment."
                  : "deploy your current configuration to runpod with one click."}
              </span>
              <a
                href={isEmpty ? undefined : runpodUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 bg-[#673AB7] px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white transition-opacity hover:opacity-85"
              >
                <RunpodIcon className="h-3.5 w-3.5" />
                Deploy to Runpod
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
