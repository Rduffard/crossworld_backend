[CmdletBinding(SupportsShouldProcess, ConfirmImpact = "High")]
param()

$ErrorActionPreference = "Stop"
$taskName = "Crossworld Operations Relay Supervisor"
$launcher = Join-Path $PSScriptRoot "supervisor.mjs"
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")).Path
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "The supervisor launcher is missing."
}
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node -or [int]((& $node.Source --version).TrimStart("v").Split(".")[0]) -lt 22) {
    throw "Install Node.js 22 or later on the registered account's PATH."
}
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "A supervisor task with this name already exists. Inspect that task before making changes."
}
$arguments = '"{0}" --start-supervised' -f $launcher
$action = New-ScheduledTaskAction -Execute $node.Source -Argument $arguments -WorkingDirectory $workspace
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
if ($PSCmdlet.ShouldProcess("$taskName for $user", "Register at logon")) {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings
}
