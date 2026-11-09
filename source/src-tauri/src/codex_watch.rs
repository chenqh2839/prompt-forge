use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexWatchStatus {
    pub enabled: bool,
    pub changed_files: usize,
}

struct WatchSession {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct CodexWatchController {
    session: Mutex<Option<WatchSession>>,
}

impl CodexWatchController {
    pub fn status(&self) -> CodexWatchStatus {
        let enabled = self
            .session
            .lock()
            .map(|session| session.is_some())
            .unwrap_or(false);
        CodexWatchStatus {
            enabled,
            changed_files: 0,
        }
    }

    pub fn start(&self, home: PathBuf, app: AppHandle) -> Result<CodexWatchStatus, String> {
        self.stop()?;
        self.start_with_interval(home, Duration::from_secs(2), move |changed| {
            let _ = app.emit("codex-context-updated", changed);
        })?;
        Ok(CodexWatchStatus {
            enabled: true,
            changed_files: 0,
        })
    }

    fn start_with_interval<F>(
        &self,
        home: PathBuf,
        interval: Duration,
        callback: F,
    ) -> Result<(), String>
    where
        F: Fn(usize) + Send + 'static,
    {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let handle = thread::Builder::new()
            .name("prompt-forge-codex-watch".to_string())
            .spawn(move || {
                let mut previous = collect_snapshot(&home);
                while !thread_stop.load(Ordering::Relaxed) {
                    thread::sleep(interval);
                    if thread_stop.load(Ordering::Relaxed) {
                        break;
                    }
                    let current = collect_snapshot(&home);
                    if current != previous {
                        let changed = changed_file_count(&previous, &current);
                        previous = current;
                        callback(changed);
                    }
                }
            })
            .map_err(|error| format!("PF-CX-014 无法启动 Codex 文件监视：{error}"))?;
        let mut session = self
            .session
            .lock()
            .map_err(|_| "PF-CX-014 文件监视状态不可用。".to_string())?;
        *session = Some(WatchSession { stop, handle });
        Ok(())
    }

    pub fn stop(&self) -> Result<CodexWatchStatus, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "PF-CX-014 文件监视状态不可用。".to_string())?
            .take();
        if let Some(session) = session {
            session.stop.store(true, Ordering::Relaxed);
            if session.handle.join().is_err() {
                return Err("PF-CX-014 文件监视线程异常结束。".to_string());
            }
        }
        Ok(CodexWatchStatus {
            enabled: false,
            changed_files: 0,
        })
    }
}

impl Drop for CodexWatchController {
    fn drop(&mut self) {
        if let Ok(session) = self.session.get_mut() {
            if let Some(session) = session.take() {
                session.stop.store(true, Ordering::Relaxed);
                let _ = session.handle.join();
            }
        }
    }
}

fn modified_ns(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .min(i64::MAX as u128) as i64
}

fn collect_snapshot(home: &Path) -> HashMap<PathBuf, (u64, i64)> {
    let mut snapshot = HashMap::new();
    let sessions = home.join("sessions");
    if sessions.is_dir() {
        for entry in WalkDir::new(&sessions)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy();
            if !(name.ends_with(".jsonl") || name.ends_with(".jsonl.zst")) {
                continue;
            }
            if let Ok(metadata) = entry.metadata() {
                snapshot.insert(
                    entry.path().to_path_buf(),
                    (metadata.len(), modified_ns(&metadata)),
                );
            }
        }
    }
    if let Ok(entries) = fs::read_dir(home) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("sqlite") {
                continue;
            }
            if let Ok(metadata) = entry.metadata() {
                snapshot.insert(path, (metadata.len(), modified_ns(&metadata)));
            }
        }
    }
    snapshot
}

fn changed_file_count(
    previous: &HashMap<PathBuf, (u64, i64)>,
    current: &HashMap<PathBuf, (u64, i64)>,
) -> usize {
    previous
        .keys()
        .chain(current.keys())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .filter(|path| previous.get(*path) != current.get(*path))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn watcher_detects_append_and_stops_cleanly() {
        let home =
            std::env::temp_dir().join(format!("prompt-forge-watch-{}", uuid::Uuid::new_v4()));
        let sessions = home.join("sessions").join("2026").join("11").join("09");
        fs::create_dir_all(&sessions).unwrap();
        let file = sessions.join("rollout.jsonl");
        fs::write(&file, "{}\n").unwrap();
        let controller = CodexWatchController::default();
        let (tx, rx) = mpsc::channel();
        let home_for_thread = home.clone();
        controller
            .start_with_interval(home_for_thread, Duration::from_millis(40), move |changed| {
                let _ = tx.send(changed);
            })
            .unwrap();
        thread::sleep(Duration::from_millis(120));
        fs::write(&file, "{}\n{\"type\":\"event_msg\"}\n").unwrap();
        let changed = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(changed >= 1);
        let status = controller.stop().unwrap();
        assert!(!status.enabled);
        assert!(controller
            .session
            .lock()
            .map(|session| session.is_none())
            .unwrap_or(false));
        let _ = fs::remove_dir_all(home);
    }
}
