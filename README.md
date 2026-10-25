# Prompt Forge Release Workspace

This repository is the private GitHub release workspace for Prompt Forge.

## Layout

- `source/` - source snapshot for Prompt Forge 0.10.1.
- `release/` - release notes, asset manifest, and checksums.
- `scripts/` - reproducible release helper scripts.
- `release-assets/` - local staging for published binary assets; ignored by Git.
- `logs/` - local command logs; ignored by Git.

The Windows x64 release asset was not rebuilt from this workspace. It was copied
from the existing local release package and verified by SHA-256 before upload.

See `release/RELEASE_NOTES.md` for the current validation boundary and known
limitations.
