import type { Engine, Platform } from './catalog'
import { DEFAULT_FRAMEWORK } from './frameworks'

export interface PlatformDraft {
  selectedModelIds: string[]
  selectedDeviceId: string | null
  deviceCount: number
  selectedVramGb: number | null
  contextOverride: number | null
  frameworkId: string
  /** Active engine filters (null = all engines shown) */
  engineFilter: Engine[] | null
}

export type PlatformDrafts = Record<Platform, PlatformDraft>

export interface PersistedPlatformState {
  version: 1
  activePlatform: Platform | null
  drafts: PlatformDrafts
}

export const PLATFORM_STATE_STORAGE_KEY = 'a2go.platform-state.v1'
export const DEFAULT_PLATFORM: Platform = 'linux'

export function createEmptyPlatformDraft(frameworkId: string = DEFAULT_FRAMEWORK.id): PlatformDraft {
  return {
    selectedModelIds: [],
    selectedDeviceId: null,
    deviceCount: 1,
    selectedVramGb: null,
    contextOverride: null,
    frameworkId,
    engineFilter: null,
  }
}

export function createDefaultPlatformDrafts(frameworkId: string = DEFAULT_FRAMEWORK.id): PlatformDrafts {
  return {
    mac: createEmptyPlatformDraft(frameworkId),
    linux: createEmptyPlatformDraft(frameworkId),
    windows: createEmptyPlatformDraft(frameworkId),
  }
}

function isPlatformDraft(value: unknown): value is PlatformDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return Array.isArray(draft.selectedModelIds)
    && (typeof draft.selectedDeviceId === 'string' || draft.selectedDeviceId === null)
    && typeof draft.deviceCount === 'number'
    && (typeof draft.selectedVramGb === 'number' || draft.selectedVramGb === null)
    && (typeof draft.contextOverride === 'number' || draft.contextOverride === null)
    && typeof draft.frameworkId === 'string'
}

export function loadPlatformState(): PersistedPlatformState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(PLATFORM_STATE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedPlatformState>
    if (parsed.version !== 1) return null
    if (parsed.activePlatform !== null && parsed.activePlatform !== undefined && !['mac', 'linux', 'windows'].includes(parsed.activePlatform)) return null
    if (!parsed.drafts || typeof parsed.drafts !== 'object') return null

    const drafts = parsed.drafts as Partial<PlatformDrafts>
    if (!isPlatformDraft(drafts.mac) || !isPlatformDraft(drafts.linux) || !isPlatformDraft(drafts.windows)) {
      return null
    }

    return {
      version: 1,
      activePlatform: parsed.activePlatform ?? null,
      drafts: {
        mac: drafts.mac,
        linux: drafts.linux,
        windows: drafts.windows,
      },
    }
  } catch {
    return null
  }
}

export function savePlatformState(state: PersistedPlatformState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(PLATFORM_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota and serialization failures so the UI remains usable.
  }
}
