export interface ModelVram {
  model: number
  overhead: number
}

export type OsPlatform = 'linux' | 'windows' | 'mac'

export interface CatalogModel {
  id: string
  name: string
  type: 'llm' | 'image' | 'audio'
  engine: string
  bits?: number
  primaryBits?: number
  status: string
  repo: string
  vram: ModelVram
  kvCacheMbPer1kTokens?: number
  contextLength?: number
  tps?: Record<string, number>
  os: OsPlatform[]
  isDefault: boolean
  hasVision: boolean
  capabilities?: string[]
}

export interface GpuInfo {
  id: string
  name: string
  vramMb: number
  os: OsPlatform[]
}

const MAC_GPUS: GpuInfo[] = [
  { id: 'apple-m3-pro-18gb', name: 'm3 pro', vramMb: 18432, os: ['mac'] },
  { id: 'apple-m4-24gb', name: 'm4', vramMb: 24576, os: ['mac'] },
  { id: 'apple-m4-pro-48gb', name: 'm4 pro', vramMb: 49152, os: ['mac'] },
  { id: 'apple-m4-max-128gb', name: 'm4 max', vramMb: 131072, os: ['mac'] },
  { id: 'apple-m4-ultra-256gb', name: 'm4 ultra', vramMb: 262144, os: ['mac'] },
]

export const VRAM_PRESETS = [8, 16, 24, 32, 48, 80, 128, 141, 192, 256, 288]
export const GPU_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type GpuCount = (typeof GPU_COUNTS)[number]

/** Minimum GPU count needed to fit the given VRAM (in MB) on a single GPU's VRAM */
export function getMinGpuCount(totalVramMb: number, gpuVramMb: number): GpuCount {
  if (gpuVramMb <= 0) return 1
  const needed = Math.ceil(totalVramMb / gpuVramMb)
  return Math.max(1, Math.min(needed, 8)) as GpuCount
}

// deterministic pastel color per model id
const MODEL_PASTELS: Record<string, string> = {}
const PASTEL_HUES = [210, 340, 160, 40, 270, 190, 20, 300, 120, 60]
let _hueIdx = 0

export function getModelColor(modelId: string): { bg: string; border: string; text: string } {
  if (!MODEL_PASTELS[modelId]) {
    const hue = PASTEL_HUES[_hueIdx % PASTEL_HUES.length]
    _hueIdx++
    MODEL_PASTELS[modelId] = String(hue)
  }
  const hue = MODEL_PASTELS[modelId]
  return {
    bg: `hsla(${hue}, 40%, 85%, 0.15)`,
    border: `hsla(${hue}, 40%, 70%, 0.3)`,
    text: `hsla(${hue}, 30%, 60%, 1)`,
  }
}

export function formatVram(mb: number): string {
  const gb = mb / 1024
  return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} gb`
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = Math.round(tokens / 1_000_000)
    return `${m}m`
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`
  }
  return `${tokens}`
}

/** Total runtime VRAM: weights + overhead + KV cache at default context length */
export function getTotalVram(selectedModels: CatalogModel[], llmContextOverride?: number | null): number {
  return selectedModels.reduce((sum, m) => {
    const ctxLen = (m.type === 'llm' && llmContextOverride != null) ? llmContextOverride : m.contextLength
    const kvCacheMb = (m.kvCacheMbPer1kTokens && ctxLen)
      ? (ctxLen / 1000) * m.kvCacheMbPer1kTokens
      : 0
    return sum + m.vram.model + m.vram.overhead + kvCacheMb
  }, 0)
}

/** VRAM without KV cache — used for catalog size display */
export function getModelVram(model: CatalogModel): number {
  return model.vram.model + model.vram.overhead
}

export function getModelsForOs(os: OsPlatform | null, allModels: CatalogModel[]): CatalogModel[] {
  if (!os) return allModels
  return allModels.filter((m) => m.os.includes(os))
}

export function getGpusForOs(os: OsPlatform | null, allGpus: GpuInfo[]): GpuInfo[] {
  if (!os) return allGpus
  return allGpus.filter((g) => g.os.includes(os))
}

interface RawModel {
  id: string
  name: string
  type: 'llm' | 'audio' | 'image'
  engine: string
  bits?: number
  status?: string
  repo?: string
  vram: ModelVram
  capabilities?: string[]
  kvCacheMbPer1kTokens?: number
  tps?: Record<string, number>
  defaults?: { contextLength?: number }
  mmproj?: string
  platform?: 'nvidia' | 'mlx'
  [key: string]: unknown
}

interface RawGpu {
  id: string
  name: string
  vramMb: number
  [key: string]: unknown
}

interface RawCatalog {
  models: RawModel[]
  gpus: RawGpu[]
}

export async function fetchCatalog(): Promise<{ models: CatalogModel[]; gpus: GpuInfo[] }> {
  const res = await fetch(`${import.meta.env.BASE_URL}v1/catalog.json`)
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`)
  const raw: RawCatalog = await res.json()

  const models: CatalogModel[] = raw.models.flatMap((m) => {
    const hasVision = typeof m.mmproj === 'string' && m.mmproj.length > 0

    // MLX-only models (platform: "mlx") → Mac tab only
    if (m.platform === 'mlx') {
      return [{
        id: m.id,
        name: m.name.toLowerCase(),
        type: m.type,
        engine: m.engine,
        bits: m.bits,
        primaryBits: m.bits,
        status: m.status ?? 'stable',
        repo: m.repo ?? m.id,
        vram: m.vram,
        kvCacheMbPer1kTokens: m.kvCacheMbPer1kTokens,
        tps: m.tps,
        contextLength: m.defaults?.contextLength,
        os: ['mac'] as OsPlatform[],
        isDefault: (m as Record<string, unknown>).default === true,
        hasVision: false,
        capabilities: m.capabilities,
      }]
    }

    // GGUF model → Linux/Windows entry
    const ggufEntry: CatalogModel = {
      id: m.id,
      name: m.name.toLowerCase(),
      type: m.type,
      engine: m.engine,
      bits: m.bits,
      primaryBits: m.bits,
      status: m.status ?? 'stable',
      repo: m.repo ?? m.id,
      vram: m.vram,
      kvCacheMbPer1kTokens: m.kvCacheMbPer1kTokens,
      tps: m.tps,
      contextLength: m.defaults?.contextLength,
      os: ['linux', 'windows'] as OsPlatform[],
      isDefault: (m as Record<string, unknown>).default === true,
      hasVision,
      capabilities: m.capabilities,
    }

    return [ggufEntry]
  })

  const gpus: GpuInfo[] = [
    ...raw.gpus.map((g) => ({
      id: g.id,
      name: g.name.replace('NVIDIA ', '').replace(/^RTX\s+/i, '').replace(/\s+\d+GB$/i, '').toLowerCase(),
      vramMb: g.vramMb,
      os: ['linux', 'windows'] as OsPlatform[],
    })),
    ...MAC_GPUS,
  ]

  gpus.sort((a, b) => a.vramMb - b.vramMb)

  return { models, gpus }
}
