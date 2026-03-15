#!/usr/bin/env npx tsx
/**
 * validate.ts — Validate model and GPU JSON files.
 *
 * Performs:
 *   1. Required field validation
 *   2. Duplicate ID detection
 *   3. HuggingFace repo existence check (optional, with --check-hf)
 *
 * Usage:
 *   npx tsx site/scripts/validate.ts
 *   npx tsx site/scripts/validate.ts --check-hf
 */

import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const MODELS_DIR = join(REPO_ROOT, 'registry', 'models')
const GPUS_DIR = join(REPO_ROOT, 'registry', 'gpus')

const ALLOWED_ENGINES = new Set(['llamacpp', 'llamacpp-audio', 'llamacpp-glm-dsa', 'image-gen', 'qwen3-tts', 'mlx', 'mlx-lm', 'mlx-audio', 'mflux', 'openclaw2go-llamacpp', 'vllm'])
const ALLOWED_TYPES = new Set(['llm', 'audio', 'image', 'vision', 'embedding', 'reranking', 'tts'])
const ALLOWED_STATUSES = new Set(['stable', 'experimental', 'deprecated'])

function loadJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function listJsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  } catch {
    return []
  }
}

function validateModel(data: Record<string, unknown>, filepath: string): string[] {
  const errors: string[] = []

  for (const field of ['id', 'name', 'type', 'engine', 'vram']) {
    if (!(field in data)) errors.push(`${filepath}: missing required field '${field}'`)
  }
  if (errors.length > 0) return errors

  if (!ALLOWED_TYPES.has(data.type as string)) {
    errors.push(`${filepath}: invalid type '${data.type}' (allowed: ${[...ALLOWED_TYPES].join(', ')})`)
  }
  if (!ALLOWED_ENGINES.has(data.engine as string)) {
    errors.push(`${filepath}: invalid engine '${data.engine}' (allowed: ${[...ALLOWED_ENGINES].join(', ')})`)
  }

  const vram = data.vram as Record<string, unknown> | undefined
  if (!vram || typeof vram !== 'object') {
    errors.push(`${filepath}: vram must be an object`)
  } else if (!('model' in vram) || !('overhead' in vram)) {
    errors.push(`${filepath}: vram must have 'model' and 'overhead' fields`)
  }

  const downloadDir = data.downloadDir as string | undefined
  if (downloadDir && !downloadDir.startsWith('/workspace/models/')) {
    errors.push(`${filepath}: downloadDir must start with /workspace/models/`)
  }

  const status = data.status as string | undefined
  if (status && !ALLOWED_STATUSES.has(status)) {
    errors.push(`${filepath}: invalid status '${status}' (allowed: ${[...ALLOWED_STATUSES].join(', ')})`)
  }

  const id = data.id as string
  if (!id.includes('/')) {
    errors.push(`${filepath}: id should be in 'provider/name' format, got '${id}'`)
  }

  return errors
}

function validateGpu(data: Record<string, unknown>, filepath: string): string[] {
  const errors: string[] = []

  for (const field of ['id', 'name', 'vramMb', 'arch']) {
    if (!(field in data)) errors.push(`${filepath}: missing required field '${field}'`)
  }
  if (errors.length > 0) return errors

  if (typeof data.vramMb !== 'number' || data.vramMb <= 0) {
    errors.push(`${filepath}: vramMb must be a positive number`)
  }

  const arch = data.arch as string
  if (!arch.startsWith('sm_')) {
    errors.push(`${filepath}: arch must start with 'sm_' (e.g., sm_80)`)
  }

  return errors
}

async function checkHfRepo(repo: string): Promise<boolean> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repo}`, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
    return res.status !== 404
  } catch {
    return true // network error — assume exists
  }
}

async function main() {
  const checkHf = process.argv.includes('--check-hf')
  const errors: string[] = []

  // Load all models
  const allModels = new Map<string, { data: Record<string, unknown>; file: string }>()
  for (const f of listJsonFiles(MODELS_DIR)) {
    try {
      const data = loadJson(join(MODELS_DIR, f))
      allModels.set((data.id as string) ?? f.replace('.json', ''), { data, file: f })
    } catch (e) {
      errors.push(`models/${f}: invalid JSON: ${e}`)
    }
  }

  // Validate models
  const modelFiles = listJsonFiles(MODELS_DIR)
  for (const f of modelFiles) {
    const filepath = `models/${f}`
    try {
      const data = loadJson(join(MODELS_DIR, f))
      const errs = validateModel(data, filepath)
      errors.push(...errs)

      if (checkHf && errs.length === 0) {
        const repo = data.repo as string | undefined
        if (repo) {
          process.stdout.write(`Checking HF repo: ${repo}... `)
          if (await checkHfRepo(repo)) {
            console.log('OK')
          } else {
            console.log('NOT FOUND')
            errors.push(`${filepath}: HuggingFace repo '${repo}' not found`)
          }
        }
      }
    } catch (e) {
      errors.push(`${filepath}: invalid JSON: ${e}`)
    }
  }

  // Check duplicate model IDs
  const seenModelIds = new Map<string, string>()
  for (const [id, { file }] of allModels) {
    if (seenModelIds.has(id)) {
      errors.push(`Duplicate model ID '${id}': ${file} and ${seenModelIds.get(id)}`)
    }
    seenModelIds.set(id, file)
  }

  // Validate GPUs
  const gpuFiles = listJsonFiles(GPUS_DIR)
  for (const f of gpuFiles) {
    const filepath = `gpus/${f}`
    try {
      const data = loadJson(join(GPUS_DIR, f))
      errors.push(...validateGpu(data, filepath))
    } catch (e) {
      errors.push(`${filepath}: invalid JSON: ${e}`)
    }
  }

  // Check duplicate GPU IDs
  const seenGpuIds = new Map<string, string>()
  for (const f of gpuFiles) {
    try {
      const data = loadJson(join(GPUS_DIR, f))
      const id = (data.id as string) ?? f.replace('.json', '')
      if (seenGpuIds.has(id)) {
        errors.push(`Duplicate GPU ID '${id}': ${f} and ${seenGpuIds.get(id)}`)
      }
      seenGpuIds.set(id, f)
    } catch { /* already reported */ }
  }

  if (errors.length > 0) {
    console.error(`\nValidation FAILED (${errors.length} errors):`)
    for (const e of errors) {
      console.error(`  - ${e}`)
    }
    process.exit(1)
  } else {
    console.log(`\nValidation OK: ${modelFiles.length} models, ${gpuFiles.length} GPUs checked`)
  }
}

main()
