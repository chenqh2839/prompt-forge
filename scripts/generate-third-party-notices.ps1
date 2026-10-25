param(
    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $false)]
    [string]$CargoAboutPath
)

$ErrorActionPreference = "Stop"
$sourceRoot = Join-Path $RepoRoot "source"
$cargoRoot = Join-Path $sourceRoot "src-tauri"
$logsRoot = Join-Path $RepoRoot "logs"
$outputPath = Join-Path $RepoRoot "THIRD-PARTY-NOTICES.md"
$npmJson = Join-Path $logsRoot "npm-licenses.json"
$rustNotices = Join-Path $logsRoot "rust-notices-generated.md"

New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null

function Normalize-LicenseText([string]$Text) {
    $normalized = (($Text -replace "`r`n", "`n") -split "`n" |
        ForEach-Object { $_.TrimEnd() }) -join "`n"
    return $normalized.Trim()
}

if (-not $CargoAboutPath) {
    $cargoAboutCommand = Get-Command cargo-about -ErrorAction SilentlyContinue
    if ($cargoAboutCommand) {
        $CargoAboutPath = $cargoAboutCommand.Source
    } else {
        $bundled = Join-Path $RepoRoot "logs\tools\cargo-about\cargo-about-0.9.2-x86_64-pc-windows-msvc\cargo-about.exe"
        if (Test-Path -LiteralPath $bundled) {
            $CargoAboutPath = $bundled
        }
    }
}

if (-not $CargoAboutPath -or -not (Test-Path -LiteralPath $CargoAboutPath)) {
    throw "cargo-about was not found. Set -CargoAboutPath to the executable."
}

Push-Location $sourceRoot
try {
    pnpm licenses list --prod --json |
        Out-File -LiteralPath $npmJson -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm licenses list failed"
    }
} finally {
    Pop-Location
}

Push-Location $cargoRoot
try {
    & $CargoAboutPath generate about.hbs --locked --fail -o $rustNotices
    if ($LASTEXITCODE -ne 0) {
        throw "cargo-about failed"
    }

    $cargoMetadata = cargo metadata --format-version 1 --locked | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw "cargo metadata failed"
    }
} finally {
    Pop-Location
}

$rustPackages = $cargoMetadata.packages |
    Where-Object { $_.name -ne "prompt-forge" } |
    Sort-Object name, version

$npmData = Get-Content -LiteralPath $npmJson -Raw | ConvertFrom-Json -AsHashtable
$npmPackages = @{}

foreach ($license in ($npmData.Keys | Sort-Object)) {
    foreach ($package in $npmData[$license]) {
        foreach ($version in $package.versions) {
            $key = "$($package.name)@$version"
            $path = @($package.paths)[0]
            $licenseFiles = Get-ChildItem -LiteralPath $path -File |
                Where-Object { $_.Name -match '^(LICEN[CS]E|COPYING|NOTICE)' } |
                Sort-Object Name

            $texts = foreach ($file in $licenseFiles) {
                $text = Get-Content -LiteralPath $file.FullName -Raw
                @{
                    Name = $file.Name
                    Text = Normalize-LicenseText $text
                }
            }

            if (@($texts).Count -eq 0) {
                $readme = Get-ChildItem -LiteralPath $path -File |
                    Where-Object { $_.Name -match '^README' } |
                    Select-Object -First 1
                if ($readme) {
                    $readmeText = Get-Content -LiteralPath $readme.FullName -Raw
                    $licenseMatch = [regex]::Match(
                        $readmeText,
                        '(?ms)^#{1,6}\s+License\s*\r?\n(?<text>.+)$'
                    )
                    if ($licenseMatch.Success) {
                        $texts = @([pscustomobject]@{
                            Name = "$($readme.Name) - License section"
                            Text = Normalize-LicenseText $licenseMatch.Groups['text'].Value
                        })
                    }
                }
            }

            if ($package.name -eq '@napi-rs/canvas-win32-x64-msvc') {
                $mainPackage = $npmData['MIT'] | Where-Object name -eq '@napi-rs/canvas'
                if ($mainPackage) {
                    $mainLicense = Join-Path @($mainPackage.paths)[0] 'LICENSE'
                    if (Test-Path -LiteralPath $mainLicense) {
                        $texts = @([pscustomobject]@{
                            Name = '@napi-rs/canvas/LICENSE'
                            Text = Normalize-LicenseText (Get-Content -LiteralPath $mainLicense -Raw)
                        })
                    }
                }
            }

            $npmPackages[$key] = [pscustomobject]@{
                Name = $package.name
                Version = $version
                License = $license
                Homepage = $package.homepage
                Texts = @($texts)
            }
        }
    }
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Third-Party Notices")
$lines.Add("")
$lines.Add("Prompt Forge is licensed under the Apache License 2.0. This file")
$lines.Add("records third-party components included by the application and its")
$lines.Add("complete locked dependency graph.")
$lines.Add("")
$lines.Add("> Generated from the repository lockfiles. Third-party components remain")
$lines.Add("> subject to their own licenses. This file is not legal advice.")
$lines.Add("")
$lines.Add("## Frontend production dependencies")
$lines.Add("")
$lines.Add("The following packages are included in the production dependency graph.")
$lines.Add("`lucide-react` is the source of the interface icon set and is licensed")
$lines.Add("under the ISC License.")
$lines.Add("")
$lines.Add("| Package | Version | License |")
$lines.Add("|---|---|---|")

foreach ($package in ($npmPackages.Values | Sort-Object Name, Version)) {
    $licenseLabel = $package.License.Replace("|", "\|")
    $lines.Add("| ``$($package.Name)`` | ``$($package.Version)`` | $licenseLabel |")
}

$lines.Add("")
$lines.Add("### Frontend license texts")

foreach ($package in ($npmPackages.Values | Sort-Object Name, Version)) {
    $lines.Add("")
    $lines.Add("#### $($package.Name) $($package.Version)")
    $lines.Add("")
    $lines.Add("- License: $($package.License)")
    if ($package.Homepage) {
        $lines.Add("- Project: $($package.Homepage)")
    }

    if ($package.Texts.Count -eq 0) {
        $lines.Add("")
        $lines.Add("The package does not include a standalone license file. Its package")
        $lines.Add("metadata declares the license above; refer to the upstream project for")
        $lines.Add("the authoritative license text and copyright notice.")
        continue
    }

    foreach ($licenseText in $package.Texts) {
        $lines.Add("")
        $lines.Add("License file: ``$($licenseText.Name)``")
        $lines.Add("")
        $lines.Add("``````text")
        $lines.Add($licenseText.Text)
        $lines.Add("``````")
    }
}

$lines.Add("")
$lines.Add("---")
$lines.Add("")
$lines.Add("## Rust dependency inventory")
$lines.Add("")
$lines.Add("The inventory below is generated from `Cargo.lock` and `cargo metadata`.")
$lines.Add("It includes target-specific transitive packages that may not be linked")
$lines.Add("into every desktop build.")
$lines.Add("")
$lines.Add("| Package | Version | Declared license expression | Repository |")
$lines.Add("|---|---|---|---|")

foreach ($package in $rustPackages) {
    $name = $package.name.Replace("|", "\|")
    $version = $package.version.Replace("|", "\|")
    $license = if ($package.license) { $package.license.Replace("|", "\|") } else { "UNKNOWN" }
    $repository = if ($package.repository) { $package.repository.Replace("|", "\|") } else { "" }
    $lines.Add("| ``$name`` | ``$version`` | $license | $repository |")
}

$rustText = Normalize-LicenseText (Get-Content -LiteralPath $rustNotices -Raw)
$rustText = $rustText -replace '(?m)^- `prompt-forge\s+0\.10\.1`.*\r?\n?', ''
$lines.Add("")
$lines.Add($rustText)

Set-Content -LiteralPath $outputPath -Value $lines -Encoding utf8

[pscustomobject]@{
    Output = $outputPath
    NpmPackages = $npmPackages.Count
    RustPackages = $rustPackages.Count
    OutputBytes = (Get-Item -LiteralPath $outputPath).Length
    RustNoticesBytes = (Get-Item -LiteralPath $rustNotices).Length
} | Format-List
