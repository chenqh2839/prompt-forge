# Prompt Forge v0.10.2 Local Validation

## Environment

- Windows 11 Home, version `10.0.26300`, x64.
- Final Windows CI run: `40510235936`, success.
- Release binary source commit: `85780465060cf4bca4cb0539d3d329fb1d45a186`.
- Installed file version and product version: `0.10.2`.

## Automated checks

- Frontend production build passed.
- Rust formatting and Clippy passed with warnings denied.
- All 36 Rust unit tests passed.
- Windows NSIS bundle generation and artifact upload passed.
- The release archive's six internal SHA-256 entries were verified with zero
  mismatches.

## Installation and migration

- The NSIS installer completed with exit code `0` as a current-user upgrade.
- The installed application started, created its window, and remained
  responsive.
- The active data root is
  `D:\Codex工作文件夹\提示词优化\PromptForge-Data`.
- `storage-location.json` has no pending path change or error.
- The D-drive SQLite database passed `PRAGMA quick_check`.
- Preserved data: 3 history rows, 1 project, 1 project summary, and 3 settings.
- The migrated database SHA-256 is
  `ba8716b7fd807f11525350697bf82f725b25d5fa7492cbdf32c741c6081e068d`.
- The legacy C-drive database no longer exists.
- No files remain under `%LOCALAPPDATA%\com.promptforge.desktop`; an empty
  directory shell may remain until the operating system releases it.
- The migration marker records a complete v0.10.2 migration and source cleanup.
- The API-key service identifier remains `com.promptforge.desktop`. No saved
  key was present for the checked providers, so credential retrieval could not
  be exercised with a real credential.

## Verification boundaries

- Role reuse was verified through unit tests and prompt composition tests, not
  through a live cloud model request.
- No real cloud API key was used for an internet model call.
- Windows 10 was not separately retested for this exact binary.
- macOS and Linux were not run on physical or virtual devices for this release.
- Invalid-path fallback, target conflict handling, and interrupted migration
  recovery are covered by automated tests; destructive interruption was not
  forced against the live production database.

