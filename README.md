# Prompt Forge

Prompt Forge is a local-first desktop application for refining prompts through
structured clarification. It is built with Tauri 2, React, TypeScript, Rust,
and local SQLite.

> Current source snapshot: **v0.10.1**
>
> Distribution status: **Windows community preview**. macOS and Linux are not
> yet verified on real hardware and do not have an official release binary.

## Repository layout

- `source/` - application source, tests, icons, configuration, and product docs.
- `release/` - release notes, asset manifest, and checksums.
- `scripts/` - release and compliance helper scripts.

The application README is available at
[`source/README.md`](source/README.md).

## Features

- Iterative prompt clarification with explainable questions.
- Prompt refinement, regeneration, and revision workflows.
- Project context, selected history summaries, and context-budget handling.
- Project interactions can be converted into reusable prompt templates.
- Reusable variable prompt templates with ordered sections.
- OpenAI-compatible `/chat/completions` integration.
- Provider presets for OpenAI, DeepSeek, a Claude-compatible gateway, and local
  Ollama.
- Local SQLite history with JSON export.
- TXT, Markdown, PDF, DOCX, and image attachments with explicit size limits.
- API keys stored in the operating system credential vault rather than SQLite.

## Platform support

| Platform | Status |
|---|---|
| Windows 10/11 x64 | Install, launch, and uninstall smoke tests completed |
| macOS | Source compatibility and CI build coverage only; not run on real hardware |
| Linux | Source compatibility and CI build coverage only; not run on real hardware |

Cross-platform compilation does not mean that installation, startup, keyring
access, database migration, or uninstall behavior has been validated.

## Installation

Download the latest Windows archive from
[GitHub Releases](https://github.com/chenqh2839/prompt-forge/releases).

1. Extract `PromptForge-0.10.1-Windows-x64.zip`.
2. To install, run `安装版\Prompt Forge_0.10.1_x64-setup.exe`.
3. To use the portable build, keep `Prompt Forge.exe` and
   `WebView2Loader.dll` in the same directory.

Microsoft Edge WebView2 Runtime is required.

The current installer is not Authenticode-signed. Windows SmartScreen may show
an "Unknown publisher" warning. Verify the release archive with the attached
`SHA256SUMS.txt`; SHA-256 verification confirms file integrity, not publisher
identity.

## Build from source

Requirements:

- Node.js 24 or newer
- pnpm 10 or newer
- Rust stable
- Tauri 2 system dependencies for the target platform
- Microsoft C++ Build Tools and the Windows SDK when building on Windows

```powershell
cd source
pnpm install --frozen-lockfile
pnpm build
pnpm desktop:build
```

See [`source/docs/DEVELOPMENT.md`](source/docs/DEVELOPMENT.md) for platform
packages, commands, and packaging details.

## Model configuration

Open the application settings, choose a provider preset, enter an
OpenAI-compatible Base URL and model ID, then save an API key.

The application does not include API keys or model credits. Token usage and
provider charges are billed by the service selected by the user. A real cloud
provider call has not yet been validated with the owner's API key.

## Privacy and local data

The application is local-first but not offline-only. When a model operation is
requested, the configured prompt, project context, and attachment content are
sent to the model endpoint selected by the user.

- Windows Credential Manager, macOS Keychain, or Linux Secret Service stores
  API keys.
- SQLite data is stored at
  `%APPDATA%\com.promptforge.desktop\prompt-forge.sqlite3` on Windows.
- WebView theme and local configuration are stored under
  `%LOCALAPPDATA%\com.promptforge.desktop`.
- Uninstalling the application does not automatically remove SQLite data,
  WebView settings, or saved credentials.
- History exports can contain prompts, project context, and attachments. Treat
  exported files as potentially sensitive.

The source does not include the owner's local database or exported credentials.

## Security

Please report vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).
Do not place API keys, access tokens, private prompts, or personal database
contents in a public issue.

## Third-party names and intellectual property

Prompt Forge is an independent project. It is not affiliated with, endorsed by,
or sponsored by OpenAI, DeepSeek, Anthropic, Claude, Ollama, or their
affiliates. Product names and trademarks belong to their respective owners.

Provider names are used only to describe compatibility with
OpenAI-compatible chat-completions endpoints. No provider logo is bundled.

Users are responsible for checking licenses, trademark rights, likeness rights,
copyright, and platform policies for prompts, templates, names, images, and
other material they enter or distribute. See [`TRADEMARKS.md`](TRADEMARKS.md).

The provenance status of project icons and built-in template text is recorded in
[`ASSET_PROVENANCE.md`](ASSET_PROVENANCE.md). The repository should not claim
those assets are third-party-free until the owner has completed that review.

## License

Project code and authored documentation are licensed under the
[Apache License 2.0](LICENSE), unless a file states otherwise.

Prompt Forge uses third-party software, including the Lucide icon library under
the ISC License. Complete dependency and license information is provided in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Apache-2.0 does not grant permission to use the Prompt Forge name, logo, or
other trademarks as a project identity. Third-party assets remain subject to
their own licenses and provenance requirements.
