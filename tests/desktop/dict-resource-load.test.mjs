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

function loadDictResource() {
  const exports = {}
  const source = readFileSync(resolve(root, 'app/core/composables/dictResourceLoad.ts'), 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require() {
        throw new Error('dictResourceLoad must stay dependency-free')
      },
    }
  )
  return exports
}

const {
  DICT_RESOURCE_MISS_MESSAGE,
  applyFetchedDictResource,
  leftoverLearnIndexBound,
  isDictResourceAbsent,
  isDictResourceHttpMiss,
  notifyDictResourceLoad,
  readDictResourcePayload,
  resolveLastLearnIndex,
} = loadDictResource()

test('HTTP miss and empty payload toast a recovery path and keep no words', async () => {
  const toasts = []
  const toast = { warning: message => toasts.push(message) }

  assert.equal(isDictResourceAbsent(null), true)
  assert.equal(isDictResourceAbsent(''), true)
  assert.equal(isDictResourceHttpMiss(404), true)
  assert.equal(isDictResourceHttpMiss(200), false)

  const missingHttp = await readDictResourcePayload(async () => ({
    ok: false,
    status: 404,
    payload: { words: [{ word: 'should-not-use' }] },
  }))
  assert.deepEqual(asJson(missingHttp), { status: 'miss', payload: null, reason: 'HTTP 404' })
  notifyDictResourceLoad(missingHttp.status, toast)

  const emptyBody = await readDictResourcePayload(async () => ({
    ok: true,
    status: 200,
    payload: null,
  }))
  assert.deepEqual(asJson(emptyBody), { status: 'miss', payload: null, reason: 'empty dictionary resource' })
  notifyDictResourceLoad(emptyBody.status, toast)

  assert.deepEqual(toasts, [DICT_RESOURCE_MISS_MESSAGE, DICT_RESOURCE_MISS_MESSAGE])
})

test('fetch or parse throws toast the same recovery path and do not reject', async () => {
  const toasts = []
  const failed = await readDictResourcePayload(async () => {
    throw new Error('Failed to fetch')
  })
  assert.deepEqual(asJson(failed), { status: 'error', payload: null, reason: 'Failed to fetch' })
  notifyDictResourceLoad(failed.status, { warning: message => toasts.push(message) })
  assert.deepEqual(toasts, [DICT_RESOURCE_MISS_MESSAGE])
})

test('readable dictionary JSON stays ok and does not toast', async () => {
  const toasts = []
  const words = [{ word: 'fixture' }]
  const loaded = await readDictResourcePayload(async () => ({
    ok: true,
    status: 200,
    payload: words,
  }))
  assert.deepEqual(asJson(loaded), { status: 'ok', payload: words })
  notifyDictResourceLoad(loaded.status, { warning: message => toasts.push(message) })
  assert.deepEqual(toasts, [])
})

test('_getDictDataByUrl notifies miss or error instead of throwing', () => {
  const source = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
  assert.match(source, /readDictResourcePayload/)
  assert.match(source, /notifyDictResourceLoad\(loaded\.status, Toast\)/)
  assert.match(source, /if \(!response\.ok\)/)
  assert.match(source, /return getDefaultDict\(\)/)
  assert.doesNotMatch(source, /\.then\(r => r\.json\(\)\)/)
})

test('leftover official dest string id fails naive catalog includes', () => {
  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  const catalog = [{ id: 1, enName: 'cet4', url: 'CET4_T.json' }]
  assert.equal(
    catalog.find(v => [v.enName, v.id].includes(leftover.id)),
    undefined
  )
  assert.equal(String(catalog[0].id), leftover.id)
})

test('leftover official dest CET-4 lastLearnIndex=20 stays on empty resource miss', () => {
  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  const fetched = { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 }
  const next = applyFetchedDictResource(leftover, fetched)
  assert.equal(next.lastLearnIndex, 20)
  assert.equal(next.length, 2607)
  assert.deepEqual(next.words, [])
  assert.equal(next.id, '1')
})

test('leftover official dest fetch success fills words without resetting lastLearnIndex', () => {
  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  const fetched = { id: 1, words: [{ word: 'cancel' }, { word: 'possess' }], lastLearnIndex: 0, length: 2 }
  const next = applyFetchedDictResource(leftover, fetched)
  assert.equal(next.lastLearnIndex, 20)
  assert.equal(next.length, 2)
  assert.equal(next.words[1].word, 'possess')
})

test('words/dict/articles leftover official load keeps dest books on miss', () => {
  const words = readFileSync(resolve(root, 'app/pages/(words)/words.vue'), 'utf8')
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  const articles = readFileSync(resolve(root, 'app/pages/(articles)/articles.vue'), 'utf8')
  for (const source of [words, dict, articles]) {
    assert.match(source, /applyFetchedDictResource/)
    assert.match(source, /isDictIdMatch/)
    assert.doesNotMatch(source, /\[v\.enName, v\.id\]\.includes/)
    assert.doesNotMatch(source, /bookList\[studyIndex\] = dict/)
    assert.doesNotMatch(source, /editDict = dict/)
  }
  assert.match(words, /leftover\.words\.length && leftover\.lastLearnIndex > leftover\.length/)
  assert.match(articles, /leftover\.articles\.length && leftover\.lastLearnIndex > leftover\.length/)
})

test('leftover official dest CET-4 lastLearnIndex=20 is not clamped to 0 when words are empty', () => {
  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  assert.equal(resolveLastLearnIndex(leftover), 20)
  assert.equal(resolveLastLearnIndex(leftover, 0), 20)
  assert.equal(leftoverLearnIndexBound(leftover), 2607)
  const lengthMissing = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 0 }
  assert.equal(resolveLastLearnIndex(lengthMissing, 0), 20)
  assert.equal(leftoverLearnIndexBound(lengthMissing), 20)
})

test('loaded official words still clamp lastLearnIndex to the word list', () => {
  const loaded = {
    id: 1,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 20,
    length: 2,
  }
  assert.equal(resolveLastLearnIndex(loaded), 2)
  assert.equal(resolveLastLearnIndex(loaded, 0), 0)
  assert.equal(leftoverLearnIndexBound(loaded), 2)
})

test('PracticeSettingDialog keeps leftover official lastLearnIndex on empty words', () => {
  const source = readFileSync(resolve(root, 'app/components/word/PracticeSettingDialog.vue'), 'utf8')
  assert.match(source, /resolveLastLearnIndex/)
  assert.match(source, /leftoverLearnIndexBound/)
  assert.match(source, /:max="lastLearnIndexBound"/)
  assert.doesNotMatch(source, /:max="runtimeStore.editDict.words.length"/)
})

test('words.vue saveLastPracticeIndex keeps leftover official lastLearnIndex on empty words', () => {
  const source = readFileSync(resolve(root, 'app/pages/(words)/words.vue'), 'utf8')
  assert.match(source, /async function saveLastPracticeIndex\(e\)/)
  assert.match(source, /resolveLastLearnIndex\(runtimeStore\.editDict,\s*e\)/)
  assert.doesNotMatch(source, /runtimeStore\.editDict\.lastLearnIndex = e\b/)

  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  leftover.lastLearnIndex = resolveLastLearnIndex(leftover, 0)
  assert.equal(leftover.lastLearnIndex, 20)

  const lengthMissing = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 0 }
  lengthMissing.lastLearnIndex = resolveLastLearnIndex(lengthMissing, 0)
  assert.equal(lengthMissing.lastLearnIndex, 20)

  const loaded = {
    id: 1,
    words: [{ word: 'cancel' }, { word: 'possess' }],
    lastLearnIndex: 20,
    length: 2,
  }
  loaded.lastLearnIndex = resolveLastLearnIndex(loaded, 0)
  assert.equal(loaded.lastLearnIndex, 0)
})

test('leftover official dest lastLearnIndex=20 is not clamped to 0 when articles are empty', () => {
  const leftover = { id: '246', enName: 'nce1', articles: [], lastLearnIndex: 20, length: 96 }
  assert.equal(resolveLastLearnIndex(leftover), 20)
  assert.equal(resolveLastLearnIndex(leftover, 0), 20)
  assert.equal(leftoverLearnIndexBound(leftover), 96)
  const lengthMissing = { id: '246', enName: 'nce1', articles: [], words: [], lastLearnIndex: 20, length: 0 }
  assert.equal(resolveLastLearnIndex(lengthMissing, 0), 20)
  assert.equal(leftoverLearnIndexBound(lengthMissing), 20)
})

test('remaining lastLearnIndex dialogs do not write leftover empty-list 20 to 0', () => {
  const shuffle = readFileSync(resolve(root, 'app/components/word/ShufflePracticeSettingDialog.vue'), 'utf8')
  const changeLast = readFileSync(resolve(root, 'app/components/word/ChangeLastPracticeIndexDialog.vue'), 'utf8')
  const wordCollect = readFileSync(resolve(root, 'app/components/word/WordCollectPopover.vue'), 'utf8')
  const stageProgress = readFileSync(resolve(root, 'app/components/StageProgress.vue'), 'utf8')

  assert.match(shuffle, /wordCount = \$computed\(\(\) => store\.sdict\.words\.length\)/)
  assert.match(shuffle, /progressNo = \$computed\(\(\) => Math\.min\(Math\.max\(Number\(store\.sdict\.lastLearnIndex\) \|\| 0, 0\), wordCount\)\)/)
  assert.match(shuffle, /MIN_RANGE_WORD_COUNT = 5/)
  assert.match(shuffle, /if \(rangeWordCount < MIN_RANGE_WORD_COUNT\)/)
  assert.doesNotMatch(shuffle, /lastLearnIndex\s*=/)
  assert.doesNotMatch(shuffle, /resolveLastLearnIndex|leftoverLearnIndexBound/)

  assert.match(changeLast, /let list = runtimeStore\.editDict\.words/)
  assert.match(changeLast, /\$emit\('ok', item\.index - 1\)/)
  assert.doesNotMatch(changeLast, /lastLearnIndex/)
  assert.doesNotMatch(changeLast, /:max=/)

  assert.doesNotMatch(wordCollect, /lastLearnIndex/)
  assert.doesNotMatch(stageProgress, /lastLearnIndex/)
})

function loadIdMatch() {
  const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
  const file = ts.createSourceFile('utils.ts', utils, ts.ScriptTarget.Latest, true)
  const body = ['normalizeDictId', 'getDictIdentityList', 'isDictIdMatch']
    .map(name => {
      const node = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
      assert.ok(node, `missing ${name}`)
      return node.getText(file).replace(/^export /, '')
    })
    .join('\n')
  const context = {}
  runInNewContext(ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context
}

test('leftover official dest string id matches catalog number via isDictIdMatch', () => {
  const leftover = { id: '1', enName: 'cet4' }
  const catalog = { id: 1, enName: 'cet4' }
  const { isDictIdMatch } = loadIdMatch()
  assert.equal([catalog.enName, catalog.id].includes(leftover.id), false)
  assert.equal(catalog.id === leftover.id, false)
  assert.equal(catalog.id === '1', false)
  assert.equal(isDictIdMatch(catalog, leftover.id), true)
  assert.equal(isDictIdMatch(leftover, '1'), true)
  assert.equal(isDictIdMatch({ id: 1 }, '1'), true)
})

test('study-list originalId catalog number finds leftover official dest string id', () => {
  const leftover = { id: '1', enName: 'cet4', lastLearnIndex: 20, length: 2607, words: [] }
  const bookList = [leftover]
  const originalId = 1
  const { isDictIdMatch } = loadIdMatch()
  assert.equal(bookList.findIndex(v => v.id === originalId), -1)
  assert.equal(bookList.findIndex(v => isDictIdMatch(v, originalId)), 0)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
})

test('leftover 错词 locate/replace keeps possess and CET-4 lastLearnIndex=20', () => {
  const { isDictIdMatch } = loadIdMatch()
  const wrong = {
    id: 'wordWrong',
    enName: 'wordWrong',
    name: '错词',
    system: true,
    words: [{ word: 'possess' }],
    lastLearnIndex: 0,
    length: 1,
  }
  const cet4 = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  const bookList = [
    { id: 'wordCollect', enName: 'wordCollect', system: true, words: [] },
    wrong,
    { id: 'wordKnown', enName: 'wordKnown', system: true, words: [] },
    cet4,
  ]
  const leftover = { id: 'wordWrong', system: true, words: [{ word: 'possess' }] }
  leftover.words = [{ word: 'possess' }]
  leftover.length = leftover.words.length
  const rIndex = bookList.findIndex(v => isDictIdMatch(v, leftover.id))
  assert.equal(rIndex, 1)
  bookList[rIndex].words = leftover.words
  bookList[rIndex].length = leftover.length
  assert.equal(wrong.id, 'wordWrong')
  assert.equal(wrong.system, true)
  assert.equal(
    wrong.words.some(item => item.word === 'possess'),
    true
  )
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(cet4.id, '1')
  assert.equal(bookList.find(v => isDictIdMatch(v, 'wordWrong')), wrong)

  const customCopy = { id: 'custom-xxx', custom: true, system: false, enName: '', words: [{ word: 'possess' }] }
  const dropped = [bookList[0], customCopy, bookList[2], cet4]
  assert.equal(
    dropped.find(v => isDictIdMatch(v, 'wordWrong')),
    undefined
  )
  assert.equal(cet4.lastLearnIndex, 20)
})

test('leftover 错词 study-list replace stays in place and does not custom-copy the system book', () => {
  const source = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  assert.match(source, /function syncDictInMyStudyList/)
  assert.match(source, /isDictIdMatch\(v, leftover\.id\)/)
  assert.match(source, /target\.words = leftover\.words/)
  assert.match(source, /target\.length = leftover\.length/)
  assert.doesNotMatch(source, /bookList\[rIndex\] = getDefaultDict\(temp\)/)
  assert.match(source, /leftover\.system \? leftover : ensureCustomDictCopy\(leftover\)/)
})

test('hydrate leftover official dest empty miss keeps lastLearnIndex instead of replacing the book', () => {
  const leftover = { id: '1', enName: 'cet4', words: [], lastLearnIndex: 20, length: 2607 }
  const bookList = [leftover]
  const fetched = { id: '', words: [], articles: [], lastLearnIndex: 0, length: 0 }
  applyFetchedDictResource(bookList[0], fetched)
  assert.equal(bookList[0], leftover)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.length, 2607)
  assert.equal(leftover.id, '1')
  bookList[0] = fetched
  assert.equal(bookList[0].lastLearnIndex, 0)
})

test('remaining leftover loaders reuse isDictIdMatch and applyFetchedDictResource', () => {
  const files = {
    sync: readFileSync(resolve(root, 'app/core/composables/useDataSyncPersistence.ts'), 'utf8'),
    practiceWords: readFileSync(resolve(root, 'app/pages/(words)/practice-words/[id].vue'), 'utf8'),
    practiceArticles: readFileSync(resolve(root, 'app/pages/(articles)/practice-articles/[id].vue'), 'utf8'),
    wordsTest: readFileSync(resolve(root, 'app/pages/(words)/words-test/[id].vue'), 'utf8'),
    sentenceInit: readFileSync(resolve(root, 'app/composables/practice-sentences/usePracticeSentenceInit.ts'), 'utf8'),
    book: readFileSync(resolve(root, 'app/pages/(articles)/book/[id].vue'), 'utf8'),
    dictList: readFileSync(resolve(root, 'app/pages/(words)/dict-list.vue'), 'utf8'),
    base: readFileSync(resolve(root, 'app/core/stores/base.ts'), 'utf8'),
    getDict: readFileSync(resolve(root, 'app/core/hooks/dict.ts'), 'utf8'),
    dict: readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8'),
    syncBook: readFileSync(resolve(root, 'app/core/hooks/article.ts'), 'utf8'),
    editBook: readFileSync(resolve(root, 'app/components/article/EditBook.vue'), 'utf8'),
  }
  assert.match(files.sync, /applyFetchedDictResource\(dict, r\)/)
  assert.match(files.sync, /applyFetchedDictResource\(book, r\)/)
  assert.doesNotMatch(files.sync, /bookList\[index\] = r/)
  for (const source of [files.practiceWords, files.practiceArticles, files.wordsTest, files.sentenceInit, files.book]) {
    assert.match(source, /applyFetchedDictResource/)
    assert.match(source, /isDictIdMatch/)
  }
  assert.match(files.dictList, /isDictIdMatch\(v, 1\)/)
  assert.doesNotMatch(files.dictList, /v\.id === 1/)
  assert.doesNotMatch(files.base, /\[v\.enName, v\.id\]\.includes/)
  assert.match(files.base, /isDictIdMatch\(v, DictId\.wordCollect\)/)
  assert.match(files.getDict, /isDictIdMatch/)
  assert.match(files.getDict, /resolveArticleBookForEdit/)
  assert.match(files.book, /if \(!fetched\.articles\?\.length\)/)
  assert.match(files.practiceWords, /applyFetchedDictResource\(dict, await _getDictDataByUrl\(dict\)\)/)
  assert.doesNotMatch(files.wordsTest, /v\.id === dictId/)
  assert.match(files.dict, /isDictIdMatch\(v, leftover\.id\)/)
  assert.match(files.syncBook, /isDictIdMatch\(v, originalId\)/)
  assert.match(files.editBook, /isDictIdMatch\(v, originalId\)/)
  for (const source of [files.dict, files.syncBook, files.editBook]) {
    assert.doesNotMatch(source, /v\.id === originalId/)
  }
})

function leftoverDestStudyList() {
  const wrong = {
    id: 'wordWrong',
    enName: 'wordWrong',
    name: '错词',
    system: true,
    custom: false,
    words: [{ word: 'possess', id: 42 }],
    lastLearnIndex: 0,
    length: 1,
  }
  const cet4 = { id: '1', enName: 'cet4', custom: false, system: false, words: [], lastLearnIndex: 20, length: 2607 }
  const collect = { id: 'wordCollect', enName: 'wordCollect', system: true, custom: false, words: [] }
  const known = { id: 'wordKnown', enName: 'wordKnown', system: true, custom: false, words: [] }
  return { collect, wrong, known, cet4, bookList: [collect, wrong, known, cet4] }
}

function collectibleDicts(bookList, excludeDictId) {
  const { isDictIdMatch } = loadIdMatch()
  return bookList.filter(dict => {
    if (dict.id !== 'wordCollect' && !dict.custom) return false
    if (excludeDictId && isDictIdMatch(dict, excludeDictId)) return false
    return true
  })
}

test('skipped study-list batch-delete is same-list item.id, not leftover dest catalog-id', () => {
  const words = readFileSync(resolve(root, 'app/pages/(words)/words.vue'), 'utf8')
  const articles = readFileSync(resolve(root, 'app/pages/(articles)/articles.vue'), 'utf8')
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  assert.match(words, /let r = store\.word\.bookList\.findIndex\(v => v\.id === id\)/)
  assert.match(words, /selectIds\.push\(item\.id\)/)
  assert.match(words, /:show-checkbox="isManageDict && j >= 3"/)
  assert.match(articles, /let r = base\.article\.bookList\.findIndex\(v => v\.id === id\)/)
  assert.match(articles, /selectIds\.push\(item\.id\)/)
  assert.match(articles, /:show-checkbox="isMultiple && j >= 1"/)
  assert.match(dict, /let rIndex2 = allList\.findIndex\(v => v\.id === id\)/)
  assert.match(dict, /batchDel\(\[val\.item\.id\]\)/)
  assert.match(dict, /onDel=\{ids => void batchDel\(ids\)\}/)

  const { bookList, wrong, cet4 } = leftoverDestStudyList()
  const selectIds = []
  const toggleSelect = item => selectIds.push(item.id)
  // 错词 is index 1; study-list checkboxes start at j >= 3
  assert.equal(bookList.findIndex(v => v.id === wrong.id), 1)
  toggleSelect(cet4)
  assert.deepEqual(selectIds, ['1'])
  assert.equal(bookList.findIndex(v => v.id === selectIds[0]), 3)
  assert.equal(bookList.findIndex(v => v.id === 1), -1)
  assert.equal(wrong.words.some(item => item.word === 'possess'), true)
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(cet4.id, '1')
})

test('skipped getCollectibleDicts / articleCollect are system-string, not leftover dest catalog-id', () => {
  const dictHook = readFileSync(resolve(root, 'app/core/hooks/dict.ts'), 'utf8')
  const setting = readFileSync(resolve(root, 'app/pages/setting.vue'), 'utf8')
  const articleAudio = readFileSync(resolve(root, 'app/components/article/ArticleAudio.vue'), 'utf8')
  const persist = readFileSync(resolve(root, 'app/core/composables/useDataSyncPersistence.ts'), 'utf8')
  assert.match(dictHook, /if \(dict\.id !== DictId\.wordCollect && !dict\.custom\) return false/)
  assert.match(dictHook, /if \(excludeDictId && isDictIdMatch\(dict, excludeDictId\)\) return false/)
  assert.match(setting, /v\.custom \|\| v\.id === DictId\.articleCollect/)
  assert.match(articleAudio, /file\.id === props\.article\.audioFileId/)
  assert.match(persist, /const item = files\.find\(file => file\.id === id\)/)

  const { bookList, wrong, cet4, collect } = leftoverDestStudyList()
  const picker = collectibleDicts(bookList, '1')
  assert.equal(picker.includes(cet4), false)
  assert.equal(picker.includes(wrong), false)
  assert.deepEqual(picker, [collect])
  const articleBooks = [
    { id: 'articleCollect', custom: false, articles: [] },
    { id: '246', custom: false, articles: [] },
    { id: 'custom-book', custom: true, articles: [] },
  ]
  const syncBooks = articleBooks.filter(v => v.custom || v.id === 'articleCollect')
  assert.equal(
    syncBooks.some(v => v.id === '246' || v.id === '1' || v.id === 'wordWrong'),
    false
  )
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(wrong.words.some(item => item.word === 'possess'), true)
})

test('skipped collect / file-id compares cannot fork leftover dest CET-4 or drop 错词 possess', () => {
  const { isDictIdMatch } = loadIdMatch()
  const { bookList, wrong, cet4, collect } = leftoverDestStudyList()
  const leftover = { id: 'wordWrong', system: true, words: [{ word: 'possess', id: 42 }] }
  leftover.words = [{ word: 'possess', id: 42 }]
  leftover.length = leftover.words.length
  const rIndex = bookList.findIndex(v => isDictIdMatch(v, leftover.id))
  bookList[rIndex].words = leftover.words
  bookList[rIndex].length = leftover.length
  assert.equal(bookList[rIndex], wrong)
  assert.equal(wrong.id, 'wordWrong')
  assert.equal(wrong.system, true)
  assert.equal(wrong.custom, false)

  const allList = leftover.words
  const wordDel = allList.findIndex(v => v.id === leftover.words[0].id)
  assert.equal(wordDel, 0)
  assert.equal(allList.findIndex(v => v.id === '1'), -1)
  assert.equal(allList.findIndex(v => v.id === 1), -1)

  collect.words.push({ word: 'other' })
  assert.equal(cet4.words.length, 0)
  assert.equal(cet4.lastLearnIndex, 20)
  assert.equal(cet4.id, '1')
  assert.equal(bookList.find(v => isDictIdMatch(v, 'wordWrong')), wrong)
  assert.equal(
    wrong.words.some(item => item.word === 'possess'),
    true
  )
})
