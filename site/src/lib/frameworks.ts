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
    available: true,
    docsUrl: 'https://hermes-agent.nousresearch.com/docs',
  },
]

export const SUGGEST_AGENT_URL =
  'https://github.com/runpod-labs/a2go/issues/new?template=agent-request.yml'

export const DEFAULT_FRAMEWORK = FRAMEWORKS[0]
