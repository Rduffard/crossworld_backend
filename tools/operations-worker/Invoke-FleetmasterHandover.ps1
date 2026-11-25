[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Recover,
    [Parameter(Mandatory)][string[]]$ScopedRoots,
    [Parameter(Mandatory)][string]$RollbackRoot,
    [switch]$PreserveFullAccess
)

. (Join-Path $PSScriptRoot 'Handover-Core.ps1')
$previous = 'Crossworld Operations Relay Supervisor'
$candidate = 'Crossworld Operations Fleetmaster Supervisor'
$recovery = 'Crossworld Operations Fleetmaster Recovery'
$controller = Join-Path $env:LOCALAPPDATA 'Crossworld Operations\Fleetmaster Handover'
$worker = Join-Path $PSScriptRoot 'worker.mjs'
$supervisor = Join-Path $PSScriptRoot 'supervisor.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$oldLog = Join-Path $env:LOCALAPPDATA 'Crossworld Operations\supervisor.jsonl'
$candidateLog = Join-Path $controller 'candidate.jsonl'
$environment = Join-Path $controller 'candidate.env'
$journal = Join-Path $controller 'status.txt'
$rollbackWorker = Join-Path $RollbackRoot 'tools\operations-worker\worker.mjs'
$rollbackSupervisor = Join-Path $RollbackRoot 'tools\operations-worker\supervisor.mjs'
$env:OPERATIONS_BACKEND_URL = 'https://api.crossworldcreative.com'
$env:OPERATIONS_SCOPED_PROFILE = '1'
$env:OPERATIONS_SCOPED_ROOTS = ConvertTo-Json -InputObject $ScopedRoots -Compress
$env:OPERATIONS_FULL_ACCESS = if ($PreserveFullAccess) { '1' } else { '0' }
$env:OPERATIONS_BACKGROUND_REVIEWS = '1'
$env:OPERATIONS_SUPERVISOR_LOG = $candidateLog
$version = (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()

function Invoke-WorkerCheck([string]$argument) {
    & $node $worker $argument
    if ($LASTEXITCODE -ne 0) { throw "Worker check $argument failed." }
}
function Set-HandoverState([string]$value) {
    [IO.File]::WriteAllText($journal, $value)
}
function Wait-TaskStop([string]$name) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    while ((Get-ScheduledTask -TaskName $name).State -eq 'Running') {
        if ([DateTimeOffset]::UtcNow -ge $deadline) { throw "The task $name is still running." }
        Start-Sleep -Milliseconds 350
    }
}
function Restore-Previous {
    $entry = Get-ScheduledTask -TaskName $candidate -ErrorAction SilentlyContinue
    if ($entry) {
        if ($entry.State -eq 'Running') { Stop-ScheduledTask -TaskName $candidate; Wait-TaskStop $candidate }
        Disable-ScheduledTask -TaskName $candidate | Out-Null
    }
    if ((Get-ScheduledTask -TaskName $previous).State -eq 'Running') { return }
    if ((Get-ScheduledTask -TaskName $recovery).State -eq 'Running') { return }
    $oldLineCount = @(Get-Content -LiteralPath $oldLog).Count
    Disable-ScheduledTask -TaskName $previous | Out-Null
    Enable-ScheduledTask -TaskName $recovery | Out-Null
    Start-ScheduledTask -TaskName $recovery
    Wait-RelayHeartbeat -Log $oldLog -After $oldLineCount -Accept { param($event) $event.profiles -contains 'read-only' }
}

if ($Apply -and $Recover) { throw 'Choose either Apply or Recover.' }
if ((Get-FileHash -LiteralPath $rollbackWorker -Algorithm SHA256).Hash -ne 'EE801CB8AA89FC2F455451BB866EC93A93889395BFDD12FF92F9C3D1F8DD3E02' -or
    (Get-FileHash -LiteralPath $rollbackSupervisor -Algorithm SHA256).Hash -ne '4D09D9B52D18A265C1A2C19A6DD80BC5A81238DD7EB06829CAB329F02B450196') {
    throw 'The rollback release does not match the known-good DRYDOCK II worker and supervisor.'
}
if ($Recover) {
    if (!(Test-Path -LiteralPath $journal -PathType Leaf)) { throw 'No handover journal exists.' }
    Invoke-WorkerCheck '--check-handover'
    Restore-Previous
    Set-HandoverState 'rolled-back'
    Write-Output 'Previous relay restored. Review hosted connectivity before clearing maintenance.'
    return
}

$known = Get-ScheduledTask -TaskName $previous
if ($known.State -ne 'Running' -or !(Test-Path -LiteralPath $oldLog -PathType Leaf)) { throw 'The previous supervised relay must be running with an existing log.' }
if (($known.Principal.UserId -split '\\')[-1] -ne ($user -split '\\')[-1]) { throw 'Run from the registered interactive Windows account.' }
if ((Get-ScheduledTask -TaskName $candidate -ErrorAction SilentlyContinue) -or (Get-ScheduledTask -TaskName $recovery -ErrorAction SilentlyContinue)) {
    throw 'A rollout task already exists. Inspect its state before applying another candidate.'
}
Invoke-WorkerCheck '--check'
Invoke-WorkerCheck '--check-device'
if (!$Apply) {
    Write-Output "Candidate $version passed local checks and persisted device authentication. Both relay tasks are unchanged."
    return
}

New-Item -ItemType Directory -Path $controller -Force | Out-Null
$variables = @('OPERATIONS_BACKEND_URL','OPERATIONS_SCOPED_PROFILE','OPERATIONS_SCOPED_ROOTS','OPERATIONS_FULL_ACCESS',
    'OPERATIONS_BACKGROUND_REVIEWS','OPERATIONS_SUPERVISOR_LOG')
$lines = foreach ($name in $variables) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($value -match "['\r\n]") { throw "Invalid value for $name." }
    "$name='$value'"
}
[IO.File]::WriteAllLines($environment, [string[]]$lines)
$offset = if (Test-Path -LiteralPath $candidateLog) { @(Get-Content -LiteralPath $candidateLog).Count } else { 0 }
$workingDirectory = @($known.Actions)[0].WorkingDirectory
$action = New-ScheduledTaskAction -Execute $node -WorkingDirectory $workingDirectory -Argument ('--env-file="{0}" "{1}" --start-supervised' -f $environment, $supervisor)
$rollbackAction = New-ScheduledTaskAction -Execute $node -WorkingDirectory $workingDirectory -Argument ('"{0}" --start-supervised' -f $rollbackSupervisor)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Invoke-WorkerCheck '--check-handover'
$disabled = New-ScheduledTaskSettingsSet -Disable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $recovery -Action $rollbackAction -Trigger $trigger -Principal $principal -Settings $disabled | Out-Null
Register-ScheduledTask -TaskName $candidate -Action $action -Trigger $trigger -Principal $principal -Settings $disabled | Out-Null

Invoke-RelayHandover -CheckReady { Invoke-WorkerCheck '--check-handover' } -Record ${function:Set-HandoverState} `
    -StopPrevious {
        Stop-ScheduledTask -TaskName $previous
        Wait-TaskStop $previous
        Disable-ScheduledTask -TaskName $previous | Out-Null
    } -StartCandidate {
        Enable-ScheduledTask -TaskName $candidate | Out-Null
        Start-ScheduledTask -TaskName $candidate
    } -ConfirmCandidate {
        Wait-RelayHeartbeat -Log $candidateLog -After $offset -Accept {
            param($event)
            $event.relayVersion -eq $version -and $event.blueprintBranches -eq $true -and
                $event.profiles -contains 'scoped' -and $event.profiles -contains 'read-only' -and
                $event.profiles -contains 'development' -and $event.profiles -contains 'workshop' -and
                (!$PreserveFullAccess -or $event.profiles -contains 'full-access')
        }
    } -RestorePrevious ${function:Restore-Previous}
Write-Output "Candidate $version authenticated. Verify the hosted device and complete the canaries before clearing the recovery window."
