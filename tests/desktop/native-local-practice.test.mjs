import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  isMaskedPracticeLetterText,
  isVisiblePracticeWord,
  resolveInstalledPracticeWord,
} from './native-local-practice-word.mjs'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('masked letter placeholders are not a typeable practice word', () => {
  assert.equal(isVisiblePracticeWord('_______'), false)
  assert.equal(isMaskedPracticeLetterText('_______'), true)
  assert.equal(isVisiblePracticeWord('fixture'), true)
})

test('resolver prefers session/cache word over masked letters', () => {
  assert.equal(
    resolveInstalledPracticeWord({
      letterText: '_______',
      cacheWord: 'fixture',
      providedWord: '',
      propWord: '',
    }),
    'fixture'
  )
  assert.equal(
    resolveInstalledPracticeWord({
      letterText: '_______',
      cacheWord: 'fixture',
      propWord: 'possess',
    }),
    'possess'
  )
  assert.equal(
    resolveInstalledPracticeWord({
      letterText: '_______',
      revealedLetterText: 'fixture',
    }),
    'fixture'
  )
  assert.equal(resolveInstalledPracticeWord({ letterText: '_______' }), '')
  assert.equal(isVisiblePracticeWord(''), false)
  assert.equal(isMaskedPracticeLetterText('_\u00a0_'), true)
})

test('official practice runner must not type masked letters as the word', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice.mjs'), 'utf8')
  assert.match(runner, /native-local-practice-word\.mjs/)
  assert.match(runner, /resolveInstalledPracticeWord/)
  assert.match(runner, /isMaskedPracticeLetterText/)
  assert.match(runner, /PracticeSaveWord/)
  assert.match(runner, /ShowWord/)
  assert.match(runner, /isolated-profile/)
  assert.match(runner, /createHash\('sha256'\)\.update\(readFileSync\(launch\.exe\)\)/)
  assert.match(runner, /native-local-practice\.json/)
  assert.match(runner, /assert\.deepEqual\(report\.errors, \[\]\)/)
  assert.doesNotMatch(runner, /runtime\?\.editWord\?\.word \|\| runtime\?\.currentWord\?\.word/)
  assert.doesNotMatch(runner, /LOCALAPPDATA/)
  assert.doesNotMatch(runner, /Get-NetTCPConnection/)
})

test('official T01 dest runner must not claim dest-green leftover keep on SHA 99948E67', () => {
  const runner = readFileSync(resolve(root, 'tests/desktop/native-local-practice.mjs'), 'utf8')
  assert.match(runner, /99948E67/)
  assert.match(runner, /pre-fix/)
  assert.match(runner, /id-match/)
  assert.match(runner, /lastLearnIndex keep/)
  assert.match(runner, /Do not claim dest-green/)
  assert.match(runner, /complete-20/)
  assert.match(runner, /official empty-task/)
  assert.match(runner, /list-page/)
  assert.match(runner, /leftover-20 proof/)
  assert.match(runner, /Do not treat old dest list-page/)
  assert.doesNotMatch(runner, /destGreenIdMatch:\s*true/)
})
