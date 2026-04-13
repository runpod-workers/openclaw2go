import type { Platform } from './catalog'

export interface ModelParam {
  repo: string
  bits: number | null
}

export interface UrlState {
  platform: Platform | null
  llm: ModelParam | null
  image: ModelParam | null
  audio: ModelParam | null
  device: string | null
  deviceCount: number | null
  vram: number | null
  ctx: number | null
  agent: string | null
  hasState: boolean
}

const VALID_PLATFORMS: Set<string> = new Set(['linux', 'windows', 'mac', 'web'])

const MODEL_ROLES = ['llm', 'image', 'audio'] as const

function parseModelParam(params: URLSearchParams, role: string): ModelParam | null {
  const raw = params.get(role)
  if (!raw) return null
  const match = raw.match(/^(.+):(\d+)bit$/)
  if (match) return { repo: match[1], bits: Number(match[2]) }
  return { repo: raw, bits: null }
}

/** Parse current URL search params into typed state */
export function parseUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)

  const platformRaw = params.get('platform') ?? params.get('os')
  const platform = platformRaw && VALID_PLATFORMS.has(platformRaw) ? (platformRaw as Platform) : null

  const vramRaw = params.get('vram')
  const vram = vramRaw ? Number(vramRaw) : null

  const ctxRaw = params.get('ctx')
  const ctx = ctxRaw ? Number(ctxRaw) : null

  const deviceCountRaw = params.get('deviceCount')
  const deviceCount = deviceCountRaw ? Number(deviceCountRaw) : null

  const recognizedKeys = ['platform', 'os', 'llm', 'image', 'audio', 'device', 'deviceCount', 'vram', 'ctx', 'agent']
  const hasState = recognizedKeys.some((key) => params.has(key))

  return {
    platform,
    llm: parseModelParam(params, 'llm'),
    image: parseModelParam(params, 'image'),
    audio: parseModelParam(params, 'audio'),
    device: params.get('device'),
    deviceCount: deviceCount && Number.isInteger(deviceCount) && deviceCount >= 1 && deviceCount <= 8 ? deviceCount : null,
    vram: vram && Number.isFinite(vram) ? vram : null,
    ctx: ctx && Number.isFinite(ctx) && ctx >= 16384 ? ctx : null,
    agent: params.get('agent'),
    hasState,
  }
}

function syncModelParam(params: URLSearchParams, role: string, model: ModelParam | null): void {
  if (!model) return
  params.set(role, model.bits != null ? `${model.repo}:${model.bits}bit` : model.repo)
}

/** Update URL search params to reflect current state (no page reload) */
export function syncUrlState(state: UrlState): void {
  const params = new URLSearchParams()

  if (state.platform) params.set('platform', state.platform)
  for (const role of MODEL_ROLES) {
    syncModelParam(params, role, state[role])
  }
  if (state.device) params.set('device', state.device)
  if (state.deviceCount != null && state.deviceCount > 1) params.set('deviceCount', String(state.deviceCount))
  if (state.vram != null) params.set('vram', String(state.vram))
  if (state.ctx != null) params.set('ctx', String(state.ctx))
  if (state.agent) params.set('agent', state.agent)

  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  history.replaceState(null, '', url)
}

/** Clear all URL params */
export function clearUrlState(): void {
  history.replaceState(null, '', window.location.pathname)
}
