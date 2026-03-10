import type { CatalogModel, OsPlatform } from './catalog'

export interface ModelVariant {
  model: CatalogModel
  os: OsPlatform[]
  bits?: number
  shortLabel: string
  vramTotal: number
  tps?: Record<string, number>
  repo: string
}

export interface ModelGroup {
  key: string
  displayName: string
  type: 'llm' | 'image' | 'audio'
  contextLength: number | undefined
  hasVision: boolean
  capabilities: string[]
  variants: ModelVariant[]
}

/** Clean base name: strip GGUF/MLX/MoE-suffix markers, quant tokens, bit labels, and parenthesized info */
function cleanBaseName(name: string): string {
  return name
    .replace(/\bgguf\b/gi, '')
    .replace(/\bmlx\b/gi, '')
    .replace(/-a\d+b\b/gi, '')
    .replace(/\b(ud-?|smol-)?(i?t?q\d+[\w_]*|sdnq)\b/gi, '')
    .replace(/\bdynamic\b/gi, '')
    .replace(/\b\d+-?bit\b/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Group key uses primaryBits so cross-platform variants of the same model stay together */
function getGroupKey(model: CatalogModel): string {
  const clean = cleanBaseName(model.name)
  return `${clean}::${model.primaryBits ?? '--'}`
}

/** Display name is just the clean model name without bit level */
function getDisplayName(name: string): string {
  return cleanBaseName(name)
}

export function groupModels(models: CatalogModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()

  for (const model of models) {
    const key = getGroupKey(model)
    const effectiveBits = model.primaryBits ?? model.bits
    const shortLabel = effectiveBits != null ? `${effectiveBits}bit` : '--'

    const variant: ModelVariant = {
      model,
      os: model.os,
      bits: effectiveBits,
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
      for (const cap of model.capabilities ?? []) {
        if (!existing.capabilities.includes(cap)) existing.capabilities.push(cap)
      }
    } else {
      map.set(key, {
        key,
        displayName: getDisplayName(model.name),
        type: model.type,
        contextLength: model.contextLength,
        hasVision: model.hasVision,
        capabilities: [...(model.capabilities ?? [])],
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
    const nameCmp = a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
    if (nameCmp !== 0) return nameCmp
    return (a.variants[0]?.model.primaryBits ?? 999) - (b.variants[0]?.model.primaryBits ?? 999)
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

/** Strip parameter-count suffixes (e.g. "-754B", "-229B") for fuzzy model family matching */
function familyName(displayName: string): string {
  return displayName
    .replace(/-?\d+B\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Find sibling groups (same model family, different bits) that have a variant for the given OS */
export function findSiblingsWithOs(
  group: ModelGroup,
  allGroups: ModelGroup[],
  os: OsPlatform,
): ModelGroup[] {
  const family = familyName(group.displayName)
  return allGroups.filter(
    (g) =>
      g.key !== group.key &&
      familyName(g.displayName) === family &&
      g.variants.some((v) => v.os.includes(os)),
  )
}
