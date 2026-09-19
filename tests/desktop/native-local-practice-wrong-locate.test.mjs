import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { isMaskedPracticeLetterText, isVisiblePracticeWord } from './native-local-practice-word.mjs'
import {
  OFFICIAL_T01_ARTICLE_CACHE_KEY,
  OFFICIAL_T01_PLAN_PASS,
  OFFICIAL_T01_PLAN_SCENE,
  OFFICIAL_T01_WRONG_BOOK,
  OFFICIAL_T01_WRONG_CLEAR_TOAST,
  articleCursorTriple,
  articleCursorsEqual,
  isDomMidArticle,
  isMidArticlePosition,
  isOfficialWrongBook,
  isOriginArticleCursor,
  parseArticleCachePosition,
  sessionHasWrongWord,
  sessionWrongWordKeys,
  wrongBookHasWord,
  wrongBookWords,
  wrongLetterForWord,
} from './native-local-practice-wrong-locate-spec.mjs'
import {
  OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
  OFFICIAL_T01_BUILTIN_WORD_BOOK,
} from './native-local-practice-matrix-spec.mjs'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('leftover dest 错词 list replace keeps possess and official CET-4 lastLearnIndex=20', () => {
  const dict = readFileSync(resolve(root, 'app/pages/(words)/dict.vue'), 'utf8')
  assert.match(dict, /function syncDictInMyStudyList/)
  assert.match(dict, /isDictIdMatch\(v, leftover\.id\)/)
  assert.match(dict, /target\.words = leftover\.words/)
  assert.doesNotMatch(dict, /bookList\[rIndex\] = getDefaultDict\(temp\)/)
  assert.match(dict, /leftover\.system \? leftover : ensureCustomDictCopy\(leftover\)/)
  assert.equal(wrongBookHasWord({ words: [{ word: 'possess' }] }, 'possess'), true)
  assert.equal(isOfficialWrongBook({ id: 'wordWrong', name: '错词' }), true)
})

test('official T01 错词 helpers record a real word, not a count-only placeholder', () => {
  assert.equal(OFFICIAL_T01_WRONG_BOOK.id, 'wordWrong')
  assert.equal(OFFICIAL_T01_WRONG_BOOK.name, '错词')
  assert.equal(isOfficialWrongBook({ id: 'wordWrong', name: '错词' }), true)
  assert.equal(isOfficialWrongBook({ id: 'backup-custom' }), false)
  assert.equal(wrongLetterForWord('cancel'), 'z')
  assert.equal(wrongLetterForWord('zone'), 'q')
  assert.throws(() => wrongLetterForWord('_______'))
  assert.throws(() => wrongLetterForWord(''))
  assert.equal(sessionHasWrongWord(['cancel', { word: 'explosive' }], 'cancel'), true)
  assert.equal(sessionHasWrongWord(['_______'], 'cancel'), false)
  assert.deepEqual(sessionWrongWordKeys([{ word: 'cancel' }, '_______']), ['cancel'])
  assert.equal(wrongBookHasWord({ words: [{ word: 'cancel' }] }, 'cancel'), true)
  assert.equal(wrongBookHasWord({ words: [{ word: '_______' }] }, '_______'), false)
  assert.deepEqual(wrongBookWords({ words: [{ word: 'cancel' }, '_______', { word: 'possess' }] }), [
    'cancel',
    'possess',
  ])
  assert.equal(isVisiblePracticeWord('cancel'), true)
  assert.equal(isMaskedPracticeLetterText('_______'), true)
})

test('official T01 文章定位 helpers resume a mid-article cursor, not a 5-sentence count', () => {
  assert.equal(OFFICIAL_T01_ARTICLE_CACHE_KEY, 'PracticeSaveArticle')
  assert.equal(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.enName, 'nce1')
  const mid = { sectionIndex: 0, sentenceIndex: 5, wordIndex: 1 }
  const origin = { sectionIndex: 0, sentenceIndex: 0, wordIndex: 0 }
  assert.equal(isOriginArticleCursor(origin), true)
  assert.equal(isOriginArticleCursor(mid), false)
  assert.equal(isMidArticlePosition(mid, 7), true)
  assert.equal(isMidArticlePosition({ ...mid, isEnd: true }, 7), false)
  assert.equal(isMidArticlePosition(origin, 7), false)
  assert.equal(isMidArticlePosition(mid, 1), false)
  assert.deepEqual(articleCursorTriple({}), { sectionIndex: 0, sentenceIndex: 0, wordIndex: 0 })
  assert.deepEqual(
    parseArticleCachePosition(
      JSON.stringify({ val: { practiceData: { sectionIndex: 6, sentenceIndex: 0, wordIndex: 3 } } })
    ),
    { sectionIndex: 6, sentenceIndex: 0, wordIndex: 3 }
  )
  assert.equal(isDomMidArticle({ finishedDomSentences: 2, sentenceCount: 7, wroteCount: 6, isEnd: false }), true)
  assert.equal(isDomMidArticle({ finishedDomSentences: 7, sentenceCount: 7, wroteCount: 20, isEnd: true }), false)
  assert.equal(
    articleCursorsEqual(mid, articleCursorTriple({ sectionIndex: '0', sentenceIndex: '5', wordIndex: '1' })),
    true
  )
  assert.equal(articleCursorsEqual(mid, { sectionIndex: 0, sentenceIndex: 4, wordIndex: 1 }), false)
  assert.deepEqual(
    parseArticleCachePosition({
      val: { practiceData: { sectionIndex: 0, sentenceIndex: 5, wordIndex: 2 } },
    }),
    { sectionIndex: 0, sentenceIndex: 5, wordIndex: 2 }
  )
  assert.equal(parseArticleCachePosition(null), null)
})

test('official T01 错词/定位 runner stays on dest official books and real session words', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice-wrong-locate.mjs'), 'utf8')
  assert.match(runner, /native-local-practice-wrong-locate-spec\.mjs/)
  assert.match(runner, /OFFICIAL_T01_WRONG_BOOK/)
  assert.match(runner, /OFFICIAL_T01_WRONG_CLEAR_TOAST/)
  assert.match(runner, /OFFICIAL_T01_PLAN_PASS/)
  assert.match(runner, /PracticeSaveArticle/)
  assert.match(runner, /practice-words\/1|practice-words\/cet4/)
  assert.match(runner, /practice-articles\/246/)
  assert.match(runner, /OFFICIAL_T01_BUILTIN_ARTICLE_BOOK/)
  assert.match(runner, /wordWrong/)
  assert.match(runner, /还有错词/)
  assert.match(runner, /resolveInstalledPracticeWord/)
  assert.match(runner, /isMaskedPracticeLetterText/)
  assert.match(runner, /wrongLetterForWord/)
  assert.match(runner, /articleCursorsEqual/)
  assert.match(runner, /isMidArticlePosition/)
  assert.match(runner, /NCE_1\.json/)
  assert.match(runner, /CET4_T\.json/)
  assert.match(runner, /isolated-profile/)
  assert.match(runner, /createHash\('sha256'\)\.update\(readFileSync\(launch\.exe\)\)/)
  assert.match(runner, /io\\.github\\.zyronon\\.typewords/)
  assert.match(runner, /native-wrong-locate\.json/)
  assert.match(runner, /wordSoundVolume/)
  assert.match(runner, /typewords\$/)
  assert.match(runner, /not faking/)
  assert.match(runner, /count-only/)
  assert.match(runner, /Official CET-4 FollowWrite 错词 missing/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
  assert.match(runner, /Refusing masked/)
  assert.equal(OFFICIAL_T01_BUILTIN_WORD_BOOK.enName, 'cet4')
  assert.equal(OFFICIAL_T01_PLAN_SCENE.includes('20'), true)
  assert.equal(OFFICIAL_T01_PLAN_PASS.includes('错词'), true)
  assert.equal(OFFICIAL_T01_PLAN_PASS.includes('文章定位'), true)
  assert.equal(OFFICIAL_T01_WRONG_CLEAR_TOAST.includes('错词'), true)
})

test('official T01 错词 dest runner must not claim dest-green leftover keep on SHA 99948E67', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice-wrong-locate.mjs'), 'utf8')
  assert.match(runner, /99948E67/)
  assert.match(runner, /pre-fix/)
  assert.match(runner, /id-match/)
  assert.match(runner, /lastLearnIndex keep/)
  assert.match(runner, /Do not claim dest-green/)
  assert.match(runner, /complete-20/)
  assert.match(runner, /official empty-task/)
  assert.match(runner, /list-page navigation/)
  assert.match(runner, /leftover-20 proof/)
  assert.match(runner, /Do not treat old dest list-page navigation/)
  assert.doesNotMatch(runner, /destGreenIdMatch:\s*true/)
})
