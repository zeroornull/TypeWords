import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { isMaskedPracticeLetterText, isVisiblePracticeWord } from './native-local-practice-word.mjs'
import {
  OFFICIAL_T01_ARTICLE_SENTENCE_COUNT,
  OFFICIAL_T01_ARTICLE_SENTENCES,
  OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
  OFFICIAL_T01_BUILTIN_WORD_BOOK,
  OFFICIAL_T01_PRACTICE_TYPE,
  OFFICIAL_T01_SEED_WORDS,
  OFFICIAL_T01_UNIQUE_WORD_COUNT,
  OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM,
  buildOfficialT01SeedWord,
  countOfficialT01ArticleSentences,
  officialT01ArticleText,
  officialT01ArticleTranslate,
  uniqueNonEmptyWords,
} from './native-local-practice-matrix-spec.mjs'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('official T01 matrix matches the plan: 20 unique words and 5 article sentences', () => {
  assert.equal(OFFICIAL_T01_UNIQUE_WORD_COUNT, 20)
  assert.equal(OFFICIAL_T01_ARTICLE_SENTENCE_COUNT, 5)
  assert.equal(OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM, 0)
  assert.equal(OFFICIAL_T01_BUILTIN_WORD_BOOK.enName, 'cet4')
  assert.equal(OFFICIAL_T01_BUILTIN_WORD_BOOK.url, 'CET4_T.json')
  assert.equal(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.enName, 'nce1')
  assert.equal(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.url, 'NCE_1.json')
  assert.equal(OFFICIAL_T01_PRACTICE_TYPE.followWrite, 0)
  assert.equal(OFFICIAL_T01_PRACTICE_TYPE.spell, 1)
  assert.equal(OFFICIAL_T01_PRACTICE_TYPE.listen, 3)
  assert.equal(OFFICIAL_T01_PRACTICE_TYPE.dictation, 4)
  assert.equal(uniqueNonEmptyWords(OFFICIAL_T01_SEED_WORDS).length, 20)
  assert.equal(OFFICIAL_T01_ARTICLE_SENTENCES.length, 5)
  assert.equal(countOfficialT01ArticleSentences(officialT01ArticleText()), 5)
  assert.equal(countOfficialT01ArticleSentences(officialT01ArticleTranslate()), 5)
  assert.equal(uniqueNonEmptyWords(['fixture', 'fixture', '', ' possess ']).join(','), 'fixture,possess')
  assert.ok(OFFICIAL_T01_SEED_WORDS.includes('fixture'))
  for (const word of OFFICIAL_T01_SEED_WORDS) {
    assert.equal(isVisiblePracticeWord(word), true)
    assert.equal(isMaskedPracticeLetterText(word), false)
    const built = buildOfficialT01SeedWord(word)
    assert.equal(built.word.length > 0, true)
    assert.equal(built.word, word)
  }
  assert.throws(() => buildOfficialT01SeedWord(''))
})

test('official T01 matrix runner types real session words on the isolated built-in dict', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice-matrix.mjs'), 'utf8')
  assert.match(runner, /native-local-practice-matrix-spec\.mjs/)
  assert.match(runner, /OFFICIAL_T01_UNIQUE_WORD_COUNT/)
  assert.match(runner, /OFFICIAL_T01_ARTICLE_SENTENCE_COUNT/)
  assert.match(runner, /OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM/)
  assert.match(runner, /OFFICIAL_T01_BUILTIN_WORD_BOOK/)
  assert.match(runner, /CET4_T\.json/)
  assert.match(runner, /NCE_1\.json/)
  assert.match(runner, /resolveInstalledPracticeWord/)
  assert.match(runner, /isMaskedPracticeLetterText/)
  assert.match(runner, /PracticeSaveWord/)
  assert.match(runner, /practice-words\/1|practice-words\/cet4/)
  assert.match(runner, /wordPracticeMode = 0/)
  assert.match(runner, /followWrite/)
  assert.match(runner, /dictation/)
  assert.match(runner, /phaseFromSources/)
  assert.match(runner, /sessionSnapshot/)
  assert.match(runner, /词库资源无法加载/)
  assert.match(runner, /not faking/)
  assert.match(runner, /backup-custom/)
  assert.match(runner, /backup-articles/)
  assert.match(runner, /isolated-profile/)
  assert.match(runner, /createHash\('sha256'\)\.update\(readFileSync\(launch\.exe\)\)/)
  assert.match(runner, /io\\.github\\.zyronon\\.typewords/)
  assert.match(runner, /native-local-practice-matrix\.json/)
  assert.match(runner, /Control\+Z/)
  assert.match(runner, /wordSoundVolume/)
  assert.match(runner, /typewords\$/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
  assert.doesNotMatch(runner, /runtime\?\.editWord\?\.word \|\| runtime\?\.currentWord\?\.word/)
  assert.match(runner, /Refusing masked/)
})

test('official T01 matrix dest runner must not claim dest-green leftover keep on SHA 99948E67', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice-matrix.mjs'), 'utf8')
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
