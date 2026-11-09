[CmdletBinding()]
param(
    [ValidateSet("check", "clippy", "test", "build")]
    [string]$Action = "check",

    [string]$XwinRoot = $env:PROMPT_FORGE_XWIN_ROOT,

    [string]$CargoHome = $env:PROMPT_FORGE_CARGO_HOME
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$sourceRoot = Join-Path $repoRoot "source"
$cargoRoot = Join-Path $sourceRoot "src-tauri"
if (-not $XwinRoot -or -not $CargoHome) {
    throw "Set PROMPT_FORGE_XWIN_ROOT and PROMPT_FORGE_CARGO_HOME before running this script."
}

if (-not (Test-Path -LiteralPath $XwinRoot -PathType Container)) {
    throw "xwin CRT/SDK directory is missing: $XwinRoot"
}
if (-not (Test-Path -LiteralPath $CargoHome -PathType Container)) {
    throw "Cargo home is missing: $CargoHome"
}

$clang = (Get-Command clang-cl.exe -ErrorAction Stop).Source
$clangBin = Split-Path -Parent $clang
$versionRoot = Get-ChildItem -LiteralPath (Join-Path $XwinRoot "VC\Tools\MSVC") -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1
$sdkVersion = Get-ChildItem -LiteralPath (Join-Path $XwinRoot "Windows Kits\10\Lib") -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1
if (-not $versionRoot -or -not $sdkVersion) {
    throw "Unable to locate MSVC CRT or Windows SDK in $XwinRoot"
}

$env:PATH = "$clangBin;$env:PATH"
$env:CC = $clang
$env:CXX = $clang
$env:AR = (Get-Command llvm-lib.exe -ErrorAction Stop).Source
$env:RC = (Get-Command llvm-rc.exe -ErrorAction Stop).Source
$env:RUSTFLAGS = "-C linker=lld-link -C link-arg=/ignore:4099"
$env:CARGO_NET_OFFLINE = "true"
$env:CARGO_HOME = $CargoHome
$sdkName = $sdkVersion.Name
$env:INCLUDE = @(
    (Join-Path $versionRoot.FullName "include"),
    (Join-Path $XwinRoot "Windows Kits\10\Include\$sdkName\ucrt"),
    (Join-Path $XwinRoot "Windows Kits\10\Include\$sdkName\shared"),
    (Join-Path $XwinRoot "Windows Kits\10\Include\$sdkName\um"),
    (Join-Path $XwinRoot "Windows Kits\10\Include\$sdkName\winrt")
) -join ";"
$env:LIB = @(
    (Join-Path $versionRoot.FullName "lib\x64"),
    (Join-Path $XwinRoot "Windows Kits\10\Lib\$sdkName\ucrt\x64"),
    (Join-Path $XwinRoot "Windows Kits\10\Lib\$sdkName\um\x64")
) -join ";"

switch ($Action) {
    "check" {
        Push-Location $cargoRoot
        try {
            cargo check --all-targets --locked
        }
        finally {
            Pop-Location
        }
    }
    "test" {
        Push-Location $cargoRoot
        try {
            cargo test --locked
        }
        finally {
            Pop-Location
        }
    }
    "clippy" {
        Push-Location $cargoRoot
        try {
            cargo clippy --all-targets --locked -- -D warnings
        }
        finally {
            Pop-Location
        }
    }
    "build" {
        Push-Location $sourceRoot
        try {
            pnpm desktop:build
        }
        finally {
            Pop-Location
        }
    }
}
