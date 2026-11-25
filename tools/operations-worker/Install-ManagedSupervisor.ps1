[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ActiveBundle,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha,
    [switch]$Apply
)

. (Join-Path $PSScriptRoot 'Handover-Core.ps1')
$ErrorActionPreference = 'Stop'
$original = 'Crossworld Operations Fleetmaster Supervisor'
$managed = 'Crossworld Operations Release-Managed Supervisor'
$operationsRoot = Join-Path $env:LOCALAPPDATA 'Crossworld Operations'
$releaseHome = Join-Path $operationsRoot 'Managed Releases'
$target = Join-Path $releaseHome $ManifestSha
$state = Join-Path $releaseHome 'state.json'
$marker = Join-Path $releaseHome 'supervisor-ready.json'
$history = Join-Path $releaseHome 'bootstrap.txt'
$environment = Join-Path $operationsRoot 'Fleetmaster Handover\candidate.env'
$controller = Join-Path $PSScriptRoot 'managed-supervisor.mjs'
$manifest = Join-Path $ActiveBundle 'runtime-manifest.json'
$worker = Join-Path $ActiveBundle 'tools\operations-worker\worker.mjs'
$node = (Get-Command node.exe).Source
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$originalTask = Get-ScheduledTask -TaskName $original

if ($originalTask.State -ne 'Running' -or ($originalTask.Principal.UserId -split '\\')[-1] -ne ($user -split '\\')[-1]) {
    throw 'The current attended Fleetmaster supervisor must be running under this Windows account.'
}
if (!(Test-Path -LiteralPath $environment -PathType Leaf)) { throw 'The current worker launch environment is missing.' }
if ((Get-FileHash -LiteralPath $manifest).Hash -ne $ManifestSha) { throw 'The seed bundle is not the reviewed release.' }
$files = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
foreach ($entry in $files) {
  if ($entry.file -notmatch '^(tools/operations-worker/[\w .-]+\.(mjs|md|cmd|ps1)|src/modules/operations/(assignment-scopes|diagnostics|media-artifacts|prompt-limits|usage)\.js)$' -or
        (Get-FileHash -LiteralPath (Join-Path $ActiveBundle $entry.file)).Hash -ne $entry.sha256) {
        throw 'The seed runtime does not match its reviewed manifest.'
    }
}

if (!(Test-Path -LiteralPath $state)) {
    New-Item -ItemType Directory -Path $releaseHome -Force | Out-Null
    New-Item -ItemType Directory -Path $target | Out-Null
    foreach ($entry in $files) {
        $file = Join-Path $target $entry.file
        New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $ActiveBundle $entry.file) -Destination $file
    }
    Copy-Item -LiteralPath $manifest -Destination (Join-Path $target 'runtime-manifest.json')
    [IO.File]::WriteAllText($state, (@{ active=$ManifestSha; previous=$null } | ConvertTo-Json -Compress))
} elseif ((Get-Content -LiteralPath $state -Raw | ConvertFrom-Json).active -ne $ManifestSha) {
    throw 'The managed installation already has a different release pointer.'
}
Write-Output "Managed seed staged at $target."
if (!$Apply) { return }

function Confirm-Hold {
    & $node ('--env-file=' + $environment) $worker '--check-handover'
    if ($LASTEXITCODE -ne 0) { throw 'Hosted maintenance is not ready for handover.' }
}
function Wait-Stop($task) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(35)
    while ((Get-ScheduledTask -TaskName $task).State -eq 'Running') {
        if ([DateTimeOffset]::UtcNow -gt $deadline) { throw "Task $task did not stop." }
        Start-Sleep -Milliseconds 300
    }
}
Confirm-Hold
if (Get-ScheduledTask -TaskName $managed -ErrorAction SilentlyContinue) { throw 'Inspect the existing managed supervisor task before retrying.' }
$taskAction = @{
    Execute = $node
    WorkingDirectory = @($originalTask.Actions)[0].WorkingDirectory
    Argument = '--env-file="{0}" "{1}" --managed-releases "{2}"' -f $environment,$controller,$releaseHome
}
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Disable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))
Register-ScheduledTask -TaskName $managed -Action (New-ScheduledTaskAction @taskAction) -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) | Out-Null
$after = [DateTimeOffset]::UtcNow
$priorLog = Join-Path $operationsRoot 'Fleetmaster Handover\candidate.jsonl'
$priorOffset = @(Get-Content -LiteralPath $priorLog).Count
$handover = @{
    CheckReady = ${function:Confirm-Hold}
    Record = { param($phase) [IO.File]::WriteAllText($history,$phase) }
    StopPrevious = { Stop-ScheduledTask -TaskName $original; Wait-Stop $original; Disable-ScheduledTask -TaskName $original | Out-Null }
    StartCandidate = { Enable-ScheduledTask -TaskName $managed | Out-Null; Start-ScheduledTask -TaskName $managed }
    ConfirmCandidate = {
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(150)
        do {
            if (Test-Path -LiteralPath $marker) {
                try {
                    $value = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
                    if ($value.active -eq $ManifestSha -and [DateTimeOffset]::Parse($value.observedAt) -gt $after) { return }
                } catch {}
            }
            Start-Sleep -Milliseconds 500
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        throw 'The independent managed supervisor did not confirm hosted enrollment.'
    }
    RestorePrevious = {
        Stop-ScheduledTask -TaskName $managed
        Wait-Stop $managed
        Disable-ScheduledTask -TaskName $managed | Out-Null
        if ((Get-ScheduledTask -TaskName $original).State -ne 'Running') {
            Enable-ScheduledTask -TaskName $original | Out-Null
            Start-ScheduledTask -TaskName $original
            Wait-RelayHeartbeat -Log $priorLog -After $priorOffset -Accept { param($entry) $entry.profiles -contains 'read-only' }
        }
    }
}
Invoke-RelayHandover @handover
Write-Output 'The independent managed control plane has connected. Verify its release inventory before clearing the hold.'
