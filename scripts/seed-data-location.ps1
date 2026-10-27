param(
    [Parameter(Mandatory = $true)]
    [string]$DataRoot
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath($DataRoot.Trim())
if (-not [IO.Path]::IsPathRooted($root)) {
    throw "DataRoot must be an absolute path."
}
if ([IO.Path]::GetPathRoot($root).TrimEnd('\') -eq $root.TrimEnd('\')) {
    throw "DataRoot cannot be a drive root."
}

$configDir = Join-Path $env:APPDATA "com.promptforge.desktop"
$configPath = Join-Path $configDir "storage-location.json"
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$config = $null
if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} else {
    $config = [pscustomobject]@{
        schemaVersion = 1
        activeRoot = $null
        pendingChange = $null
        lastError = $null
        updatedAt = $now
    }
}

$config.schemaVersion = 1
$config.pendingChange = [pscustomobject]@{
    targetRoot = $root
    mode = "migrate"
    requestedAt = $now
}
$config.lastError = $null
$config.updatedAt = $now

$tempPath = "$configPath.tmp-$([Guid]::NewGuid().ToString('N'))"
$json = $config | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($tempPath, $json, [Text.UTF8Encoding]::new($false))
if (Test-Path -LiteralPath $configPath) {
    [IO.File]::WriteAllBytes(
        "$configPath.bak",
        [IO.File]::ReadAllBytes($configPath)
    )
}
[IO.File]::Move($tempPath, $configPath, $true)

Write-Output "CONFIG_PATH=$configPath"
Write-Output "PENDING_TARGET=$root"
Write-Output "PENDING_MODE=migrate"
