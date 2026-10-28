# Prompt Forge

Prompt Forge is a local-first desktop application for refining prompts through
structured clarification. It is built with Tauri 2, React, TypeScript, Rust,
and local SQLite.

> Current source snapshot: **v0.10.3**
>
> Distribution status: **Windows community preview**. The latest published
> Windows binary is **v0.10.2**. macOS and Linux are not yet verified on real
> hardware and do not have an official release binary.

## Repository layout

- `source/` - application source, tests, icons, configuration, and product docs.
- `release/` - release notes, asset manifest, and checksums.
- `scripts/` - release and compliance helper scripts.

The application README is available at
[`source/README.md`](source/README.md).

## Features

- Iterative prompt clarification with explainable questions.
- Reuse of matching project roles and technical context without repeating a
  standalone role declaration; this can be disabled in Settings.
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
| Windows 11 x64 | v0.10.2 install, upgrade, launch, data migration, SQLite, and UI checks completed on local hardware |
| Windows 10 x64 | Earlier install and launch smoke tests only; v0.10.2 was not separately retested |
| macOS | Source compatibility only; not covered by the current release CI or run on real hardware |
| Linux | Source compatibility only; not covered by the current release CI or run on real hardware |

Cross-platform compilation does not mean that installation, startup, keyring
access, database migration, or uninstall behavior has been validated.

## Installation

Download the latest published Windows archive from
[GitHub Releases](https://github.com/chenqh2839/prompt-forge/releases).

1. Extract the Windows ZIP attached to the latest available Release.
2. To install, run the versioned NSIS setup executable in `安装版`.
3. To use the portable build, run `Prompt Forge.exe`. The v0.10.2 build uses a
   static WebView2 loader and does not require a separate `WebView2Loader.dll`.

Microsoft Edge WebView2 Runtime is required.

The current installer is not Authenticode-signed. Windows SmartScreen may show
an "Unknown publisher" warning. Verify the release ZIP with
`SHA256SUMS-v0.10.2.txt`; the extracted archive also contains its own
`SHA256SUMS.txt` for individual files. SHA-256 verification confirms file
integrity, not publisher identity.

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

Remote endpoints must use HTTPS. Plain HTTP is accepted only for loopback
services on `localhost`, `127.0.0.1`, or `::1`, so API keys are not sent over
an unencrypted network connection.

The application does not include API keys or model credits. Token usage and
provider charges are billed by the service selected by the user. A real cloud
provider call has not yet been validated with the owner's API key.

## Privacy and local data

The application is local-first but not offline-only. When a model operation is
requested, the configured prompt, project context, and attachment content are
sent to the model endpoint selected by the user.

- Windows Credential Manager, macOS Keychain, or Linux Secret Service stores
  API keys.
- SQLite data is stored at `<data-root>\data\prompt-forge.sqlite3`.
- WebView theme and local configuration are stored at `<data-root>\webview`.
- The migration configuration is kept separately in the operating system's
  application configuration directory as `storage-location.json`.
- Uninstalling the application does not automatically remove SQLite data,
  WebView settings, or saved credentials.
- History exports can contain prompts, project context, and attachments. Treat
  exported files as potentially sensitive.

The source does not include the owner's local database or exported credentials.

Starting with v0.10.2, database and WebView data can be stored under a
user-selected data root. On first start, Prompt Forge migrates legacy data,
verifies every copied file with SHA-256, and only then removes the migrated
source files. The path can be changed under
`Settings → 数据位置`; the change takes effect after restarting the application.
See [`source/docs/DATA_LOCATION.md`](source/docs/DATA_LOCATION.md).

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
