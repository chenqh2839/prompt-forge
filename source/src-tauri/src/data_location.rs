use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const STORAGE_CONFIG_FILE: &str = "storage-location.json";
pub const STORAGE_SCHEMA_VERSION: u32 = 1;
pub const DATABASE_FILE: &str = "prompt-forge.sqlite3";
const MIGRATION_MARKER: &str = "migration.json";

#[derive(Clone, Debug)]
pub struct DataPaths {
    pub root: PathBuf,
    pub data_dir: PathBuf,
    pub database_path: PathBuf,
    pub webview_dir: PathBuf,
    pub meta_dir: PathBuf,
    pub managed: bool,
}

impl DataPaths {
    pub fn managed(root: PathBuf) -> Self {
        let data_dir = root.join("data");
        let webview_dir = root.join("webview");
        let meta_dir = root.join("meta");
        Self {
            root,
            database_path: data_dir.join(DATABASE_FILE),
            data_dir,
            webview_dir,
            meta_dir,
            managed: true,
        }
    }

    pub fn legacy(data_dir: PathBuf, webview_dir: PathBuf) -> Self {
        Self {
            database_path: data_dir.join(DATABASE_FILE),
            data_dir: data_dir.clone(),
            root: data_dir,
            webview_dir,
            meta_dir: PathBuf::new(),
            managed: false,
        }
    }

    pub fn ensure_directories(&self) -> Result<(), String> {
        for path in [&self.data_dir, &self.webview_dir] {
            fs::create_dir_all(path)
                .map_err(|error| format!("无法创建数据目录 {}：{error}", path.display()))?;
        }
        if self.managed {
            fs::create_dir_all(&self.meta_dir)
                .map_err(|error| format!("无法创建数据元信息目录：{error}"))?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub legacy_data_dir: PathBuf,
    pub legacy_webview_dir: PathBuf,
    pub install_dir: PathBuf,
    pub preferred_root: PathBuf,
}

#[derive(Clone, Debug)]
pub struct StartupResult {
    pub paths: DataPaths,
    pub default_root: PathBuf,
    pub warning: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub active_root: Option<String>,
    #[serde(default)]
    pub pending_change: Option<PendingChange>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub updated_at: u64,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            schema_version: STORAGE_SCHEMA_VERSION,
            active_root: None,
            pending_change: None,
            last_error: None,
            updated_at: now_timestamp(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingChange {
    pub target_root: String,
    pub mode: DataRootChangeMode,
    pub requested_at: u64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DataRootChangeMode {
    Existing,
    Migrate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocationStatus {
    pub current_root: String,
    pub configured_root: Option<String>,
    pub default_root: String,
    pub database_path: String,
    pub webview_path: String,
    pub bootstrap_config_path: String,
    pub pending_root: Option<String>,
    pub pending_mode: Option<DataRootChangeMode>,
    pub restart_required: bool,
    pub warning: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataRootInspection {
    pub target_root: String,
    pub has_existing_data: bool,
    pub has_managed_data: bool,
    pub has_foreign_entries: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataRootChangeRequest {
    pub target_root: String,
    pub mode: DataRootChangeMode,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationMarker {
    schema_version: u32,
    status: String,
    app_version: String,
    source: String,
    target: String,
    started_at: u64,
    completed_at: Option<u64>,
    files: usize,
    bytes: u64,
    source_removed: bool,
}

#[derive(Clone, Debug)]
struct MigrationSource {
    label: PathBuf,
    database_path: PathBuf,
    webview_dir: PathBuf,
    managed_root: Option<PathBuf>,
}

#[derive(Default)]
struct CopyStats {
    files: usize,
    bytes: u64,
    encryption_fallback_files: usize,
}

#[derive(Default)]
struct MigrationOutcome {
    files: usize,
    bytes: u64,
    warning: Option<String>,
}

fn schema_version() -> u32 {
    STORAGE_SCHEMA_VERSION
}

pub fn now_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

pub fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join(STORAGE_CONFIG_FILE)
}

pub fn resolve_startup(app: &AppPaths, version: &str) -> Result<StartupResult, String> {
    fs::create_dir_all(&app.config_dir)
        .map_err(|error| format!("无法创建配置目录 {}：{error}", app.config_dir.display()))?;
    let config_path = config_path(&app.config_dir);
    let (mut config, mut warning) = load_config(&config_path)?;

    let current = configured_or_legacy_paths(app, &config);
    let mut current_warning = warning.take();

    if let Some(pending) = config.pending_change.clone() {
        match apply_pending_change(app, version, &config_path, &mut config, &current, &pending) {
            Ok(result) => return Ok(result),
            Err(error) => {
                config.pending_change = None;
                config.last_error = Some(error.clone());
                config.updated_at = now_timestamp();
                let _ = write_config(&config_path, &config);
                let warning = combine_warning(
                    current_warning,
                    Some(format!("数据目录更改未完成，已回退到原目录：{error}")),
                );
                return Ok(fallback_result(&current, &app.preferred_root, warning));
            }
        }
    }

    if let Some(active_root) = config.active_root.as_deref() {
        match use_configured_root(app, active_root, &current) {
            Ok(paths) => {
                return Ok(StartupResult {
                    paths,
                    default_root: app.preferred_root.clone(),
                    warning: current_warning,
                });
            }
            Err(error) => {
                current_warning = combine_warning(
                    current_warning,
                    Some(format!("配置的数据目录不可用，已回退到原目录：{error}")),
                );
            }
        }
    }

    let source = match source_from_paths(&current) {
        Ok(source) => source,
        Err(error) => {
            return Ok(fallback_result(
                &current,
                &app.preferred_root,
                combine_warning(
                    current_warning,
                    Some(format!("无法读取旧数据目录，已回退：{error}")),
                ),
            ))
        }
    };
    match initialize_default_root(app, version, source.as_ref()) {
        Ok((paths, source_warning)) => {
            config.active_root = Some(paths.root.to_string_lossy().to_string());
            config.pending_change = None;
            config.last_error = None;
            config.updated_at = now_timestamp();
            if let Err(error) = write_config(&config_path, &config) {
                return Ok(fallback_result(
                    &current,
                    &app.preferred_root,
                    combine_warning(
                        current_warning,
                        Some(format!("无法保存数据位置配置，已回退到原目录：{error}")),
                    ),
                ));
            }
            let cleanup_warning = source.as_ref().and_then(remove_source_data);
            if cleanup_warning.is_none() && source.is_some() {
                mark_source_removed(&paths.root, true);
            }
            Ok(StartupResult {
                paths,
                default_root: app.preferred_root.clone(),
                warning: combine_warning(
                    current_warning,
                    combine_warning(source_warning, cleanup_warning),
                ),
            })
        }
        Err(error) => Ok(fallback_result(
            &current,
            &app.preferred_root,
            combine_warning(
                current_warning,
                Some(format!("无法使用配置的数据目录，已回退到默认目录：{error}")),
            ),
        )),
    }
}

pub fn read_status(
    config_path: &Path,
    current: &DataPaths,
    default_root: &Path,
    warning: Option<String>,
) -> Result<DataLocationStatus, String> {
    let (config, config_warning) = load_config(config_path)?;
    let pending = config.pending_change.as_ref();
    Ok(DataLocationStatus {
        current_root: current.root.to_string_lossy().to_string(),
        configured_root: config.active_root.clone(),
        default_root: default_root.to_string_lossy().to_string(),
        database_path: current.database_path.to_string_lossy().to_string(),
        webview_path: current.webview_dir.to_string_lossy().to_string(),
        bootstrap_config_path: config_path.to_string_lossy().to_string(),
        pending_root: pending.map(|pending| pending.target_root.clone()),
        pending_mode: pending.map(|pending| pending.mode),
        restart_required: pending.is_some(),
        warning: combine_warning(warning, config_warning),
    })
}

pub fn inspect_target(
    raw_target: &str,
    current: &DataPaths,
    install_dir: &Path,
) -> Result<DataRootInspection, String> {
    let target = validate_target_root(raw_target, current, install_dir)?;
    let paths = DataPaths::managed(target.clone());
    let database_exists = paths.database_path.is_file();
    let webview_has_data = directory_has_entries(&paths.webview_dir)?;
    let data_has_entries = directory_has_entries(&paths.data_dir)?;
    let meta_has_entries = directory_has_entries(&paths.meta_dir)?;

    if database_exists {
        verify_sqlite_database(&paths.database_path)?;
    }

    let has_managed_data =
        database_exists || webview_has_data || data_has_entries || meta_has_entries;
    let target_has_other_entries = fs::read_dir(&target)
        .map_err(|error| format!("无法读取目标目录：{error}"))?
        .filter_map(Result::ok)
        .any(|entry| {
            !matches!(
                entry.file_name().to_str(),
                Some("data") | Some("webview") | Some("meta")
            )
        });

    Ok(DataRootInspection {
        target_root: target.to_string_lossy().to_string(),
        has_existing_data: database_exists,
        has_managed_data,
        has_foreign_entries: target_has_other_entries,
    })
}

pub fn schedule_change(
    config_path: &Path,
    current: &DataPaths,
    install_dir: &Path,
    default_root: &Path,
    request: &DataRootChangeRequest,
) -> Result<DataLocationStatus, String> {
    let inspection = inspect_target(&request.target_root, current, install_dir)?;
    let target = PathBuf::from(&inspection.target_root);

    if inspection.has_foreign_entries {
        return Err("目标目录包含非 Prompt Forge 文件，请选择一个专用空目录。".to_string());
    }
    match request.mode {
        DataRootChangeMode::Existing if !inspection.has_existing_data => {
            return Err("目标目录中没有可用的 Prompt Forge 数据库。".to_string())
        }
        DataRootChangeMode::Migrate if inspection.has_managed_data => {
            return Err("目标目录已有 Prompt Forge 数据，不能静默覆盖。".to_string())
        }
        _ => {}
    }

    let mut config = load_config(config_path)?.0;
    config.schema_version = STORAGE_SCHEMA_VERSION;
    config.active_root = current
        .managed
        .then(|| current.root.to_string_lossy().to_string());
    config.pending_change = Some(PendingChange {
        target_root: target.to_string_lossy().to_string(),
        mode: request.mode,
        requested_at: now_timestamp(),
    });
    config.last_error = None;
    config.updated_at = now_timestamp();
    write_config(config_path, &config)?;

    read_status(
        config_path,
        current,
        default_root,
        Some("数据目录更改将在重启应用后生效。".to_string()),
    )
}

fn apply_pending_change(
    app: &AppPaths,
    version: &str,
    config_path: &Path,
    config: &mut StorageConfig,
    current: &DataPaths,
    pending: &PendingChange,
) -> Result<StartupResult, String> {
    let target = validate_target_root(&pending.target_root, current, &app.install_dir)?;
    let target_paths = DataPaths::managed(target.clone());
    let inspection = inspect_target(&pending.target_root, current, &app.install_dir)?;

    match pending.mode {
        DataRootChangeMode::Existing => {
            if !inspection.has_existing_data {
                return Err("目标目录中没有可用的 Prompt Forge 数据库。".to_string());
            }
            target_paths.ensure_directories()?;
            config.active_root = Some(target.to_string_lossy().to_string());
            config.pending_change = None;
            config.last_error = None;
            config.updated_at = now_timestamp();
            write_config(config_path, config)?;
            Ok(StartupResult {
                paths: target_paths,
                default_root: app.preferred_root.clone(),
                warning: Some("已切换到目标目录中的现有数据。".to_string()),
            })
        }
        DataRootChangeMode::Migrate => {
            let source = source_from_paths(current)?;
            if source.is_none()
                && inspection.has_managed_data
                && migration_is_complete(&target, &current.root)
            {
                target_paths.ensure_directories()?;
                config.active_root = Some(target.to_string_lossy().to_string());
                config.pending_change = None;
                config.last_error = None;
                config.updated_at = now_timestamp();
                write_config(config_path, config)?;
                let cleanup_warning = source.as_ref().and_then(remove_source_data);
                if cleanup_warning.is_none() && source.is_some() {
                    mark_source_removed(&target_paths.root, true);
                }
                return Ok(StartupResult {
                    paths: target_paths,
                    default_root: app.preferred_root.clone(),
                    warning: combine_warning(
                        Some("已确认目标目录中的完整迁移结果，并完成数据位置切换。".to_string()),
                        cleanup_warning,
                    ),
                });
            }
            if inspection.has_managed_data
                && !source
                    .as_ref()
                    .is_some_and(|source| can_resume_migration(&target, source))
            {
                return Err("目标目录已有 Prompt Forge 数据，不能静默覆盖。".to_string());
            }
            let notice = if let Some(source) = source.as_ref() {
                let outcome = migrate_data(source, &target, version)?;
                Some(format!(
                    "数据已迁移：{} 个文件，{} 字节。",
                    outcome.files, outcome.bytes
                ))
            } else {
                target_paths.ensure_directories()?;
                Some("新数据目录已创建，没有需要迁移的旧数据。".to_string())
            };
            config.active_root = Some(target.to_string_lossy().to_string());
            config.pending_change = None;
            config.last_error = None;
            config.updated_at = now_timestamp();
            write_config(config_path, config)?;
            let cleanup_warning = source.as_ref().and_then(remove_source_data);
            if cleanup_warning.is_none() && source.is_some() {
                mark_source_removed(&target_paths.root, true);
            }
            Ok(StartupResult {
                paths: target_paths,
                default_root: app.preferred_root.clone(),
                warning: combine_warning(notice, cleanup_warning),
            })
        }
    }
}

fn initialize_default_root(
    app: &AppPaths,
    version: &str,
    source: Option<&MigrationSource>,
) -> Result<(DataPaths, Option<String>), String> {
    let target = validate_target_root(
        &app.preferred_root.to_string_lossy(),
        &DataPaths::legacy(app.legacy_data_dir.clone(), app.legacy_webview_dir.clone()),
        &app.install_dir,
    )?;
    let target_paths = DataPaths::managed(target.clone());
    let inspection = inspect_target(
        &target.to_string_lossy(),
        &DataPaths::legacy(app.legacy_data_dir.clone(), app.legacy_webview_dir.clone()),
        &app.install_dir,
    )?;

    if inspection.has_existing_data && source.is_some() {
        return Err("目标目录和旧目录都包含数据，请启动后在设置中选择要使用的数据。".to_string());
    }
    if inspection.has_existing_data {
        target_paths.ensure_directories()?;
        return Ok((target_paths, None));
    }
    if inspection.has_managed_data
        && !source.is_some_and(|source| can_resume_migration(&target, source))
    {
        return Err("目标目录已有不完整数据或非 Prompt Forge 文件。".to_string());
    }
    if inspection.has_foreign_entries {
        return Err("目标目录包含非 Prompt Forge 文件。".to_string());
    }

    let warning = if let Some(source) = source {
        let outcome = migrate_data(source, &target, version)?;
        combine_warning(
            Some(format!(
                "首次启动已迁移 {} 个文件，共 {} 字节。",
                outcome.files, outcome.bytes
            )),
            outcome.warning,
        )
    } else {
        target_paths.ensure_directories()?;
        Some("已创建新的 Prompt Forge 数据目录。".to_string())
    };

    Ok((target_paths, warning))
}

fn use_configured_root(
    app: &AppPaths,
    active_root: &str,
    _current: &DataPaths,
) -> Result<DataPaths, String> {
    let legacy = DataPaths::legacy(app.legacy_data_dir.clone(), app.legacy_webview_dir.clone());
    let target = validate_target_root(active_root, &legacy, &app.install_dir)?;
    let paths = DataPaths::managed(target);
    paths.ensure_directories()?;
    if paths.database_path.is_file() {
        verify_sqlite_database(&paths.database_path)?;
    }
    Ok(paths)
}

fn configured_or_legacy_paths(app: &AppPaths, config: &StorageConfig) -> DataPaths {
    let legacy = DataPaths::legacy(app.legacy_data_dir.clone(), app.legacy_webview_dir.clone());
    let Some(root) = config.active_root.as_deref() else {
        return legacy;
    };
    match validate_target_root(root, &legacy, &app.install_dir) {
        Ok(path) => {
            let paths = DataPaths::managed(path);
            if paths.database_path.is_file()
                && verify_sqlite_database(&paths.database_path).is_err()
            {
                legacy
            } else {
                paths
            }
        }
        Err(_) => legacy,
    }
}

fn fallback_result(
    current: &DataPaths,
    preferred_root: &Path,
    warning: Option<String>,
) -> StartupResult {
    StartupResult {
        paths: current.clone(),
        default_root: preferred_root.to_path_buf(),
        warning,
    }
}

fn source_from_paths(paths: &DataPaths) -> Result<Option<MigrationSource>, String> {
    let has_database = paths.database_path.is_file();
    let has_webview = directory_has_entries(&paths.webview_dir)?;
    if !has_database && !has_webview {
        return Ok(None);
    }
    Ok(Some(MigrationSource {
        label: paths.root.clone(),
        database_path: paths.database_path.clone(),
        webview_dir: paths.webview_dir.clone(),
        managed_root: paths.managed.then(|| paths.root.clone()),
    }))
}

fn migrate_data(
    source: &MigrationSource,
    target_root: &Path,
    version: &str,
) -> Result<MigrationOutcome, String> {
    fs::create_dir_all(target_root).map_err(|error| format!("无法创建目标数据目录：{error}"))?;
    let target_paths = DataPaths::managed(target_root.to_path_buf());
    target_paths.ensure_directories()?;

    let marker_path = target_paths.meta_dir.join(MIGRATION_MARKER);
    if marker_path.is_file() {
        let marker: MigrationMarker = serde_json::from_slice(
            &fs::read(&marker_path).map_err(|error| format!("读取迁移标记失败：{error}"))?,
        )
        .map_err(|error| format!("迁移标记损坏：{error}"))?;
        if marker.status == "complete" {
            return Err("目标目录已完成过迁移，不能重复覆盖。".to_string());
        }
        if marker.status != "in_progress" || marker.target != target_root.to_string_lossy() {
            return Err("目标目录存在无法确认的迁移标记，已停止。".to_string());
        }
        if marker.source != source.label.to_string_lossy() {
            return Err("迁移标记中的源目录与当前数据目录不一致，已停止。".to_string());
        }
        remove_managed_target_dirs(&target_paths)?;
    } else if target_paths.database_path.is_file()
        || directory_has_entries(&target_paths.webview_dir)?
        || directory_has_entries(&target_paths.data_dir)?
    {
        return Err("目标目录已有数据，不能静默覆盖。".to_string());
    }

    let started_at = now_timestamp();
    let mut marker = MigrationMarker {
        schema_version: STORAGE_SCHEMA_VERSION,
        status: "in_progress".to_string(),
        app_version: version.to_string(),
        source: source.label.to_string_lossy().to_string(),
        target: target_root.to_string_lossy().to_string(),
        started_at,
        completed_at: None,
        files: 0,
        bytes: 0,
        source_removed: false,
    };
    write_json_atomic(&marker_path, &marker)?;

    let staging = target_root.join(format!(".migration-{}", Uuid::new_v4()));
    fs::create_dir_all(staging.join("data"))
        .map_err(|error| format!("无法创建迁移暂存目录：{error}"))?;
    fs::create_dir_all(staging.join("webview"))
        .map_err(|error| format!("无法创建 WebView 暂存目录：{error}"))?;

    let mut stats = CopyStats::default();
    if source.database_path.is_file() {
        for source_file in [
            source.database_path.clone(),
            source.database_path.with_extension("sqlite3-wal"),
            source.database_path.with_extension("sqlite3-shm"),
        ] {
            if source_file.is_file() {
                let destination = staging
                    .join("data")
                    .join(source_file.file_name().unwrap_or_default());
                copy_verified(&source_file, &destination, &mut stats)?;
            }
        }
        verify_sqlite_database(&staging.join("data").join(DATABASE_FILE))?;
    }
    if source.webview_dir.is_dir() {
        copy_tree_verified(&source.webview_dir, &staging.join("webview"), &mut stats)?;
    }

    marker.files = stats.files;
    marker.bytes = stats.bytes;
    write_json_atomic(&marker_path, &marker)?;

    let data_target = target_paths.data_dir.clone();
    let webview_target = target_paths.webview_dir.clone();
    remove_empty_directory(&data_target)?;
    remove_empty_directory(&webview_target)?;
    fs::rename(staging.join("data"), &data_target)
        .map_err(|error| format!("无法提交数据库迁移：{error}"))?;
    fs::rename(staging.join("webview"), &webview_target)
        .map_err(|error| format!("无法提交 WebView 数据迁移：{error}"))?;
    let _ = fs::remove_dir_all(&staging);

    marker.status = "complete".to_string();
    marker.completed_at = Some(now_timestamp());
    marker.source_removed = false;
    write_json_atomic(&marker_path, &marker)?;

    Ok(MigrationOutcome {
        files: stats.files,
        bytes: stats.bytes,
        warning: (stats.encryption_fallback_files > 0).then(|| {
            format!(
                "{} 个源文件启用了 EFS，但目标位置不允许继承文件加密，已按普通文件迁移；请确认目标磁盘使用了 BitLocker 或其他适当的静态加密。",
                stats.encryption_fallback_files
            )
        }),
    })
}

fn can_resume_migration(target_root: &Path, source: &MigrationSource) -> bool {
    let marker_path = DataPaths::managed(target_root.to_path_buf())
        .meta_dir
        .join(MIGRATION_MARKER);
    if !marker_path.is_file() {
        return false;
    }
    let Ok(bytes) = fs::read(marker_path) else {
        return false;
    };
    let Ok(marker) = serde_json::from_slice::<MigrationMarker>(&bytes) else {
        return false;
    };
    marker.status == "in_progress"
        && marker.target == target_root.to_string_lossy()
        && marker.source == source.label.to_string_lossy()
}

fn migration_is_complete(target_root: &Path, source_root: &Path) -> bool {
    let marker_path = DataPaths::managed(target_root.to_path_buf())
        .meta_dir
        .join(MIGRATION_MARKER);
    let Ok(bytes) = fs::read(marker_path) else {
        return false;
    };
    let Ok(marker) = serde_json::from_slice::<MigrationMarker>(&bytes) else {
        return false;
    };
    if marker.status != "complete" {
        return false;
    }
    let Ok(expected_target) = normalize_for_compare(target_root) else {
        return false;
    };
    let Ok(expected_source) = normalize_for_compare(source_root) else {
        return false;
    };
    let target_matches = normalize_for_compare(Path::new(&marker.target))
        .map(|path| path_key(&path) == path_key(&expected_target))
        .unwrap_or(false);
    let source_matches = normalize_for_compare(Path::new(&marker.source))
        .map(|path| path_key(&path) == path_key(&expected_source))
        .unwrap_or(false);
    target_matches && source_matches
}

fn mark_source_removed(target_root: &Path, source_removed: bool) {
    let marker_path = DataPaths::managed(target_root.to_path_buf())
        .meta_dir
        .join(MIGRATION_MARKER);
    let Ok(bytes) = fs::read(&marker_path) else {
        return;
    };
    let Ok(mut marker) = serde_json::from_slice::<MigrationMarker>(&bytes) else {
        return;
    };
    marker.source_removed = source_removed;
    let _ = write_json_atomic(&marker_path, &marker);
}

fn remove_managed_target_dirs(paths: &DataPaths) -> Result<(), String> {
    for path in [&paths.data_dir, &paths.webview_dir] {
        if path.exists() {
            fs::remove_dir_all(path)
                .map_err(|error| format!("无法清理未完成的迁移目录 {}：{error}", path.display()))?;
        }
    }
    if let Ok(entries) = fs::read_dir(&paths.root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(".migration-")
                && path.is_dir()
            {
                fs::remove_dir_all(&path)
                    .map_err(|error| format!("无法清理未完成的迁移暂存目录：{error}"))?;
            }
        }
    }
    Ok(())
}

fn remove_source_data(source: &MigrationSource) -> Option<String> {
    let mut failures = Vec::new();
    for path in [
        source.database_path.clone(),
        source.database_path.with_extension("sqlite3-wal"),
        source.database_path.with_extension("sqlite3-shm"),
    ] {
        if path.exists() {
            if let Err(error) = fs::remove_file(&path) {
                failures.push(format!("{}：{error}", path.display()));
            }
        }
    }
    if source.webview_dir.exists() {
        if let Err(error) = fs::remove_dir_all(&source.webview_dir) {
            failures.push(format!("{}：{error}", source.webview_dir.display()));
        }
    }
    if let Some(root) = source.managed_root.as_deref() {
        for directory in [root.join("data"), root.join("webview")] {
            if directory.exists() {
                if let Err(error) = fs::remove_dir_all(&directory) {
                    failures.push(format!("{}：{error}", directory.display()));
                }
            }
        }
    }
    if failures.is_empty() {
        None
    } else {
        Some(format!(
            "目标数据已校验成功，但部分源文件无法删除；已保留目标目录并继续启动。{}",
            failures.join("；")
        ))
    }
}

fn validate_target_root(
    raw_target: &str,
    current: &DataPaths,
    install_dir: &Path,
) -> Result<PathBuf, String> {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() {
        return Err("数据目录不能为空。".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("数据目录必须是绝对路径。".to_string());
    }
    if path.parent().is_none() || path.parent() == Some(path.as_path()) {
        return Err("数据目录不能是磁盘根目录。".to_string());
    }
    if path.exists() && !path.is_dir() {
        return Err("所选数据路径不是目录。".to_string());
    }

    let canonical = normalize_for_compare(&path)?;
    let current_root = normalize_for_compare(&current.root)?;
    let install_root = normalize_for_compare(install_dir)?;

    if overlaps(&canonical, &current_root) {
        return Err("新数据目录不能与当前数据目录相同、互为父目录或子目录。".to_string());
    }
    if overlaps(&canonical, &current.webview_dir) {
        return Err("新数据目录不能与当前 WebView 数据目录重叠。".to_string());
    }
    if overlaps(&canonical, &install_root) {
        return Err("数据目录不能位于程序安装目录内，也不能包含安装目录。".to_string());
    }
    if is_system_directory(&canonical)? {
        return Err("不能将数据目录设置在系统关键目录或磁盘根目录。".to_string());
    }

    fs::create_dir_all(&path)
        .map_err(|error| format!("无法创建数据目录 {}：{error}", path.display()))?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("无法解析数据目录 {}：{error}", path.display()))?;
    let probe = path.join(format!(".prompt-forge-write-test-{}", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|error| format!("数据目录不可写：{error}"))?;
    file.write_all(b"prompt-forge")
        .map_err(|error| format!("写入测试文件失败：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("同步测试文件失败：{error}"))?;
    fs::remove_file(&probe).map_err(|error| format!("删除测试文件失败：{error}"))?;

    Ok(canonical)
}

fn is_system_directory(path: &Path) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let mut roots = Vec::new();
        for key in [
            "SystemRoot",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramData",
        ] {
            if let Some(value) = env::var_os(key) {
                roots.push(PathBuf::from(value));
            }
        }
        for root in roots {
            let root = path_key(&normalize_for_compare(&root)?);
            let candidate = path_key(path);
            if candidate == root || candidate.starts_with(&(root + "/")) {
                return Ok(true);
            }
        }
        let components: Vec<_> = path.components().collect();
        if components.len() <= 2 {
            return Ok(true);
        }
    }
    #[cfg(target_family = "unix")]
    {
        for root in [
            "/usr", "/etc", "/bin", "/sbin", "/lib", "/boot", "/proc", "/sys",
        ] {
            let candidate = path_key(path);
            let root = path_key(Path::new(root));
            if candidate == root || candidate.starts_with(&(root + "/")) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn normalize_for_compare(path: &Path) -> Result<PathBuf, String> {
    let mut candidate = path.to_path_buf();
    let mut suffix = Vec::new();
    while !candidate.exists() {
        let Some(name) = candidate.file_name().map(ToOwned::to_owned) else {
            break;
        };
        suffix.push(name);
        if !candidate.pop() {
            break;
        }
    }
    let mut normalized = fs::canonicalize(&candidate).unwrap_or(candidate);
    for component in suffix.iter().rev() {
        normalized.push(component);
    }
    Ok(normalized)
}

fn overlaps(left: &Path, right: &Path) -> bool {
    let left = path_key(left);
    let right = path_key(right);
    left == right || left.starts_with(&(right.clone() + "/")) || right.starts_with(&(left + "/"))
}

fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/").to_lowercase();
    value.trim_end_matches('/').to_string()
}

fn copy_tree_verified(source: &Path, target: &Path, stats: &mut CopyStats) -> Result<(), String> {
    let source_metadata =
        fs::symlink_metadata(source).map_err(|error| format!("读取源目录信息失败：{error}"))?;
    if source_metadata.file_type().is_symlink() {
        return Err(format!("迁移中止：不支持符号链接 {}", source.display()));
    }
    for entry in fs::read_dir(source)
        .map_err(|error| format!("读取源目录 {} 失败：{error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("读取源目录条目失败：{error}"))?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        let metadata =
            fs::symlink_metadata(&path).map_err(|error| format!("读取源文件信息失败：{error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("迁移中止：不支持符号链接 {}", path.display()));
        }
        if metadata.is_dir() {
            fs::create_dir_all(&destination)
                .map_err(|error| format!("创建迁移子目录失败：{error}"))?;
            copy_tree_verified(&path, &destination, stats)?;
        } else if metadata.is_file() {
            copy_verified(&path, &destination, stats)?;
        }
    }
    Ok(())
}

fn copy_verified(source: &Path, target: &Path, stats: &mut CopyStats) -> Result<(), String> {
    if source.is_symlink() {
        return Err(format!("迁移中止：不支持符号链接 {}", source.display()));
    }
    let source_size = fs::metadata(source)
        .map_err(|error| format!("读取源文件大小失败：{error}"))?
        .len();
    let parent = target
        .parent()
        .ok_or_else(|| format!("无法确定迁移目标目录：{}", target.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("创建迁移目标目录失败 {}：{error}", parent.display()))?;
    let temp = target.with_file_name(format!(
        ".migration-{}-{}",
        target
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".to_string()),
        Uuid::new_v4()
    ));

    let result = (|| {
        let copy_result = fs::copy(source, &temp);
        if let Err(copy_error) = copy_result {
            if !source_uses_efs(source) {
                return Err(format!(
                    "复制文件失败 {} → {}：{copy_error}",
                    source.display(),
                    target.display()
                ));
            }
            if temp.exists() {
                fs::remove_file(&temp)
                    .map_err(|error| format!("清理 EFS 回退临时文件失败：{error}"))?;
            }
            stream_copy_new(source, &temp)?;
            stats.encryption_fallback_files += 1;
        }

        let target_size = fs::metadata(&temp)
            .map_err(|error| format!("读取迁移临时文件大小失败：{error}"))?
            .len();
        if source_size != target_size || file_sha256(source)? != file_sha256(&temp)? {
            return Err("迁移校验失败：临时文件与源文件不一致。".to_string());
        }
        if target.exists() {
            if !target.is_file() {
                return Err(format!("迁移目标不是文件：{}", target.display()));
            }
            fs::remove_file(target).map_err(|error| format!("替换迁移目标失败：{error}"))?;
        }
        fs::rename(&temp, target).map_err(|error| format!("提交迁移文件失败：{error}"))?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
        return result;
    }

    stats.files += 1;
    stats.bytes = stats.bytes.saturating_add(source_size);
    Ok(())
}

#[cfg(target_os = "windows")]
fn source_uses_efs(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_ENCRYPTED: u32 = 0x0000_4000;
    fs::metadata(path)
        .map(|metadata| metadata.file_attributes() & FILE_ATTRIBUTE_ENCRYPTED != 0)
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn source_uses_efs(_path: &Path) -> bool {
    false
}

fn stream_copy_new(source: &Path, target: &Path) -> Result<(), String> {
    let mut input = File::open(source).map_err(|error| format!("打开源文件失败：{error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| format!("创建迁移临时文件失败：{error}"))?;
    std::io::copy(&mut input, &mut output).map_err(|error| format!("流式复制文件失败：{error}"))?;
    output
        .sync_all()
        .map_err(|error| format!("同步迁移临时文件失败：{error}"))
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("打开校验文件失败：{error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("读取校验文件失败：{error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_sqlite_database(path: &Path) -> Result<(), String> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("无法打开待校验数据库：{error}"))?;
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("SQLite 完整性检查失败：{error}"))?;
    if result != "ok" {
        return Err(format!("SQLite 完整性检查未通过：{result}"));
    }
    Ok(())
}

fn directory_has_entries(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let mut entries =
        fs::read_dir(path).map_err(|error| format!("读取目录 {} 失败：{error}", path.display()))?;
    Ok(entries.next().is_some())
}

fn remove_empty_directory(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if directory_has_entries(path)? {
        return Err(format!("目录不是空的，拒绝覆盖：{}", path.display()));
    }
    fs::remove_dir(path).map_err(|error| format!("无法移除空目录：{error}"))
}

fn combine_warning(first: Option<String>, second: Option<String>) -> Option<String> {
    match (first, second) {
        (Some(first), Some(second)) => Some(format!("{first} {second}")),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn load_config(path: &Path) -> Result<(StorageConfig, Option<String>), String> {
    let backup = backup_path(path);
    if !path.exists() && backup.exists() {
        fs::copy(&backup, path).map_err(|error| format!("恢复数据位置配置失败：{error}"))?;
    }
    if !path.exists() {
        return Ok((StorageConfig::default(), None));
    }
    match fs::read(path)
        .map_err(|error| error.to_string())
        .and_then(|bytes| {
            serde_json::from_slice::<StorageConfig>(&bytes).map_err(|error| error.to_string())
        }) {
        Ok(config) if config.schema_version <= STORAGE_SCHEMA_VERSION => Ok((config, None)),
        Ok(config) => Ok((
            StorageConfig::default(),
            Some(format!(
                "数据位置配置版本 {} 暂不受支持，已使用默认位置。",
                config.schema_version
            )),
        )),
        Err(error) => {
            let invalid =
                path.with_file_name(format!("storage-location.invalid-{}.json", now_timestamp()));
            let _ = fs::rename(path, &invalid);
            Ok((
                StorageConfig::default(),
                Some(format!(
                    "数据位置配置损坏，已保存原文件为 {} 并使用默认位置：{error}",
                    invalid.display()
                )),
            ))
        }
    }
}

fn write_config(path: &Path, config: &StorageConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    }
    write_json_atomic(path, config)
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建目录 {}：{error}", parent.display()))?;
    }
    let temp = path.with_file_name(format!(
        "{}.tmp-{}",
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        Uuid::new_v4()
    ));
    let backup = backup_path(path);
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|error| format!("序列化配置失败：{error}"))?;
    let mut file = match OpenOptions::new().write(true).create_new(true).open(&temp) {
        Ok(file) => file,
        Err(open_error) if path.is_file() => {
            let original =
                fs::read(path).map_err(|error| format!("读取原配置文件失败：{error}"))?;
            let result = write_bytes_in_place(path, &bytes);
            if result.is_err() {
                let _ = write_bytes_in_place(path, &original);
            }
            return result.map_err(|error| {
                format!("无法创建临时配置文件（{open_error}），原位写入也失败：{error}")
            });
        }
        Err(error) => return Err(format!("创建临时配置文件失败：{error}")),
    };
    file.write_all(&bytes)
        .map_err(|error| format!("写入临时配置文件失败：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("同步临时配置文件失败：{error}"))?;
    drop(file);

    if path.exists() {
        let mut source =
            File::open(path).map_err(|error| format!("打开待备份配置文件失败：{error}"))?;
        let mut target = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&backup)
            .map_err(|error| format!("创建配置备份失败：{error}"))?;
        std::io::copy(&mut source, &mut target)
            .map_err(|error| format!("复制配置备份失败：{error}"))?;
        target
            .sync_all()
            .map_err(|error| format!("同步配置备份失败：{error}"))?;
        drop(source);
        drop(target);
        if let Err(remove_error) = fs::remove_file(path) {
            let _ = fs::remove_file(&temp);
            return write_bytes_in_place(path, &bytes).map_err(|write_error| {
                format!("替换配置文件失败（{remove_error}），原位写入也失败：{write_error}")
            });
        }
    }
    if let Err(rename_error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return write_bytes_in_place(path, &bytes)
            .map_err(|error| format!("提交配置失败（{rename_error}），恢复写入也失败：{error}"));
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn write_bytes_in_place(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)
        .map_err(|error| format!("打开原配置文件失败：{error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("写入原配置文件失败：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("同步原配置文件失败：{error}"))
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_file_name(format!(
        "{}.bak",
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        env::temp_dir().join(format!("prompt-forge-data-test-{label}-{}", Uuid::new_v4()))
    }

    fn source_fixture(root: &Path) -> MigrationSource {
        let db = root.join(DATABASE_FILE);
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO settings VALUES ('provider', 'openai');",
        )
        .unwrap();
        drop(conn);
        let webview = root.join("webview-source");
        fs::create_dir_all(webview.join("Local Storage")).unwrap();
        fs::write(webview.join("Local Storage").join("theme"), b"dark").unwrap();
        MigrationSource {
            label: root.to_path_buf(),
            database_path: db,
            webview_dir: webview,
            managed_root: None,
        }
    }

    fn create_database(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO settings VALUES ('provider', 'openai');",
        )
        .unwrap();
    }

    #[test]
    fn copies_verifies_and_removes_source() {
        let root = temp_dir("migrate");
        let target = temp_dir("target");
        fs::create_dir_all(&root).unwrap();
        let source = source_fixture(&root);
        let outcome = migrate_data(&source, &target, "0.10.2").unwrap();
        assert!(outcome.files >= 2);
        assert!(target.join("data").join(DATABASE_FILE).is_file());
        assert!(target.join("webview").join("Local Storage").is_dir());
        assert!(target.join("meta").join(MIGRATION_MARKER).is_file());
        assert_eq!(remove_source_data(&source), None);
        assert!(!source.database_path.exists());
        assert!(!source.webview_dir.exists());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn existing_target_is_not_overwritten() {
        let root = temp_dir("source");
        let target = temp_dir("existing-target");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(target.join("data")).unwrap();
        let source = source_fixture(&root);
        let existing = Connection::open(target.join("data").join(DATABASE_FILE)).unwrap();
        existing
            .execute_batch("CREATE TABLE existing_data (id INTEGER);")
            .unwrap();
        drop(existing);
        let result = migrate_data(&source, &target, "0.10.2");
        assert!(result.is_err());
        assert!(source.database_path.is_file());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn rejects_relative_drive_root_and_install_overlap() {
        let current_root = temp_dir("current");
        let install = temp_dir("install");
        fs::create_dir_all(&current_root).unwrap();
        fs::create_dir_all(&install).unwrap();
        let current = DataPaths::managed(current_root.clone());
        assert!(validate_target_root("relative/path", &current, &install).is_err());
        #[cfg(target_os = "windows")]
        assert!(validate_target_root("D:\\", &current, &install).is_err());
        assert!(validate_target_root(
            &install.join("inside").to_string_lossy(),
            &current,
            &install
        )
        .is_err());
        let _ = fs::remove_dir_all(current_root);
        let _ = fs::remove_dir_all(install);
    }

    #[test]
    fn corrupt_config_falls_back_without_secret_data() {
        let root = temp_dir("config");
        fs::create_dir_all(&root).unwrap();
        let path = root.join(STORAGE_CONFIG_FILE);
        fs::write(&path, b"{not-json").unwrap();
        let (config, warning) = load_config(&path).unwrap();
        assert!(config.active_root.is_none());
        assert!(warning.unwrap().contains("配置损坏"));
        assert!(!path.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_migrates_legacy_data_to_preferred_root() {
        let root = temp_dir("startup");
        let legacy_data = root.join("legacy-data");
        let legacy_webview = root.join("legacy-webview");
        let config_dir = root.join("config");
        let target = root.join("managed-target");
        let install = root.join("install");
        create_database(&legacy_data.join(DATABASE_FILE));
        fs::create_dir_all(legacy_webview.join("Local Storage")).unwrap();
        fs::write(legacy_webview.join("Local Storage").join("theme"), b"light").unwrap();
        fs::create_dir_all(&install).unwrap();

        let result = resolve_startup(
            &AppPaths {
                config_dir: config_dir.clone(),
                legacy_data_dir: legacy_data.clone(),
                legacy_webview_dir: legacy_webview.clone(),
                install_dir: install,
                preferred_root: target.clone(),
            },
            "0.10.2",
        )
        .unwrap();

        assert!(result.paths.database_path.is_file());
        assert!(result
            .paths
            .webview_dir
            .join("Local Storage/theme")
            .is_file());
        assert!(!legacy_data.join(DATABASE_FILE).exists());
        assert!(!legacy_webview.exists());
        assert!(config_dir.join(STORAGE_CONFIG_FILE).is_file());
        assert!(result.warning.unwrap().contains("首次启动"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn completed_marker_does_not_replace_changed_source() {
        let root = temp_dir("completed-recovery");
        let legacy_data = root.join("legacy-data");
        let legacy_webview = root.join("legacy-webview");
        let config_dir = root.join("config");
        let target = root.join("managed-target");
        let install = root.join("install");
        fs::create_dir_all(&legacy_data).unwrap();
        fs::create_dir_all(&install).unwrap();
        let source = source_fixture(&legacy_data);
        fs::create_dir_all(legacy_webview.parent().unwrap()).unwrap();
        fs::rename(&source.webview_dir, &legacy_webview).unwrap();
        let source = MigrationSource {
            label: legacy_data.clone(),
            database_path: legacy_data.join(DATABASE_FILE),
            webview_dir: legacy_webview.clone(),
            managed_root: None,
        };
        migrate_data(&source, &target, "0.10.2").unwrap();

        let config_path = config_path(&config_dir);
        let saved_config_dir = config_dir.clone();
        write_config(
            &config_path,
            &StorageConfig {
                schema_version: STORAGE_SCHEMA_VERSION,
                active_root: None,
                pending_change: Some(PendingChange {
                    target_root: target.to_string_lossy().to_string(),
                    mode: DataRootChangeMode::Migrate,
                    requested_at: now_timestamp(),
                }),
                last_error: None,
                updated_at: now_timestamp(),
            },
        )
        .unwrap();

        assert!(migration_is_complete(&target, &legacy_data));

        let result = resolve_startup(
            &AppPaths {
                config_dir,
                legacy_data_dir: legacy_data.clone(),
                legacy_webview_dir: legacy_webview.clone(),
                install_dir: install,
                preferred_root: target.clone(),
            },
            "0.10.2",
        )
        .unwrap();

        assert!(!result.paths.managed);
        assert!(legacy_data.join(DATABASE_FILE).is_file());
        assert!(legacy_webview.exists());
        let saved = load_config(&config_path).unwrap().0;
        assert!(saved.active_root.is_none());
        assert!(saved.pending_change.is_none());
        assert!(saved
            .last_error
            .as_deref()
            .is_some_and(|error| error.contains("已有 Prompt Forge 数据")));
        assert!(!fs::read_dir(&saved_config_dir)
            .unwrap()
            .flatten()
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with("storage-location.json.tmp-")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_does_not_overwrite_existing_target_data() {
        let root = temp_dir("conflict");
        let legacy_data = root.join("legacy-data");
        let legacy_webview = root.join("legacy-webview");
        let config_dir = root.join("config");
        let target = root.join("managed-target");
        let install = root.join("install");
        create_database(&legacy_data.join(DATABASE_FILE));
        fs::create_dir_all(&legacy_webview).unwrap();
        fs::write(legacy_webview.join("theme"), b"light").unwrap();
        create_database(&target.join("data").join(DATABASE_FILE));
        fs::create_dir_all(&install).unwrap();

        let result = resolve_startup(
            &AppPaths {
                config_dir,
                legacy_data_dir: legacy_data.clone(),
                legacy_webview_dir: legacy_webview.clone(),
                install_dir: install,
                preferred_root: target,
            },
            "0.10.2",
        )
        .unwrap();

        assert!(!result.paths.managed);
        assert!(legacy_data.join(DATABASE_FILE).is_file());
        assert!(result.warning.unwrap().contains("都包含数据"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn fresh_startup_creates_managed_layout() {
        let root = temp_dir("fresh");
        let config_dir = root.join("config");
        let target = root.join("managed-target");
        let install = root.join("install");
        fs::create_dir_all(&install).unwrap();

        let result = resolve_startup(
            &AppPaths {
                config_dir: config_dir.clone(),
                legacy_data_dir: root.join("missing-legacy-data"),
                legacy_webview_dir: root.join("missing-legacy-webview"),
                install_dir: install,
                preferred_root: target.clone(),
            },
            "0.10.2",
        )
        .unwrap();

        assert!(result.paths.managed);
        assert!(result.paths.data_dir.is_dir());
        assert!(result.paths.webview_dir.is_dir());
        assert!(result.paths.meta_dir.is_dir());
        assert!(config_dir.join(STORAGE_CONFIG_FILE).is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pending_change_can_use_existing_data_after_restart() {
        let root = temp_dir("pending-existing");
        let config_dir = root.join("config");
        let legacy_data = root.join("legacy-data");
        let legacy_webview = root.join("legacy-webview");
        let target = root.join("managed-target");
        let install = root.join("install");
        create_database(&legacy_data.join(DATABASE_FILE));
        fs::create_dir_all(&legacy_webview).unwrap();
        fs::write(legacy_webview.join("theme"), b"light").unwrap();
        create_database(&target.join("data").join(DATABASE_FILE));
        fs::create_dir_all(target.join("webview")).unwrap();
        fs::create_dir_all(&install).unwrap();

        let current = DataPaths::legacy(legacy_data.clone(), legacy_webview.clone());
        let status = schedule_change(
            &config_path(&config_dir),
            &current,
            &install,
            &target,
            &DataRootChangeRequest {
                target_root: target.to_string_lossy().to_string(),
                mode: DataRootChangeMode::Existing,
            },
        )
        .unwrap();
        assert!(status.restart_required);
        assert!(status.configured_root.is_none());

        let result = resolve_startup(
            &AppPaths {
                config_dir,
                legacy_data_dir: legacy_data.clone(),
                legacy_webview_dir: legacy_webview,
                install_dir: install,
                preferred_root: target.clone(),
            },
            "0.10.2",
        )
        .unwrap();
        assert!(result.paths.managed);
        assert_eq!(result.paths.root, target.canonicalize().unwrap());
        assert!(legacy_data.join(DATABASE_FILE).is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn interrupted_migration_can_restart_from_source() {
        let root = temp_dir("interrupted");
        let target = temp_dir("interrupted-target");
        fs::create_dir_all(&root).unwrap();
        let source = source_fixture(&root);
        let target_paths = DataPaths::managed(target.clone());
        target_paths.ensure_directories().unwrap();
        write_json_atomic(
            &target_paths.meta_dir.join(MIGRATION_MARKER),
            &MigrationMarker {
                schema_version: STORAGE_SCHEMA_VERSION,
                status: "in_progress".to_string(),
                app_version: "0.10.2".to_string(),
                source: source.label.to_string_lossy().to_string(),
                target: target.to_string_lossy().to_string(),
                started_at: now_timestamp(),
                completed_at: None,
                files: 0,
                bytes: 0,
                source_removed: false,
            },
        )
        .unwrap();
        create_database(&target_paths.data_dir.join(DATABASE_FILE));
        let orphan = target.join(".migration-orphan");
        fs::create_dir_all(orphan.join("partial")).unwrap();
        fs::write(orphan.join("partial/file"), b"incomplete").unwrap();

        let outcome = migrate_data(&source, &target, "0.10.2").unwrap();
        assert!(outcome.files >= 2);
        assert!(!orphan.exists());
        assert!(source.database_path.is_file());
        assert!(target.join("data").join(DATABASE_FILE).is_file());
        assert!(target.join("webview").join("Local Storage/theme").is_file());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn invalid_target_falls_back_to_legacy_paths() {
        let root = temp_dir("invalid-target");
        let legacy_data = root.join("legacy-data");
        let legacy_webview = root.join("legacy-webview");
        let install = root.join("install");
        create_database(&legacy_data.join(DATABASE_FILE));
        fs::create_dir_all(&legacy_webview).unwrap();
        fs::create_dir_all(&install).unwrap();
        let invalid_target = root.join("target-is-a-file");
        fs::write(&invalid_target, b"not a directory").unwrap();

        let result = resolve_startup(
            &AppPaths {
                config_dir: root.join("config"),
                legacy_data_dir: legacy_data.clone(),
                legacy_webview_dir: legacy_webview,
                install_dir: install,
                preferred_root: invalid_target,
            },
            "0.10.2",
        )
        .unwrap();

        assert!(!result.paths.managed);
        assert!(legacy_data.join(DATABASE_FILE).is_file());
        assert!(result.warning.unwrap().contains("回退"));
        let _ = fs::remove_dir_all(root);
    }
}
