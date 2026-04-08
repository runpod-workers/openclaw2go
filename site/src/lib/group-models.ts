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
  size: string
  type: 'llm' | 'image' | 'audio'
  contextLength: number | undefined
  hasVision: boolean
  capabilities: string[]
  variants: ModelVariant[]
  family: string
}

/** Display name: strip GGUF/MLX/quant tokens and parenthesized info */
function getDisplayName(name: string): string {
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


export function groupModels(models: CatalogModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()

  for (const model of models) {
    const key = model.group
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
        size: model.size,
        type: model.type,
        contextLength: model.contextLength,
        hasVision: model.hasVision,
        capabilities: [...(model.capabilities ?? [])],
        variants: [variant],
        family: model.family,
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

/** Find sibling groups (same family, different group) that have a variant for the given OS */
export function findSiblingsWithOs(
  group: ModelGroup,
  allGroups: ModelGroup[],
  os: OsPlatform,
): ModelGroup[] {
  return allGroups.filter(
    (g) =>
      g.key !== group.key &&
      g.family === group.family &&
      g.variants.some((v) => v.os.includes(os)),
  )
}

// ─── CatalogEntry: grouped by catalogKey ─────────────────────────────────────

export interface SubVariant {
  label: string                 // "Flash", "Claude Distill", "" for single
  groups: ModelGroup[]          // one per quant level, sorted by bits ascending
}

export interface CatalogEntry {
  catalogKey: string
  displayName: string
  size: string
  family: string
  type: 'llm' | 'image' | 'audio'
  hasVision: boolean
  capabilities: string[]
  maxContextLength?: number
  groups: ModelGroup[]          // all ModelGroups under this entry
  subVariants: SubVariant[]
}

/** Compute OS-aware summary stats for a catalog entry.
 *  TPS is taken from the smallest-VRAM variant that has TPS data,
 *  not the max across all quants, so the catalog row stays close to what
 *  the user sees on click (default selection picks smallest quant).
 */
export function getEntrySummary(
  entry: CatalogEntry,
  os: OsPlatform | null,
): { maxTps?: number; minVramMb: number } {
  let minVramMb = Infinity
  // Track the smallest-VRAM variant that actually has TPS data
  let minVramWithTps = Infinity
  let tpsVariant: ModelVariant | undefined

  for (const group of entry.groups) {
    for (const v of group.variants) {
      if (os && !v.os.includes(os)) continue
      if (v.vramTotal < minVramMb) minVramMb = v.vramTotal
      if (v.tps && v.vramTotal < minVramWithTps) {
        minVramWithTps = v.vramTotal
        tpsVariant = v
      }
    }
  }
  if (minVramMb === Infinity) {
    // No variants for this OS — fall back to all variants
    for (const group of entry.groups) {
      for (const v of group.variants) {
        if (v.vramTotal < minVramMb) minVramMb = v.vramTotal
        if (v.tps && v.vramTotal < minVramWithTps) {
          minVramWithTps = v.vramTotal
          tpsVariant = v
        }
      }
    }
  }

  const maxTps = tpsVariant?.tps
    ? Math.max(...Object.values(tpsVariant.tps))
    : undefined

  return { maxTps, minVramMb: minVramMb === Infinity ? 0 : minVramMb }
}

/** Derive a sub-variant label from a group key relative to the catalogKey.
 *  e.g. catalogKey="glm47", groupKey="glm47-flash" → "Flash"
 *       catalogKey="glm47", groupKey="glm47-claude-distill" → "Claude Distill"
 *       catalogKey="nemotron3-super", groupKey="nemotron3-super-2bit" → "" (just a quant)
 */
function deriveSubVariantKey(catalogKey: string, groupKey: string): string {
  // Strip catalogKey prefix
  let suffix = groupKey.startsWith(catalogKey + '-')
    ? groupKey.slice(catalogKey.length + 1)
    : groupKey === catalogKey ? '' : groupKey

  // Strip trailing bit-level patterns (e.g. "2bit", "4bit", "q4km", "tq1", "iq2xxs", "q2kxl", "q8", "3bit", "sdnq")
  suffix = suffix
    .replace(/[-_]?\d+bit$/i, '')
    .replace(/[-_]?(ud-?|smol-)?(i?t?q\d+[\w_]*|sdnq|q\d+k?[a-z]*)$/i, '')
    .replace(/[-_]?(gguf|mlx)$/i, '')
    .replace(/-+$/, '')

  return suffix
}

/** Build CatalogEntry[] from existing ModelGroup[] */
export function buildCatalogEntries(allGroups: ModelGroup[]): CatalogEntry[] {
  // 1. Group existing ModelGroups by catalogKey
  const byKey = new Map<string, ModelGroup[]>()
  for (const group of allGroups) {
    const ck = group.variants[0]?.model.catalogKey
    if (!ck) continue
    const arr = byKey.get(ck) ?? []
    arr.push(group)
    byKey.set(ck, arr)
  }

  const entries: CatalogEntry[] = []

  for (const [catalogKey, groups] of byKey) {
    const firstGroup = groups[0]
    const firstModel = firstGroup.variants[0].model

    // 2. Aggregate summary stats
    let hasVision = false
    const capabilities: string[] = []
    let maxContextLength: number | undefined

    for (const g of groups) {
      if (g.hasVision) hasVision = true
      for (const cap of g.capabilities) {
        if (!capabilities.includes(cap)) capabilities.push(cap)
      }
      if (g.contextLength != null) {
        maxContextLength = maxContextLength != null
          ? Math.max(maxContextLength, g.contextLength)
          : g.contextLength
      }
    }

    // 3. Detect sub-variants: group by sub-variant key
    const svMap = new Map<string, ModelGroup[]>()
    for (const g of groups) {
      const svKey = deriveSubVariantKey(catalogKey, g.key)
      const arr = svMap.get(svKey) ?? []
      arr.push(g)
      svMap.set(svKey, arr)
    }

    const subVariants: SubVariant[] = []
    for (const [svKey, svGroups] of svMap) {
      // Sort groups by bits ascending
      svGroups.sort((a, b) => {
        const aBits = a.variants[0]?.bits ?? 999
        const bBits = b.variants[0]?.bits ?? 999
        return aBits - bBits
      })

      // Derive label: capitalize, hyphen→space
      const label = svKey
        ? svKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : ''

      subVariants.push({ label, groups: svGroups })
    }

    // 4. Pick display name: use the first group's displayName, which is already cleaned.
    //    For multi-sub-variant entries, strip the sub-variant suffix to get the common name.
    let displayName = firstGroup.displayName
    if (subVariants.length > 1 && subVariants[0].label) {
      // Try to find the common prefix among all sub-variant display names
      const names = subVariants.map(sv => sv.groups[0]?.displayName ?? '')
      const common = longestCommonPrefix(names).replace(/\s+$/, '')
      if (common.length > 3) displayName = common
    }

    entries.push({
      catalogKey,
      displayName,
      size: firstGroup.size,
      family: firstModel.family,
      type: firstModel.type as 'llm' | 'image' | 'audio',
      hasVision,
      capabilities,
      maxContextLength,
      groups,
      subVariants,
    })
  }

  // 5. Sort entries by displayName (numeric-aware)
  entries.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
  )

  return entries
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return ''
  let prefix = strs[0]
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix === '') return ''
    }
  }
  return prefix
}

/** Check if a catalog entry has any variant for the given OS */
export function entryHasOs(entry: CatalogEntry, os: OsPlatform | null): boolean {
  if (!os) return true
  return entry.groups.some((g) => g.variants.some((v) => v.os.includes(os)))
}

// ─── FamilyEntry: grouped by family ─────────────────────────────────────────

export interface FamilyEntry {
  family: string
  displayName: string
  type: 'llm' | 'image' | 'audio'
  hasVision: boolean
  capabilities: string[]
  maxContextLength?: number
  entries: CatalogEntry[]      // sorted by min VRAM ascending (≈ by param size)
  sizeLabels: string[]         // one per entry, e.g., ["4B", "9B", "27B", ...]
  isMultiSize: boolean         // true when entries.length > 1
}

/** Build FamilyEntry[] from existing CatalogEntry[].
 *  Families with a single entry pass through transparently. */
export function buildFamilyEntries(allEntries: CatalogEntry[]): FamilyEntry[] {
  const byFamily = new Map<string, CatalogEntry[]>()
  for (const entry of allEntries) {
    const arr = byFamily.get(entry.family) ?? []
    arr.push(entry)
    byFamily.set(entry.family, arr)
  }

  const familyEntries: FamilyEntry[] = []

  for (const [family, entries] of byFamily) {
    // Sort entries by smallest VRAM (proxy for parameter count)
    entries.sort((a, b) => {
      const aMin = minEntryVram(a)
      const bMin = minEntryVram(b)
      return aMin - bMin
    })

    const isMultiSize = entries.length > 1

    // Derive family display name and per-entry size labels
    let displayName: string
    let sizeLabels: string[]

    if (isMultiSize) {
      // Use the size field from each entry's first group
      sizeLabels = entries.map((e) => e.groups[0]?.size || '')
      // Derive family display name by stripping the size from the first entry's name
      const firstName = entries[0].displayName
      const firstSize = sizeLabels[0]
      if (firstSize) {
        const names = entries.map((e) => e.displayName)
        const prefix = longestCommonPrefix(names).replace(/[-\s]+$/, '')
        displayName = prefix.length > 3 ? prefix : firstName.replace(new RegExp('[\\s-]+' + firstSize.replace('.', '\\.').replace(/b$/i, '') + 'b\\b', 'i'), '').trim()
      } else {
        const names = entries.map((e) => e.displayName)
        const prefix = longestCommonPrefix(names).replace(/[-\s]+$/, '')
        displayName = prefix.length > 3 ? prefix : entries[0].displayName
      }
    } else {
      const size = entries[0].groups[0]?.size || ''
      if (size) {
        displayName = entries[0].displayName.replace(new RegExp('[\\s-]+' + size.replace('.', '\\.').replace(/b$/i, '') + 'b\\b', 'i'), '').trim()
        sizeLabels = [size]
      } else {
        displayName = entries[0].displayName
        sizeLabels = ['']
      }
    }

    // Aggregate stats across all entries
    let hasVision = false
    const capabilities: string[] = []
    let maxContextLength: number | undefined

    for (const entry of entries) {
      if (entry.hasVision) hasVision = true
      for (const cap of entry.capabilities) {
        if (!capabilities.includes(cap)) capabilities.push(cap)
      }
      if (entry.maxContextLength != null) {
        maxContextLength = maxContextLength != null
          ? Math.max(maxContextLength, entry.maxContextLength)
          : entry.maxContextLength
      }
    }

    familyEntries.push({
      family,
      displayName,
      type: entries[0].type as 'llm' | 'image' | 'audio',
      hasVision,
      capabilities,
      maxContextLength,
      entries,
      sizeLabels,
      isMultiSize,
    })
  }

  familyEntries.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { numeric: true }),
  )

  return familyEntries
}

/** Get the minimum VRAM across all variants of a catalog entry */
function minEntryVram(entry: CatalogEntry): number {
  let min = Infinity
  for (const g of entry.groups) {
    for (const v of g.variants) {
      if (v.vramTotal < min) min = v.vramTotal
    }
  }
  return min === Infinity ? 0 : min
}

/** OS-aware summary stats for a family entry (aggregated across all sizes) */
export function getFamilyEntrySummary(
  fe: FamilyEntry,
  os: OsPlatform | null,
): { maxTps?: number; minVramMb: number } {
  let minVramMb = Infinity
  let bestTps: number | undefined

  for (const entry of fe.entries) {
    const s = getEntrySummary(entry, os)
    if (s.minVramMb > 0 && s.minVramMb < minVramMb) minVramMb = s.minVramMb
    if (s.maxTps != null && (bestTps == null || s.maxTps > bestTps)) bestTps = s.maxTps
  }

  return { maxTps: bestTps, minVramMb: minVramMb === Infinity ? 0 : minVramMb }
}

/** Check if any entry in a family has a variant for the given OS */
export function familyEntryHasOs(fe: FamilyEntry, os: OsPlatform | null): boolean {
  if (!os) return true
  return fe.entries.some((e) => entryHasOs(e, os))
}
