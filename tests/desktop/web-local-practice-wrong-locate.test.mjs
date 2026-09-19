import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { OFFICIAL_T01_PLAN_PASS } from './native-local-practice-wrong-locate-spec.mjs'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('official T01 web 错词/定位 runner stays on local web/dev, not dest or production', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/web-local-practice-wrong-locate.mjs'), 'utf8')
  assert.match(runner, /TYPEWORDS_WEB_ORIGIN/)
  assert.match(runner, /127\\.0\\.0\\.1\|localhost/)
  assert.match(runner, /chromium\.launch/)
  assert.match(runner, /web-wrong-locate\.json/)
  assert.match(runner, /practice-words\/\$\{OFFICIAL_T01_BUILTIN_WORD_BOOK\.id\}/)
  assert.match(runner, /practice-articles\/\$\{OFFICIAL_T01_BUILTIN_ARTICLE_BOOK\.id\}/)
  assert.match(runner, /wordWrong/)
  assert.match(runner, /PracticeSaveArticle/)
  assert.match(runner, /wrongLetterForWord/)
  assert.match(runner, /resolveInstalledPracticeWord/)
  assert.match(runner, /isMaskedPracticeLetterText/)
  assert.match(runner, /isDomMidArticle/)
  assert.doesNotMatch(runner, /connectOverCDP/)
  assert.doesNotMatch(runner, /tauri\.localhost/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
  assert.doesNotMatch(runner, /typewords\.cc/)
  assert.equal(OFFICIAL_T01_PLAN_PASS.includes('Web 基线'), true)
  const articlePage = readFileSync(resolve(root, 'app/pages/(articles)/practice-articles/[id].vue'), 'utf8')
  assert.match(articlePage, /isDictIdMatch/)
})
