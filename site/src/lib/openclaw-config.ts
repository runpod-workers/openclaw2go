/**
 * Single source of truth for generating openclaw.json configs.
 *
 * Used by:
 * - Site (MLX deploy tab) — generates config for macOS users
 * - CI (validate-openclaw-config.mjs) — validates against `openclaw doctor`
 * - Reference for entrypoint-unified.sh (Docker adds channels, skills, plugins on top)
 */

export interface OpenClawConfigInput {
  provider: string
  baseUrl: string
  apiKey: string
  modelId: string
  modelName: string
  contextWindow: number
  hasVision: boolean
  authToken: string
  allowedOrigins?: string[]
  dangerouslyDisableDeviceAuth?: boolean
  workspace?: string
}

export function generateOpenClawConfig(input: OpenClawConfigInput): Record<string, unknown> {
  const contextTokens = Math.min(input.contextWindow, 135000)

  return {
    models: {
      providers: {
        [input.provider]: {
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          api: 'openai-completions',
          models: [{
            id: input.modelId,
            name: input.modelName,
            contextWindow: input.contextWindow,
            maxTokens: 8192,
            reasoning: false,
            input: input.hasVision ? ['text', 'image'] : ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          }],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: `${input.provider}/${input.modelId}` },
        contextTokens,
        ...(input.workspace ? { workspace: input.workspace } : {}),
      },
    },
    gateway: {
      mode: 'local',
      bind: 'lan',
      controlUi: {
        allowedOrigins: input.allowedOrigins ?? [],
        dangerouslyDisableDeviceAuth: input.dangerouslyDisableDeviceAuth ?? false,
      },
      auth: { mode: 'token', token: input.authToken },
      remote: { token: input.authToken },
    },
    logging: { level: 'info' },
  }
}
