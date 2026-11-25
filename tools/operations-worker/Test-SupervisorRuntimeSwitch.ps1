[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Candidate,
    [Parameter(Mandatory)][string]$ManifestSha,
    [Parameter(Mandatory)][string]$FixtureDirectory
)

$ErrorActionPreference = 'Stop'
$fixture = Get-Item -LiteralPath $FixtureDirectory
if (!$fixture.PSIsContainer -or ($fixture.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid fixture directory.' }
$local = Join-Path $fixture.FullName ([guid]::NewGuid().ToString('N'))
$priorLocal = $env:LOCALAPPDATA
$productionTask = 'Crossworld Operations Release-Managed Supervisor'
$fixtureState = [pscustomobject]@{
    knownGood = 'a' * 64
    holdAllowed = $true
    taskState = 'Running'
    failCandidate = $false
    stops = 0
    starts = 0
    priorAction = [pscustomobject]@{ Execute='Invoke-FixtureReadiness'; WorkingDirectory=$local; Arguments='fixture only' }
    currentAction = $null
}
$fixtureState.currentAction = $fixtureState.priorAction
function Invoke-FixtureReadiness { $global:LASTEXITCODE = $(if ($fixtureState.holdAllowed) { 0 } else { 1 }) }
function Assert-FixtureTask($TaskName) { if ($TaskName -ne $productionTask) { throw 'Unexpected fixture task.' } }
function Get-ScheduledTask($TaskName) {
    Assert-FixtureTask $TaskName
    [pscustomobject]@{ State=$fixtureState.taskState; Actions=@($fixtureState.currentAction) }
}
function New-ScheduledTaskAction($Execute,$WorkingDirectory,$Argument) {
    [pscustomobject]@{ Execute=$Execute; WorkingDirectory=$WorkingDirectory; Arguments=$Argument }
}
function Set-ScheduledTask($TaskName,$Action) {
    Assert-FixtureTask $TaskName
    if ($fixtureState.failCandidate -and $Action -ne $fixtureState.priorAction) { throw 'Fixture candidate task action failed.' }
    $fixtureState.currentAction = $Action
}
function Stop-ScheduledTask($TaskName) {
    Assert-FixtureTask $TaskName
    $fixtureState.stops++
    $fixtureState.taskState = 'Ready'
}
function Start-ScheduledTask($TaskName) {
    Assert-FixtureTask $TaskName
    $fixtureState.starts++
    $fixtureState.taskState = 'Running'
    @{ active=$fixtureState.knownGood; observedAt=[DateTimeOffset]::UtcNow.AddMilliseconds(10).ToString('o') } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $releaseHome 'supervisor-ready.json') -Encoding utf8
}

try {
    $env:LOCALAPPDATA = $local
    $root = Join-Path $local 'Crossworld Operations'
    $releaseHome = Join-Path $root 'Managed Releases'
    New-Item -ItemType Directory -Path $releaseHome -Force | Out-Null
    @{ active=$fixtureState.knownGood } | ConvertTo-Json -Compress |
        Set-Content -LiteralPath (Join-Path $releaseHome 'state.json') -Encoding utf8
    $switch = Join-Path $PSScriptRoot 'Switch-ManagedSupervisorRuntime.ps1'

    $fixtureState.holdAllowed = $false
    try { & $switch -Candidate $Candidate -ManifestSha $ManifestSha -Apply; throw 'Fixture should block before stopping.' }
    catch { if ($_.Exception.Message -notlike '*not ready for supervisor handover*') { throw } }
    if ($fixtureState.stops -or $fixtureState.starts) { throw 'Unheld sign-off changed the task.' }

    $fixtureState.holdAllowed = $true
    $fixtureState.failCandidate = $true
    try { & $switch -Candidate $Candidate -ManifestSha $ManifestSha -Apply; throw 'Fixture should restore.' }
    catch { if ($_.Exception.Message -notlike '*previous relay was restored*') { throw } }
    if ($fixtureState.taskState -ne 'Running' -or $fixtureState.currentAction -ne $fixtureState.priorAction -or $fixtureState.starts -ne 1) {
        throw 'The fixture did not restore its previous controller.'
    }

    $fixtureState.failCandidate = $false
    & $switch -Candidate $Candidate -ManifestSha $ManifestSha -Apply
    $expected = Join-Path (Join-Path $root 'Supervisor Runtime') $ManifestSha
    if ($fixtureState.taskState -ne 'Running' -or $fixtureState.currentAction.WorkingDirectory -ne $expected -or $fixtureState.starts -ne 2) {
        throw 'The fixture did not run the installed digest-addressed controller.'
    }
    if ((Get-Content -LiteralPath (Join-Path $releaseHome 'state.json') -Raw | ConvertFrom-Json).active -ne $fixtureState.knownGood) {
        throw 'The independent controller handover modified the worker pointer.'
    }
    . (Join-Path $PSScriptRoot 'Supervisor-Runtime.ps1')
    Set-Content -LiteralPath (Join-Path $expected 'package.json') -Value '{}' -Encoding utf8
    try {
        $null = Assert-SupervisorRuntime -Directory $expected -ManifestSha $ManifestSha
        throw 'Fixture should reject an undeclared runtime file.'
    } catch { if ($_.Exception.Message -ne 'Unexpected supervisor runtime file.') { throw } }
    Write-Output 'Supervisor isolation fixture PASS. Maintenance gate, rollback, separate install, worker pointer preservation and undeclared file rejection.'
} finally {
    $env:LOCALAPPDATA = $priorLocal
}
