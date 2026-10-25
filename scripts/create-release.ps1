param(
    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $false)]
    [string]$Tag = "v0.10.1",

    [Parameter(Mandatory = $false)]
    [string]$Title = "Prompt Forge v0.10.1 - Windows x64"
)

$ErrorActionPreference = "Stop"
$assetName = "PromptForge-0.10.1-Windows-x64.zip"
$asset = Join-Path $RepoRoot "release-assets\$assetName"
$checksums = Join-Path $RepoRoot "release\SHA256SUMS.txt"
$notes = Join-Path $RepoRoot "release\RELEASE_NOTES.md"
$gh = "C:\Program Files\GitHub CLI\gh.exe"

foreach ($path in @($asset, $checksums, $notes)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required release file missing: $path"
    }
}

if (-not (Test-Path -LiteralPath $gh -PathType Leaf)) {
    throw "GitHub CLI not found: $gh"
}

if ((git -C $RepoRoot status --porcelain)) {
    throw "Git working tree is not clean"
}

$head = (git -C $RepoRoot rev-parse HEAD).Trim()
$tagCommit = (git -C $RepoRoot rev-parse "$Tag^{commit}").Trim()
if ($head -ne $tagCommit) {
    throw "HEAD does not match $Tag"
}

$remoteTag = (git -C $RepoRoot ls-remote --tags origin "refs/tags/$Tag").Trim()
if (-not $remoteTag) {
    throw "Tag $Tag has not been pushed to origin"
}

& $gh release view $Tag --repo chenqh2839/prompt-forge *> $null
if ($LASTEXITCODE -eq 0) {
    throw "Release $Tag already exists; refusing to overwrite"
}

& $gh release create $Tag $asset $checksums `
    --repo chenqh2839/prompt-forge `
    --title $Title `
    --notes-file $notes `
    --verify-tag `
    --latest

if ($LASTEXITCODE -ne 0) {
    throw "gh release create failed with exit code $LASTEXITCODE"
}
