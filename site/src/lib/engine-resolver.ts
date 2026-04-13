/**
 * Central engine/platform resolver — single source of truth for:
 * - Which engines are available on a platform
 * - Which engine is preferred on a platform
 * - Which variant to select for a given family + platform
 *
 * RULES:
 * 1. macOS → prefer MLX, fallback wandler
 * 2. Linux/Windows → prefer llamacpp, fallback wandler
 * 3. null (no platform) → all engines, prefer llamacpp
 * 4. Engine pills on card = engines available for the family ON the active tab's OS
 * 5. Platform tabs on card = platforms where the current engine works
 * 6. Switching platform tab auto-selects the preferred engine for that OS
 */

import { ENGINES, ENGINE_META, type Engine, type Platform, type CatalogModel } from './catalog'
import type { FamilyEntry } from './group-models'

/** Engines available on a given platform (null = all) */
export function getEnginesForPlatform(platform: Platform | null): Engine[] {
  if (!platform) return [...ENGINES]
  return ENGINES.filter((e) => ENGINE_META[e].os.includes(platform))
}

/** Preferred engine for a platform — the one users expect by default */
export function getPreferredEngine(platform: Platform | null): Engine {
  if (platform === 'mac') return 'mlx'
  return 'llamacpp' // linux, windows, or null
}

/** Engine priority order for a given platform (most preferred first) */
export function getEnginePriority(platform: Platform | null): Engine[] {
  if (platform === 'mac') return ['mlx', 'llamacpp', 'wandler']
  return ['llamacpp', 'mlx', 'wandler']
}

/** Find all engines that have at least one variant in a family for a given platform */
export function getAvailableEnginesForFamily(
  familyEntry: FamilyEntry | undefined,
  platform: Platform | null,
): Engine[] {
  if (!familyEntry) return []
  const found = new Set<Engine>()
  for (const entry of familyEntry.entries) {
    for (const group of entry.groups) {
      for (const variant of group.variants) {
        if (platform && !variant.os.includes(platform)) continue
        found.add(variant.model.engineCategory)
      }
    }
  }
  // Return in stable order
  return ENGINES.filter((e) => found.has(e))
}

/** Pick the best variant for a family given platform + preferred engine */
export function resolveVariantForPlatformEngine(
  familyEntry: FamilyEntry | undefined,
  platform: Platform | null,
  preferredEngine: Engine | null,
): CatalogModel | null {
  if (!familyEntry) return null

  const priority = preferredEngine
    ? [preferredEngine, ...getEnginePriority(platform).filter((e) => e !== preferredEngine)]
    : getEnginePriority(platform)

  for (const engine of priority) {
    for (const entry of familyEntry.entries) {
      for (const group of entry.groups) {
        for (const variant of group.variants) {
          if (variant.model.engineCategory !== engine) continue
          if (platform && !variant.os.includes(platform)) continue
          return variant.model
        }
      }
    }
  }

  // Final fallback: any variant that works on this platform
  for (const entry of familyEntry.entries) {
    for (const group of entry.groups) {
      for (const variant of group.variants) {
        if (platform && !variant.os.includes(platform)) continue
        return variant.model
      }
    }
  }

  return null
}
