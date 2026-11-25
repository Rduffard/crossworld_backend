[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Candidate,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha,
    [switch]$Apply
)

. (Join-Path $PSScriptRoot 'Supervisor-Runtime.ps1')
. (Join-Path $PSScriptRoot 'Handover-Core.ps1')
$operationsRoot = Join-Path $env:LOCALAPPDATA 'Crossworld Operations'
$releaseHome = Join-Path $operationsRoot 'Managed Releases'
$environment = Join-Path $operationsRoot 'Fleetmaster Handover\candidate.env'
$taskName = 'Crossworld Operations Release-Managed Supervisor'
$state = Get-Content -LiteralPath (Join-Path $releaseHome 'state.json') -Raw | ConvertFrom-Json
$knownGood = $state.active
if ($knownGood -cnotmatch '^[a-f0-9]{64}$' -or (Test-Path -LiteralPath (Join-Path $releaseHome 'handover.json'))) {
    throw 'Resolve the active worker handover before changing the independent supervisor.'
}
$manifest = Assert-SupervisorRuntime -Directory $Candidate -ManifestSha $ManifestSha
if (!$Apply) {
    Write-Output "Verified supervisor $($manifest.commit) with manifest $ManifestSha. The scheduled task was preserved."
    return
}
$task = Get-ScheduledTask -TaskName $taskName
if ($task.State -ne 'Running' -or @($task.Actions).Count -ne 1) { throw 'The supervisor must be running before handover.' }
$previous = @($task.Actions)[0]
$node = $previous.Execute
$worker = Join-Path $releaseHome "$knownGood\tools\operations-worker\worker.mjs"
$marker = Join-Path $releaseHome 'supervisor-ready.json'
$receipt = Join-Path $operationsRoot ('supervisor-switch-' + $ManifestSha + '.txt')
function Confirm-Hold {
    & $node ('--env-file=' + $environment) $worker '--check-handover'
    if ($LASTEXITCODE -ne 0) { throw 'Hosted maintenance and dispatch are not ready for supervisor handover.' }
    if ((Get-Content -LiteralPath (Join-Path $releaseHome 'state.json') -Raw | ConvertFrom-Json).active -ne $knownGood) {
        throw 'The active worker release changed.'
    }
}
Confirm-Hold
$target = Install-SupervisorRuntime -Candidate $Candidate -ManifestSha $ManifestSha -OperationsRoot $operationsRoot
$controller = Join-Path $target 'tools\operations-worker\managed-supervisor.mjs'
$arguments = '--env-file="{0}" "{1}" --managed-releases "{2}"' -f $environment,$controller,$releaseHome
$action = New-ScheduledTaskAction -Execute $node -WorkingDirectory $target -Argument $arguments
$after = [DateTimeOffset]::UtcNow
function Stop-Supervisor {
    Stop-ScheduledTask -TaskName $taskName
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(35)
    while ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') {
        if ([DateTimeOffset]::UtcNow -gt $deadline) { throw 'The supervisor did not stop in the maintenance window.' }
        Start-Sleep -Milliseconds 250
    }
}
function Confirm-Supervisor([DateTimeOffset]$After) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(145)
    do {
        if (Test-Path -LiteralPath $marker -PathType Leaf) {
            try {
                $ready = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
                if ($ready.active -eq $knownGood -and [DateTimeOffset]$ready.observedAt -gt $After -and
                    (Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { return }
            } catch {}
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw 'The supervisor did not report fresh authenticated readiness.'
}
Invoke-RelayHandover -CheckReady ${function:Confirm-Hold} -Record {
    param($phase)
    [IO.File]::AppendAllText($receipt, ("{0:o} {1}`r`n" -f [DateTimeOffset]::UtcNow, $phase))
} -StopPrevious ${function:Stop-Supervisor} -StartCandidate {
    Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
    Start-ScheduledTask -TaskName $taskName
} -ConfirmCandidate {
    Confirm-Supervisor $after
} -RestorePrevious {
    if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { Stop-Supervisor }
    Set-ScheduledTask -TaskName $taskName -Action $previous | Out-Null
    $restore = [DateTimeOffset]::UtcNow
    Start-ScheduledTask -TaskName $taskName
    Confirm-Supervisor $restore
}
