export interface ModelVram {
  model: number
  overhead: number
}

export type OsPlatform = 'linux' | 'windows' | 'mac'

export interface ModelMlx {
  engine: string
  repo: string
  memoryMb: number
}

export interface CatalogModel {
  id: string
  name: string
  type: 'llm' | 'image' | 'audio'
  engine: string
  status: string
  repo: string
  vram: ModelVram
  kvCacheMbPer1kTokens?: number
  contextLength?: number
  os: OsPlatform[]
  isDefault: boolean
  mlx?: ModelMlx
}

export interface GpuInfo {
  id: string
  name: string
  vramMb: number
  os: OsPlatform[]
}

const MAC_GPUS: GpuInfo[] = [
  { id: 'apple-m3-pro-18gb', name: 'm3 pro 18gb', vramMb: 18432, os: ['mac'] },
  { id: 'apple-m4-24gb', name: 'm4', vramMb: 24576, os: ['mac'] },
  { id: 'apple-m4-pro-48gb', name: 'm4 pro', vramMb: 49152, os: ['mac'] },
  { id: 'apple-m4-max-128gb', name: 'm4 max', vramMb: 131072, os: ['mac'] },
]

export const VRAM_PRESETS = [8, 16, 24, 32, 48, 80, 128, 192]
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
  return `${(mb / 1024).toFixed(1)} gb`
}

export function formatContext(tokens: number): string {
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`
  }
  return `${tokens}`
}

export function getTotalVram(selectedModels: CatalogModel[]): number {
  return selectedModels.reduce((sum, m) => sum + m.vram.model + m.vram.overhead, 0)
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
  status?: string
  repo?: string
  vram: ModelVram
  kvCacheMbPer1kTokens?: number
  defaults?: { contextLength?: number }
  platform?: 'nvidia' | 'mlx'
  mlx?: { engine: string; repo: string; memoryMb: number }
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

  const models: CatalogModel[] = raw.models.map((m) => ({
    id: m.id,
    name: m.name.toLowerCase(),
    type: m.type,
    engine: m.engine,
    status: m.status ?? 'stable',
    repo: m.repo ?? m.id,
    vram: m.vram,
    kvCacheMbPer1kTokens: m.kvCacheMbPer1kTokens,
    contextLength: m.defaults?.contextLength,
    os: m.platform === 'mlx'
      ? (['mac'] as OsPlatform[])
      : (['linux', 'windows'] as OsPlatform[]),
    isDefault: (m as Record<string, unknown>).default === true,
    mlx: m.platform === 'mlx'
      ? { engine: m.engine, repo: m.repo ?? m.id, memoryMb: m.vram.model }
      : m.mlx && m.mlx.repo ? { engine: m.mlx.engine, repo: m.mlx.repo, memoryMb: m.mlx.memoryMb } : undefined,
  }))

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
