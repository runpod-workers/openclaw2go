import type { AgentFramework } from '../lib/frameworks'

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4.5 11.5 11 5m0 0H5.5m5.5 0v5.5" />
    </svg>
  )
}

export default function SecurityGuide({ framework }: { framework: AgentFramework }) {
  const hasLinks = framework.docsUrl || framework.securityUrl

  return (
    <div className="flex flex-col gap-4">
      {/* Intro text */}
      <p className="font-mono text-[11px] leading-relaxed text-foreground/80">
        {framework.available
          ? `${framework.name} agents can execute shell commands, read and write files, and fetch arbitrary URLs on your machine. Review the security guide before you start.`
          : 'AI agents can execute shell commands, read and write files, and fetch arbitrary URLs on your machine. Review the security guide for your chosen framework before you start.'}
      </p>

      {/* Framework-specific links */}
      {hasLinks && (
        <div className="flex flex-col gap-1">
          {framework.docsUrl && (
            <a
              href={framework.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-2 py-2 -mx-2 transition-colors hover:bg-primary/[0.08]"
            >
              <span className="font-mono text-[12px] font-bold tabular-nums text-primary">
                1
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                    Getting Started
                  </span>
                  <ArrowIcon className="h-2.5 w-2.5 shrink-0 text-foreground/25 transition-colors group-hover:text-foreground/50" />
                </div>
                <span className="font-mono text-[10px] text-foreground/50">
                  Install, onboarding wizard, first chat
                </span>
              </div>
            </a>
          )}
          {framework.securityUrl && (
            <a
              href={framework.securityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-2 py-2 -mx-2 transition-colors hover:bg-primary/[0.08]"
            >
              <span className="font-mono text-[12px] font-bold tabular-nums text-primary">
                {framework.docsUrl ? 2 : 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                    Security Guide
                  </span>
                  <ArrowIcon className="h-2.5 w-2.5 shrink-0 text-foreground/25 transition-colors group-hover:text-foreground/50" />
                </div>
                <span className="font-mono text-[10px] text-foreground/50">
                  Trust model, access control, hardening
                </span>
              </div>
            </a>
          )}
        </div>
      )}

      {/* Separator + vulnerability reporting — only for frameworks with security URLs */}
      {framework.securityUrl && (
        <>
          <div className="border-t border-primary/20" />
          <a
            href={framework.securityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2 px-2 py-1.5 -mx-2 transition-colors hover:bg-primary/[0.08]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-medium text-foreground/60 transition-colors group-hover:text-foreground/80">
                  Report a Vulnerability
                </span>
                <ArrowIcon className="h-2.5 w-2.5 shrink-0 text-foreground/20 transition-colors group-hover:text-foreground/40" />
              </div>
              <span className="font-mono text-[9px] text-foreground/40">
                Responsible disclosure & security contacts
              </span>
            </div>
          </a>
        </>
      )}
    </div>
  )
}
