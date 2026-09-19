import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

function loadCache() {
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(resolve(root, 'app/core/utils/cache.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === '../types/enum') return { WordPracticeMode: {}, WordPracticeStage: {}, WordPracticeType: {} }
        if (name === 'idb-keyval') return { get: async () => null, set: async () => {} }
        return {}
      },
    }
  )
  return exports
}

const cache = loadCache()
const leftover = { sectionIndex: 6, sentenceIndex: 0, wordIndex: 3 }
const origin = { sectionIndex: 0, sentenceIndex: 0, wordIndex: 0, resumed: false }
const plain = value => JSON.parse(JSON.stringify(value))
const word = text => ({ word: text })
const sentence = (...words) => ({ words: words.map(word) })
const shortFixture = [[sentence('This'), sentence('Birds'), sentence('Cats'), sentence('Dogs'), sentence('Kids')]]
const nceLike = Array.from({ length: 7 }, (_, section) => [sentence('I', 'had', 'a', 'very', 'good')])

test('leftover NCE1 6/0/3 resumes on a long article and recovers on a short fixture', () => {
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor(nceLike, leftover)), { ...leftover, resumed: true })
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor(shortFixture, leftover)), origin)
  assert.equal(shortFixture[leftover.sectionIndex]?.[leftover.sentenceIndex], undefined)
  const recovered = cache.resolveArticlePracticeCursor(shortFixture, leftover)
  assert.ok(shortFixture[recovered.sectionIndex][recovered.sentenceIndex].words[recovered.wordIndex])
})

test('out-of-range, negative, and missing sections recover instead of reading undefined[0]', () => {
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor(undefined, leftover)), origin)
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor([], leftover)), origin)
  assert.deepEqual(
    plain(cache.resolveArticlePracticeCursor(shortFixture, { sectionIndex: 0, sentenceIndex: 0, wordIndex: 9 })),
    origin
  )
  assert.deepEqual(
    plain(cache.resolveArticlePracticeCursor(nceLike, { sectionIndex: -1, sentenceIndex: 0, wordIndex: 0 })),
    origin
  )
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor(nceLike, origin)), { ...origin, resumed: true })
})

test('empty practice cache objects are not a valid export envelope', () => {
  assert.equal(cache.exportablePracticeCacheVal(null), null)
  assert.equal(cache.exportablePracticeCacheVal({}), null)
  assert.equal(cache.exportablePracticeCacheVal([]), null)
  const leftoverArticle = { practiceData: leftover, statStoreData: { spend: 1 } }
  assert.deepEqual(cache.exportablePracticeCacheVal(leftoverArticle), leftoverArticle)
})

test('article practice and ZIP export use the leftover resume/export helpers', () => {
  const typing = readFileSync(resolve(root, 'app/components/article/TypingArticle.vue'), 'utf8')
  const exporter = readFileSync(resolve(root, 'app/core/hooks/export.ts'), 'utf8')
  const listen = readFileSync(resolve(root, 'tests/desktop/native-listen-audio.mjs'), 'utf8')
  const locate = readFileSync(resolve(root, 'tests/desktop/native-local-practice-wrong-locate.mjs'), 'utf8')
  assert.match(typing, /resolveArticlePracticeCursor/)
  assert.match(typing, /sections\?\.\[sectionIndex\]\?\.\[sentenceIndex\]/)
  assert.match(exporter, /exportablePracticeCacheVal/)
  assert.match(exporter, /wordCacheVal\s*=\s*exportablePracticeCacheVal\(/)
  assert.match(exporter, /articleCacheVal\s*=\s*exportablePracticeCacheVal\(/)
  assert.match(exporter, /val:\s*wordCacheVal/)
  assert.match(exporter, /val:\s*articleCacheVal/)
  assert.doesNotMatch(exporter, /val:\s*\{\s*\}/)
  assert.equal(cache.exportablePracticeCacheVal({}), null)
  assert.match(listen, /articleCache\?\.sectionIndex, 6/)
  assert.match(listen, /articleCache\?\.sentenceIndex, 0/)
  assert.match(listen, /articleCache\?\.wordIndex, 3/)
  assert.match(locate, /parseArticleCachePosition/)
})

function nextArticleLearnIndex(lastLearnIndex, listLength) {
  if (lastLearnIndex >= listLength - 1) return 0
  return lastLearnIndex + 1
}

test('practice-articles next wrap does not wipe leftover dest-like NCE1 3 or 6/0/3', () => {
  const page = readFileSync(resolve(root, 'app/pages/(articles)/practice-articles/[id].vue'), 'utf8')
  const typing = readFileSync(resolve(root, 'app/components/article/TypingArticle.vue'), 'utf8')
  const hooks = readFileSync(resolve(root, 'app/core/hooks/article.ts'), 'utf8')
  const catalog = JSON.parse(readFileSync(resolve(root, 'public/list/article.json'), 'utf8'))
  const nce1 = catalog.find(item => item.enName === 'nce1')
  assert.equal(nce1.id, 246)
  assert.equal(nce1.length, 5)

  const destLikeIndex = 3
  assert.equal(nextArticleLearnIndex(destLikeIndex, nce1.length), destLikeIndex + 1)
  assert.notEqual(nextArticleLearnIndex(destLikeIndex, nce1.length), 0)
  assert.equal(nextArticleLearnIndex(destLikeIndex, 0), 0)

  assert.match(page, /isDictIdMatch/)
  assert.match(page, /if \(!dict\.articles\.length\)/)
  assert.match(page, /router\.push\('\/articles'\)/)
  assert.match(page, /if \(store\.sbook\.lastLearnIndex >= articleData\.list\.length - 1\)/)
  assert.match(page, /store\.sbook\.lastLearnIndex = 0/)
  assert.match(page, /useDisableEventListener\(\(\) => loading\)/)
  assert.match(page, /articlePersistence\.clear\(\)/)
  assert.match(page, /\[EventKey\.continueStudy, next\]/)
  assert.doesNotMatch(hooks, /lastLearnIndex/)
  assert.match(typing, /store\.sbook\.lastLearnIndex < store\.sbook\.articles\.length - 1/)
  assert.match(typing, /if \(a !== 0 \|\| b !== 0 \|\| c !== 0\)/)
  assert.deepEqual(plain(cache.resolveArticlePracticeCursor(nceLike, leftover)), { ...leftover, resumed: true })
})
