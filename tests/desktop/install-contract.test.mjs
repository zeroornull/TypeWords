import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || process.cwd())

test('invoke-setup keeps isolated /NS by default and omits it only with WithShortcuts', () => {
  const script = readFileSync(resolve(root, 'scripts/invoke-setup.ps1'), 'utf8')
  assert.match(script, /\[switch\] \$WithShortcuts/)
  assert.match(
    script,
    /\$argumentList = if \(\$WithShortcuts\) \{ "\/S \/D=\$Dest" \} else \{ "\/S \/NS \/D=\$Dest" \}/
  )
  assert.match(script, /Start-Process -FilePath \$Setup -ArgumentList \$argumentList/)
  assert.doesNotMatch(script, /Start-Process -FilePath \$Setup -ArgumentList "\/S \/NS \/D=\$Dest"/)
  assert.match(script, /Option 2 support-path wrapper/)
  assert.match(script, /allowDowngrades=false is insufficient/)
  assert.match(script, /as \[version\] \(not string\)/)
  assert.match(script, /exit 2 before launching NSIS/)
  assert.doesNotMatch(script, /Get-NetTCPConnection/)
})

test('native install-contract inspects DisplayVersion, shortcuts and unused default identifier', () => {
  const script = readFileSync(resolve(root, 'tests/desktop/native-install-contract.ps1'), 'utf8')
  assert.match(script, /DisplayVersion/)
  assert.match(script, /DisplayName/)
  assert.match(script, /UninstallString/)
  assert.match(script, /Start Menu/)
  assert.match(script, /io\.github\.zyronon\.typewords/)
  assert.match(script, /\[string\] \$ExpectedSha256/)
  assert.match(script, /Get-FileHash -LiteralPath \$exe -Algorithm SHA256/)
  assert.match(script, /if \(\$ExpectedSha256\)/)
  assert.match(script, /live dest/)
  assert.doesNotMatch(script, /74F7DBB4DD9DD4140D7492D259D03A9152016B58DD1946B472A2B6C4CAD5EF9D/)
  assert.doesNotMatch(script, /ExpectedSha256 = '74F7/)
  assert.match(script, /RequireShortcuts/)
  assert.match(script, /install-contract\.json/)
  assert.doesNotMatch(script, /uninstall\.ps1/)
  assert.doesNotMatch(script, /Start-Process -FilePath .*uninstall/)
  assert.ok(!script.includes('Get-NetTCPConnection'), 'install-contract must not probe TCP table')
})

test('internal installer stays currentUser NSIS and does not claim a signed release', () => {
  const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.internal.conf.json'), 'utf8'))
  const base = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  assert.equal(base.identifier, 'io.github.zyronon.typewords')
  assert.equal(base.productName, 'TypeWords')
  assert.equal(base.version, '0.1.3')
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser')
  assert.equal(config.bundle.windows.allowDowngrades, false)
})

// Honesty: silent currentUser NSIS kills typewords-desktop.exe by name
// (FindProcessCurrentUser / KillProcessCurrentUser) and rewrites the shared
// HKCU Uninstall\TypeWords key. A second /D= is not a safe leftover-preserving
// upgrade while dest is running. This is source-lock only; do not dest rematrix.
test('silent NSIS kill-by-name means a second /D= is not leftover-preserving while dest is running', () => {
  const script = readFileSync(resolve(root, 'scripts/invoke-setup.ps1'), 'utf8')
  assert.match(script, /FindProcessCurrentUser/)
  assert.match(script, /KillProcessCurrentUser/)
  assert.match(script, /typewords-desktop\.exe by process name/)
  assert.match(script, /not a safe leftover-preserving upgrade while dest is running/)
  assert.match(script, /rewrite HKCU Uninstall\\TypeWords InstallLocation/)
  assert.match(script, /does not skip that kill-by-name/)
  assert.match(
    script,
    /UninstallKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TypeWords'/
  )
  assert.match(script, /"\/S \/NS \/D=\$Dest"/)
  assert.doesNotMatch(script, /Get-NetTCPConnection/)
  assert.doesNotMatch(script, /Get-Process typewords-desktop/)
  const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.internal.conf.json'), 'utf8'))
  const base = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser')
  assert.equal(base.productName, 'TypeWords')
  assert.match(cargo, /^name = "typewords-desktop"$/m)
})
