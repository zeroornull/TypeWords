import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())
const nodeRequire = createRequire(import.meta.url)

function transpile(rel) {
  return ts.transpileModule(readFileSync(resolve(root, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function loadTyping() {
  const visibleExports = {}
  runInNewContext(transpile('app/core/composables/practice-words/visible-word-typing.ts'), {
    exports: visibleExports,
    module: { exports: visibleExports },
    require() {
      throw new Error('visible-word-typing must stay dependency-free')
    },
  })
  const typingExports = {}
  runInNewContext(transpile('app/core/composables/practice-words/usePracticeWordTyping.ts'), {
    exports: typingExports,
    module: { exports: typingExports },
    require(name) {
      if (name === 'vue') return nodeRequire('vue')
      if (name.endsWith('enum.ts') || name.includes('types/enum')) {
        return { WordPlayTrigger: { Typo: 'Typo', NewWord: 'NewWord' }, WordPracticeType: { FollowWrite: 0, Spell: 1, Dictation: 4, Identify: 2, Listen: 3 } }
      }
      if (name.includes('utils/index')) return { normalizeWord: value => value }
      if (name.includes('visible-word-typing')) return visibleExports
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return typingExports.usePracticeWordTyping
}

function harness({ practiceType = 0, masked = false } = {}) {
  const events = []
  const timers = []
  const typing = loadTyping()({
    getWord: () => ({ word: 'possess' }),
    getPracticeType: () => practiceType,
    getIsWordMasked: () => masked,
    getShowWordResult: () => false,
    getSettings: () => ({
      ignoreCase: true,
      repeatCount: 1,
      waitTimeForChangeWord: 0,
      spaceCooldownTime: 0,
      autoNextWord: false,
      inputWrongClear: false,
    }),
    setShowWordResult() {},
    onComplete: () => events.push('complete'),
    onWrong: () => events.push('wrong'),
    onPlay: trigger => events.push(['play', trigger]),
    playBeep: () => events.push('beep'),
    playCorrect: () => events.push('correct'),
    playKeyboardAudio: () => events.push('key'),
    now: () => 0,
    setTimer: (fn, ms) => {
      const id = { fn, ms }
      timers.push(id)
      return id
    },
    clearTimer(id) {
      const index = timers.indexOf(id)
      if (index >= 0) timers.splice(index, 1)
    },
  })
  return { events, typing }
}

test('System CET-4 FollowWrite visible typo records 错词 via onWrong', () => {
  const { events, typing } = harness({ practiceType: 0, masked: false })
  typing.reset('NewWord')
  events.length = 0
  typing.typeCharacter({ key: 'z', code: 'KeyZ', shiftKey: false })
  assert.equal(events.includes('wrong'), true, `FollowWrite visible typo must persist 错词, got ${JSON.stringify(events)}`)
})

test('Spell masked typo still records 错词 via onWrong', () => {
  const { events, typing } = harness({ practiceType: 1, masked: true })
  typing.reset('NewWord')
  events.length = 0
  typing.typeCharacter({ key: 'z', code: 'KeyZ', shiftKey: false })
  assert.equal(events.includes('wrong'), true)
})

test('FollowWrite correct first letter does not record 错词', () => {
  const { events, typing } = harness({ practiceType: 0, masked: false })
  typing.reset('NewWord')
  events.length = 0
  typing.typeCharacter({ key: 'p', code: 'KeyP', shiftKey: false })
  assert.equal(events.includes('wrong'), false)
})
