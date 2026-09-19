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

function loadArticleBook() {
  const exports = {}
  const source = readFileSync(resolve(root, 'app/core/composables/articleBookLoad.ts'), 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require() {
        throw new Error('articleBookLoad must stay dependency-free')
      },
    }
  )
  return exports
}

const { needsOfficialArticleFetch, resolveArticleBookForEdit } = loadArticleBook()

function loadDictResource() {
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
  return exports
}

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

function restoreArticleLearnIndex(lastLearnIndex, articlesLength) {
  if (lastLearnIndex >= articlesLength) return Math.max(articlesLength - 1, 0)
  return lastLearnIndex
}

test('leftover custom articles stay assignable without a catalog fetch', () => {
  const leftover = {
    id: 'backup-articles',
    custom: true,
    articles: [{ title: 'Audio fixture' }],
  }
  assert.equal(needsOfficialArticleFetch(leftover), false)
  assert.deepEqual(asJson(resolveArticleBookForEdit(leftover)), leftover)
})

test('official empty catalog books still fetch, empty ids do not assign', () => {
  const official = { id: 246, custom: false, system: false, is_default: false, articles: [] }
  const fetched = { id: 246, articles: [{ title: 'Excuse me' }] }
  assert.equal(needsOfficialArticleFetch(official), true)
  assert.deepEqual(asJson(resolveArticleBookForEdit(official, fetched)), fetched)
  assert.equal(resolveArticleBookForEdit({ id: '', articles: [] }), null)
  assert.equal(needsOfficialArticleFetch({ id: 'sys', system: true, articles: [] }), false)
})

test('book page recovers leftover articles from the user catalog, not only URL fetch', () => {
  const hook = readFileSync(resolve(root, 'app/core/hooks/dict.ts'), 'utf8')
  const page = readFileSync(resolve(root, 'app/pages/(articles)/book/[id].vue'), 'utf8')
  assert.match(hook, /needsOfficialArticleFetch/)
  assert.match(hook, /resolveArticleBookForEdit/)
  assert.match(hook, /runtimeStore\.editDict = assigned/)
  assert.doesNotMatch(
    hook,
    /if \(store\.article\.bookList\.find\(book => book\.id === runtimeStore\.editDict\.id\)\) \{\s*\}/
  )
  assert.match(page, /runtimeStore\.editDict\.articles/)
  assert.match(page, /title: '介绍'/)
})

test('book restore clamp after non-empty official NCE1 fetch keeps leftover dest-like lastLearnIndex=3', () => {
  const { applyFetchedDictResource, resolveLastLearnIndex } = loadDictResource()
  const { isDictIdMatch } = loadIdMatch()
  const page = readFileSync(resolve(root, 'app/pages/(articles)/book/[id].vue'), 'utf8')
  const hooks = readFileSync(resolve(root, 'app/core/hooks/article.ts'), 'utf8')
  const catalog = JSON.parse(readFileSync(resolve(root, 'public/list/article.json'), 'utf8'))
  const nce1 = catalog.find(item => item.enName === 'nce1')
  assert.equal(isDictIdMatch({ id: '246', enName: 'nce1' }, nce1.id), true)
  assert.equal(nce1.length, 5)

  const leftover = {
    id: '246',
    enName: 'nce1',
    custom: false,
    articles: [],
    lastLearnIndex: 3,
    length: 96,
  }
  const fetched = { articles: Array.from({ length: nce1.length }, (_, index) => ({ title: `Lesson ${index}` })) }
  applyFetchedDictResource(leftover, fetched)
  assert.equal(leftover.articles.length, 5)
  assert.equal(leftover.length, 5)
  assert.equal(leftover.lastLearnIndex, 3)
  assert.equal(restoreArticleLearnIndex(leftover.lastLearnIndex, leftover.articles.length), 3)
  assert.equal(resolveLastLearnIndex(leftover), 3)
  assert.equal(restoreArticleLearnIndex(3, 0), 0)

  assert.match(page, /isDictIdMatch\(v, runtimeStore\.editDict\.id\)/)
  assert.match(page, /if \(!fetched\.articles\?\.length\)/)
  assert.match(page, /applyFetchedDictResource\(item, fetched\)/)
  assert.match(page, /if \(item\.lastLearnIndex >= item\.articles\.length\)/)
  assert.match(page, /item\.lastLearnIndex = Math\.max\(item\.articles\.length - 1, 0\)/)
  assert.match(page, /runtimeStore\.editDict\.custom && runtimeStore\.editDict\.url/)
  assert.doesNotMatch(page, /resolveArticlePracticeCursor|practiceData|articlePersistence/)
  assert.doesNotMatch(hooks, /lastLearnIndex/)
})
