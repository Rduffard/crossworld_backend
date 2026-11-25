$ErrorActionPreference = 'Stop'

function Assert-SupervisorRuntime {
    param([Parameter(Mandatory)][string]$Directory, [Parameter(Mandatory)][string]$ManifestSha)
    if ($ManifestSha -cnotmatch '^[a-f0-9]{64}$') { throw 'Use the lowercase reviewed supervisor manifest digest.' }
    $root = Get-Item -LiteralPath $Directory
    if (!$root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The supervisor runtime directory is redirected or invalid.'
    }
    $manifest = Join-Path $root.FullName 'supervisor-manifest.json'
    $manifestItem = Get-Item -LiteralPath $manifest
    if ($manifestItem.PSIsContainer -or ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $manifestItem.Length -gt 65536) {
        throw 'Invalid supervisor manifest.'
    }
    if ((Get-FileHash -LiteralPath $manifest).Hash -ne $ManifestSha) { throw 'Supervisor manifest does not match its reviewed digest.' }
    $value = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    if ($value.commit -cnotmatch '^[a-f0-9]{40}$' -or !$value.files.Count -or $value.files.Count -gt 20) {
        throw 'Invalid supervisor manifest identity.'
    }
    foreach ($entry in $value.files) {
        if ($entry.file -cnotmatch '^(tools/operations-worker/(managed-supervisor|worker|windows|codex|control|media-storage|profiles|resources)\.mjs|src/modules/operations/(assignment-scopes|managed-release-format|diagnostics|media-artifacts|prompt-limits|usage)\.js)$' -or
            $entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or !$names.Add($entry.file)) {
            throw 'Unexpected or duplicate file in the supervisor manifest.'
        }
        $item = Get-Item -LiteralPath (Join-Path $root.FullName $entry.file)
        $parent = $item.Directory
        while ($parent -and $parent.FullName -ne $root.FullName) {
            if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected supervisor runtime path.' }
            $parent = $parent.Parent
        }
        if (!$parent -or $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $item.Length -gt 1048576 -or (Get-FileHash -LiteralPath $item.FullName).Hash -ne $entry.sha256) {
            throw 'Supervisor runtime file differs from the reviewed manifest.'
        }
    }
    $required = @('managed-supervisor','worker','windows','codex','control','media-storage','profiles','resources') |
        ForEach-Object { "tools/operations-worker/$_.mjs" }
    $required += @('diagnostics','media-artifacts','prompt-limits','usage') |
        ForEach-Object { "src/modules/operations/$_.js" }
    if (@($required | Where-Object { !$names.Contains($_) }).Count) { throw 'Supervisor runtime is incomplete.' }
    $directories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in $names) {
        $parent = $name
        while ($parent.Contains('/')) {
            $parent = $parent.Substring(0, $parent.LastIndexOf('/'))
            $null = $directories.Add($parent)
        }
    }
    $null = $names.Add('supervisor-manifest.json')
    $pending = [Collections.Generic.Queue[string]]::new()
    $pending.Enqueue($root.FullName)
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath ($pending.Dequeue()) -Force) {
            $relative = $item.FullName.Substring($root.FullName.Length + 1).Replace('\','/')
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected supervisor runtime path.' }
            if ($item.PSIsContainer) {
                if (!$directories.Contains($relative)) { throw 'Unexpected supervisor runtime directory.' }
                $pending.Enqueue($item.FullName)
            } elseif (!$names.Contains($relative)) { throw 'Unexpected supervisor runtime file.' }
        }
    }
    $value
}

function Install-SupervisorRuntime {
    param([string]$Candidate, [string]$ManifestSha, [string]$OperationsRoot)
    $value = Assert-SupervisorRuntime -Directory $Candidate -ManifestSha $ManifestSha
    $base = Join-Path $OperationsRoot 'Supervisor Runtime'
    $target = Join-Path $base $ManifestSha
    if (!(Test-Path -LiteralPath $base)) { New-Item -ItemType Directory -Path $base | Out-Null }
    if ((Get-Item -LiteralPath $base).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Supervisor runtime store is redirected.' }
    if (!(Test-Path -LiteralPath $target)) {
        $stage = Join-Path $base ('.stage-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        foreach ($entry in $value.files) {
            $file = Join-Path $stage $entry.file
            New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $Candidate $entry.file) -Destination $file
        }
        Copy-Item -LiteralPath (Join-Path $Candidate 'supervisor-manifest.json') -Destination $stage
        $null = Assert-SupervisorRuntime -Directory $stage -ManifestSha $ManifestSha
        try { [IO.Directory]::Move($stage, $target) }
        catch [IO.IOException] { if (!(Test-Path -LiteralPath $target)) { throw } }
    }
    $null = Assert-SupervisorRuntime -Directory $target -ManifestSha $ManifestSha
    $target
}
