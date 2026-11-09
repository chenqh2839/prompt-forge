[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PortableExe,

    [Parameter(Mandatory = $true)]
    [string]$InstallerExe,

    [string]$WebView2Loader,

    [string]$Version = '0.10.4',

    [string]$BuildRoot = (Join-Path $PSScriptRoot '..\..\提示词优化\PromptForge-Build'),

    [string]$OutputDirectory
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

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$buildRoot = [System.IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath $buildRoot -PathType Container)) {
    throw "Build root does not exist: $buildRoot"
}
$buildRootItem = Get-Item -LiteralPath $buildRoot -Force
if ($buildRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "Build root must not be a symbolic link or junction: $buildRoot"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $buildRoot 'release-assets'
}

$portablePath = Resolve-RequiredFile -Path $PortableExe -Label 'Portable executable'
$installerPath = Resolve-RequiredFile -Path $InstallerExe -Label 'NSIS installer'
$loaderPath = if ($WebView2Loader) {
    Resolve-RequiredFile -Path $WebView2Loader -Label 'WebView2Loader.dll'
} else {
    $null
}

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$buildRootPrefix = "$buildRoot\"
if (
    -not $outputPath.StartsWith($buildRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
    throw "Output directory must remain inside the build root: $outputPath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$outputItem = Get-Item -LiteralPath $outputPath -Force
if ($outputItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "Output directory must not be a symbolic link or junction: $outputPath"
}

$packageName = "PromptForge-$Version-Windows-x64"
$stagingRoot = Join-Path $buildRoot "temp\package-$([guid]::NewGuid().ToString('N'))"
$stagingPackage = Join-Path $stagingRoot $packageName
$portableDirectory = Join-Path $stagingPackage '便携版'
$installerDirectory = Join-Path $stagingPackage '安装版'
$archivePath = Resolve-AvailableFilePath -Path (Join-Path $outputPath "$packageName.zip")
$archiveName = Split-Path -Leaf $archivePath
$checksumPath = Resolve-AvailableFilePath -Path (Join-Path $outputPath "SHA256SUMS-v$Version.txt")

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

    Compress-Archive -LiteralPath $stagingPackage -DestinationPath $archivePath -CompressionLevel Optimal

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $archiveSize = (Get-Item -LiteralPath $archivePath).Length
    Set-Content -LiteralPath $checksumPath -Value "$archiveHash  $archiveName" -Encoding ascii

    [pscustomobject]@{
        Archive = $archivePath
        Checksums = $checksumPath
        SizeBytes = $archiveSize
        SHA256 = $archiveHash
    }
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
        if ($resolvedStaging.StartsWith("$buildRoot\temp\", [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
        }
    }
}
