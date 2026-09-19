import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function extractNestedFunction(source, name) {
  const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true)
  let found
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name?.text === name) {
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(found, `missing ${name}`)
  return found.getText(file).replace(/^export /, '')
}

function loadHelpers() {
  const exports = {}
  runInNewContext(transpile(readFileSync(resolve(root, 'app/core/composables/dictResourceLoad.ts'), 'utf8')), {
    exports,
    require() {
      throw new Error('dictResourceLoad must stay dependency-free')
    },
  })
  return exports
}

const { applyFetchedDictResource, resolveLastLearnIndex } = loadHelpers()

function leftoverOfficialCet4(extra = {}) {
  return {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
    ...extra,
  }
}

function runCreateTaskFromGroup(sdict, group) {
  const session = readFileSync(resolve(root, 'app/core/composables/practice-words/usePracticeWordSession.ts'), 'utf8')
  const store = { sdict }
  runInNewContext(
    transpile(extractNestedFunction(session, 'createTaskFromGroup')) + `\ncreateTaskFromGroup(${JSON.stringify(group)})`,
    {
      store,
      resolveLastLearnIndex,
      createStudyTask: () => ({ taskWords: { new: [], review: [] } }),
    }
  )
  return sdict
}

/** words.vue leftover-load clamp after applyFetchedDictResource */
function applyWordsLeftoverLoadClamp(leftover) {
  if (leftover.words.length && leftover.lastLearnIndex > leftover.length) {
    leftover.lastLearnIndex = leftover.length
    leftover.complete = true
  }
  return leftover
}

test('createTaskFromGroup leftover official dest CET-4 lastLearnIndex=20 stays on group=1 when words are empty', () => {
  const leftover = leftoverOfficialCet4()
  runCreateTaskFromGroup(leftover, 1)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.complete, false)
  assert.equal(leftover.id, '1')
  assert.deepEqual(leftover.words, [])
})

test('createTaskFromGroup leftover official dest CET-4 lastLearnIndex=20 stays on group=1 when length is 0', () => {
  const leftover = leftoverOfficialCet4({ length: 0 })
  runCreateTaskFromGroup(leftover, 1)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
  assert.equal(leftover.length, 0)
})

test('createTaskFromGroup leftover official dest CET-4 lastLearnIndex=20 stays on group=2 when words are empty', () => {
  const leftover = leftoverOfficialCet4()
  runCreateTaskFromGroup(leftover, 2)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
})

test('createTaskFromGroup loaded official words still jump group=1 to lastLearnIndex=0', () => {
  const loaded = {
    id: 1,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 20,
    length: 2,
    perDayStudyNumber: 20,
  }
  runCreateTaskFromGroup(loaded, 1)
  assert.equal(loaded.lastLearnIndex, 0)
})

test('createTaskFromGroup loaded official words still jump group=2 by perDayStudyNumber', () => {
  const loaded = {
    id: 1,
    words: Array.from({ length: 40 }, (_, i) => ({ word: `w${i}` })),
    lastLearnIndex: 20,
    length: 40,
    perDayStudyNumber: 20,
  }
  runCreateTaskFromGroup(loaded, 2)
  assert.equal(loaded.lastLearnIndex, 20)
})

test('createTaskFromGroup / leftover-load clamps source lock remaining lastLearnIndex writes', () => {
  const words = readFileSync(resolve(root, 'app/pages/(words)/words.vue'), 'utf8')
  const articles = readFileSync(resolve(root, 'app/pages/(articles)/articles.vue'), 'utf8')
  const session = readFileSync(resolve(root, 'app/core/composables/practice-words/usePracticeWordSession.ts'), 'utf8')
  const setting = readFileSync(resolve(root, 'app/components/word/PracticeSettingDialog.vue'), 'utf8')
  const base = readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8')

  assert.match(session, /import \{ resolveLastLearnIndex \}/)
  assert.match(session, /function createTaskFromGroup/)
  assert.match(
    session,
    /resolveLastLearnIndex\(\s*store\.sdict,\s*\(group - 1\) \* store\.sdict\.perDayStudyNumber\s*\)/
  )
  assert.doesNotMatch(session, /store\.sdict\.lastLearnIndex = \(group - 1\) \* store\.sdict\.perDayStudyNumber/)
  assert.doesNotMatch(session, /store\.sdict\.lastLearnIndex = store\.sdict\.length/)

  assert.match(setting, /resolveLastLearnIndex\(runtimeStore\.editDict, tempLastLearnIndex\)/)
  assert.match(words, /resolveLastLearnIndex\(runtimeStore\.editDict,\s*e\)/)
  assert.match(base, /resolveLastLearnIndex\(leftoverSnap \?\? val, val\.length\)/)
  assert.match(base, /resolveLastLearnIndex\(leftoverSnap \?\? leftover, val\.lastLearnIndex\)/)
  assert.match(session, /resolveLastLearnIndex\(store\.sdict, store\.sdict\.length\)/)

  assert.match(words, /leftover\.words\.length && leftover\.lastLearnIndex > leftover\.length/)
  assert.match(articles, /leftover\.articles\.length && leftover\.lastLearnIndex > leftover\.length/)
})

test('words.vue leftover-load clamp keeps leftover official dest CET-4 lastLearnIndex=20 on empty words', () => {
  const leftover = leftoverOfficialCet4()
  applyFetchedDictResource(leftover, { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 })
  applyWordsLeftoverLoadClamp(leftover)
  leftover.lastLearnIndex = resolveLastLearnIndex(leftover, leftover.length)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 2607)
  assert.equal(leftover.complete, false)
  assert.equal(leftover.id, '1')
})

test('words.vue leftover-load clamp keeps leftover official dest CET-4 lastLearnIndex=20 when length is 0', () => {
  const leftover = leftoverOfficialCet4({ length: 0 })
  applyFetchedDictResource(leftover, { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 })
  applyWordsLeftoverLoadClamp(leftover)
  leftover.lastLearnIndex = resolveLastLearnIndex(leftover, leftover.length)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 0)
  assert.equal(leftover.id, '1')
})

test('words.vue leftover-load clamp still completes loaded official words when lastLearnIndex exceeds length', () => {
  const leftover = leftoverOfficialCet4()
  applyFetchedDictResource(leftover, {
    id: 1,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 0,
    length: 2,
  })
  applyWordsLeftoverLoadClamp(leftover)
  assert.equal(leftover.lastLearnIndex, 2)
  assert.equal(leftover.complete, true)
  assert.equal(leftover.words[1].word, 'possess')
})
