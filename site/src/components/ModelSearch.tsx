export default function ModelSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative shrink-0 border-b border-foreground/[0.06]">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search models..."
        className="w-full bg-transparent py-1.5 pl-9 pr-3 font-mono text-[11px] text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-foreground/50 transition-colors hover:text-foreground/80"
        >
          clear
        </button>
      )}
    </div>
  )
}
