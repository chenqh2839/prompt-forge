# Changelog

All notable changes to this project are documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.10.4] - 2026-11-09

### Added

- Read-only Codex project and conversation discovery with JSONL and Zstandard rollout streaming.
- Incremental rollout indexing using file size, modification time, SHA-256 digests, and byte offsets.
- Explainable Codex project association based on explicit project IDs, project roots, and cwd matching.
- Session search, date filters, archived-thread filtering, compaction summaries, and source read manifests.
- Local Codex skill discovery and optional model reranking for the top five to eight candidates.
- Structured role evidence, context conflict reporting, source references, and removable Codex skill blocks.
- Reference-only favorites for project, thread, and skill combinations.
- Explicitly opt-in Codex file watching with clean watcher shutdown.
- Compatibility diagnostics for unknown events, incomplete JSONL lines, plugin cache changes, and project-level skill roots.

### Changed

- Role reuse now evaluates complete role evidence separately from the overall context truncation state.
- Codex execution guidance is injected into a separate prompt section and never treated as role evidence.

## [0.10.3] - 2026-10-28

### Added

- Single and multi-select history moves to an existing project or back to
  unfiled, using one atomic SQLite transaction.
- A project target picker with search and explicit origin-to-target
  confirmation.
- A cancel control during prompt analysis that stops the active request,
  discards the round result, and preserves editable input.

### Changed

- Analysis requests now carry request IDs and are tracked by a cancellation
  registry until completion.

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
- Migration handles Windows EFS sources and encrypted bootstrap configuration
  directories, and refuses to activate a completed target while the source is
  still present and may have changed.

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
