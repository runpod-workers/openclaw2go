export interface AgentFramework {
  id: string
  name: string
  description: string
  available: boolean
  docsUrl?: string
  securityUrl?: string
}

export const FRAMEWORKS: AgentFramework[] = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Full-featured AI agent with tool use, MCP, and web UI',
    available: true,
    docsUrl: 'https://docs.openclaw.ai/getting-started',
    securityUrl: 'https://trust.openclaw.ai',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    description: '40+ tools, deep memory, 200+ models via OpenRouter',
    available: false,
  },
  {
    id: 'nanoclaw',
    name: 'NanoClaw',
    description: 'Security-focused agent in sandboxed containers',
    available: false,
  },
]

export const DEFAULT_FRAMEWORK = FRAMEWORKS[0]
