export interface ModelVram {
  model: number
  overhead: number
}

export const PLATFORMS = ['mac', 'linux', 'windows'] as const
export type Platform = (typeof PLATFORMS)[number]
export type OsPlatform = Platform

export interface CatalogModel {
  id: string
  group: string
  family: string
  catalogKey: string
  name: string
  size: string
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
  os: Platform[]
  engineCategory: Engine
  isDefault: boolean
  hasVision: boolean
  capabilities?: string[]
}

export interface DeviceInfo {
  id: string
  name: string
  vramMb: number
  os: Platform[]
}

const MAC_DEVICES: DeviceInfo[] = [
  { id: 'apple-m4-16gb', name: 'm4 16gb', vramMb: 16384, os: ['mac'] },
  { id: 'apple-m3-pro-18gb', name: 'm3 pro', vramMb: 18432, os: ['mac'] },
  { id: 'apple-m4-24gb', name: 'm4 24gb', vramMb: 24576, os: ['mac'] },
  { id: 'apple-m4-pro-24gb', name: 'm4 pro 24gb', vramMb: 24576, os: ['mac'] },
  { id: 'apple-m4-32gb', name: 'm4 32gb', vramMb: 32768, os: ['mac'] },
  { id: 'apple-m4-pro-48gb', name: 'm4 pro 48gb', vramMb: 49152, os: ['mac'] },
  { id: 'apple-m4-max-128gb', name: 'm4 max', vramMb: 131072, os: ['mac'] },
  { id: 'apple-m4-ultra-256gb', name: 'm4 ultra', vramMb: 262144, os: ['mac'] },
]

/** User-facing inference engine categories */
export const ENGINES = ['llamacpp', 'mlx', 'wandler'] as const
export type Engine = (typeof ENGINES)[number]

export const ENGINE_META: Record<Engine, { label: string; description: string; os: Platform[] }> = {
  'llamacpp': { label: 'llama.cpp', description: 'NVIDIA GPU (CUDA)', os: ['linux', 'windows'] },
  'mlx': { label: 'MLX', description: 'Apple Silicon', os: ['mac'] },
  'wandler': { label: 'wandler', description: 'Any GPU (WebGPU)', os: ['mac', 'linux', 'windows'] },
}

/** Map raw model engine strings to user-facing engine categories */
export function resolveEngine(rawEngine: string): Engine {
  if (rawEngine === 'mlx' || rawEngine === 'mlx-lm' || rawEngine === 'mlx-audio') return 'mlx'
  if (rawEngine === 'wandler' || rawEngine === 'onnx') return 'wandler'
  return 'llamacpp' // llamacpp, a2go-llamacpp, a2go-media, image-gen, etc.
}

/** Get engines available on a given platform (null = all engines) */
export function getEnginesForPlatform(platform: Platform | null): Engine[] {
  if (!platform) return [...ENGINES]
  return ENGINES.filter((e) => ENGINE_META[e].os.includes(platform))
}

export const VRAM_PRESETS = [8, 16, 24, 32, 48, 80, 128, 141, 192, 256, 288, 384, 512]
export const DEVICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type DeviceCount = (typeof DEVICE_COUNTS)[number]

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
  if (gb >= 1000) {
    const tb = gb / 1024
    return `${tb % 1 === 0 ? tb.toFixed(0) : tb.toFixed(1)} tb`
  }
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

export function getDevicesForOs(os: OsPlatform | null, allDevices: DeviceInfo[]): DeviceInfo[] {
  if (!os) return allDevices
  return allDevices.filter((g) => g.os.includes(os))
}

interface RawModel {
  id: string
  group: string
  family: string
  catalogKey: string
  name: string
  size?: string
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
  platform?: string
  platforms?: Platform[]
  [key: string]: unknown
}

interface RawDevice {
  id: string
  name: string
  vramMb: number
  [key: string]: unknown
}

interface RawCatalog {
  models: RawModel[]
  gpus: RawDevice[]
}

function resolveModelPlatforms(model: RawModel): Platform[] {
  const declared = Array.isArray(model.platforms)
    ? model.platforms.filter((platform): platform is Platform => PLATFORMS.includes(platform))
    : []
  if (declared.length > 0) return declared

  switch (model.platform) {
    case 'mlx':
    case 'mac':
      return ['mac']
    case 'linux':
      return ['linux']
    case 'windows':
      return ['windows']
    case 'nvidia':
    default:
      return ['linux', 'windows']
  }
}

export async function fetchCatalog(): Promise<{ models: CatalogModel[]; devices: DeviceInfo[] }> {
  const res = await fetch(`${import.meta.env.BASE_URL}v1/catalog.json`)
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`)
  const raw: RawCatalog = await res.json()

  const models: CatalogModel[] = raw.models.flatMap((m) => {
    const hasVision = typeof m.mmproj === 'string' && m.mmproj.length > 0

    const entry: CatalogModel = {
      id: m.id,
      group: m.group,
      family: m.family,
      catalogKey: m.catalogKey,
      name: m.name.toLowerCase(),
      size: m.size ?? '',
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
      os: resolveModelPlatforms(m),
      engineCategory: resolveEngine(m.engine),
      isDefault: (m as Record<string, unknown>).default === true,
      hasVision,
      capabilities: m.capabilities,
    }

    return [entry]
  })

  const devices: DeviceInfo[] = [
    ...raw.gpus.map((g) => ({
      id: g.id,
      name: g.name.replace('NVIDIA ', '').replace(/^RTX\s+/i, '').replace(/\s+\d+GB$/i, '').toLowerCase(),
      vramMb: g.vramMb,
      os: ['linux', 'windows'] as OsPlatform[],
    })),
    ...MAC_DEVICES,
  ]

  devices.sort((a, b) => a.vramMb - b.vramMb)

  return { models, devices }
}
