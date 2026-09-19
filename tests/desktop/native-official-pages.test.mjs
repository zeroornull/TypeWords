import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('official page dest proof on 99948E67 is pre-leftover-fix honesty-only and does not close T05 human-ear or T04 NIC-off', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-official-pages.mjs'), 'utf8')
  assert.match(runner, /Honesty-only T05\/R4 dest lock/)
  assert.match(runner, /Do not rematrix dest/)
  assert.match(runner, /Do not add dest UI/)
  assert.match(runner, /99948E67C19B6C66501AE23D4DA643D31D4EE46B358F9063E5A9AFE972D77D72/)
  assert.match(runner, /pre-leftover-fix/)
  assert.match(runner, /does not contain leftover-fix/)
  assert.match(runner, /isDictIdMatch/)
  assert.match(runner, /Dest proof does not close T05 human-ear/)
  assert.match(runner, /Human-ear remains user-blocked/)
  assert.match(runner, /Dest proof does not close T04 NIC-off/)
  assert.match(runner, /Ethernet-off remains user-blocked/)
  assert.doesNotMatch(runner, /Disable-NetAdapter/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
})

test('official page runner covers installed surfaces and fails on pageerror', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-official-pages.mjs'), 'utf8')
  for (const route of [
    "'/'",
    "'/words'",
    "'/articles'",
    "'/setting'",
    "'/about'",
    "'/help'",
    "'/doc'",
    "'/feedback'",
    "'/dict-list'",
    "'/book-list'",
    "'/practice-words/backup-custom'",
    "'/practice-articles/backup-articles'",
  ]) {
    assert.match(runner, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(runner, /pageerror/)
  assert.match(runner, /official-pages\.json/)
  assert.match(runner, /isolated-profile/)
  assert.match(runner, /assert\.equal\(report\.pageerrorCount, 0/)
  assert.match(runner, /assert\.deepEqual\(report\.missingNuxt, \[\]\)/)
  assert.match(runner, /assert\.deepEqual\(report\.looks404, \[\]\)/)
  assert.match(runner, /assert\.deepEqual\(report\.historyMissingNuxt, \[\]\)/)
  assert.match(runner, /assert\.deepEqual\(report\.historyLooks404, \[\]\)/)
  assert.match(runner, /assert\.deepEqual\(report\.historyPiniaUnexpected, \[\]\)/)
  assert.match(runner, /createHash\('sha256'\)\.update\(readFileSync\(launch\.exe\)\)/)
  assert.match(runner, /goBack/)
  assert.match(runner, /goForward/)
  assert.match(runner, /reload/)
  assert.match(runner, /historyPageerrorCount/)
  assert.match(runner, /practice-words\/backup-custom/)
  assert.match(runner, /completedWordPracticeRedirect/)
  assert.match(runner, /没有可学习的单词/)
  assert.match(runner, /history walk uses leftover \/practice-articles\/backup-articles/)
  assert.match(runner, /assert\.deepEqual\(report\.historyHrefMismatch, \[\]\)/)
  assert.match(runner, /page\.goto\(articlePracticeHref/)
  assert.match(runner, /setting\?index=5/)
  assert.doesNotMatch(runner, /74F7DBB4DD9DD4140D7492D259D03A9152016B58DD1946B472A2B6C4CAD5EF9D/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
  assert.doesNotMatch(runner, /route\.abort/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /historyHrefMismatch\.length === 0 \|\|/)
})

test('official T03 dest runner must not claim dest-green leftover keep on SHA 99948E67', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-official-pages.mjs'), 'utf8')
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
