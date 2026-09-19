import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()
const read = path => readFileSync(resolve(root, path), 'utf8')
const json = path => JSON.parse(read(path))

function deepMerge(base, overlay) {
  if (Array.isArray(overlay)) return overlay.slice()
  if (overlay && typeof overlay === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
    const out = { ...base }
    for (const [key, value] of Object.entries(overlay)) {
      out[key] = deepMerge(base[key], value)
    }
    return out
  }
  return overlay === undefined ? base : overlay
}

function walk(value, visit, path = '') {
  visit(value, path)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(child, visit, path ? `${path}.${key}` : key)
    }
  }
}

function assertNoPublicUpdater(config, label) {
  assert.equal(config.plugins, undefined, `${label} plugins`)
  assert.equal(config.plugins?.updater, undefined, `${label} plugins.updater`)
  assert.equal(config.bundle.createUpdaterArtifacts, false, `${label} createUpdaterArtifacts`)
  const hits = []
  walk(config, (value, path) => {
    const leaf = path.split('.').pop()
    if (leaf === 'endpoints' || leaf === 'pubkey') hits.push(path)
    if (typeof value === 'string' && /tauri-plugin-updater|@tauri-apps\/plugin-updater|latest\.json|releases\/latest/i.test(value)) {
      hits.push(`${path}=${value}`)
    }
  })
  assert.deepEqual(hits, [], `${label} public updater fields`)
}

test('unsigned internal profile has no public updater endpoint or plugin', () => {
  const base = json('src-tauri/tauri.conf.json')
  const internal = json('src-tauri/tauri.internal.conf.json')
  const merged = deepMerge(base, internal)

  assertNoPublicUpdater(base, 'base')
  assertNoPublicUpdater(internal, 'internal')
  assertNoPublicUpdater(merged, 'internal-merged')
  assert.equal(internal.bundle.shortDescription, 'TypeWords internal testing build (unsigned)')
  assert.match(merged.app.security.csp['connect-src'], /https:\/\/\*\.supabase\.co/)
  assert.doesNotMatch(merged.app.security.csp['connect-src'], /github\.com|releases\.|latest\.json/)
})

test('unsigned host lockfile, capabilities and frontend omit the updater plugin', () => {
  const cargo = read('src-tauri/Cargo.toml')
  const lock = read('src-tauri/Cargo.lock')
  const rust = read('src-tauri/src/lib.rs')
  const pkg = json('package.json')
  const capability = json('src-tauri/capabilities/main.json')

  assert.doesNotMatch(cargo, /tauri-plugin-updater/)
  assert.doesNotMatch(lock, /name = "tauri-plugin-updater"/)
  assert.doesNotMatch(rust, /tauri_plugin_updater|plugin-updater/)
  assert.equal(pkg.dependencies['@tauri-apps/plugin-updater'], undefined)
  assert.equal(pkg.devDependencies['@tauri-apps/plugin-updater'], undefined)
  assert.equal(JSON.stringify(capability).includes('updater'), false)
  assert.deepEqual(
    capability.permissions.map(item => (typeof item === 'string' ? item : item.identifier)),
    ['dialog:allow-save', 'fs:allow-write-file', 'opener:allow-open-url']
  )
})

test('internal unsigned bundle command stays --no-sign on the internal config', async () => {
  const script = read('scripts/desktop-internal.mjs')
  const { internalBuildCommand } = await import(pathToFileURL(resolve(root, 'scripts/desktop-internal.mjs')))
  const cmd = internalBuildCommand('win32', 'x64')

  assert.doesNotMatch(script, /TAURI_SIGNING_PRIVATE_KEY|plugin-updater|createUpdaterArtifacts/)
  assert.deepEqual(cmd.args.slice(1), [
    'build',
    '--target',
    'x86_64-pc-windows-msvc',
    '--config',
    'src-tauri/tauri.internal.conf.json',
    '--bundles',
    'nsis',
    '--no-sign',
    '--ci',
  ])
})
