import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()

function asJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadRecovery() {
  const exports = {}
  const source = readFileSync(resolve(root, 'app/core/composables/localStoreRecovery.ts'), 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require() {
        throw new Error('localStoreRecovery must stay dependency-free')
      },
    }
  )
  return exports
}

const { LOCAL_STORE_CORRUPT_MESSAGE, isLocalStoreAbsent, notifyLocalStoreRecovery, readLocalStoreRecord } =
  loadRecovery()

test('first-run is only an absent local key and never toasts', async () => {
  const toasts = []
  for (const raw of [null, undefined, '']) {
    assert.equal(isLocalStoreAbsent(raw), true)
    const loaded = await readLocalStoreRecord(raw, async () => {
      throw new Error('parser must not run on first-run')
    })
    assert.deepEqual(asJson(loaded), { recovery: 'first-run', record: null })
    notifyLocalStoreRecovery(loaded.recovery, 'dict', { error: message => toasts.push(message) })
  }
  assert.deepEqual(toasts, [])
})

test('unreadable stored payloads are corrupt, keep no record, and toast once per kind', async () => {
  const toasts = []
  const toast = { error: message => toasts.push(message) }
  const invalidJson = await readLocalStoreRecord('{not-json', async value => JSON.parse(value))
  assert.equal(invalidJson.recovery, 'corrupt')
  assert.equal(invalidJson.record, null)
  assert.match(invalidJson.reason, /JSON|Unexpected|not valid/i)
  notifyLocalStoreRecovery(invalidJson.recovery, 'dict', toast)

  const notText = await readLocalStoreRecord({ version: 4 }, async () => ({ version: 4, val: {} }))
  assert.deepEqual(asJson(notText), { recovery: 'corrupt', record: null, reason: 'stored value is not text' })
  notifyLocalStoreRecovery(notText.recovery, 'setting', toast)

  const thrown = await readLocalStoreRecord('{"version":4}', async () => {
    throw new Error('upgrade exploded')
  })
  assert.deepEqual(asJson(thrown), { recovery: 'corrupt', record: null, reason: 'upgrade exploded' })

  const emptyObject = await readLocalStoreRecord('{"version":4}', async () => null)
  assert.deepEqual(asJson(emptyObject), {
    recovery: 'corrupt',
    record: null,
    reason: 'parsed value is not an object',
  })

  assert.deepEqual(toasts, [LOCAL_STORE_CORRUPT_MESSAGE.dict, LOCAL_STORE_CORRUPT_MESSAGE.setting])
})

test('readable stored envelopes stay ok and do not toast', async () => {
  const toasts = []
  const record = { version: 4, val: { load: false } }
  const loaded = await readLocalStoreRecord(JSON.stringify(record), async value => JSON.parse(value))
  assert.deepEqual(asJson(loaded), { recovery: 'ok', record })
  notifyLocalStoreRecovery(loaded.recovery, 'dict', { error: message => toasts.push(message) })
  assert.deepEqual(toasts, [])
})

test('dict and setting stores toast only after a thrown local read', () => {
  const dict = readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8')
  const setting = readFileSync(resolve(root, 'app/core/stores/setting.ts'), 'utf8')
  for (const source of [dict, setting]) {
    assert.match(source, /readLocalStoreRecord/)
    assert.match(source, /notifyLocalStoreRecovery/)
  }
  assert.match(dict, /notifyLocalStoreRecovery\(loaded\.recovery, 'dict', Toast\)/)
  assert.match(dict, /notifyLocalStoreRecovery\('corrupt', 'dict', Toast\)/)
  assert.match(setting, /notifyLocalStoreRecovery\(loaded\.recovery, 'setting', Toast\)/)
  assert.match(setting, /notifyLocalStoreRecovery\('corrupt', 'setting', Toast\)/)
  assert.match(setting, /__updateLocalData/)
})
