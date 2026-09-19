param(
    [Parameter(Mandatory = $true)][string] $Stage,
    [string] $ExpectedSha256,
    [switch] $RequireShortcuts
)
$ErrorActionPreference = 'Stop'

$dest = Join-Path $Stage 'installed'
$exe = Join-Path $dest 'typewords-desktop.exe'
$uninstaller = Join-Path $dest 'uninstall.exe'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TypeWords'
$pref = 'HKCU:\Software\github\TypeWords'
$defaultId = Join-Path $env:LOCALAPPDATA 'io.github.zyronon.typewords'
$launch = Get-Content -LiteralPath (Join-Path $Stage 'launch.json') -Raw | ConvertFrom-Json

function Get-TypeWordsShortcutRecords {
    $roots = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory')
    )
    $shell = New-Object -ComObject WScript.Shell
    $records = @()
    foreach ($root in $roots) {
        if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match 'TypeWords|typewords' -or $_.DirectoryName -match 'TypeWords|typewords' } |
            ForEach-Object {
                $link = $shell.CreateShortcut($_.FullName)
                $records += [ordered]@{
                    path = $_.FullName
                    target = $link.TargetPath
                    workingDirectory = $link.WorkingDirectory
                    inStartMenu = $_.FullName -match 'Start Menu'
                    inDesktop = $_.FullName -match '\\Desktop\\'
                }
            }
    }
    return $records
}

if (!(Test-Path -LiteralPath $exe)) { throw "Missing dest EXE: $exe" }
$sha = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
$productVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
if ($ExpectedSha256) {
    if ($sha -ne $ExpectedSha256) { throw "Dest SHA $sha != $ExpectedSha256" }
    if ($launch.sha256 -ne $ExpectedSha256) { throw 'launch.json SHA does not match dest contract' }
} else {
    if ($launch.sha256 -ne $sha) { throw "launch.json SHA $($launch.sha256) != live dest $sha" }
}

if (!(Test-Path -LiteralPath $key)) { throw 'Uninstall registration missing' }
$registered = Get-ItemProperty -LiteralPath $key
$installLocation = "$($registered.InstallLocation)".Trim('"')
if ($registered.DisplayName -ne 'TypeWords') { throw "DisplayName $($registered.DisplayName)" }
if ($registered.DisplayVersion -ne '0.1.3') { throw "DisplayVersion $($registered.DisplayVersion)" }
if ($installLocation -ne $dest) { throw "InstallLocation $installLocation != $dest" }
$uninstallString = "$($registered.UninstallString)".Trim('"')
if ($uninstallString -ne $uninstaller) { throw "UninstallString $uninstallString != $uninstaller" }
if (!(Test-Path -LiteralPath $uninstaller)) { throw 'uninstall.exe missing' }

$prefLocation = $null
if (Test-Path -LiteralPath $pref) {
    $prefLocation = (Get-ItemProperty -LiteralPath $pref).'(default)'
}

$defaultExists = Test-Path -LiteralPath $defaultId
$defaultFileCount = 0
if ($defaultExists) {
    $defaultFileCount = @(Get-ChildItem -LiteralPath $defaultId -Force -Recurse -ErrorAction SilentlyContinue).Count
}
if ($defaultFileCount -ne 0) { throw "Default identifier directory is not unused: $defaultFileCount files" }

$shortcuts = @(Get-TypeWordsShortcutRecords)
$destShortcuts = @($shortcuts | Where-Object { $_.target -eq $exe })
if ($RequireShortcuts -and $destShortcuts.Count -eq 0) {
    throw "Required Start Menu/Desktop shortcut targeting $exe was not found"
}

$record = [ordered]@{
    dest = $dest
    exe = $exe
    sha256 = $sha
    productVersion = $productVersion
    displayName = $registered.DisplayName
    displayVersion = $registered.DisplayVersion
    installLocation = $installLocation
    uninstallString = $uninstallString
    prefLocation = $prefLocation
    defaultIdentifier = $defaultId
    defaultIdentifierExists = $defaultExists
    defaultIdentifierFileCount = $defaultFileCount
    requireShortcuts = [bool]$RequireShortcuts
    shortcutCount = $shortcuts.Count
    destShortcutCount = $destShortcuts.Count
    shortcuts = $shortcuts
    authenticode = (Get-AuthenticodeSignature -LiteralPath $exe).Status.ToString()
}
$out = Join-Path $Stage 'install-contract.json'
$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $out -Encoding utf8
Write-Output ($record | ConvertTo-Json -Depth 6)
if ($RequireShortcuts) {
    Write-Output "PASS: isolated dest DisplayVersion 0.1.3, SHA matched, default identifier unused, dest shortcut present"
} else {
    Write-Output "PASS: isolated dest DisplayVersion 0.1.3, SHA matched, default identifier unused"
}
