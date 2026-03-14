import type { OsPlatform } from './catalog'

export interface UrlState {
  os: OsPlatform | null
  llm: string | null
  image: string | null
  audio: string | null
  gpu: string | null
  vram: number | null
  ctx: number | null
}

const PARAM_KEYS = ['os', 'llm', 'image', 'audio', 'gpu', 'vram', 'ctx'] as const

const VALID_OS: Set<string> = new Set(['linux', 'windows', 'mac'])

/** Parse current URL search params into typed state */
export function parseUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)

  const osRaw = params.get('os')
  const os = osRaw && VALID_OS.has(osRaw) ? (osRaw as OsPlatform) : null

  const vramRaw = params.get('vram')
  const vram = vramRaw ? Number(vramRaw) : null

  const ctxRaw = params.get('ctx')
  const ctx = ctxRaw ? Number(ctxRaw) : null

  return {
    os,
    llm: params.get('llm'),
    image: params.get('image'),
    audio: params.get('audio'),
    gpu: params.get('gpu'),
    vram: vram && Number.isFinite(vram) ? vram : null,
    ctx: ctx && Number.isFinite(ctx) && ctx >= 16384 ? ctx : null,
  }
}

/** Update URL search params to reflect current state (no page reload) */
export function syncUrlState(state: UrlState): void {
  const params = new URLSearchParams()

  if (state.os) params.set('os', state.os)
  if (state.llm) params.set('llm', state.llm)
  if (state.image) params.set('image', state.image)
  if (state.audio) params.set('audio', state.audio)
  if (state.gpu) params.set('gpu', state.gpu)
  if (state.vram != null) params.set('vram', String(state.vram))
  if (state.ctx != null) params.set('ctx', String(state.ctx))

  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  history.replaceState(null, '', url)
}

/** Clear all URL params */
export function clearUrlState(): void {
  history.replaceState(null, '', window.location.pathname)
}
