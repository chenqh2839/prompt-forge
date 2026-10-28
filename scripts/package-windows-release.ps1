[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PortableExe,

    [Parameter(Mandatory = $true)]
    [string]$InstallerExe,

    [string]$WebView2Loader,

    [string]$Version = '0.10.3',

    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release-assets')
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredFile {
    param([string]$Path, [string]$Label)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "$Label is not a file: $resolved"
    }
    return $resolved
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$portablePath = Resolve-RequiredFile -Path $PortableExe -Label 'Portable executable'
$installerPath = Resolve-RequiredFile -Path $InstallerExe -Label 'NSIS installer'
$loaderPath = if ($WebView2Loader) {
    Resolve-RequiredFile -Path $WebView2Loader -Label 'WebView2Loader.dll'
} else {
    $null
}

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output directory must remain inside the repository: $outputPath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$packageName = "PromptForge-$Version-Windows-x64"
$stagingRoot = Join-Path $outputPath ".staging-$([guid]::NewGuid().ToString('N'))"
$stagingPackage = Join-Path $stagingRoot $packageName
$portableDirectory = Join-Path $stagingPackage '便携版'
$installerDirectory = Join-Path $stagingPackage '安装版'
$archivePath = Join-Path $outputPath "$packageName.zip"

try {
    New-Item -ItemType Directory -Path $portableDirectory, $installerDirectory -Force | Out-Null
    Copy-Item -LiteralPath $portablePath -Destination (Join-Path $portableDirectory 'Prompt Forge.exe')
    if ($loaderPath) {
        Copy-Item -LiteralPath $loaderPath -Destination (Join-Path $portableDirectory 'WebView2Loader.dll')
    }
    Copy-Item -LiteralPath $installerPath -Destination (Join-Path $installerDirectory "Prompt Forge_${Version}_x64-setup.exe")
    Copy-Item -LiteralPath (Join-Path $repoRoot 'source\docs\INSTALL.txt') -Destination (Join-Path $stagingPackage 'INSTALL.txt')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $stagingPackage 'LICENSE')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'NOTICE') -Destination (Join-Path $stagingPackage 'NOTICE')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'THIRD-PARTY-NOTICES.md') -Destination (Join-Path $stagingPackage 'THIRD-PARTY-NOTICES.md')

    $packageFiles = Get-ChildItem -LiteralPath $stagingPackage -Recurse -File |
        Sort-Object FullName
    $checksumLines = foreach ($file in $packageFiles) {
        $relative = [System.IO.Path]::GetRelativePath($stagingPackage, $file.FullName).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $relative"
    }
    Set-Content -LiteralPath (Join-Path $stagingPackage 'SHA256SUMS.txt') -Value $checksumLines -Encoding utf8NoBOM

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -LiteralPath $stagingPackage -DestinationPath $archivePath -CompressionLevel Optimal

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $archiveSize = (Get-Item -LiteralPath $archivePath).Length
    Set-Content -LiteralPath (Join-Path $outputPath "SHA256SUMS-v$Version.txt") `
        -Value "$archiveHash  $packageName.zip" -Encoding ascii

    [pscustomobject]@{
        Archive = $archivePath
        SizeBytes = $archiveSize
        SHA256 = $archiveHash
    }
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
        if ($resolvedStaging.StartsWith($outputPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
        }
    }
}
