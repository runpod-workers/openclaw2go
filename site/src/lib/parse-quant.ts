/** Parse quant into a simplified label and the full quant string */
export function parseQuant(name: string): {
  shortLabel: string
  fullQuant: string
  baseName: string
} {
  // Strip parenthesized info like "(2-bit, 241GB)" before parsing
  const cleanName = name.replace(/\s*\([^)]*\)/g, '').trim()
  const parts = cleanName.split(" ")

  let shortLabel = "--"
  let fullQuant = "--"
  let quantIdx = -1

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase()

    // "sdnq 4-bit" style -- show just the bit depth in the short label
    if (p === "sdnq" && i + 1 < parts.length) {
      quantIdx = i
      const nextBit = parts[i + 1].match(/^(\d+)/)
      if (nextBit) {
        shortLabel = `${nextBit[1]}bit`
      } else {
        shortLabel = "sdnq"
      }
      fullQuant = parts.slice(i).join(" ")
      break
    }

    // Strip prefixes like "ud-", "smol-" to find the quant root
    const stripped = p.replace(/^(ud-|smol-)/, '')

    // "q4_k_m", "iq2_xxs", "tq1_0" style (standard, IQ, TQ quants)
    const qMatch = stripped.match(/^[it]?q(\d+)/)
    if (qMatch) {
      quantIdx = i
      shortLabel = `${qMatch[1]}bit`
      fullQuant = parts.slice(i).join(" ")
      break
    }

    // "4-bit" or "8-bit" style
    const bitMatch = p.match(/^(\d+)-?bit$/)
    if (bitMatch) {
      quantIdx = i
      shortLabel = `${bitMatch[1]}bit`
      fullQuant = parts.slice(i).join(" ")
      break
    }
  }

  // baseName from the cleaned name (no parens), up to the quant
  const cleanParts = cleanName.split(" ")
  const baseName = quantIdx > 0 ? cleanParts.slice(0, quantIdx).join(" ") : cleanName

  // Fall back to parenthesized bit info if parser found no quant
  if (shortLabel === "--") {
    const parenMatch = name.match(/\((\d+)-?bit/)
    if (parenMatch) {
      shortLabel = `${parenMatch[1]}bit`
    }
  }

  return { shortLabel, fullQuant, baseName }
}
