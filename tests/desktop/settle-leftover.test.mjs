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

function runProgress(sdict, { newWordNumber = 0, ignoreScope = 'remaining', mode = 0 } = {}) {
  const { resolveLastLearnIndex } = loadHelpers()
  const session = readFileSync(resolve(root, 'app/core/composables/practice-words/usePracticeWordSession.ts'), 'utf8')
  const store = { sdict, allIgnoreWords: [], knownWords: [] }
  runInNewContext(
    transpile(extractNestedFunction(session, 'updateCompletedDictProgress')) + `\nupdateCompletedDictProgress(${JSON.stringify(ignoreScope)})`,
    {
      store,
      statStore: { newWordNumber },
      settingStore: { ignoreSimpleWord: false },
      WordPracticeMode: { Shuffle: 5 },
      getPracticeMode: () => mode,
      resolveLastLearnIndex,
    }
  )
  return sdict
}

test('settle leftover official dest CET-4 lastLearnIndex=20 stays when words are empty and length is 0', () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 0,
    complete: false,
  }
  runProgress(leftover, { newWordNumber: 0 })
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.complete, false)
  assert.equal(leftover.id, '1')
  assert.deepEqual(leftover.words, [])
})

test('settle leftover official dest CET-4 lastLearnIndex=20 stays on empty words with dest-like length 2607', () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    complete: false,
  }
  runProgress(leftover, { newWordNumber: 0 })
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.complete, false)
  assert.equal(leftover.id, '1')
})

test('settle leftover official empty length=0 does not write 0 when newWordNumber is 20', () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 0,
    complete: false,
  }
  runProgress(leftover, { newWordNumber: 20 })
  assert.notEqual(leftover.lastLearnIndex, 0)
  assert.equal(leftover.lastLearnIndex, 40)
  assert.equal(leftover.complete, false)
  assert.equal(leftover.id, '1')
})

test('settle leftover custom-20 complete lastLearnIndex=20 stays 20', () => {
  const leftover = {
    id: 'backup-custom',
    custom: true,
    words: Array.from({ length: 20 }, (_, i) => ({ word: `w${i}` })),
    lastLearnIndex: 20,
    length: 20,
    complete: true,
  }
  runProgress(leftover, { newWordNumber: 0 })
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.complete, true)
  assert.equal(leftover.id, 'backup-custom')
})

test('settle loaded official words still clamp lastLearnIndex to the word list', () => {
  const loaded = {
    id: 1,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 20,
    length: 2,
    complete: false,
  }
  runProgress(loaded, { newWordNumber: 0, ignoreScope: 'all' })
  assert.equal(loaded.lastLearnIndex, 2)
  assert.equal(loaded.complete, true)
})

test('settle Shuffle mode does not write leftover official lastLearnIndex', () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    words: [],
    lastLearnIndex: 20,
    length: 0,
    complete: false,
  }
  runProgress(leftover, { newWordNumber: 20, mode: 5 })
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.complete, false)
})

test('settleLocalPractice / persistence do not assign lastLearnIndex = length', () => {
  const session = readFileSync(resolve(root, 'app/core/composables/practice-words/usePracticeWordSession.ts'), 'utf8')
  const persistence = readFileSync(resolve(root, 'app/core/composables/usePracticePersistence.ts'), 'utf8')
  assert.match(session, /import \{ resolveLastLearnIndex \}/)
  assert.match(session, /function settleLocalPractice/)
  assert.match(session, /updateCompletedDictProgress\('remaining'\)/)
  assert.match(session, /resolveLastLearnIndex\(store\.sdict, store\.sdict\.length\)/)
  assert.match(session, /if \(store\.sdict\.words\?\.length\) store\.sdict\.complete = true/)
  assert.doesNotMatch(session, /store\.sdict\.lastLearnIndex = store\.sdict\.length/)
  assert.doesNotMatch(persistence, /lastLearnIndex/)
})
