param(
    [Parameter(Mandatory = $false)]
    [string]$SourceAsset,

    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$version = "0.10.1"
$assetName = "PromptForge-$version-Windows-x64.zip"
$releaseDir = Join-Path $RepoRoot "release"
$assetDir = Join-Path $RepoRoot "release-assets"
$destination = Join-Path $assetDir $assetName

if (-not $SourceAsset) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $SourceAsset = Join-Path $desktop $assetName
}

if (-not (Test-Path -LiteralPath $SourceAsset -PathType Leaf)) {
    throw "Source asset not found: $SourceAsset"
}

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null

$sourceHash = (Get-FileHash -LiteralPath $SourceAsset -Algorithm SHA256).Hash.ToLowerInvariant()
if (Test-Path -LiteralPath $destination) {
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($destinationHash -ne $sourceHash) {
        throw "Existing staged asset differs from source; refusing to overwrite: $destination"
    }
} else {
    Copy-Item -LiteralPath $SourceAsset -Destination $destination
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
}

if ($sourceHash -ne $destinationHash) {
    throw "Staged asset hash mismatch"
}

$checksumFile = Join-Path $releaseDir "SHA256SUMS.txt"
"$destinationHash  $assetName" |
    Set-Content -LiteralPath $checksumFile -Encoding ascii

[pscustomobject]@{
    Asset = $destination
    SizeBytes = (Get-Item -LiteralPath $destination).Length
    SHA256 = $destinationHash
    Checksums = $checksumFile
} | Format-List
