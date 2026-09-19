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

function extractBraced(source, startNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const brace = source.indexOf('{', start)
  let depth = 0
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  assert.fail(`unclosed ${startNeedle}`)
}

function loadHelpers() {
  const exports = {}
  runInNewContext(
    transpile(readFileSync(resolve(root, 'app/core/composables/dictResourceLoad.ts'), 'utf8')),
    {
      exports,
      require() {
        throw new Error('dictResourceLoad must stay dependency-free')
      },
    }
  )
  return exports
}

function loadStore() {
  const func = readFileSync(resolve(root, 'app/core/types/func.ts'), 'utf8')
  const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
  const base = readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8')
  const helpers = loadHelpers()
  const context = {
    shallowReactive: value => value,
    DictType: { word: 'word', article: 'article' },
    resolveLastLearnIndex: helpers.resolveLastLearnIndex,
    applyFetchedDictResource: helpers.applyFetchedDictResource,
  }
  runInNewContext(
    transpile(
      [
        extractFunction(func, 'getDefaultDict'),
        extractFunction(utils, 'normalizeDictId'),
        extractFunction(utils, 'getDictIdentityList'),
        extractFunction(utils, 'isDictIdMatch'),
        extractFunction(utils, 'isSameDictResource'),
        `var storeApi = {
  ${extractBraced(base, 'async changeDict(val: Dict)')},
  ${extractBraced(base, 'async changeBook(val: Dict)')},
};`,
      ].join('\n')
    ),
    context
  )
  assert.equal(typeof context.storeApi?.changeDict, 'function')
  assert.equal(typeof context.storeApi?.changeBook, 'function')
  return {
    ...helpers,
    getDefaultDict: context.getDefaultDict,
    isSameDictResource: context.isSameDictResource,
    createStore(wordList, articleList) {
      return {
        word: { bookList: wordList, studyIndex: wordList.length ? 0 : -1 },
        article: { bookList: articleList, studyIndex: articleList.length ? 0 : -1 },
        changeDict: context.storeApi.changeDict,
        changeBook: context.storeApi.changeBook,
      }
    },
  }
}

const {
  applyFetchedDictResource,
  resolveLastLearnIndex,
  getDefaultDict,
  isSameDictResource,
  createStore,
} = loadStore()

test('changeDict leftover official dest CET-4 lastLearnIndex=20 stays on empty fetch', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore([leftover], [])
  applyFetchedDictResource(leftover, getDefaultDict())
  await store.changeDict(leftover)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 2607)
  assert.equal(leftover.id, '1')
})

test('changeDict leftover official dest CET-4 lastLearnIndex=20 stays when length is 0', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 0,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore([leftover], [])
  applyFetchedDictResource(leftover, getDefaultDict())
  await store.changeDict(leftover)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
})

test('changeDict loaded official words still clamp lastLearnIndex to the word list', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 20,
    length: 2,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore([leftover], [])
  await store.changeDict(leftover)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 2)
  assert.equal(leftover.complete, true)
})

test('changeBook leftover official dest NCE1 lastLearnIndex=3 stays on empty fetch', async () => {
  const leftover = {
    id: '246',
    enName: 'nce1',
    custom: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
    complete: false,
  }
  const store = createStore([], [leftover])
  applyFetchedDictResource(leftover, getDefaultDict())
  await store.changeBook(leftover)
  assert.equal(store.article.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 3)
  assert.equal(leftover.length, 96)
  assert.equal(leftover.id, '246')
})

test('empty getDefaultDict() miss does not replace leftover dest books', async () => {
  const cet4 = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
  }
  const nce1 = {
    id: '246',
    enName: 'nce1',
    custom: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
  }
  const store = createStore([cet4], [nce1])
  const empty = getDefaultDict()
  assert.equal(empty.lastLearnIndex, 0)
  assert.equal(empty.id, '')
  await store.changeDict(empty)
  await store.changeBook(empty)
  assert.equal(store.word.bookList[0], cet4)
  assert.equal(store.article.bookList[0], nce1)
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(nce1.lastLearnIndex, 3)
  assert.equal(cet4.id, '1')
  assert.equal(nce1.id, '246')
})

test('changeDict(getDefaultDict(catalog CET-4)) keeps leftover lastLearnIndex=20', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore([leftover], [])
  const catalog = getDefaultDict({ id: 1, enName: 'cet4', length: 2607 })
  assert.equal(catalog.lastLearnIndex, 0)
  assert.equal(catalog.words.length, 0)
  await store.changeDict(catalog)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 2607)
  assert.equal(leftover.id, 1)
})

test('changeDict catalog fetch still keeps leftover dest CET-4 lastLearnIndex=20', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore([leftover], [])
  const catalog = getDefaultDict({
    id: 1,
    enName: 'cet4',
    length: 2607,
    words: [{ word: 'possess' }, { word: 'cancel' }],
  })
  assert.equal(catalog.lastLearnIndex, 0)
  await store.changeDict(catalog)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.words[0].word, 'possess')
  assert.equal(leftover.id, 1)
})

test('changeDict(getDefaultDict(catalog CET-4)) writes 0 over leftover dest 20 when official words are loaded', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: Array.from({ length: 21 }, (_, i) => ({ word: `w${i}` })),
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore(
    [
      { id: 'wordCollect', custom: false, words: [] },
      { id: 'wordWrong', custom: false, words: [] },
      { id: 'wordKnown', custom: false, words: [] },
      leftover,
    ],
    []
  )
  const catalog = getDefaultDict({
    id: 1,
    enName: 'cet4',
    length: 2607,
    words: leftover.words.slice(),
  })
  assert.equal(catalog.lastLearnIndex, 0)
  await store.changeDict(catalog)
  assert.equal(store.word.bookList[3], leftover)
  assert.equal(leftover.lastLearnIndex, 0)
})

test('dict.vue catalog getDefaultDict lastLearnIndex=0 keeps leftover dest 20 via resolveLastLearnIndex(leftover)', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: Array.from({ length: 21 }, (_, i) => ({ word: `w${i}` })),
    lastLearnIndex: 20,
    length: 2607,
    perDayStudyNumber: 20,
    complete: false,
  }
  const store = createStore(
    [
      { id: 'wordCollect', custom: false, words: [] },
      { id: 'wordWrong', custom: false, words: [] },
      { id: 'wordKnown', custom: false, words: [] },
      leftover,
    ],
    []
  )
  const catalog = getDefaultDict({
    id: 1,
    enName: 'cet4',
    length: 2607,
    words: leftover.words.slice(),
  })
  assert.equal(catalog.lastLearnIndex, 0)
  catalog.lastLearnIndex = resolveLastLearnIndex(leftover)
  assert.equal(catalog.lastLearnIndex, 20)
  await store.changeDict(catalog)
  assert.equal(store.word.bookList[3], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.words[0].word, 'w0')
  assert.equal(leftover.id, 1)
})

test('changeBook(getDefaultDict(catalog NCE1)) keeps leftover lastLearnIndex=3', async () => {
  const leftover = {
    id: '246',
    enName: 'nce1',
    custom: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
    complete: false,
  }
  const store = createStore([], [leftover])
  const catalog = getDefaultDict({ id: 246, enName: 'nce1', length: 96 })
  assert.equal(catalog.lastLearnIndex, 0)
  await store.changeBook(catalog)
  assert.equal(store.article.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 3)
  assert.equal(leftover.length, 96)
  assert.equal(String(leftover.id), '246')
})

test('dict-list getDictDetail catalog CET-4 does not fork leftover dest "1" or zero lastLearnIndex=20', async () => {
  const catalogResource = JSON.parse(readFileSync(resolve(root, 'public/list/word.json'), 'utf8')).find(
    item => item.enName === 'cet4'
  )
  assert.equal(catalogResource?.id, 1)
  const destShapes = [
    { words: [], label: 'empty official words' },
    { words: Array.from({ length: 21 }, (_, i) => ({ word: `w${i}` })), label: 'loaded official words' },
  ]
  for (const shape of destShapes) {
    const leftover = {
      id: '1',
      enName: 'cet4',
      custom: false,
      words: shape.words,
      lastLearnIndex: 20,
      length: 2607,
      perDayStudyNumber: 20,
      complete: false,
    }
    const store = createStore(
      [
        { id: 'wordCollect', custom: false, words: [] },
        { id: 'wordWrong', custom: false, words: [] },
        { id: 'wordKnown', custom: false, words: [] },
        leftover,
      ],
      []
    )
    const edit = getDefaultDict({
      id: catalogResource.id,
      enName: catalogResource.enName,
      length: catalogResource.length,
      words: leftover.words.slice(),
    })
    assert.equal(edit.lastLearnIndex, 0, shape.label)
    const matched = store.word.bookList.find(v => isSameDictResource(v, edit))
    assert.equal(matched, leftover, shape.label)
    edit.lastLearnIndex = resolveLastLearnIndex(matched)
    assert.equal(edit.lastLearnIndex, 20, shape.label)
    await store.changeDict(edit)
    assert.equal(store.word.bookList.length, 4, shape.label)
    assert.equal(store.word.bookList[3], leftover, shape.label)
    assert.equal(leftover.lastLearnIndex, 20, shape.label)
  }
})

test('dict-list leftover official catalog id source lock', () => {
  const dictList = readFileSync(resolve(root, 'app/pages/(words)/dict-list.vue'), 'utf8')
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  assert.match(dictList, /isDictIdMatch\(v, 1\)/)
  assert.doesNotMatch(dictList, /v\.id === 1/)
  assert.match(dictList, /runtimeStore\.editDict = getDefaultDict\(val\)/)
  assert.match(dictList, /nav\('\/dict', \{ from: 'list' \}\)/)
  assert.doesNotMatch(dictList, /lastLearnIndex/)
  assert.doesNotMatch(dictList, /bookList/)
  assert.doesNotMatch(dictList, /changeDict/)
  assert.doesNotMatch(dictList, /leftover\.id\s*=/)
  assert.match(dict, /function keepLeftoverLearnIndex\(edit: Dict\)/)
  assert.match(dict, /keepLeftoverLearnIndex\(runtimeStore\.editDict\)/)
})

test('changeBook / forcePush / hydrate do not assign empty default over leftover dest', () => {
  const base = readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8')
  const sync = readFileSync(resolve(root, 'app/core/composables/useDataSyncPersistence.ts'), 'utf8')
  const practiceArticles = readFileSync(resolve(root, 'app/pages/(articles)/practice-articles/[id].vue'), 'utf8')
  const book = readFileSync(resolve(root, 'app/pages/(articles)/book/[id].vue'), 'utf8')
  const sentenceInit = readFileSync(resolve(root, 'app/composables/practice-sentences/usePracticeSentenceInit.ts'), 'utf8')
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')

  assert.match(base, /resolveLastLearnIndex\(leftoverSnap \?\? val, val\.length\)/)
  assert.match(base, /resolveLastLearnIndex\(leftoverSnap \?\? leftover, val\.lastLearnIndex\)/)
  assert.match(base, /\/\/ this\.article\.bookList\[this\.article\.studyIndex\] = getDefaultDict\(val\)/)
  assert.doesNotMatch(
    base.replace(/\/\/ this\.article\.bookList\[this\.article\.studyIndex\] = getDefaultDict\(val\)/, ''),
    /this\.(word|article)\.bookList\[this\.(word|article)\.studyIndex\] = getDefaultDict/
  )
  assert.match(sync, /applyFetchedDictResource\(dict, r\)/)
  assert.match(sync, /applyFetchedDictResource\(book, r\)/)
  assert.doesNotMatch(sync, /bookList\[index\] = (r|getDefaultDict)/)
  assert.match(sync, /async function forcePushLocalDataToRemote/)
  assert.doesNotMatch(sync.slice(sync.indexOf('async function forcePushLocalDataToRemote')), /hydrateDictData|_getDictDataByUrl|getDefaultDict\(\)/)
  assert.match(practiceArticles, /if \(!dict\.articles\.length\)/)
  assert.match(practiceArticles, /await store\.changeBook\(dict\)/)
  assert.match(book, /if \(!sbook\.articles\.length\)/)
  assert.match(book, /await store\.changeBook\(sbook\)/)
  assert.match(sentenceInit, /applyFetchedDictResource\(dict, await _getDictDataByUrl\(dict\)\)/)
  assert.match(dict, /function keepLeftoverLearnIndex\(edit: Dict\)/)
  assert.match(dict, /isSameDictResource\(v, edit\)/)
  assert.match(dict, /edit\.lastLearnIndex = resolveLastLearnIndex\(leftover\)/)
  assert.equal((dict.match(/keepLeftoverLearnIndex\(runtimeStore\.editDict\)/g) || []).length, 3)
  assert.match(dict, /keepLeftoverLearnIndex\(runtimeStore\.editDict\)\s*\n\s*await base\.changeDict\(runtimeStore\.editDict\)/)
  assert.match(dict, /await base\.changeDict\(runtimeStore\.editDict\)/)
  assert.match(utils, /return getDefaultDict\(\)/)
})
