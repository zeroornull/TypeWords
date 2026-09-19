import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()
const page = readFileSync(resolve(root, 'app/pages/(words)/practice-words/[id].vue'), 'utf8')
const utils = readFileSync(resolve(root, 'app/core/utils/index.ts'), 'utf8')
function loadApplyFetchedDictResource() {
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(resolve(root, 'app/core/composables/dictResourceLoad.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require() {
        throw new Error('dictResourceLoad must stay dependency-free')
      },
    }
  )
  return exports.applyFetchedDictResource
}
// Execute the actual page loader and existing identity helpers, not a copied implementation.
function declaration(source, name) {
  const file = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  const node = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(node, `missing ${name}`)
  return node.getText(file).replace(/^export /, '')
}
async function load({ id = '1', personal = [], catalog = [{ id: 1, words: [] }], fetchEmpty = false } = {}) {
  const events = []
  const store = { word: { bookList: personal }, changeDict: d => events.push(['dict', d.id]) }
  const context = {
    store,
    route: { params: { id } },
    getDefaultDict: () => ({}),
    fetch: async () => ({ json: async () => catalog }),
    resourceWrap: x => x,
    DICT_LIST: { WORD: { ALL: '/list/word.json' } },
    applyFetchedDictResource: loadApplyFetchedDictResource(),
    _getDictDataByUrl: async d =>
      fetchEmpty ? { id: '', words: [], lastLearnIndex: 0, length: 0 } : { ...d, words: [{ word: 'cancel' }] },
    initData: async () => events.push(['cache']),
    loading: true,
    router: { push: url => events.push(['redirect', url]) },
    Toast: { warning: x => events.push(['warning', x]) },
  }
  const source =
    ['normalizeDictId', 'getDictIdentityList', 'isDictIdMatch'].map(n => declaration(utils, n)).join('\n') +
    '\n' +
    declaration(page.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1], 'loadDict')
  runInNewContext(
    ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    context
  )
  await context.loadDict()
  return events
}
test('direct numeric catalog route resolves string URL before cache restoration', async () => {
  assert.deepEqual(await load(), [['dict', 1], ['cache']])
})
test('persisted numeric dictionary wins over catalog and preserves selection', async () => {
  assert.deepEqual(await load({ personal: [{ id: 1, custom: true, words: [{ word: 'local' }] }], catalog: [] }), [
    ['dict', 1],
    ['cache'],
  ])
})
test('legacy enName route resolves using existing dictionary identity semantics', async () => {
  assert.deepEqual(await load({ id: 'cet4', catalog: [{ id: 1, enName: 'cet4' }] }), [['dict', 1], ['cache']])
})
test('custom string ID still loads and unknown/empty routes still return to words', async () => {
  assert.deepEqual(await load({ id: 'custom-one', personal: [{ id: 'custom-one', custom: true, words: [{}] }] }), [
    ['dict', 'custom-one'],
    ['cache'],
  ])
  assert.deepEqual(await load({ id: 'missing' }), [['redirect', '/words']])
  assert.deepEqual(await load({ id: '' }), [['redirect', '/words']])
})
test('leftover official dest string id wins over numeric catalog and empty miss keeps lastLearnIndex', async () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [{ word: 'possess' }],
    lastLearnIndex: 20,
    length: 2607,
  }
  assert.deepEqual(await load({ personal: [leftover], catalog: [{ id: 1, enName: 'cet4', words: [] }] }), [
    ['dict', '1'],
    ['cache'],
  ])
  const emptyLeftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
  }
  assert.deepEqual(await load({ personal: [emptyLeftover], fetchEmpty: true }), [
    ['redirect', '/words'],
    ['warning', '没有单词可学习！'],
  ])
  assert.equal(emptyLeftover.lastLearnIndex, 20)
  assert.equal(emptyLeftover.length, 2607)
  assert.equal(emptyLeftover.id, '1')
})
test('study-list originalId catalog number finds leftover official dest string id', () => {
  const leftover = {
    id: '1',
    enName: 'cet4',
    custom: false,
    words: [],
    lastLearnIndex: 20,
    length: 2607,
  }
  const bookList = [leftover]
  const originalId = 1
  const context = {}
  runInNewContext(
    ts.transpileModule(
      ['normalizeDictId', 'getDictIdentityList', 'isDictIdMatch'].map(n => declaration(utils, n)).join('\n'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
    ).outputText,
    context
  )
  assert.equal(bookList.findIndex(v => v.id === originalId), -1)
  assert.equal(bookList.findIndex(v => context.isDictIdMatch(v, originalId)), 0)
  assert.equal(leftover.lastLearnIndex, 20)
  assert.equal(leftover.id, '1')
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  const syncBook = readFileSync(resolve(root, 'app/core/hooks/article.ts'), 'utf8')
  const editBook = readFileSync(resolve(root, 'app/components/article/EditBook.vue'), 'utf8')
  assert.match(dict, /isDictIdMatch\(v, leftover\.id\)/)
  assert.match(syncBook, /isDictIdMatch\(v, originalId\)/)
  assert.match(editBook, /isDictIdMatch\(v, originalId\)/)
  for (const source of [dict, syncBook, editBook]) {
    assert.doesNotMatch(source, /v\.id === originalId/)
  }
})
