# Prompt Forge v0.10.4 Local Build Record

## Toolchain

- Target: `x86_64-pc-windows-msvc`
- C/C++ compiler: LLVM `clang-cl`
- Linker: LLVM `lld-link`
- CRT/SDK: Microsoft CRT 14.44 and Windows SDK 10.0.26100 from `xwin`
- Cargo dependencies: pre-fetched offline into a local Cargo home cache

## Verification

- Frontend production build: passed.
- Rust format check: passed.
- Clippy with `-D warnings`: passed.
- Rust tests: 53 passed, 0 failed.
- Installed `FileVersion`: `0.10.4`.
- Installed `ProductVersion`: `0.10.4`.
- UI version: `v0.10.4`.
- Application window: responding.

## Local assets

- Portable EXE: 16,988,672 bytes, SHA-256
  `3cba402432a63cbf50aa92a11e2bdab93c6ce7e2373660f65811ef6a435d8d3c`.
- NSIS installer: 4,974,638 bytes, SHA-256
  `232440dc26af7923f0b29f6098669c2ad52d7f6bdf869893aad6bbed6cd17e75`.
- Release ZIP: 11,697,263 bytes, SHA-256
  `0540cc71df1bd3fdc06ffd1b9d6ffa7796c5961714f1e11d0835f3b39089a8e5`.

## Functional checks

- Incremental Codex index reuses unchanged file state.
- JSONL and Zstandard readers keep valid lines while skipping damaged lines.
- Unknown event types produce a warning without aborting.
- Codex project association combines global-state, project-root, and cwd evidence.
- Local skill matching returns at most eight candidates; malformed model rerank falls back.
- Role evidence remains usable when non-role context is truncated.
- Context conflicts retain both values and source references.
- Removable skill block restores the prompt body unchanged.
- Favorites persist references without copying conversation content.
- File watching is opt-in, detects appends, and joins its thread when disabled.

## Known limitations

- A live cloud model call was not run with the owner API key.
- macOS and Linux were not tested on real hardware.
- The installer is not Authenticode-signed.
