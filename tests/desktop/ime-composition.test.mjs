import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()

function transpile(rel) {
  return ts.transpileModule(readFileSync(resolve(root, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function loadGuard() {
  const exports = {}
  runInNewContext(transpile('app/core/composables/imeCompositionGuard.ts'), {
    exports,
    module: { exports },
    require() {
      throw new Error('imeCompositionGuard must stay dependency-free')
    },
  })
  return exports
}

function eventFixture() {
  const handlers = new Map()
  const received = []
  const windowHandlers = new Map()
  const input = {
    value: '',
    focus() {},
    remove() {},
    addEventListener(type, fn) {
      handlers.set(type, fn)
    },
    removeEventListener(type) {
      handlers.delete(type)
    },
  }
  const exports = {}
  runInNewContext(transpile('app/core/hooks/event.ts'), {
    exports,
    setTimeout() {},
    console,
    document: { querySelector: () => input, body: { appendChild() {} } },
    window: {
      addEventListener(type, fn) {
        windowHandlers.set(type, fn)
      },
      removeEventListener(type) {
        windowHandlers.delete(type)
      },
    },
    require(name) {
      if (name === 'vue') return { onMounted: fn => fn(), onUnmounted() {}, onDeactivated() {} }
      if (name === '@/base') return { Toast: { warning() {} } }
      if (name === '../utils/eventBus') return { emitter: {} }
      if (name === '../stores' || name === '../utils') return {}
      if (name === '../composables/imeCompositionGuard') return loadGuard()
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  exports.useEventListener('keydown', e => received.push({ key: e.key, code: e.code }))
  return {
    input,
    received,
    has: type => handlers.has(type),
    send(type, event) {
      const fn = handlers.get(type)
      if (!fn) return false
      fn({ target: input, ...event })
      return true
    },
    key: event => windowHandlers.get('keydown')(event),
  }
}

function scoreAgainstTarget(target, keys) {
  let input = ''
  let typos = 0
  for (const key of keys) {
    if (key === 'Backspace') {
      input = input.slice(0, -1)
      continue
    }
    const expected = target[input.length]
    if (expected && key.toLowerCase() === expected.toLowerCase()) input += key
    else typos++
  }
  return { input, typos }
}

function asJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function collectKeys(guard, events) {
  const keys = []
  for (const event of events) {
    if (event.type === 'input') keys.push(...guard.onInput(event).keys)
    else if (event.type === 'keydown') keys.push(...guard.onKey(event).keys)
    else keys.push(...guard.onComposition(event).keys)
  }
  return asJson(keys)
}

const { createImeCompositionGuard, imeCompositionCommitKeys, isImeComposingKey } = loadGuard()

test('compositionstart and compositionupdate never commit keys', () => {
  const guard = createImeCompositionGuard()
  assert.deepEqual(asJson(guard.onComposition({ type: 'compositionstart' })), { phase: 'composing', keys: [] })
  assert.deepEqual(asJson(guard.onComposition({ type: 'compositionupdate', data: 'n' })), { phase: 'composing', keys: [] })
  assert.deepEqual(asJson(guard.onComposition({ type: 'compositionupdate', data: 'ni' })), { phase: 'composing', keys: [] })
  assert.deepEqual(asJson(guard.onComposition({ type: 'compositionupdate', data: '你' })), { phase: 'composing', keys: [] })
  assert.equal(guard.phase(), 'composing')
  assert.deepEqual(asJson(imeCompositionCommitKeys('compositionstart', 'n')), [])
  assert.deepEqual(asJson(imeCompositionCommitKeys('compositionupdate', '你')), [])
})

test('cancelled compositionend commits nothing and resumes ordinary keys', () => {
  const guard = createImeCompositionGuard()
  const keys = collectKeys(guard, [
    { type: 'compositionstart' },
    { type: 'compositionupdate', data: 'n' },
    { type: 'input', inputType: 'insertCompositionText', data: 'n', value: 'n' },
    { type: 'keydown', key: 'Backspace', isComposing: true },
    { type: 'compositionend', data: '' },
    { type: 'input', inputType: 'insertCompositionText', data: null, value: '' },
    { type: 'keydown', key: 'Process', code: 'KeyP' },
    { type: 'keydown', key: 'p', code: 'KeyP' },
  ])
  assert.deepEqual(keys, ['p'])
  assert.equal(guard.phase(), 'idle')
})

test('confirmed compositionend commits the final string once, not each preedit snapshot', () => {
  const guard = createImeCompositionGuard()
  const keys = collectKeys(guard, [
    { type: 'compositionstart' },
    { type: 'compositionupdate', data: 'c' },
    { type: 'compositionupdate', data: 'ca' },
    { type: 'input', inputType: 'insertCompositionText', data: 'ca', value: 'ca' },
    { type: 'compositionend', data: 'ca' },
  ])
  assert.deepEqual(keys, ['c', 'a'])
  assert.deepEqual(asJson(imeCompositionCommitKeys('compositionend', 'ca')), ['c', 'a'])
  assert.deepEqual(asJson(imeCompositionCommitKeys('compositionend', '')), [])
  assert.deepEqual(asJson(imeCompositionCommitKeys('compositionend', null)), [])
})

test('partial IME preedit against possess does not score as typos', () => {
  const guard = createImeCompositionGuard()
  const committed = collectKeys(guard, [
    { type: 'compositionstart' },
    { type: 'compositionupdate', data: 'n' },
    { type: 'input', inputType: 'insertCompositionText', data: 'n', value: 'n' },
    { type: 'compositionupdate', data: 'ni' },
    { type: 'input', inputType: 'insertCompositionText', data: 'ni', value: 'ni' },
    { type: 'compositionupdate', data: '你' },
    { type: 'input', inputType: 'insertCompositionText', data: '你', value: '你' },
    { type: 'keydown', key: 'n', isComposing: true },
    { type: 'compositionend', data: '' },
  ])
  const naivePreedit = [...'n', ...'ni', ...'你']
  assert.deepEqual(committed, [])
  assert.equal(scoreAgainstTarget('possess', committed).typos, 0)
  assert.ok(scoreAgainstTarget('possess', naivePreedit).typos > 0)
})

test('composing keys and Process stay ignored until composition ends', () => {
  const guard = createImeCompositionGuard()
  guard.onComposition({ type: 'compositionstart' })
  for (const event of [
    { key: 'Backspace', isComposing: true },
    { key: 'Enter', isComposing: true },
    { key: ' ', isComposing: true },
    { key: 'a', isComposing: true },
    { key: 'Process' },
  ]) {
    assert.equal(isImeComposingKey(event, 'composing'), true)
    assert.deepEqual(asJson(guard.onKey(event)), { phase: 'composing', keys: [] })
  }
  assert.equal(isImeComposingKey({ key: 'Backspace', isComposing: true }, 'idle'), true)
  assert.equal(isImeComposingKey({ key: 'Process' }, 'idle'), true)
  assert.equal(isImeComposingKey({ key: 'p' }, 'idle'), false)
})

test('event.ts compositionstart/update/end do not emit partial IME as practice keys', () => {
  const source = readFileSync(resolve(root, 'app/core/hooks/event.ts'), 'utf8')
  assert.match(source, /createImeCompositionGuard/)
  assert.match(source, /imeGuard\.onComposition/)
  assert.match(source, /imeGuard\.onInput/)
  assert.match(source, /compositionstart/)
  assert.match(source, /compositionupdate/)
  assert.match(source, /compositionend/)
  assert.match(source, /e\.isComposing \|\| e\.key === 'Process'/)

  const f = eventFixture()
  assert.equal(f.has('compositionstart'), true)
  assert.equal(f.has('compositionupdate'), true)
  assert.equal(f.has('compositionend'), true)

  f.send('compositionstart', {})
  f.input.value = 'n'
  assert.equal(f.send('compositionupdate', { data: 'n' }), true)
  f.send('input', { inputType: 'insertCompositionText', data: 'n' })
  f.input.value = 'ni'
  f.send('compositionupdate', { data: 'ni' })
  f.send('input', { inputType: 'insertCompositionText', data: 'ni' })
  f.key({ key: 'n', code: 'KeyN', isComposing: true })
  f.key({ key: 'Process', code: 'KeyN', isComposing: false })
  assert.deepEqual(f.received, [])

  f.send('compositionend', { data: '' })
  f.send('input', { inputType: 'insertCompositionText', data: null })
  assert.deepEqual(f.received, [])

  const confirmed = eventFixture()
  confirmed.send('compositionstart', {})
  confirmed.input.value = 'c'
  confirmed.send('compositionupdate', { data: 'c' })
  confirmed.send('input', { inputType: 'insertCompositionText', data: 'c' })
  confirmed.input.value = 'ca'
  confirmed.send('compositionupdate', { data: 'ca' })
  confirmed.send('input', { inputType: 'insertCompositionText', data: 'ca' })
  assert.deepEqual(confirmed.received, [])
  confirmed.send('compositionend', { data: 'ca' })
  assert.deepEqual(confirmed.received, [
    { key: 'c', code: 'KeyC' },
    { key: 'a', code: 'KeyA' },
  ])
  confirmed.send('input', { inputType: 'insertCompositionText', data: 'ca', value: 'ca' })
  assert.deepEqual(confirmed.received, [
    { key: 'c', code: 'KeyC' },
    { key: 'a', code: 'KeyA' },
  ])
})
