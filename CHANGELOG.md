# Changelog

All notable changes to this project are documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.10.2] - 2026-10-27

### Added

- User-selectable Prompt Forge data root for SQLite and WebView data.
- A storage-location settings tab with directory validation and restart notice.
- One-time migration from legacy Windows AppData/LocalAppData locations.
- Migration markers, SHA-256 file verification, and SQLite quick checks.
- Single-instance enforcement to prevent concurrent access during migration.
- Optional reuse of matching project/manual background for role selection.
- A separate one-line role decision explanation in the final result panel.

### Changed

- SQLite, WAL/SHM, and WebView data now share a managed
  `data`, `webview`, and `meta` directory layout.
- The WebView data directory is configured before the main window is created.
- Manual background and project context are merged and deduplicated before
  prompt generation. Context beyond the safety limit is truncated.

### Security

- Remote model Base URLs must use HTTPS. Plain HTTP is limited to loopback hosts.
- URLs containing embedded credentials, query strings, or fragments are rejected.

## [0.10.1] - 2026-10-25

### Changed

- Improved startup sequencing and persisted theme restoration.

### Added

- Project interaction context, summaries, and template distillation.
- Variable prompt templates with ordered sections and source mappings.
- Local attachment extraction for TXT, Markdown, PDF, DOCX, and images.
- Apache-2.0 licensing and third-party notices.
