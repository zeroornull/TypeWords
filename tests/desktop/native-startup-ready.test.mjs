import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('startup-ready runner waits for isolated dest pinia without writing the default identifier', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-startup-ready.mjs'), 'utf8')
  assert.match(runner, /TYPEWORDS_PLAYWRIGHT_MODULE/)
  assert.match(runner, /tauri\.localhost/)
  assert.match(runner, /practice-words\/backup-custom/)
  assert.match(runner, /pinia\?._s.get\('base'\)\?\.load/)
  assert.match(runner, /\.typing-word/)
  assert.match(runner, /startup-ready\.json/)
  assert.match(runner, /readyMsFromConnect/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
  assert.doesNotMatch(runner, /Disable-NetAdapter/)
})
