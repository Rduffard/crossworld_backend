$ErrorActionPreference = 'Stop'

function Invoke-RelayHandover {
    param(
        [scriptblock]$CheckReady, [scriptblock]$StopPrevious, [scriptblock]$StartCandidate,
        [scriptblock]$ConfirmCandidate, [scriptblock]$RestorePrevious, [scriptblock]$Record
    )

    & $CheckReady
    & $Record 'switching'
    try {
        & $StopPrevious
        & $StartCandidate
        & $ConfirmCandidate
    } catch {
        $candidateFailure = $_.Exception.Message
        & $Record 'restoring'
        try { & $RestorePrevious }
        catch { throw "Candidate failed ($candidateFailure). Automatic rollback needs attention: $($_.Exception.Message)" }
        & $Record 'rolled-back'
        throw "Candidate failed ($candidateFailure). The previous relay was restored."
    }
    & $Record 'active'
}

function Wait-RelayHeartbeat {
    param([string]$Log, [int]$After, [scriptblock]$Accept, [int]$Seconds = 170)

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Seconds)
    do {
        if (Test-Path -LiteralPath $Log -PathType Leaf) {
            foreach ($line in (Get-Content -LiteralPath $Log | Select-Object -Skip $After)) {
                try { $entry = ConvertFrom-Json -InputObject $line -ErrorAction Stop }
                catch { continue }
                if ($entry.state -eq 'healthy' -and (& $Accept $entry)) { return }
            }
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw 'The expected authenticated supervisor heartbeat did not arrive.'
}
