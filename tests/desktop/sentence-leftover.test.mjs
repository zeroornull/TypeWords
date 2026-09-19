import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  runInNewContext(transpile(readFileSync(resolve(root, 'app/core/composables/dictResourceLoad.ts'), 'utf8')), {
    exports,
    require() {
      throw new Error('dictResourceLoad must stay dependency-free')
    },
  })
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
  return {
    ...helpers,
    getDefaultDict: context.getDefaultDict,
    isDictIdMatch: context.isDictIdMatch,
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

const { applyFetchedDictResource, getDefaultDict, isDictIdMatch, resolveLastLearnIndex, createStore } = loadStore()
const sentenceInit = readFileSync(resolve(root, 'app/composables/practice-sentences/usePracticeSentenceInit.ts'), 'utf8')
const loadDictByIdSource = extractBraced(sentenceInit, 'async function loadDictById')

async function loadDictById({
  dictId = '1',
  leftover,
  nce1,
  catalog = [[{ id: 1, enName: 'cet4', lastLearnIndex: 0 }]],
  fetchEmpty = true,
  fetchedWords,
} = {}) {
  const wordList = leftover ? [leftover] : []
  const articleList = nce1 ? [nce1] : []
  const store = createStore(wordList, articleList)
  const context = {
    store,
    isDictIdMatch,
    getDefaultDict,
    applyFetchedDictResource,
    resourceWrap: value => value,
    DICT_LIST: { WORD: { ALL: '/list/word.json' } },
    fetch: async () => ({ json: async () => catalog }),
    _getDictDataByUrl: async dict => {
      if (fetchEmpty) return getDefaultDict()
      return getDefaultDict({
        ...dict,
        words: fetchedWords ?? [{ word: 'cancel' }, { word: 'possess' }],
        lastLearnIndex: 0,
      })
    },
  }
  runInNewContext(transpile(`${loadDictByIdSource}\nvar loadDictById = loadDictById;`), context)
  const dict = await context.loadDictById(dictId)
  return { dict, store, leftover, nce1 }
}

function leftoverCet4(extra = {}) {
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

function leftoverNce1(extra = {}) {
  return {
    id: '246',
    enName: 'nce1',
    custom: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
    complete: false,
    ...extra,
  }
}

function pageFiles(dir = resolve(root, 'app/pages')) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = resolve(dir, entry.name)
    if (entry.isDirectory()) found.push(...pageFiles(next))
    else found.push(next.replace(/\\/g, '/'))
  }
  return found
}

test('sentence loadDictById leftover official dest CET-4 lastLearnIndex=20 stays on empty miss after always changeDict', async () => {
  const leftover = leftoverCet4({ length: 0 })
  const nce1 = leftoverNce1()
  const { dict, store } = await loadDictById({ leftover, nce1, dictId: 1, fetchEmpty: true })
  assert.equal(dict, leftover)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
  assert.equal(nce1.lastLearnIndex, 3)
  assert.equal(nce1.id, '246')
})

test('sentence loadDictById leftover dest string id "1" wins catalog number and keeps lastLearnIndex=20', async () => {
  const leftover = leftoverCet4()
  const catalog = [[{ id: 1, enName: 'cet4', lastLearnIndex: 0, words: [] }]]
  const { dict } = await loadDictById({ leftover, dictId: 1, catalog, fetchEmpty: true })
  assert.equal(isDictIdMatch(leftover, 1), true)
  assert.equal(dict, leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 2607)
  assert.equal(leftover.id, '1')
})

test('sentence loadDictById catalog lastLearnIndex=0 still keeps leftover dest CET-4 20 via leftoverSnap', async () => {
  const leftover = leftoverCet4()
  const catalogBook = { id: 1, enName: 'cet4', lastLearnIndex: 0, custom: false, words: [] }
  const { leftover: kept } = await loadDictById({
    leftover,
    dictId: 'cet4-missing-numeric',
    catalog: [[catalogBook]],
    fetchEmpty: true,
  })
  assert.equal(kept.lastLearnIndex, 20)
  assert.equal(kept.id, '1')
})

test('sentence loadDictById missing article id does not write leftover dest NCE1 lastLearnIndex=3', async () => {
  const leftover = leftoverCet4()
  const nce1 = leftoverNce1()
  const { dict, store } = await loadDictById({
    leftover,
    nce1,
    dictId: 246,
    catalog: [[{ id: 1, enName: 'cet4', lastLearnIndex: 0 }]],
    fetchEmpty: true,
  })
  assert.equal(dict.id, '')
  assert.equal(dict.lastLearnIndex, 0)
  assert.equal(store.word.bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(store.article.bookList[0], nce1)
  assert.equal(nce1.lastLearnIndex, 3)
  assert.equal(nce1.id, '246')
})

test('sentence loadDictById loaded official words still clamp lastLearnIndex to the word list', async () => {
  const leftover = leftoverCet4({ words: [], length: 2607 })
  const { leftover: kept } = await loadDictById({
    leftover,
    dictId: '1',
    fetchEmpty: false,
    fetchedWords: [{ word: 'cancel' }, { word: 'possess' }],
  })
  assert.equal(kept.lastLearnIndex, 2)
  assert.equal(resolveLastLearnIndex(kept, 20), 2)
})

test('TypingSentence pages and session do not write leftover official lastLearnIndex', () => {
  const files = {
    init: sentenceInit,
    typing: readFileSync(resolve(root, 'app/components/practice-sentences/TypingSentence.vue'), 'utf8'),
    item: readFileSync(resolve(root, 'app/components/practice-sentences/TypingSentenceItem.vue'), 'utf8'),
    articleWord: readFileSync(resolve(root, 'app/components/practice-sentences/TypingArticleWord.vue'), 'utf8'),
    session: readFileSync(resolve(root, 'app/composables/practice-sentences/usePracticeSentenceSession.ts'), 'utf8'),
    persistence: readFileSync(
      resolve(root, 'app/composables/practice-sentences/usePracticeSentencePersistence.ts'),
      'utf8'
    ),
    cache: readFileSync(resolve(root, 'app/composables/practice-sentences/practice-sentence-cache.ts'), 'utf8'),
    flow: readFileSync(resolve(root, 'app/composables/practice-sentences/useSentenceTypingFlow.ts'), 'utf8'),
    panel: readFileSync(resolve(root, 'app/components/word/WordMetaPanel.vue'), 'utf8'),
    book: readFileSync(resolve(root, 'app/pages/(articles)/book/[id].vue'), 'utf8'),
    base: readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8'),
  }
  assert.match(files.init, /isDictIdMatch\(item, dictId\)/)
  assert.match(files.init, /applyFetchedDictResource\(dict, await _getDictDataByUrl\(dict\)\)/)
  assert.match(files.init, /store\.changeDict\(dict\)/)
  assert.doesNotMatch(files.init, /if \(!dict\.words\.length\)/)
  assert.doesNotMatch(files.init, /changeBook/)
  assert.match(files.base, /resolveLastLearnIndex\(leftoverSnap \?\? leftover, val\.lastLearnIndex\)/)
  for (const source of [
    files.typing,
    files.item,
    files.articleWord,
    files.session,
    files.persistence,
    files.cache,
    files.flow,
    files.panel,
  ]) {
    assert.doesNotMatch(source, /lastLearnIndex|changeDict|changeBook/)
  }
  assert.match(files.panel, /function startPracticeSentence\(\) \{\s*activeSentenceIndex = 0/)
  assert.match(files.book, /<TypingSentenceItem/)
  assert.doesNotMatch(
    files.book.replace(/item\.lastLearnIndex/g, '').replace(/sbook\.lastLearnIndex/g, ''),
    /TypingSentence[\s\S]*lastLearnIndex/
  )
  const pages = pageFiles()
  assert.equal(
    pages.some(path => path.includes('practice-sentences')),
    false
  )
  assert.equal(existsSync(resolve(root, 'app/pages/practice-sentences')), false)
})
