import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()
const wrapper = resolve(root, 'scripts/invoke-setup.ps1')
const testKeyRoot = 'HKCU:\\Software\\TypeWordsDesktopTest'
const testKey = `${testKeyRoot}\\Uninstall\\TypeWords`

function runWrapper(args) {
  return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper, ...args], {
    encoding: 'utf8',
  })
}

function withTempSetup(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tw-invoke-setup-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Remove-Item -LiteralPath '${testKeyRoot}' -Recurse -Force -ErrorAction SilentlyContinue`,
      ],
      { encoding: 'utf8' }
    )
  }
}

function setDisplayVersion(version) {
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `New-Item -Path '${testKey}' -Force | Out-Null; Set-ItemProperty -LiteralPath '${testKey}' -Name DisplayVersion -Value '${version}'`,
    ],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

test('invoke-setup refuses an older setup when DisplayVersion is newer without launching NSIS', () => {
  withTempSetup(dir => {
    const older = join(dir, 'TypeWords_0.1.2_x64-setup.exe')
    const same = join(dir, 'TypeWords_0.1.3_x64-setup.exe')
    writeFileSync(older, 'dummy-setup')
    writeFileSync(same, 'dummy-setup')
    setDisplayVersion('0.1.3')
    const refusePath = join(dir, 'refuse.json')
    const allowPath = join(dir, 'allow.json')
    const refused = runWrapper([
      '-Setup',
      older,
      '-Dest',
      dir,
      '-UninstallKey',
      testKey,
      '-ResultPath',
      refusePath,
      '-DryRun',
    ])
    assert.equal(refused.status, 2, refused.stderr || refused.stdout)
    const refuse = JSON.parse(readFileSync(refusePath, 'utf8'))
    assert.equal(refuse.setupVersion, '0.1.2')
    assert.equal(refuse.displayVersion, '0.1.3')
    assert.equal(refuse.refused, true)
    assert.equal(refuse.launched, false)
    const allowed = runWrapper([
      '-Setup',
      same,
      '-Dest',
      dir,
      '-UninstallKey',
      testKey,
      '-ResultPath',
      allowPath,
      '-DryRun',
    ])
    assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout)
    const allow = JSON.parse(readFileSync(allowPath, 'utf8'))
    assert.equal(allow.setupVersion, '0.1.3')
    assert.equal(allow.displayVersion, '0.1.3')
    assert.equal(allow.refused, false)
    assert.equal(allow.launched, false)
    assert.equal(allow.dryRun, true)
    assert.equal(allow.withShortcuts, false)
    assert.match(allow.argumentList, /\/S \/NS \/D=/)
    const shortcutPath = join(dir, 'shortcuts.json')
    const withShortcuts = runWrapper([
      '-Setup',
      same,
      '-Dest',
      dir,
      '-UninstallKey',
      testKey,
      '-ResultPath',
      shortcutPath,
      '-DryRun',
      '-WithShortcuts',
    ])
    assert.equal(withShortcuts.status, 0, withShortcuts.stderr || withShortcuts.stdout)
    const shortcuts = JSON.parse(readFileSync(shortcutPath, 'utf8'))
    assert.equal(shortcuts.withShortcuts, true)
    assert.equal(shortcuts.launched, false)
    assert.match(shortcuts.argumentList, /\/S \/D=/)
    assert.doesNotMatch(shortcuts.argumentList, /\/NS/)
  })
})

test('invoke-setup refuses a lower multi-digit setup without DryRun and still refuses with WithShortcuts', () => {
  withTempSetup(dir => {
    const older = join(dir, 'TypeWords_0.1.9_x64-setup.exe')
    writeFileSync(older, 'dummy-setup')
    setDisplayVersion('0.1.10')
    const refusePath = join(dir, 'refuse-multidigit.json')
    const refused = runWrapper([
      '-Setup',
      older,
      '-Dest',
      dir,
      '-UninstallKey',
      testKey,
      '-ResultPath',
      refusePath,
      '-WithShortcuts',
    ])
    assert.equal(refused.status, 2, refused.stderr || refused.stdout)
    const refuse = JSON.parse(readFileSync(refusePath, 'utf8'))
    assert.equal(refuse.setupVersion, '0.1.9')
    assert.equal(refuse.displayVersion, '0.1.10')
    assert.equal(refuse.refused, true)
    assert.equal(refuse.launched, false)
    assert.equal(refuse.dryRun, false)
    assert.equal(refuse.withShortcuts, true)
    assert.match(refuse.reason, /installed DisplayVersion 0\.1\.10 is newer than setup 0\.1\.9/)
    assert.match(refuse.argumentList, /\/S \/D=/)
    assert.doesNotMatch(refuse.argumentList, /\/NS/)
  })
})

// Honesty: a different -Dest still DryRun-allows on the shared Uninstall
// DisplayVersion. invoke-setup has no running-dest guard. Silent /S would
// let currentUser NSIS FindProcessCurrentUser / KillProcessCurrentUser
// typewords-desktop.exe by name and rewrite HKCU Uninstall\TypeWords.
// A second /D= is not a safe leftover-preserving upgrade while dest is
// running. Dummy setup + test key only; do not launch dest or real NSIS.
test('invoke-setup allows a second /D= on the shared uninstall key and still builds silent /S', () => {
  withTempSetup(dir => {
    const setup = join(dir, 'TypeWords_0.1.3_x64-setup.exe')
    writeFileSync(setup, 'dummy-setup')
    setDisplayVersion('0.1.3')
    const otherDest = join(dir, 'new-side-by-side')
    const resultPath = join(dir, 'second-d.json')
    const allowed = runWrapper([
      '-Setup',
      setup,
      '-Dest',
      otherDest,
      '-UninstallKey',
      testKey,
      '-ResultPath',
      resultPath,
      '-DryRun',
    ])
    assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout)
    const allow = JSON.parse(readFileSync(resultPath, 'utf8'))
    assert.equal(allow.setupVersion, '0.1.3')
    assert.equal(allow.displayVersion, '0.1.3')
    assert.equal(allow.refused, false)
    assert.equal(allow.launched, false)
    assert.equal(allow.dryRun, true)
    assert.equal(allow.dest, otherDest)
    assert.match(allow.dest, /new-side-by-side/)
    assert.match(allow.argumentList, /\/S \/NS \/D=/)
    assert.ok(
      allow.argumentList.includes(`/D=${otherDest}`),
      `silent second /D= must target the new dest: ${allow.argumentList}`
    )
  })
})
