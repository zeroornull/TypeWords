param([Parameter(Mandatory = $true)][string] $Stage)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'cdp-port.ps1')
$repo = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$launchScript = Join-Path $PSScriptRoot 'launch-existing.ps1'
$closeScript = Join-Path $PSScriptRoot 'close-installed.ps1'
$readyScript = Join-Path $PSScriptRoot 'native-startup-ready.mjs'
$runs = @()
function Get-TreeWorkingSetMiB([int] $RootPid) {
    $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize, Name)
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$ids.Add($RootPid)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($row in $rows) {
            if ($ids.Contains([int]$row.ParentProcessId) -and -not $ids.Contains([int]$row.ProcessId)) {
                [void]$ids.Add([int]$row.ProcessId)
                $changed = $true
            }
        }
    }
    $bytes = 0L
    $names = @()
    foreach ($row in $rows) {
        if ($ids.Contains([int]$row.ProcessId)) {
            $bytes += [int64]$row.WorkingSetSize
            $names += "$($row.Name):$($row.ProcessId)"
        }
    }
    [pscustomobject]@{
        miB = [math]::Round($bytes / 1MB, 1)
        processCount = $ids.Count
        names = $names
    }
}
if (Get-Process typewords-desktop -ErrorAction SilentlyContinue) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $closeScript -Stage $Stage
}
if (Test-TypeWordsCdp 19273) { throw 'CDP 19273 still answered after close' }
Push-Location $repo
try {
    for ($i = 1; $i -le 5; $i++) {
        $readyFile = Join-Path $Stage ("startup-ready-$i.json")
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launchScript -Stage $Stage
        if ($LASTEXITCODE -ne 0) { throw "launch-existing failed on run $i" }
        node $readyScript $Stage ("startup-ready-$i.json")
        if ($LASTEXITCODE -ne 0) { throw "startup-ready failed on run $i" }
        $sw.Stop()
        $launch = Get-Content -LiteralPath (Join-Path $Stage 'launch.json') -Raw | ConvertFrom-Json
        $ready = Get-Content -LiteralPath $readyFile -Raw | ConvertFrom-Json
        $mem = Get-TreeWorkingSetMiB ([int]$launch.pid)
        $runs += [pscustomobject]@{
            n = $i
            pid = $launch.pid
            processToInputMs = $sw.ElapsedMilliseconds
            connectToInputMs = $ready.readyMsFromConnect
            href = $ready.href
            word = $ready.word
            workingSetMiB = $mem.miB
            treeProcessCount = $mem.processCount
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $closeScript -Stage $Stage
        if ($LASTEXITCODE -ne 0) { throw "close failed on run $i" }
        if (-not (Wait-TypeWordsCdp 19273 $false 20)) { throw "CDP still up after run $i" }
    }
}
finally {
    Pop-Location
}
$sorted = $runs.processToInputMs | Sort-Object
$median = $sorted[2]
$report = [ordered]@{
    definition = 'Start-Process through practice page .typing-word visible on /practice-words/backup-custom'
    budgetLocked = $false
    budgetMs = $null
    runs = $runs
    rawProcessToInputMs = @($runs.processToInputMs)
    medianProcessToInputMs = $median
    idleWorkingSetMiB = @($runs.workingSetMiB)
    note = 'Measurement only. T12 budget stays 待填写; do not treat this as a pass.'
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Stage 'startup-timing.json') -Encoding utf8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launchScript -Stage $Stage
Write-Output "STARTUP median=$median ms raw=$($runs.processToInputMs -join ',') relaunched PID=$((Get-Content (Join-Path $Stage 'launch.json') -Raw | ConvertFrom-Json).pid)"
