import { useState, useMemo, useEffect } from 'react'
import { cn } from '../lib/utils'
import type { CatalogModel, OsPlatform } from '../lib/catalog'
import { getVariantForOs, type ModelGroup } from '../lib/group-models'
import { generateOpenClawConfig } from '../lib/openclaw-config'

type DeployTab = 'docker' | 'mlx'

const DOCKER_REQUIREMENTS = ['nvidia gpu', 'nvidia-container-toolkit', 'docker']
const MLX_REQUIREMENTS = ['apple silicon (m1+)', 'python 3.10+', 'pip']

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
        "shrink-0 rounded px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider transition-all duration-150",
        copied
          ? "text-primary"
          : "bg-foreground/[0.08] text-foreground/60 hover:bg-foreground/[0.12] hover:text-foreground"
      )}
    >
      {copied ? "copied" : "copy"}
    </button>
  )
}

function CodeBlock({ code, requirements }: { code: string; requirements: string[] }) {
  return (
    <div className="flex h-full gap-3">
      {/* Requirements column */}
      <div className="flex w-[140px] shrink-0 flex-col gap-1.5 py-1">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/30">
          requires
        </span>
        <ul className="flex flex-col gap-1">
          {requirements.map((req) => (
            <li key={req} className="flex items-start gap-1.5">
              <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-foreground/20" />
              <span className="font-mono text-[9px] leading-tight text-foreground/40">{req}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Code column */}
      <div className="relative flex min-w-0 flex-1 max-w-[620px] flex-col overflow-hidden rounded border border-foreground/[0.06] bg-[#080706]">
        <div className="absolute top-3 right-3 z-10">
          <CopyButton text={code} />
        </div>
        <div className="flex-1 overflow-auto p-3">
          <pre className="font-mono text-[10px] leading-relaxed text-foreground/90">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

function DockerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M9 3H7.5v1.5H9V3Zm0 2H7.5v1.5H9V5Zm-3 0H4.5v1.5H6V5Zm1.5 0v1.5h1.5V5H7.5ZM6 3H4.5v1.5H6V3Zm-3 2H1.5v1.5H3V5Zm12.3 2.3c-.4-.3-1.2-.4-1.8-.3-.2-1-.7-1.8-1.4-2.1l-.3-.2-.2.3c-.3.4-.4 1.1-.4 1.6 0 .5.1 1 .4 1.4-.6.3-1.5.4-1.8.4H.6c-.2 1 0 2.3.6 3.2.7 1 1.7 1.5 3.2 1.5 3 0 5.3-1.4 6.3-3.9.4 0 1.3 0 1.8-.9l.1-.2-.3-.2Z" />
    </svg>
  )
}

function MlxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM5.8 10.5 4 7l1.8-3.5h.9L5.2 6.2h2.3L6.2 10.5h-.4Zm4.4 0L8.5 6.2h-1l1.8-2.7h.9L8.8 6.2h2.3L9.8 10.5h-.4Z" />
    </svg>
  )
}

const TAB_CONFIG: { id: DeployTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'docker', label: 'docker', Icon: DockerIcon },
  { id: 'mlx', label: 'mlx', Icon: MlxIcon },
]

function isTabVisible(tab: DeployTab, os: OsPlatform | null): boolean {
  if (tab === 'docker') return os !== 'mac'
  if (tab === 'mlx') return os !== 'linux' && os !== 'windows'
  return true
}

function buildDockerCommand(models: CatalogModel[]): string {
  const config: Record<string, string> = {}
  for (const m of models) {
    if (m.type === 'llm') {
      config.llm = m.repo
    } else if (m.type === 'audio') {
      config.audio = m.repo
    } else if (m.type === 'image') {
      config.image = m.repo
    }
  }

  const configStr = Object.keys(config).length > 0
    ? JSON.stringify(config)
    : '{}'

  return [
    'docker run --gpus all \\',
    `  -e OPENCLAW2GO_CONFIG='${configStr}' \\`,
    '  -e OPENCLAW_WEB_PASSWORD=changeme \\',
    '  -e LLAMA_API_KEY=changeme \\',
    '  -p 8000:8000 -p 8080:8080 -p 18789:18789 \\',
    '  -v openclaw2go-models:/workspace \\',
    '  runpod/openclaw2go:latest',
  ].join('\n')
}

function buildMlxCommand(models: CatalogModel[]): { command: string; config: string; missing: string[] } {
  const missing: string[] = []

  const mlxModels = models.filter((m) => {
    if (!m.os.includes('mac')) {
      missing.push(m.name)
      return false
    }
    return true
  })

  if (mlxModels.length === 0) {
    return { command: '', config: '', missing }
  }

  const sections: string[] = []

  // Venv setup
  sections.push(
    '# setup\npython3 -m venv ~/.openclaw2go/venv\nsource ~/.openclaw2go/venv/bin/activate'
  )

  // Group by engine to show pip installs
  const engines = new Set(mlxModels.map((m) => m.engine))
  if (engines.size > 0) {
    sections.push(
      [...engines].map((e) => `pip install ${e}`).join('\n')
    )
  }

  for (const m of mlxModels) {
    const port = m.type === 'llm' ? 8000 : m.type === 'audio' ? 8001 : 8002
    if (m.engine === 'mlx-lm') {
      sections.push(`# llm (run in separate terminal)\npython -m mlx_lm.server --model ${m.repo} --host 0.0.0.0 --port ${port}`)
    } else if (m.engine === 'mlx-audio') {
      sections.push(`# audio (run in separate terminal)\npython -m mlx_audio.server --host 0.0.0.0 --port ${port}`)
    } else if (m.engine === 'mflux') {
      sections.push(`# image (one-shot generation)\nmflux-generate --prompt "your prompt" --model ${m.repo} --steps 4`)
    }
  }

  // Generate openclaw.json config
  const config = buildMlxConfig(mlxModels)

  return { command: sections.join('\n\n'), config, missing }
}

function buildMlxConfig(models: CatalogModel[]): string {
  const llm = models.find((m) => m.type === 'llm')
  if (!llm) return ''

  const config = generateOpenClawConfig({
    provider: 'mlx-local',
    baseUrl: 'http://localhost:8000/v1',
    apiKey: 'local',
    modelId: llm.repo.split('/').pop() ?? llm.repo,
    modelName: llm.name,
    contextWindow: llm.contextLength ?? 32768,
    hasVision: llm.hasVision,
    authToken: 'changeme',
  })

  return JSON.stringify(config, null, 2)
}

export default function DeployCard({
  selectedModels,
  modelIdToGroup,
  os,
}: {
  selectedModels: CatalogModel[]
  modelIdToGroup: Map<string, ModelGroup>
  os: OsPlatform | null
}) {
  const [activeTab, setActiveTab] = useState<DeployTab>('docker')

  const visibleTabs = useMemo(
    () => TAB_CONFIG.filter((t) => isTabVisible(t.id, os)),
    [os]
  )

  // Reset to first visible tab when active tab becomes hidden
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'docker')
    }
  }, [visibleTabs, activeTab])

  const dockerModels = useMemo(
    () => selectedModels.map((m) => {
      const group = modelIdToGroup.get(m.id)
      return group ? getVariantForOs(group, 'linux').model : m
    }),
    [selectedModels, modelIdToGroup]
  )

  const mlxResolvedModels = useMemo(
    () => selectedModels.map((m) => {
      const group = modelIdToGroup.get(m.id)
      return group ? getVariantForOs(group, 'mac').model : m
    }),
    [selectedModels, modelIdToGroup]
  )

  const docker = useMemo(() => buildDockerCommand(dockerModels), [dockerModels])

  const mlx = useMemo(() => buildMlxCommand(mlxResolvedModels), [mlxResolvedModels])

  const hasModels = selectedModels.length > 0

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1">
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all duration-150",
              activeTab === id
                ? "bg-foreground/[0.08] text-foreground/90"
                : "text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03]"
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content — content-driven height */}
      <div className="flex min-h-[120px] flex-col">
        {!hasModels && (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-[10px] text-foreground/30">
              select models above to generate deploy command
            </span>
          </div>
        )}

        {hasModels && activeTab === 'docker' && (
          <div className="flex-1 min-h-0 p-3">
            <CodeBlock code={docker} requirements={DOCKER_REQUIREMENTS} />
          </div>
        )}

        {hasModels && activeTab === 'mlx' && (
          <div className="flex flex-1 min-h-0 flex-col p-3 gap-4">
            {mlx.command ? (
              <>
                <div className="flex-1 min-h-0">
                  <CodeBlock code={mlx.command} requirements={MLX_REQUIREMENTS} />
                </div>
                {mlx.config && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/30">
                        openclaw config
                      </span>
                      <span className="font-mono text-[8px] text-foreground/20">
                        save as ~/.openclaw/openclaw.json
                      </span>
                    </div>
                    <div className="relative flex min-w-0 max-w-[620px] flex-col overflow-hidden rounded border border-foreground/[0.06] bg-[#080706]">
                      <div className="absolute top-3 right-3 z-10">
                        <CopyButton text={mlx.config} />
                      </div>
                      <div className="overflow-auto p-3">
                        <pre className="font-mono text-[10px] leading-relaxed text-foreground/90">
                          <code>{mlx.config}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
                {mlx.missing.length > 0 && (
                  <span className="shrink-0 font-mono text-[9px] text-foreground/30">
                    no mlx variant: {mlx.missing.join(', ')}
                  </span>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <span className="font-mono text-[10px] text-foreground/30">
                  no mlx variant available for selected models
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
