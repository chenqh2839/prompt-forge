# Data Location and Migration

Prompt Forge v0.10.2 and later store application data under a configurable data root.
The default Windows managed root is `D:\PromptForge-Data` when drive D is
available. If D is unavailable, the application falls back to the legacy
AppData locations.

The current development machine uses this explicit migration target:

```text
D:\Codex工作文件夹\提示词优化\PromptForge-Data
```

That target is supplied through the independent bootstrap configuration rather
than hard-coded into the application. A pending migration can be prepared with:

```powershell
.\scripts\seed-data-location.ps1 `
  -DataRoot "D:\Codex工作文件夹\提示词优化\PromptForge-Data"
```

## Managed layout

```text
<data-root>/
├─ data/
│  ├─ prompt-forge.sqlite3
│  ├─ prompt-forge.sqlite3-wal
│  └─ prompt-forge.sqlite3-shm
├─ webview/
└─ meta/
   └─ migration.json
```

The small `storage-location.json` configuration remains in the operating
system's application configuration directory so that the application can still
find the selected target after the data root changes.

API keys remain in the operating system credential vault. They are not copied
into SQLite, WebView storage, the data root, or configuration files. The keyring
service remains `com.promptforge.desktop`.

## Legacy locations

On Windows, earlier versions used:

```text
%APPDATA%\com.promptforge.desktop\prompt-forge.sqlite3
%LOCALAPPDATA%\com.promptforge.desktop
```

Migration copies the database and any WAL/SHM files together with the complete
WebView data directory.

## Safety behavior

- The application acquires a single-instance lock before startup migration.
- No SQLite connection or main window exists while files are being copied.
- Every copied file is checked for existence, size, and SHA-256 equality.
- Copied SQLite databases are checked with `PRAGMA quick_check`.
- Encryption attributes are preserved when the target filesystem accepts them.
  If an EFS-encrypted source cannot create encrypted destination files,
  Prompt Forge writes the verified copy as a regular file and displays a
  warning; use BitLocker or another volume encryption layer for that target.
- Target directories that already contain valid or incomplete Prompt Forge data
  are not overwritten automatically.
- A failed or interrupted migration keeps the source data and retries only when
  a compatible in-progress marker is present.
- Source files are removed only after the destination is verified and the new
  location configuration is committed.
- If source cleanup alone fails, the verified target remains active and a
  warning is shown; the application does not delete the target.

## Path validation

The selected path must be absolute and writable. Prompt Forge rejects:

- Empty or relative paths.
- Filesystem roots.
- Windows system directories, Program Files, and ProgramData.
- The program installation directory and paths overlapping it.
- The current data directory or paths that are parents/children of it.
- Targets containing unrelated files or incompatible application data.

## Changing the data location

Open `设置 → 数据位置`, choose a directory, then choose one of:

- `使用现有数据`: requires a valid `data/prompt-forge.sqlite3` in the target.
- `迁移当前数据`: requires a target without existing Prompt Forge data.

The choice is written to the independent bootstrap configuration and takes
effect after restarting the application. Migration is performed before the
window and database are opened on the next start.

Uninstall does not remove the data root or saved credentials.
