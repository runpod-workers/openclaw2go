import { useState, useMemo, useEffect } from 'react'
import { cn } from '../lib/utils'
import type { CatalogModel, OsPlatform } from '../lib/catalog'
import type { ModelGroup } from '../lib/group-models'

type DeployTab = 'docker' | 'mlx'

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
        "shrink-0 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all duration-150",
        copied
          ? "text-primary"
          : "bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground"
      )}
    >
      {copied ? "copied" : "copy"}
    </button>
  )
}

function CodeBlock({ code, hint }: { code: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <pre className="flex-1 overflow-x-auto font-mono text-[10px] leading-relaxed text-foreground/90">
          <code>{code}</code>
        </pre>
        <CopyButton text={code} />
      </div>
      {hint && (
        <span className="font-mono text-[9px] text-foreground/30">{hint}</span>
      )}
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

/** Resolve each selected model to its Linux/Windows variant for Docker */
function resolveDockerModels(
  selectedModels: CatalogModel[],
  allModels: CatalogModel[],
  modelIdToGroup: Map<string, ModelGroup>,
): CatalogModel[] {
  return selectedModels.map((m) => {
    if (m.os.includes('linux')) return m
    // Same ID, different OS variant
    const sameId = allModels.find((v) => v.id === m.id && v.os.includes('linux'))
    if (sameId) return sameId
    // Different ID, same group (e.g. mlx-only model → find its GGUF sibling)
    const group = modelIdToGroup.get(m.id)
    if (group) {
      const groupVariant = group.variants.find((v) => v.os.includes('linux'))
      if (groupVariant) return groupVariant.model
    }
    return m
  })
}

/** Resolve each selected model to its Mac variant (with mlx field) for MLX */
function resolveMlxModels(
  selectedModels: CatalogModel[],
  allModels: CatalogModel[],
  modelIdToGroup: Map<string, ModelGroup>,
): CatalogModel[] {
  return selectedModels.map((m) => {
    if (m.mlx) return m
    // Same ID, different OS variant
    const sameId = allModels.find((v) => v.id === m.id && v.mlx != null)
    if (sameId) return sameId
    // Different ID, same group (e.g. GGUF model → find its MLX sibling)
    const group = modelIdToGroup.get(m.id)
    if (group) {
      const groupVariant = group.variants.find((v) => v.model.mlx != null)
      if (groupVariant) return groupVariant.model
    }
    return m
  })
}

function buildDockerCommand(models: CatalogModel[]): string {
  const config: Record<string, string | boolean> = {}
  for (const m of models) {
    if (m.type === 'llm') {
      config.llm = m.isDefault ? true : m.repo
    } else if (m.type === 'audio') {
      config.audio = m.isDefault ? true : m.repo
    } else if (m.type === 'image') {
      config.image = m.isDefault ? true : m.repo
    }
  }

  const configStr = Object.keys(config).length > 0
    ? JSON.stringify(config)
    : '{}'

  return [
    'docker run --gpus all \\',
    `  -e OPENCLAW_CONFIG='${configStr}' \\`,
    '  -e OPENCLAW_WEB_PASSWORD=changeme \\',
    '  -e LLAMA_API_KEY=changeme \\',
    '  -p 8000:8000 -p 8080:8080 -p 18789:18789 \\',
    '  -v openclaw2go-models:/workspace \\',
    '  runpod/openclaw2go:latest',
  ].join('\n')
}

function buildMlxCommand(models: CatalogModel[]): { command: string; missing: string[] } {
  const missing: string[] = []

  const mlxModels = models.filter((m) => {
    if (!m.mlx) {
      missing.push(m.name)
      return false
    }
    return true
  })

  if (mlxModels.length === 0) {
    return { command: '', missing }
  }

  const sections: string[] = []

  // Venv setup
  sections.push(
    '# setup\npython3 -m venv ~/.openclaw2go/venv\nsource ~/.openclaw2go/venv/bin/activate'
  )

  // Group by engine to show pip installs
  const engines = new Set(mlxModels.map((m) => m.mlx!.engine))
  if (engines.size > 0) {
    sections.push(
      [...engines].map((e) => `pip install ${e}`).join('\n')
    )
  }

  for (const m of mlxModels) {
    const port = m.type === 'llm' ? 8000 : m.type === 'audio' ? 8001 : 8002
    if (m.mlx!.engine === 'mlx-lm') {
      sections.push(`# llm (run in separate terminal)\npython -m mlx_lm.server --model ${m.mlx!.repo} --host 0.0.0.0 --port ${port}`)
    } else if (m.mlx!.engine === 'mlx-audio') {
      sections.push(`# audio (run in separate terminal)\npython -m mlx_audio.server --host 0.0.0.0 --port ${port}`)
    } else if (m.mlx!.engine === 'mflux') {
      sections.push(`# image (one-shot generation)\nmflux-generate --prompt "your prompt" --model ${m.mlx!.repo} --steps 4`)
    }
  }

  return { command: sections.join('\n\n'), missing }
}

export default function DeployCard({
  selectedModels,
  allModels,
  modelIdToGroup,
  os,
}: {
  selectedModels: CatalogModel[]
  allModels: CatalogModel[]
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
    () => resolveDockerModels(selectedModels, allModels, modelIdToGroup),
    [selectedModels, allModels, modelIdToGroup]
  )

  const mlxResolvedModels = useMemo(
    () => resolveMlxModels(selectedModels, allModels, modelIdToGroup),
    [selectedModels, allModels, modelIdToGroup]
  )

  const docker = useMemo(() => buildDockerCommand(dockerModels), [dockerModels])

  const mlx = useMemo(() => buildMlxCommand(mlxResolvedModels), [mlxResolvedModels])

  const hasModels = selectedModels.length > 0

  return (
    <div className="flex flex-col" style={{ minHeight: '140px' }}>
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!hasModels && (
          <span className="font-mono text-[10px] text-foreground/30">
            select models above to generate deploy command
          </span>
        )}

        {hasModels && activeTab === 'docker' && (
          <CodeBlock
            code={docker}
            hint="requires nvidia gpu + nvidia-container-toolkit"
          />
        )}

        {hasModels && activeTab === 'mlx' && (
          <div className="flex flex-col gap-2">
            {mlx.command ? (
              <CodeBlock
                code={mlx.command}
                hint="requires apple silicon (m1+) and python 3.10+"
              />
            ) : (
              <span className="font-mono text-[10px] text-foreground/30">
                no mlx variant available for selected models
              </span>
            )}
            {mlx.missing.length > 0 && mlx.command && (
              <span className="font-mono text-[9px] text-foreground/30">
                no mlx variant: {mlx.missing.join(', ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
