param(
    [Parameter(Mandatory = $false)]
    [string]$SourceAsset,

    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $false)]
    [string]$BuildRoot
)

$ErrorActionPreference = "Stop"
if (-not $BuildRoot) {
    $BuildRoot = Join-Path (Split-Path -Parent $RepoRoot) "提示词优化\PromptForge-Build"
}
$version = "0.10.4"
$assetName = "PromptForge-$version-Windows-x64.zip"
$releaseDir = Join-Path $RepoRoot "release"
$assetDir = Join-Path $BuildRoot "release-assets"
$destination = Join-Path $assetDir $assetName

function Resolve-AvailableFilePath {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $Path
    }

    $directory = Split-Path -Parent $Path
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($Path)
    $extension = [System.IO.Path]::GetExtension($Path)
    for ($suffix = 2; $suffix -lt 10000; $suffix++) {
        $candidate = Join-Path $directory "$baseName-$suffix$extension"
        if (-not (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    throw "Unable to find an available output name for: $Path"
}

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
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($assetName)
        for ($suffix = 2; $suffix -lt 10000; $suffix++) {
            $candidate = Join-Path $assetDir "$stem-$suffix.zip"
            if (-not (Test-Path -LiteralPath $candidate)) {
                $destination = $candidate
                $assetName = Split-Path -Leaf $candidate
                Copy-Item -LiteralPath $SourceAsset -Destination $destination
                break
            }
        }
        if (-not (Test-Path -LiteralPath $destination)) {
            throw "Unable to find an available staged asset name"
        }
    }
} else {
    Copy-Item -LiteralPath $SourceAsset -Destination $destination
}

$destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $destinationHash) {
    throw "Staged asset hash mismatch"
}

$checksumFile = Resolve-AvailableFilePath -Path (Join-Path $assetDir "SHA256SUMS-$version.txt")
"$destinationHash  $assetName" |
    Set-Content -LiteralPath $checksumFile -Encoding ascii

[pscustomobject]@{
    Asset = $destination
    SizeBytes = (Get-Item -LiteralPath $destination).Length
    SHA256 = $destinationHash
    Checksums = $checksumFile
} | Format-List
