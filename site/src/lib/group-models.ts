import type { CatalogModel, OsPlatform } from './catalog'
import { parseQuant } from './parse-quant'

export interface ModelVariant {
  model: CatalogModel
  os: OsPlatform[]
  quant: string
  shortLabel: string
  vramTotal: number
  tps?: Record<string, number>
  repo: string
}

export interface ModelGroup {
  key: string
  displayName: string
  type: 'llm' | 'image' | 'audio' | 'tts'
  contextLength: number | undefined
  hasVision: boolean
  variants: ModelVariant[]
}

/** Clean base name: strip GGUF/MLX/MoE-suffix markers */
function cleanBaseName(name: string): string {
  return name
    .replace(/\bgguf\b/gi, '')
    .replace(/\bmlx\b/gi, '')
    .replace(/-a\d+b\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Group key includes bit level so different quants stay separate.
 * Same model at same bit level but different platforms (GGUF 4-bit + MLX 4-bit) group together.
 * Quant method prefixes (e.g. "sdnq") are stripped so "sdnq 4bit" and "4bit" produce the same key.
 */
function getGroupKey(name: string): string {
  const { baseName, shortLabel } = parseQuant(name)
  const clean = cleanBaseName(baseName)
  // Normalize to just the bit level: "sdnq 4bit" → "4bit"
  const bitOnly = shortLabel !== '--' ? (shortLabel.match(/(\d+bit)$/)?.[1] ?? shortLabel) : '--'
  return bitOnly !== '--' ? `${clean}::${bitOnly}` : clean
}

/** Display name is just the clean model name without bit level */
function getDisplayName(name: string): string {
  const { baseName } = parseQuant(name)
  return cleanBaseName(baseName)
}

export function groupModels(models: CatalogModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()

  for (const model of models) {
    const key = getGroupKey(model.name)
    const { shortLabel, fullQuant } = parseQuant(model.name)

    const variant: ModelVariant = {
      model,
      os: model.os,
      quant: fullQuant,
      shortLabel,
      vramTotal: model.vram.model + model.vram.overhead,
      tps: model.tps,
      repo: model.repo,
    }

    const existing = map.get(key)
    if (existing) {
      // Skip if a variant already covers the same OS set
      const osKey = [...variant.os].sort().join(',')
      const duplicate = existing.variants.some(
        (v) => [...v.os].sort().join(',') === osKey
      )
      if (!duplicate) {
        existing.variants.push(variant)
      }
      if (model.contextLength && !existing.contextLength) {
        existing.contextLength = model.contextLength
      }
      if (model.hasVision) existing.hasVision = true
    } else {
      map.set(key, {
        key,
        displayName: getDisplayName(model.name),
        type: model.type,
        contextLength: model.contextLength,
        hasVision: model.hasVision,
        variants: [variant],
      })
    }
  }

  // Sort variants: Linux/Windows first, Mac second
  for (const group of map.values()) {
    group.variants.sort((a, b) => {
      const aIsMac = a.os.includes('mac') ? 1 : 0
      const bIsMac = b.os.includes('mac') ? 1 : 0
      return aIsMac - bIsMac
    })
  }

  // Sort groups: by display name, then by bit level ascending (1-bit → 2-bit → 4-bit …)
  const groups = Array.from(map.values())
  groups.sort((a, b) => {
    const nameCmp = a.displayName.localeCompare(b.displayName)
    if (nameCmp !== 0) return nameCmp
    const aBit = a.variants[0]?.shortLabel.match(/^(\d+)bit$/)?.[1]
    const bBit = b.variants[0]?.shortLabel.match(/^(\d+)bit$/)?.[1]
    return (aBit ? Number(aBit) : 999) - (bBit ? Number(bBit) : 999)
  })

  return groups
}

/** Pick the best variant for a given OS, falling back to the first variant */
export function getVariantForOs(group: ModelGroup, os: OsPlatform | null): ModelVariant {
  if (os) {
    const match = group.variants.find((v) => v.os.includes(os))
    if (match) return match
  }
  return group.variants[0]
}

/** Check if a group has any variant for the given OS */
export function groupHasOs(group: ModelGroup, os: OsPlatform | null): boolean {
  if (!os) return true
  return group.variants.some((v) => v.os.includes(os))
}
