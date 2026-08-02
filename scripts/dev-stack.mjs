#!/usr/bin/env node
/**
 * Start SpeechC API + Vite together so parent login never "Failed to fetch"
 * just because the backend wasn't running.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const apiRoot = path.join(repoRoot, 'apps', 'api')
const venvPython = path.join(apiRoot, '.venv', 'bin', 'python')
const venvUvicorn = path.join(apiRoot, '.venv', 'bin', 'uvicorn')

const kids = []

function run(command, args, cwd, label, env = process.env) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  kids.push(child)
  const tag = (chunk) => {
    const text = chunk.toString()
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) console.log(`[${label}] ${line}`)
    }
  }
  child.stdout.on('data', tag)
  child.stderr.on('data', tag)
  child.on('exit', (code, signal) => {
    console.log(`[${label}] exited code=${code} signal=${signal || ''}`)
    shutdown(code ?? 1)
  })
  return child
}

function shutdown(code = 0) {
  for (const child of kids) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

if (!fs.existsSync(venvUvicorn)) {
  console.error(`[stack] Missing SpeechC venv at ${apiRoot}/.venv`)
  console.error('[stack] Run: python3 -m venv apps/api/.venv && apps/api/.venv/bin/pip install -r apps/api/requirements.txt')
  process.exit(1)
}

const apiEnv = {
  ...process.env,
  SPEECHC_SCORER: process.env.SPEECHC_SCORER || 'mock',
  USE_MOCK_AI: process.env.USE_MOCK_AI || 'true',
  PYTHONPATH: apiRoot,
}

console.log('[stack] starting SpeechC API on :8000')
run(
  venvUvicorn,
  ['app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload', '--app-dir', apiRoot],
  repoRoot,
  'api',
  apiEnv,
)

console.log('[stack] starting Vite on :5173 (proxies /api → SpeechC :8000)')
run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', '5173'],
  frontendRoot,
  'web',
)
