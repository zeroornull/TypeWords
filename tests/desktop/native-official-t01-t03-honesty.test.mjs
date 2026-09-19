import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  DEST_LIST_PAGES,
  DEST_RUNNER_HONESTY_PHRASES,
  LEFTOVER_DEST_SHA256,
  LEFTOVER_DEST_SHA_PREFIX,
  OFFICIAL_COMPLETE20_WORD_PRACTICE_PATH,
  OFFICIAL_EMPTY_TASK_LANDING_PATH,
  OFFICIAL_T01_T03_DEST_RUNNERS,
  OFFICIAL_T01_T03_STATUS,
  OFFICIAL_T03_HISTORY_PRACTICE_PATH,
  canClaimLeftoverDestGreen,
  destListPageNavigationProvesLeftover20,
  isDestListPage,
  isLeftoverDestPreFix,
  isOfficialEmptyTaskComplete20Redirect,
  leftoverDestHonesty,
  leftoverDestLacksSourceFixes,
  officialT03WordPracticeHrefAccepted,
} from './native-official-t01-t03-honesty.mjs'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('leftover dest SHA 99948E67 is pre-fix and lacks leftover source fixes', () => {
  assert.equal(LEFTOVER_DEST_SHA_PREFIX, '99948E67')
  assert.equal(LEFTOVER_DEST_SHA256.startsWith(LEFTOVER_DEST_SHA_PREFIX), true)
  assert.equal(isLeftoverDestPreFix(LEFTOVER_DEST_SHA256), true)
  assert.equal(isLeftoverDestPreFix('99948E67…'), true)
  assert.equal(isLeftoverDestPreFix(LEFTOVER_DEST_SHA256.toLowerCase()), true)
  assert.equal(leftoverDestLacksSourceFixes(LEFTOVER_DEST_SHA256), true)
  assert.equal(isLeftoverDestPreFix('958E6855C0FFEE'), false)
})

test('must not claim dest-green for leftover id-match / lastLearnIndex keep on SHA 99948E67', () => {
  const honesty = leftoverDestHonesty(LEFTOVER_DEST_SHA256)
  assert.equal(honesty.preFix, true)
  assert.equal(honesty.lacksSourceFixes, true)
  assert.equal(honesty.destGreenIdMatch, false)
  assert.equal(honesty.destGreenLastLearnIndexKeep, false)
  assert.equal(canClaimLeftoverDestGreen(LEFTOVER_DEST_SHA256, 'id-match'), false)
  assert.equal(canClaimLeftoverDestGreen(LEFTOVER_DEST_SHA256, 'lastLearnIndex-keep'), false)
  assert.equal(canClaimLeftoverDestGreen(LEFTOVER_DEST_SHA256, 'list-page'), false)
  assert.equal(canClaimLeftoverDestGreen('0209C0D8DEADBEEF', 'id-match'), false)
})

test('complete-20 → /words is official empty-task', () => {
  assert.equal(OFFICIAL_COMPLETE20_WORD_PRACTICE_PATH, '/practice-words/backup-custom')
  assert.equal(OFFICIAL_EMPTY_TASK_LANDING_PATH, '/words')
  assert.equal(OFFICIAL_T03_HISTORY_PRACTICE_PATH, '/practice-articles/backup-articles')
  assert.equal(
    isOfficialEmptyTaskComplete20Redirect({
      fromPath: '/practice-words/backup-custom',
      toPath: '/words',
      complete: true,
      lastLearnIndex: 20,
    }),
    true
  )
  assert.equal(
    isOfficialEmptyTaskComplete20Redirect({
      fromPath: 'http://tauri.localhost/practice-words/backup-custom',
      toPath: 'http://tauri.localhost/words',
    }),
    true
  )
  assert.equal(officialT03WordPracticeHrefAccepted('http://tauri.localhost/words'), true)
  assert.equal(
    officialT03WordPracticeHrefAccepted('http://tauri.localhost/practice-words/backup-custom'),
    true
  )
  assert.equal(officialT03WordPracticeHrefAccepted('http://tauri.localhost/practice-words/1'), false)
  assert.equal(
    isOfficialEmptyTaskComplete20Redirect({
      fromPath: '/practice-words/1',
      toPath: '/words',
    }),
    false
  )
})

test('runners must not treat old dest list-page navigation as leftover-20 proof', () => {
  assert.deepEqual(DEST_LIST_PAGES, ['/words', '/dict', '/articles'])
  for (const path of DEST_LIST_PAGES) {
    assert.equal(isDestListPage(path), true)
    assert.equal(
      destListPageNavigationProvesLeftover20({
        path,
        sha256: LEFTOVER_DEST_SHA256,
        lastLearnIndex: 20,
      }),
      false
    )
  }
  assert.equal(isDestListPage('/practice-words/backup-custom'), false)
  assert.equal(leftoverDestHonesty(LEFTOVER_DEST_SHA256).listPageNavigationIsLeftover20Proof, false)
})

test('official T01/T03 stay incomplete after dest-runner honesty lock', () => {
  const honesty = leftoverDestHonesty(LEFTOVER_DEST_SHA256)
  assert.equal(OFFICIAL_T01_T03_STATUS.T01, 'incomplete')
  assert.equal(OFFICIAL_T01_T03_STATUS.T03, 'incomplete')
  assert.equal(honesty.officialStatus.T01, 'incomplete')
  assert.equal(honesty.officialStatus.T03, 'incomplete')
  assert.equal(honesty.complete20ToWordsIsOfficialEmptyTask, true)
})

test('T01/T03 dest runners lock leftover dest honesty comments and do not invent dest flows', () => {
  for (const file of OFFICIAL_T01_T03_DEST_RUNNERS) {
    const runner = readFileSync(resolve(root, file), 'utf8')
    for (const phrase of DEST_RUNNER_HONESTY_PHRASES) {
      assert.match(runner, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${file} missing ${phrase}`)
    }
    assert.match(runner, /Do not treat old dest list-page navigation/)
    assert.doesNotMatch(runner, /destGreenIdMatch:\s*true/)
    assert.doesNotMatch(runner, /listPageNavigationIsLeftover20Proof:\s*true/)
    assert.doesNotMatch(runner, /Get-NetTCPConnection/)
    assert.doesNotMatch(runner, /LOCALAPPDATA/)
  }
})
