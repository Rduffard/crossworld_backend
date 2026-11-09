param(
  [ValidatePattern('^(mongo:8\.0(?:\.\d+)?|mongo@sha256:[a-f0-9]{64})$')]
  [string]$Image = 'mongo:8.0'
)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$runId = [Guid]::NewGuid().ToString('N')
$containerName = 'sa-phase2-mongo-' + $runId
$databaseName = 'sa_phase2_' + $runId
$volumeNames = @(('sa-phase2-data-' + $runId), ('sa-phase2-config-' + $runId))
$ownerLabel = 'com.crossworld.phase2-run'
$previousUri = [Environment]::GetEnvironmentVariable('SA_PHASE2_TEST_MONGO_URI', 'Process')
$createdVolumes = @()
$containerMayExist = $false
$testExitCode = 1
$logPath = Join-Path $repoPath ('phase2-mongo-' + $runId + '.log')
$transcriptStarted = $false
function Invoke-DockerResult {
  param([string[]]$DockerArguments)
  # Windows PowerShell 5.1 turns native stderr into error records. Capture those
  # without aborting readiness retries or cleanup before checking the exit code.
  $ErrorActionPreference = 'Continue'
  $lines = @(& docker @DockerArguments 2>&1)
  return @{ Lines = $lines; ExitCode = $LASTEXITCODE }
}
function Invoke-DockerChecked {
  param([string[]]$DockerArguments)
  $result = Invoke-DockerResult $DockerArguments
  if ($result.ExitCode -ne 0) {
    $message = $result.Lines -join "`n"
    if ($message -match '(?i)permission denied|access is denied') {
      throw ('Docker access denied for this process. If this is a restricted ChatGPT command session, run this same script from a normal Windows PowerShell window outside ChatGPT. No administrator elevation or Docker security changes are required for that diagnostic. Original error: ' + $message)
    }
    throw ('Docker failed: ' + $message)
  }
  return $result.Lines
}
try {
  Start-Transcript -Path $logPath | Out-Null
  $transcriptStarted = $true
  Write-Host ('Saved test log: ' + $logPath)
  $osType = (Invoke-DockerChecked @('info', '--format', '{{.OSType}}') | Out-String).Trim()
  if ($osType -ne 'linux') { throw 'Start Docker Desktop with its Linux engine before running these tests.' }
  Write-Host ('Phase 2 isolated run: ' + $runId)
  foreach ($volumeName in $volumeNames) {
    Invoke-DockerChecked @('volume', 'create', '--label', ($ownerLabel + '=' + $runId), $volumeName) | Out-Null
    $createdVolumes += $volumeName
  }
  $containerMayExist = $true
  Write-Host ('Starting the isolated MongoDB container (downloading ' + $Image + ' if needed)...')
  Invoke-DockerChecked @('run', '--detach', '--pull=missing', '--name', $containerName,
    '--label', ($ownerLabel + '=' + $runId), '--publish', '127.0.0.1:37027:27017',
    '--mount', ('type=volume,source=' + $volumeNames[0] + ',target=/data/db'),
    '--mount', ('type=volume,source=' + $volumeNames[1] + ',target=/data/configdb'),
    $Image, '--replSet', 'phase2', '--bind_ip_all') | Out-Null
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $ping = Invoke-DockerResult @('exec', $containerName, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1}).ok')
    if ($ping.ExitCode -eq 0 -and ($ping.Lines -join '').Trim() -eq '1') { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) { throw 'The isolated MongoDB did not become ready.' }
  # Windows PowerShell 5.1 strips embedded double quotes when invoking Docker.
  # JavaScript single quotes survive the native argument boundary.
  Invoke-DockerChecked @('exec', $containerName, 'mongosh', '--quiet', '--eval',
    "rs.initiate({_id:'phase2',members:[{_id:0,host:'localhost:27017'}]})") | Out-Null
  $primary = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $hello = Invoke-DockerResult @('exec', $containerName, 'mongosh', '--quiet', '--eval', 'db.hello().isWritablePrimary')
    if ($hello.ExitCode -eq 0 -and ($hello.Lines -join '').Trim() -eq 'true') { $primary = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$primary) { throw 'The isolated replica set did not elect its primary.' }
  Write-Host 'Isolated MongoDB is ready. Running the full backend test suite...'
  $imageId = (Invoke-DockerChecked @('inspect', '--format', '{{.Image}}', $containerName) | Out-String).Trim()
  Write-Host ('MongoDB image ID: ' + $imageId)
  Invoke-DockerChecked @('image', 'inspect', '--format', '{{json .RepoDigests}}', $Image) | Write-Host
  $env:SA_PHASE2_TEST_MONGO_URI = 'mongodb://127.0.0.1:37027/' + $databaseName + '?replicaSet=phase2&directConnection=true'
  Push-Location -LiteralPath $repoPath
  try {
    & node --test --experimental-test-isolation=none tests/*.test.mjs
    $testExitCode = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  try {
  [Environment]::SetEnvironmentVariable('SA_PHASE2_TEST_MONGO_URI', $previousUri, 'Process')
  if ($containerMayExist) {
    $raw = Invoke-DockerResult @('inspect', $containerName)
    if ($raw.ExitCode -eq 0) {
      $record = @($raw.Lines | ConvertFrom-Json)[0]
      if ($record.Config.Labels.$ownerLabel -ne $runId -or $containerName -notmatch '^sa-phase2-mongo-[a-f0-9]{32}$') {
        throw 'Refusing cleanup: test container ownership label or name differs.'
      }
      Invoke-DockerChecked @('rm', '--force', '--', $containerName) | Out-Null
      Write-Host ('Removed test container: ' + $containerName)
    }
  }
  foreach ($volumeName in $createdVolumes) {
    $raw = Invoke-DockerResult @('volume', 'inspect', $volumeName)
    if ($raw.ExitCode -eq 0) {
      $record = @($raw.Lines | ConvertFrom-Json)[0]
      if ($record.Labels.$ownerLabel -ne $runId -or $volumeName -notmatch '^sa-phase2-(data|config)-[a-f0-9]{32}$') {
        throw 'Refusing cleanup: test volume ownership label or name differs.'
      }
      Invoke-DockerChecked @('volume', 'rm', '--', $volumeName) | Out-Null
      Write-Host ('Removed test volume: ' + $volumeName)
    }
  }
  } finally {
    if ($transcriptStarted) { Stop-Transcript | Out-Null }
  }
}
exit $testExitCode
