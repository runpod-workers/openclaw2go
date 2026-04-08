import { useState, useMemo, useEffect } from 'react'
import { cn } from '../lib/utils'
import { formatVram, type CatalogModel, type OsPlatform } from '../lib/catalog'
import { getVariantForOs, findSiblingsWithOs, type ModelGroup } from '../lib/group-models'
import type { AgentFramework } from '../lib/frameworks'
import { PlatformIcon } from './PlatformSelector'
import { TriangleAlert } from 'lucide-react'
import { FaCloud } from 'react-icons/fa'

type DeployTab = 'linux' | 'windows' | 'mac' | 'cloud'

const LINUX_REQUIREMENTS: { label: string; href?: string }[] = [
  { label: 'nvidia gpu' },
  { label: 'docker', href: 'https://docs.docker.com/get-started/get-docker/' },
  { label: 'nvidia-container-toolkit', href: 'https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html' },
]
const WINDOWS_REQUIREMENTS: { label: string; href?: string }[] = [
  { label: 'nvidia gpu' },
  { label: 'docker desktop (wsl2)', href: 'https://docs.docker.com/desktop/setup/install/windows-install/' },
  { label: 'nvidia-container-toolkit', href: 'https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html' },
]
const MAC_REQUIREMENTS = [
  'apple silicon (m1+)',
]

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

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-foreground/10 font-mono text-[9px] font-bold text-foreground/40">
      {n}
    </span>
  )
}


function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] leading-tight text-foreground/40">{children}</span>
  )
}

function InlineCodeBlock({ code }: { code: string }) {
  return (
    <div className="relative flex flex-col overflow-clip rounded border border-foreground/[0.06] bg-[#080706]">
      <div className="absolute top-2 right-2 z-10">
        <CopyButton text={code} />
      </div>
      <div className="overflow-x-auto p-3 pr-16">
        <pre className="whitespace-pre font-mono text-[10px] leading-relaxed text-foreground/90">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}

export function CodeBlock({ code, requirements }: { code: string; requirements: string[] }) {
  return (
    <div className="flex h-full flex-col sm:flex-row gap-3">
      {/* Requirements column */}
      <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
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
      <div className="relative flex min-w-0 flex-1 max-w-full sm:max-w-[620px] flex-col overflow-clip rounded border border-foreground/[0.06] bg-[#080706]">
        <div className="absolute top-3 right-3 z-10">
          <CopyButton text={code} />
        </div>
        <div className="flex-1 overflow-x-auto p-3">
          <pre className="whitespace-pre font-mono text-[10px] leading-relaxed text-foreground/90">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

const TAB_CONFIG: { id: DeployTab; label: string; os: OsPlatform | null }[] = [
  { id: 'linux', label: 'linux', os: 'linux' },
  { id: 'windows', label: 'windows', os: 'windows' },
  { id: 'mac', label: 'mac', os: 'mac' },
  { id: 'cloud', label: 'cloud', os: null },
]

function isTabVisible(tab: DeployTab, os: OsPlatform | null): boolean {
  if (os === null) return true
  if (tab === 'cloud') return os !== 'mac'
  if (tab === 'linux') return os === 'linux'
  if (tab === 'windows') return os === 'windows'
  if (tab === 'mac') return os === 'mac'
  return true
}

function buildCliCommand(
  models: CatalogModel[],
  platform: 'linux' | 'windows' | 'mac',
  agentId: string,
  contextOverride?: number | null,
): { install: string; doctor: string; run: string } {
  const install = platform === 'windows'
    ? 'irm https://a2go.run/install.ps1 | iex'
    : 'curl -sSL https://a2go.run/install.sh | bash'

  const doctor = 'a2go doctor'

  const flags: string[] = [`--agent ${agentId}`]
  for (const m of models) {
    const role = m.type === 'llm' ? 'llm' : m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : null
    if (!role) continue
    flags.push(`--${role} ${m.bits != null ? `${m.repo}:${m.bits}bit` : m.repo}`)
  }

  if (contextOverride != null) {
    flags.push(`--context ${contextOverride}`)
  }

  const run = flags.length > 0
    ? `a2go run ${flags.join(' ')}`
    : 'a2go run --llm <model>'

  return { install, doctor, run }
}

function RequirementsList({ requirements }: { requirements: { label: string; href?: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {requirements.map((req) => (
        <li key={req.label} className="flex items-start gap-1.5">
          <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
          {req.href ? (
            <a
              href={req.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] leading-tight text-foreground/90 underline decoration-foreground/20 underline-offset-2 transition-colors hover:decoration-foreground/50"
            >
              {req.label}
            </a>
          ) : (
            <span className="font-mono text-[9px] leading-tight text-foreground/90">{req.label}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function buildCloudConfig(
  models: CatalogModel[],
  agentId: string,
  contextOverride?: number | null,
): { image: string; envVars: { key: string; value: string }[]; ports: { port: string; protocol: string; service: string; note: string | null }[] } {
  const configParts: Record<string, string | number> = { agent: agentId }
  for (const m of models) {
    const role = m.type === 'llm' ? 'llm' : m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : null
    if (!role) continue
    configParts[role] = m.bits != null ? `${m.repo}:${m.bits}bit` : m.repo
  }
  if (contextOverride != null) {
    configParts['contextLength'] = contextOverride
  }

  const configJSON = Object.keys(configParts).length > 0
    ? JSON.stringify(configParts)
    : '{"llm":"<repo>:<bits>bit"}'

  return {
    image: 'runpod/a2go:latest',
    envVars: [
      { key: 'A2GO_CONFIG', value: configJSON },
      { key: 'A2GO_AUTH_TOKEN', value: 'changeme' },
      { key: 'LLAMACPP_API_KEY', value: 'changeme' },
    ],
    ports: [
      agentId === 'hermes'
        ? { port: '8642', protocol: 'http', service: 'Hermes Gateway', note: null }
        : { port: '18789', protocol: 'http', service: 'OpenClaw', note: null },
      { port: '8080', protocol: 'http', service: 'Media proxy', note: 'required for image gen, TTS, and web UI' },
      { port: '8000', protocol: 'http', service: 'LLM API', note: 'optional — direct model access + llama.cpp chat UI' },
    ],
  }
}

type CloudConfig = ReturnType<typeof buildCloudConfig>

function CloudConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px]">
        {children}
      </div>
    </div>
  )
}

function CloudSteps({ config }: { config: CloudConfig }) {
  return (
    <>
      <CloudConfigRow label="image">
        <InlineCodeBlock code={config.image} />
      </CloudConfigRow>

      <CloudConfigRow label="env vars">
        <InlineCodeBlock code={config.envVars.map((env) => `${env.key}=${env.value}`).join('\n')} />
      </CloudConfigRow>

      <CloudConfigRow label="ports">
        <div className="flex flex-col gap-1.5">
          {config.ports.map((p) => (
            <div key={p.port} className="flex items-center gap-2">
              <span className="rounded border border-foreground/[0.06] bg-[#080706] px-2 py-0.5 font-mono text-[10px] text-foreground/90 w-[52px] text-center">
                {p.port}
              </span>
              <span className="font-mono text-[9px] uppercase text-foreground/30">{p.protocol}</span>
              <span className="font-mono text-[9px] text-foreground/50">{p.service}</span>
              {p.note && <span className="font-mono text-[8px] text-foreground/25">{p.note}</span>}
            </div>
          ))}
        </div>
      </CloudConfigRow>

    </>
  )
}

function HelpRow() {
  return (
    <div className="flex flex-col sm:flex-row gap-3 border-t border-dashed border-foreground/[0.06] pt-4">
      <div className="flex w-full sm:w-[140px] shrink-0 items-start py-1">
        <div className="flex items-center gap-2">
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-foreground/[0.06] font-mono text-[9px] text-foreground/25">
            ?
          </span>
          <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/25">
            help
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] py-1">
        <a
          href="https://github.com/runpod-labs/a2go/blob/main/docs/troubleshooting-mlx.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[9px] text-foreground/35 transition-colors hover:text-foreground/60"
        >
          <span>troubleshooting guide</span>
          <span className="text-foreground/15">&#8599;</span>
        </a>
      </div>
    </div>
  )
}

function CliSteps({
  cli,
  requirements,
  setupNote,
  showHelp,
}: {
  cli: { install: string; doctor: string; run: string }
  requirements: { label: string; href?: string }[]
  setupNote: string
  showHelp?: boolean
}) {
  return (
    <>
      {/* Step 1: Prerequisites */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={1} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              prerequisites
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px]">
          <RequirementsList requirements={requirements} />
        </div>
      </div>

      {/* Step 2: Install CLI */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={2} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              install cli
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] flex flex-col gap-2">
          <InlineCodeBlock code={cli.install} />
        </div>
      </div>

      {/* Step 3: Setup (one-time) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={3} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              setup
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] flex flex-col gap-2">
          <InlineCodeBlock code={cli.doctor} />
          <InfoNote>{setupNote}</InfoNote>
        </div>
      </div>

      {/* Step 4: Run */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={4} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              run
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] flex flex-col gap-2">
          <InlineCodeBlock code={cli.run} />
          <InfoNote>first run downloads the model — use <code className="text-foreground/80">a2go status</code> to check progress</InfoNote>
        </div>
      </div>

      {/* Step 5: Stop */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={5} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              stop
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] flex flex-col gap-2">
          <InlineCodeBlock code="a2go stop" />
          <InfoNote>shuts down all running services and containers</InfoNote>
        </div>
      </div>

      {/* Step 6: More commands */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
          <div className="flex items-center gap-2">
            <StepNumber n={6} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-foreground/40">
              more commands
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px] flex flex-col gap-2">
          <InlineCodeBlock code="a2go --help" />
          <InfoNote>see all available commands — status, logs, update, and more</InfoNote>
        </div>
      </div>

      {showHelp && <HelpRow />}
    </>
  )
}

export default function DeployCard({
  selectedModels,
  modelIdToGroup,
  globalOs,
  contextOverride,
  onToggle,
  framework,
}: {
  selectedModels: CatalogModel[]
  modelIdToGroup: Map<string, ModelGroup>
  globalOs: OsPlatform | null
  contextOverride: number | null
  onToggle?: (model: CatalogModel) => void
  framework: AgentFramework
}) {
  const [activeTab, setActiveTab] = useState<DeployTab>('linux')

  // Only filter tabs when the global OS filter (top-level buttons) is active.
  // Model card platform tabs (sharedOs) should NOT hide deploy tabs.
  const visibleTabs = useMemo(
    () => TAB_CONFIG.filter((t) => isTabVisible(t.id, globalOs)),
    [globalOs]
  )

  // Reset to first visible tab when active tab becomes hidden
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'linux')
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

  // Linux/Windows use docker model slugs
  const linuxCli = useMemo(
    () => buildCliCommand(dockerModels, 'linux', framework.id, contextOverride),
    [dockerModels, framework.id, contextOverride]
  )
  const windowsCli = useMemo(
    () => buildCliCommand(dockerModels, 'windows', framework.id, contextOverride),
    [dockerModels, framework.id, contextOverride]
  )

  // Mac: filter to mac-available models, track missing
  const macCli = useMemo(() => {
    const missing: string[] = []
    const available: CatalogModel[] = []
    for (let i = 0; i < mlxResolvedModels.length; i++) {
      if (!mlxResolvedModels[i].os.includes('mac')) {
        missing.push(mlxResolvedModels[i].name)
      } else {
        available.push(dockerModels[i])
      }
    }
    const cli = buildCliCommand(available, 'mac', framework.id, contextOverride)
    return { ...cli, missing }
  }, [mlxResolvedModels, dockerModels, framework.id, contextOverride])

  // Find alternatives for models without Mac variants
  const macAlternatives = useMemo(() => {
    const allGroups = [...new Map([...modelIdToGroup.values()].map((g) => [g.key, g])).values()]
    const result: { model: CatalogModel; siblings: ModelGroup[] }[] = []
    for (const m of selectedModels) {
      const group = modelIdToGroup.get(m.id)
      if (!group) continue
      if (group.variants.some((v) => v.os.includes('mac'))) continue
      const siblings = findSiblingsWithOs(group, allGroups, 'mac')
      if (siblings.length > 0) {
        result.push({ model: m, siblings })
      }
    }
    return result
  }, [selectedModels, modelIdToGroup])

  const cloudConfig = useMemo(
    () => buildCloudConfig(dockerModels, framework.id, contextOverride),
    [dockerModels, framework.id, contextOverride]
  )

  const hasModels = selectedModels.length > 0

  if (!framework.available) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <span className="font-mono text-[11px] font-medium text-foreground/50">
          {framework.name}
        </span>
        <span className="font-mono text-[10px] text-foreground/25">
          Deploy instructions coming soon
        </span>
        <span className="mt-2 rounded border border-foreground/[0.06] px-3 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-foreground/20">
          in development
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1">
        {visibleTabs.map(({ id, label, os: tabOs }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 h-8 font-mono text-[10px] uppercase tracking-wider transition-all",
              activeTab === id
                ? "text-foreground/80 bg-foreground/[0.08]"
                : "text-foreground/30 hover:text-foreground/50"
            )}
          >
            {tabOs ? (
              <PlatformIcon os={tabOs} className="h-3.5 w-3.5" />
            ) : (
              <FaCloud className="h-3.5 w-3.5" />
            )}
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

        {hasModels && activeTab === 'linux' && (
          <div className="flex flex-1 min-h-0 flex-col p-3 gap-5">
            <CliSteps
              cli={linuxCli}
              requirements={LINUX_REQUIREMENTS}
              setupNote="only needed once — checks prerequisites and pulls docker image"
            />
          </div>
        )}

        {hasModels && activeTab === 'windows' && (
          <div className="flex flex-1 min-h-0 flex-col p-3 gap-5">
            <CliSteps
              cli={windowsCli}
              requirements={WINDOWS_REQUIREMENTS}
              setupNote="only needed once — checks prerequisites and pulls docker image"
            />
          </div>
        )}

        {hasModels && activeTab === 'mac' && (
          <div className="flex flex-1 min-h-0 flex-col p-3 gap-5">
            {macCli.install ? (
              <>
                {macCli.missing.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex w-full sm:w-[140px] shrink-0 flex-col gap-1.5 py-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-primary/30 text-primary">
                          <TriangleAlert size={10} />
                        </span>
                        <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-primary/70">
                          excluded
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 max-w-full sm:max-w-[620px]">
                      <div className="rounded border border-primary/20 bg-primary/[0.06] px-3 py-2.5 flex flex-col gap-2.5">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] font-bold text-primary/90">
                            no mac variant for: {macCli.missing.join(', ')}
                          </span>
                          <span className="font-mono text-[9px] leading-relaxed text-foreground/50">
                            {macCli.missing.length === 1 ? 'this model is' : 'these models are'} not included in the mac setup below — only linux/windows variants exist for {macCli.missing.length === 1 ? 'it' : 'them'}
                          </span>
                        </div>
                        {macAlternatives.length > 0 && (
                          <div className="flex flex-col gap-2 border-t border-primary/10 pt-2.5">
                            {macAlternatives.map(({ model, siblings }) => (
                              <div key={model.id} className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/30">
                                  switch to
                                </span>
                                {siblings.map((s) => {
                                  const macV = s.variants.find((v) => v.os.includes('mac'))
                                  if (!macV) return null
                                  return (
                                    <button
                                      key={s.key}
                                      onClick={() => {
                                        if (!onToggle) return
                                        const variant = s.variants.find((v) => v.os.includes('linux')) ?? macV
                                        onToggle(model)
                                        onToggle(variant.model)
                                      }}
                                      className="font-mono text-[10px] px-2.5 py-1 border border-primary/20 text-primary/80 hover:text-primary hover:border-primary/40 hover:bg-primary/[0.06] transition-colors"
                                    >
                                      {s.displayName} · {macV.shortLabel} · {formatVram(macV.vramTotal)}
                                    </button>
                                  )
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <CliSteps
                  cli={macCli}
                  requirements={MAC_REQUIREMENTS.map((r) => ({ label: r }))}
                  setupNote="only needed once — checks prerequisites, installs python packages and agent framework"
                  showHelp
                />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
                <span className="font-mono text-[10px] text-foreground/30">
                  no mac variant available for selected models
                </span>
                {macAlternatives.map(({ model, siblings }) => (
                  <div key={model.id} className="flex flex-col items-center gap-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/25">
                      available as
                    </span>
                    <div className="flex flex-wrap justify-center gap-2">
                      {siblings.map((s) => {
                        const macV = s.variants.find((v) => v.os.includes('mac'))
                        if (!macV) return null
                        return (
                          <button
                            key={s.key}
                            onClick={() => {
                              if (!onToggle) return
                              const variant = s.variants.find((v) => v.os.includes('linux')) ?? macV
                              onToggle(model)
                              onToggle(variant.model)
                            }}
                            className="font-mono text-[11px] px-3 py-1.5 border border-foreground/10 text-foreground/60 hover:text-foreground/90 hover:border-foreground/30 transition-colors"
                          >
                            {s.displayName} · {macV.shortLabel} · {formatVram(macV.vramTotal)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {hasModels && activeTab === 'cloud' && (
          <div className="flex flex-1 min-h-0 flex-col p-3 gap-5">
            <CloudSteps config={cloudConfig} />
          </div>
        )}
      </div>
    </div>
  )
}
