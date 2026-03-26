#!/usr/bin/env npx tsx
/**
 * build-catalog.ts — Merge individual model/gpu JSON files into catalog.json.
 *
 * Reads all JSON files from registry/models/ and registry/gpus/ directories,
 * validates them, and produces a single dist/v1/catalog.json file.
 * Also copies individual files for browsing.
 *
 * Usage:
 *   npx tsx site/scripts/build-catalog.ts
 *   npx tsx site/scripts/build-catalog.ts --output-dir dist/v1
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, resolve } from 'path'

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
export const MODELS_DIR = join(REPO_ROOT, 'registry', 'models')
export const GPUS_DIR = join(REPO_ROOT, 'registry', 'gpus')

function loadAllJson(dir: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  } catch {
    return results
  }
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    data._source = f
    results.push(data)
  }
  return results
}

function validateRequired(entry: Record<string, unknown>, required: string[], type: string, filename: string): boolean {
  const missing = required.filter(f => !(f in entry))
  if (missing.length > 0) {
    console.error(`ERROR: ${type} ${filename}: missing required fields: ${missing.join(', ')}`)
    return false
  }
  return true
}

function checkDuplicates(entries: Record<string, unknown>[], keyField: string, type: string): boolean {
  const seen: Record<string, string> = {}
  let ok = true
  for (const entry of entries) {
    const id = entry[keyField] as string
    const source = (entry._source as string) ?? 'unknown'
    if (id in seen) {
      console.error(`ERROR: duplicate ${type} ID '${id}' in ${source} and ${seen[id]}`)
      ok = false
    }
    seen[id] = source
  }
  return ok
}

function copyJsonFiles(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  let files: string[]
  try {
    files = readdirSync(srcDir).filter(f => f.endsWith('.json')).sort()
  } catch {
    return
  }
  for (const f of files) {
    copyFileSync(join(srcDir, f), join(destDir, f))
  }
}

/** Build the catalog and write to outputDir. Returns true on success. */
export function buildCatalog(outputDir: string): boolean {
  mkdirSync(outputDir, { recursive: true })

  const models = loadAllJson(MODELS_DIR)
  const gpus = loadAllJson(GPUS_DIR)

  console.log(`[catalog] Loaded ${models.length} models and ${gpus.length} GPUs`)

  let ok = true

  for (const m of models) {
    if (!validateRequired(m, ['id', 'group', 'family', 'catalogKey', 'name', 'type', 'engine', 'vram'], 'model', (m._source as string) ?? '?')) ok = false
  }
  for (const g of gpus) {
    if (!validateRequired(g, ['id', 'name', 'vramMb', 'arch'], 'gpu', (g._source as string) ?? '?')) ok = false
  }

  if (!checkDuplicates(models, 'id', 'model')) ok = false
  if (!checkDuplicates(gpus, 'id', 'gpu')) ok = false

  if (!ok) {
    console.error('[catalog] Build FAILED due to validation errors')
    return false
  }

  // Strip _source metadata
  for (const entry of [...models, ...gpus]) {
    delete entry._source
  }

  const catalog = { version: '1', models, gpus }

  const catalogPath = join(outputDir, 'catalog.json')
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')

  copyJsonFiles(MODELS_DIR, join(outputDir, 'models'))
  copyJsonFiles(GPUS_DIR, join(outputDir, 'gpus'))

  console.log(`[catalog] Written ${catalogPath} (${models.length} models, ${gpus.length} GPUs)`)
  return true
}

// CLI entry point
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2)
  let outputDir = join(REPO_ROOT, 'dist', 'v1')
  const outputIdx = args.indexOf('--output-dir')
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputDir = resolve(args[outputIdx + 1])
  }

  if (!buildCatalog(outputDir)) {
    process.exit(1)
  }
}
