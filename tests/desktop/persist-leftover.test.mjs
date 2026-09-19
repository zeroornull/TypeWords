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

function extractFunction(source, name) {
  const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true)
  const node = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(node, `missing ${name}`)
  return node.getText(file).replace(/^export /, '')
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

function loadShake() {
  const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
  const context = {}
  runInNewContext(transpile([extractFunction(utils, 'cloneDeep'), extractFunction(utils, 'shakeCommonDict')].join('\n')), context)
  assert.equal(typeof context.shakeCommonDict, 'function')
  return context.shakeCommonDict
}

function loadHydrate(fetchImpl) {
  const sync = readFileSync(resolve(root, 'app/core/composables/useDataSyncPersistence.ts'), 'utf8')
  const { applyFetchedDictResource } = loadHelpers()
  const context = {
    applyFetchedDictResource,
    _getDictDataByUrl: fetchImpl,
    DictType: { article: 'article' },
    console: { warn() {} },
  }
  runInNewContext(transpile(extractFunction(sync, 'hydrateDictData')), context)
  assert.equal(typeof context.hydrateDictData, 'function')
  return context.hydrateDictData
}

function leftoverDestState() {
  const collect = { id: 'wordCollect', enName: 'wordCollect', system: true, custom: false, words: [], lastLearnIndex: 0 }
  const wrong = { id: 'wordWrong', enName: 'wordWrong', system: true, custom: false, words: [{ word: 'possess' }], lastLearnIndex: 0 }
  const known = { id: 'wordKnown', enName: 'wordKnown', system: true, custom: false, words: [], lastLearnIndex: 0 }
  const cet4 = {
    id: '1',
    enName: 'cet4',
    custom: false,
    system: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    complete: false,
  }
  const articleCollect = {
    id: 'articleCollect',
    enName: 'articleCollect',
    system: true,
    custom: false,
    articles: [],
    lastLearnIndex: 0,
  }
  const nce1 = {
    id: '246',
    enName: 'nce1',
    custom: false,
    system: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
    complete: false,
  }
  const word = { bookList: [collect, wrong, known, cet4], studyIndex: 3 }
  const article = { bookList: [articleCollect, nce1], studyIndex: 1 }
  return {
    collect,
    wrong,
    known,
    cet4,
    articleCollect,
    nce1,
    word,
    article,
    store: {
      word,
      article,
      get sdict() {
        return this.word.bookList[this.word.studyIndex]
      },
      get sbook() {
        return this.article.bookList[this.article.studyIndex]
      },
    },
  }
}

function wordsWatchClamp(leftover, fetched) {
  const { applyFetchedDictResource } = loadHelpers()
  applyFetchedDictResource(leftover, fetched)
  if (leftover.words.length && leftover.lastLearnIndex > leftover.length) {
    leftover.lastLearnIndex = leftover.length
    leftover.complete = true
  }
  return leftover
}

function articlesWatchClamp(leftover, fetched) {
  const { applyFetchedDictResource } = loadHelpers()
  applyFetchedDictResource(leftover, fetched)
  if (leftover.articles.length && leftover.lastLearnIndex > leftover.length) {
    leftover.lastLearnIndex = leftover.length
    leftover.complete = true
  }
  return leftover
}

const shakeCommonDict = loadShake()
const { resolveLastLearnIndex } = loadHelpers()

test('Pinia persist shake keeps leftover official dest CET-4 lastLearnIndex=20', () => {
  const dest = leftoverDestState()
  const persisted = JSON.parse(JSON.stringify(shakeCommonDict(dest)))
  const cet4 = persisted.word.bookList[3]
  const nce1 = persisted.article.bookList[1]
  assert.equal(cet4.lastLearnIndex, 20)
  assert.deepEqual(cet4.words, [])
  assert.equal(cet4.id, '1')
  assert.equal(cet4.length, 2607)
  assert.equal(nce1.lastLearnIndex, 3)
  assert.deepEqual(nce1.articles, [])
  assert.equal(nce1.id, '246')
  assert.equal(dest.cet4.lastLearnIndex, 20)
  assert.equal(dest.nce1.lastLearnIndex, 3)
  assert.equal(dest.wrong.words[0].word, 'possess')
})

test('hydrate empty miss does not replace leftover official dest books or write lastLearnIndex 0', async () => {
  const dest = leftoverDestState()
  const empty = { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 }
  const hydrateDictData = loadHydrate(async () => empty)
  hydrateDictData(dest.store)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(dest.store.word.bookList[3], dest.cet4)
  assert.equal(dest.store.article.bookList[1], dest.nce1)
  assert.equal(dest.cet4.lastLearnIndex, 20)
  assert.equal(dest.cet4.length, 2607)
  assert.deepEqual(dest.cet4.words, [])
  assert.equal(dest.nce1.lastLearnIndex, 3)
  assert.equal(dest.nce1.length, 96)
  assert.deepEqual(dest.nce1.articles, [])
  assert.equal(dest.wrong.words[0].word, 'possess')
})

test('hydrate catalog fetch fills leftover official dest without writing lastLearnIndex 0', async () => {
  const dest = leftoverDestState()
  const hydrateDictData = loadHydrate(async (book, type) =>
    type === 'article'
      ? { id: 246, articles: [{ title: 'Excuse me' }], lastLearnIndex: 0, length: 1 }
      : { id: 1, words: [{ word: 'cancel' }, { word: 'possess' }], lastLearnIndex: 0, length: 2 }
  )
  hydrateDictData(dest.store)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(dest.store.word.bookList[3], dest.cet4)
  assert.equal(dest.store.article.bookList[1], dest.nce1)
  assert.equal(dest.cet4.lastLearnIndex, 20)
  assert.equal(dest.cet4.words[1].word, 'possess')
  assert.equal(dest.nce1.lastLearnIndex, 3)
  assert.equal(dest.nce1.articles[0].title, 'Excuse me')
})

test('words/articles load watches do not persist lastLearnIndex 0 over leftover dest', () => {
  const empty = { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 }
  const cet4 = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607, custom: false, complete: false }
  const nce1 = { id: '246', enName: 'nce1', articles: [], lastLearnIndex: 3, length: 96, custom: false, complete: false }
  wordsWatchClamp(cet4, empty)
  articlesWatchClamp(nce1, empty)
  const persisted = JSON.parse(
    JSON.stringify(
      shakeCommonDict({
        word: { bookList: [cet4], studyIndex: 0 },
        article: { bookList: [nce1], studyIndex: 0 },
      })
    )
  )
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(nce1.lastLearnIndex, 3)
  assert.equal(persisted.word.bookList[0].lastLearnIndex, 20)
  assert.equal(persisted.article.bookList[0].lastLearnIndex, 3)
  assert.notEqual(resolveLastLearnIndex(cet4, 0), 0)
  assert.equal(resolveLastLearnIndex(cet4, 0), 20)
})

test('Pinia/watch persist sources do not assign lastLearnIndex 0 or replace leftover dest books', () => {
  const base = readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8')
  const init = readFileSync(resolve(root, 'app/core/composables/useInit.ts'), 'utf8')
  const persist = readFileSync(resolve(root, 'app/core/composables/usePracticePersistence.ts'), 'utf8')
  const sync = readFileSync(resolve(root, 'app/core/composables/useDataSyncPersistence.ts'), 'utf8')
  const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
  const words = readFileSync(resolve(root, 'app/pages/(words)/words.vue'), 'utf8')
  const articles = readFileSync(resolve(root, 'app/pages/(articles)/articles.vue'), 'utf8')

  assert.doesNotMatch(init, /lastLearnIndex/)
  assert.match(init, /store\.\$subscribe\(dictAutosave\.callback/)
  assert.match(init, /saveDictState\(data\)/)
  assert.doesNotMatch(persist, /lastLearnIndex/)
  assert.match(utils, /if \(!v\.custom && !v\.system\) v\.words = \[\]/)
  assert.match(utils, /if \(!v\.custom && !v\.system\) v\.articles = \[\]/)
  assert.doesNotMatch(extractFunction(utils, 'shakeCommonDict'), /lastLearnIndex/)
  assert.match(sync, /applyFetchedDictResource\(dict, r\)/)
  assert.match(sync, /applyFetchedDictResource\(book, r\)/)
  assert.match(sync, /word\.bookList\[index\] === dict/)
  assert.match(sync, /article\.bookList\[index\] === book/)
  assert.doesNotMatch(sync, /bookList\[index\] = (r|getDefaultDict|fetched)/)
  assert.doesNotMatch(extractFunction(sync, 'hydrateDictData'), /lastLearnIndex/)
  assert.match(base, /resolveLastLearnIndex\(leftoverSnap \?\? leftover, val\.lastLearnIndex\)/)
  assert.match(words, /leftover\.words\.length && leftover\.lastLearnIndex > leftover\.length/)
  assert.match(articles, /leftover\.articles\.length && leftover\.lastLearnIndex > leftover\.length/)
  assert.doesNotMatch(words, /leftover\.lastLearnIndex = 0/)
  assert.doesNotMatch(articles, /leftover\.lastLearnIndex = 0/)
})
