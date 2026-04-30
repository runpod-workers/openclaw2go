#!/usr/bin/env node

/**
 * Validates that our generated openclaw.json config is accepted by the current
 * version of OpenClaw without modifications.
 *
 * Generates a sample config using the same structure as the site and entrypoint,
 * runs `openclaw doctor --fix`, and checks if anything changed. If the config
 * was modified, our template is stale and needs updating.
 *
 * Used by CI (watch-openclaw.yml) to catch config drift on new OpenClaw releases.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mirror the config shape from site/src/lib/openclaw-config.ts
// Kept in sync manually — CI validates both produce valid configs
function generateConfig() {
  const provider = 'test-provider'
  const modelId = 'test-model'
  return {
    models: {
      providers: {
        [provider]: {
          baseUrl: 'http://localhost:8000/v1',
          apiKey: 'test-key',
          api: 'openai-completions',
          models: [{
            id: modelId,
            name: 'Test Model',
            contextWindow: 32768,
            maxTokens: 8192,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          }],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: `${provider}/${modelId}` },
        contextTokens: 32768,
      },
    },
    gateway: {
      mode: 'local',
      bind: 'lan',
      controlUi: {
        allowedOrigins: [],
        dangerouslyDisableDeviceAuth: false,
      },
      auth: { mode: 'token', token: 'test-token' },
      remote: { token: 'test-token' },
    },
    logging: { level: 'info' },
  }
}

// Docker entrypoint generates additional fields — validate those too
function generateDockerConfig() {
  const base = generateConfig()
  return {
    ...base,
    agents: {
      ...base.agents,
      defaults: {
        ...base.agents.defaults,
        workspace: '/workspace/openclaw',
      },
    },
    channels: {
      telegram: { enabled: true },
    },
    skills: {
      load: { extraDirs: ['/opt/a2go/skills'] },
      entries: {
        'openai-image-gen': { enabled: false },
        'nano-banana-pro': { enabled: false },
      },
    },
    plugins: {
      load: { paths: ['/workspace/openclaw/.openclaw/extensions'] },
      entries: { 'toolresult-images': { enabled: true } },
    },
    gateway: {
      ...base.gateway,
      controlUi: {
        allowedOrigins: ['https://test-pod-18789.proxy.runpod.net'],
        dangerouslyDisableDeviceAuth: false,
      },
    },
  }
}

function validate(name, config) {
  const stateDir = mkdtempSync(join(tmpdir(), `openclaw-validate-${name}-`))
  mkdirSync(stateDir, { recursive: true })
  const configPath = join(stateDir, 'openclaw.json')

  const before = JSON.stringify(config, null, 2)
  writeFileSync(configPath, before)

  try {
    execSync(`OPENCLAW_STATE_DIR="${stateDir}" npx openclaw doctor --fix`, {
      stdio: 'pipe',
      timeout: 30000,
    })
  } catch (e) {
    // doctor may exit non-zero even when fixing, that's ok
  }

  const after = readFileSync(configPath, 'utf-8')

  if (before !== after) {
    console.error(`\n❌ ${name} config was modified by openclaw doctor:`)
    console.error(`\nBefore:\n${before}`)
    console.error(`\nAfter:\n${after}`)
    return false
  }

  console.log(`✓ ${name} config is valid`)
  return true
}

const mlxOk = validate('mlx', generateConfig())
const dockerOk = validate('docker', generateDockerConfig())

if (!mlxOk || !dockerOk) {
  console.error('\n⚠️  Config template is stale — update site/src/lib/openclaw-config.ts and scripts/entrypoint-unified.sh')
  process.exit(1)
}

console.log('\n✓ All configs valid')
