import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FolderGit2,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { bridge } from "../lib/bridge";
import type {
  CodexContextSelection,
  CodexDiagnostic,
  CodexDiscovery,
  CodexFavorite,
  CodexInjectionPreview,
  CodexPreferences,
  CodexSkillMatch,
  CodexThread,
  CodexWatchStatus,
} from "../types";

interface CodexContextDialogProps {
  originalPrompt: string;
  initialSelection: CodexContextSelection | null;
  onClose: () => void;
  onApply: (selection: CodexContextSelection | null) => void;
}

function errorText(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "未知错误";
}

function dateLabel(value: number) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalDate(value?: number | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function fromDateInput(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function diagnosticText(diagnostic: CodexDiagnostic) {
  return `${diagnostic.code}：${diagnostic.message}`;
}

export function CodexContextDialog({
  originalPrompt,
  initialSelection,
  onClose,
  onApply,
}: CodexContextDialogProps) {
  const [preferences, setPreferences] = useState<CodexPreferences>({
    enabled: initialSelection !== null,
    watchEnabled: false,
  });
  const [watchStatus, setWatchStatus] = useState<CodexWatchStatus>({
    enabled: false,
    changedFiles: 0,
  });
  const [discovery, setDiscovery] = useState<CodexDiscovery | null>(null);
  const [favorites, setFavorites] = useState<CodexFavorite[]>([]);
  const [favoriteName, setFavoriteName] = useState("");
  const [search, setSearch] = useState(initialSelection?.search ?? "");
  const [fromDate, setFromDate] = useState(
    toLocalDate(initialSelection?.fromMs),
  );
  const [toDate, setToDate] = useState(toLocalDate(initialSelection?.toMs));
  const [includeArchived, setIncludeArchived] = useState(
    initialSelection?.includeArchived ?? false,
  );
  const [projectId, setProjectId] = useState(
    initialSelection?.projectId ?? "",
  );
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>(
    initialSelection?.threadIds ?? [],
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(
    initialSelection?.skillIds ?? [],
  );
  const [includeProjectFiles, setIncludeProjectFiles] = useState(
    initialSelection?.includeProjectFiles ?? false,
  );
  const [includeToolOutputs, setIncludeToolOutputs] = useState(
    initialSelection?.includeToolOutputs ?? false,
  );
  const [skillMatches, setSkillMatches] = useState<CodexSkillMatch[]>([]);
  const [useModelRerank, setUseModelRerank] = useState(false);
  const [preview, setPreview] = useState<CodexInjectionPreview | null>(null);
  const [showInjected, setShowInjected] = useState(true);
  const [busy, setBusy] = useState<"load" | "skills" | "preview" | "watch" | "favorite" | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const query = useMemo(
    () => ({
      search,
      fromMs: fromDateInput(fromDate),
      toMs: fromDateInput(toDate, true),
      includeArchived,
    }),
    [fromDate, includeArchived, search, toDate],
  );

  const load = useCallback(async () => {
    if (!preferences.enabled) return;
    setBusy("load");
    setError("");
    try {
      const [nextPreferences, nextDiscovery, nextFavorites, nextWatch] =
        await Promise.all([
          bridge.getCodexPreferences(),
          bridge.discoverCodex(query),
          bridge.listCodexFavorites(),
          bridge.getCodexWatchStatus(),
        ]);
      setPreferences(nextPreferences);
      setDiscovery(nextDiscovery);
      setFavorites(nextFavorites);
      setWatchStatus(nextWatch);
    } catch (loadError) {
      setError(`读取 Codex 数据失败：${errorText(loadError)}`);
    } finally {
      setBusy(null);
    }
  }, [preferences.enabled, query]);

  useEffect(() => {
    void bridge
      .getCodexPreferences()
      .then((value) => {
        setPreferences(value);
        if (value.enabled) {
          return Promise.all([
            bridge.discoverCodex(query),
            bridge.listCodexFavorites(),
            bridge.getCodexWatchStatus(),
          ]).then(([nextDiscovery, nextFavorites, nextWatch]) => {
            setDiscovery(nextDiscovery);
            setFavorites(nextFavorites);
            setWatchStatus(nextWatch);
          });
        }
      })
      .catch((loadError) => {
        setError(`读取 Codex 设置失败：${errorText(loadError)}`);
      });
  }, []);

  useEffect(() => {
    if (!preferences.enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      bridge
        .discoverCodex(query)
        .then((value) => {
          if (!cancelled) {
            setDiscovery(value);
            setError("");
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(`更新 Codex 会话筛选失败：${errorText(loadError)}`);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [preferences.enabled, query]);

  useEffect(() => {
    if (!watchStatus.enabled) return;
    let dispose: (() => void) | undefined;
    void listen("codex-context-updated", () => {
      void load();
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, [load, watchStatus.enabled]);

  const toggleThread = (threadId: string) => {
    setSelectedThreadIds((current) =>
      current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId],
    );
    setPreview(null);
  };

  const matchSkills = async () => {
    if (!originalPrompt.trim()) {
      setError("请先在主输入区填写原始提示词，才能匹配 skills。");
      return;
    }
    setBusy("skills");
    setError("");
    try {
      let result = await bridge.matchCodexSkills(
        originalPrompt,
        selectedThreadIds,
        8,
      );
      if (useModelRerank && result.candidates.length >= 2) {
        result = await bridge.rerankCodexSkills(
          originalPrompt,
          result.candidates,
        );
      }
      setSkillMatches(result.candidates);
      setSelectedSkillIds((current) =>
        current.filter((id) =>
          result.candidates.some((candidate) => candidate.skill.id === id),
        ),
      );
      setMessage(
        result.fallback
          ? result.warning || "模型重排失败，已回退到本地评分。"
          : result.usedModelRerank
            ? "已完成模型重排。"
            : "已完成本地 skills 匹配。",
      );
    } catch (matchError) {
      setError(`匹配 Codex skills 失败：${errorText(matchError)}`);
    } finally {
      setBusy(null);
    }
  };

  const selection: CodexContextSelection = {
    projectId: projectId || null,
    threadIds: selectedThreadIds,
    includeProjectFiles,
    includeToolOutputs,
    includeArchived,
    search,
    fromMs: query.fromMs,
    toMs: query.toMs,
    skillIds: selectedSkillIds,
  };

  const runPreview = async (nextSkillIds = selectedSkillIds) => {
    if (!originalPrompt.trim()) {
      setError("请先在主输入区填写原始提示词。");
      return;
    }
    setBusy("preview");
    setError("");
    try {
      const result = await bridge.previewCodexInjection(originalPrompt, {
        ...selection,
        skillIds: nextSkillIds,
      });
      setPreview(result);
      setShowInjected(true);
      if (nextSkillIds.length === 0) {
        setSelectedSkillIds([]);
        setMessage("已从预览和本次注入中移除 skill 段落。");
      }
    } catch (previewError) {
      setError(`生成 Codex 注入预览失败：${errorText(previewError)}`);
    } finally {
      setBusy(null);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    setBusy("load");
    setError("");
    try {
      const value = await bridge.saveCodexPreferences(enabled);
      setPreferences(value);
      if (enabled) {
        const nextDiscovery = await bridge.discoverCodex(query);
        setDiscovery(nextDiscovery);
      } else {
        if (watchStatus.enabled) {
          const stopped = await bridge.setCodexWatch(false);
          setWatchStatus(stopped);
        }
        setDiscovery(null);
        setPreview(null);
      }
    } catch (preferenceError) {
      setError(`保存 Codex 读取开关失败：${errorText(preferenceError)}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = async () => {
    setBusy("watch");
    setError("");
    try {
      const status = await bridge.setCodexWatch(!watchStatus.enabled);
      setWatchStatus(status);
      setMessage(status.enabled ? "Codex 文件监视已开启。" : "Codex 文件监视已关闭。");
    } catch (watchError) {
      setError(`切换 Codex 文件监视失败：${errorText(watchError)}`);
    } finally {
      setBusy(null);
    }
  };

  const saveFavorite = async () => {
    if (!favoriteName.trim()) {
      setError("请填写收藏名称。");
      return;
    }
    setBusy("favorite");
    setError("");
    try {
      const saved = await bridge.saveCodexFavorite({
        name: favoriteName.trim(),
        projectId: projectId || null,
        threadIds: selectedThreadIds,
        skillIds: selectedSkillIds,
        metadata: {
          search,
          fromMs: query.fromMs,
          toMs: query.toMs,
          includeArchived,
          includeProjectFiles,
          includeToolOutputs,
        },
      });
      setFavorites((current) => [saved, ...current]);
      setFavoriteName("");
      setMessage("已保存项目、会话和 skill 引用，不复制正文。");
    } catch (favoriteError) {
      setError(`保存 Codex 收藏失败：${errorText(favoriteError)}`);
    } finally {
      setBusy(null);
    }
  };

  const loadFavorite = (favorite: CodexFavorite) => {
    const metadata = favorite.metadata as Record<string, unknown>;
    setProjectId(favorite.projectId ?? "");
    setSelectedThreadIds(favorite.threadIds);
    setSelectedSkillIds(favorite.skillIds);
    setSearch(typeof metadata.search === "string" ? metadata.search : "");
    setFromDate(toLocalDate(metadata.fromMs as number | null));
    setToDate(toLocalDate(metadata.toMs as number | null));
    setIncludeArchived(Boolean(metadata.includeArchived));
    setIncludeProjectFiles(Boolean(metadata.includeProjectFiles));
    setIncludeToolOutputs(Boolean(metadata.includeToolOutputs));
    setPreview(null);
    setMessage(`已载入收藏「${favorite.name}」。`);
  };

  const deleteFavorite = async (id: string) => {
    try {
      await bridge.deleteCodexFavorite(id);
      setFavorites((current) => current.filter((item) => item.id !== id));
    } catch (favoriteError) {
      setError(`删除 Codex 收藏失败：${errorText(favoriteError)}`);
    }
  };

  const visibleThreads = discovery?.threads ?? [];
  const selectedSet = new Set(selectedThreadIds);
  const skillSet = new Set(selectedSkillIds);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="codex-context-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Codex 上下文"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">CODEX / LOCAL CONTEXT</span>
            <h2>Codex 项目与会话上下文</h2>
            <p>只读读取 Codex 本地索引，并在发送前显示实际范围。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="codex-context-toolbar">
          <label className="preference-switch codex-master-switch">
            <span>允许 Prompt Forge 读取 Codex 本地上下文</span>
            <input
              type="checkbox"
              checked={preferences.enabled}
              disabled={busy !== null}
              onChange={(event) => void setEnabled(event.target.checked)}
            />
          </label>
          {preferences.enabled && (
            <div className="codex-watch-control">
              <button
                className="secondary-button"
                onClick={() => void toggleWatch()}
                disabled={busy !== null}
              >
                {busy === "watch" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                {watchStatus.enabled ? "关闭文件监视" : "开启文件监视"}
              </button>
              <small>
                {watchStatus.enabled
                  ? "监视已开启，仅在本次应用运行期间运行。"
                  : "默认关闭；关闭后不保留监视线程。"}
              </small>
            </div>
          )}
        </div>

        {!preferences.enabled ? (
          <div className="codex-context-empty">
            默认关闭读取。开启后只会在你选择项目或会话时读取对应本地文件。
          </div>
        ) : (
          <>
            <div className="codex-filter-grid">
              <label>
                <span>
                  <Search size={14} />
                  搜索会话
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="标题、cwd 或 compaction 摘要"
                />
              </label>
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </label>
              <label className="codex-check-line">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                />
                包含归档会话
              </label>
            </div>

            <div className="codex-project-row">
              <label>
                <span>
                  <FolderGit2 size={14} />
                  Codex 项目
                </span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">不指定 / 使用会话关联</option>
                  {discovery?.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="codex-check-line">
                <input
                  type="checkbox"
                  checked={includeProjectFiles}
                  onChange={(event) =>
                    setIncludeProjectFiles(event.target.checked)
                  }
                />
                读取项目文本文件
              </label>
              <label className="codex-check-line">
                <input
                  type="checkbox"
                  checked={includeToolOutputs}
                  onChange={(event) =>
                    setIncludeToolOutputs(event.target.checked)
                  }
                />
                高级：允许工具输出
              </label>
            </div>

            <div className="codex-source-layout">
              <section className="codex-thread-list">
                <div className="codex-section-head">
                  <span>会话 {visibleThreads.length}</span>
                  <button
                    className="icon-button"
                    onClick={() => void load()}
                    disabled={busy !== null}
                    aria-label="刷新 Codex 会话"
                  >
                    <RefreshCw
                      className={busy === "load" ? "spin" : ""}
                      size={14}
                    />
                  </button>
                </div>
                {visibleThreads.map((thread: CodexThread) => (
                  <label
                    className={`codex-thread-option ${
                      selectedSet.has(thread.id) ? "selected" : ""
                    }`}
                    key={thread.id}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(thread.id)}
                      onChange={() => toggleThread(thread.id)}
                    />
                    <span>
                      <strong>{thread.title || "未命名会话"}</strong>
                      <small>
                        {dateLabel(thread.updatedAt)} · {thread.rolloutFormat} ·{" "}
                        {thread.indexStatus}
                      </small>
                      <small className="codex-path">{thread.cwd}</small>
                      <span className={`codex-association ${thread.association.level}`}>
                        {Math.round(thread.association.confidence * 100)}% ·{" "}
                        {thread.association.reasons.join("；")}
                      </span>
                    </span>
                  </label>
                ))}
                {!visibleThreads.length && (
                  <div className="codex-context-empty">没有符合筛选条件的会话。</div>
                )}
              </section>

              <section className="codex-skill-panel">
                <div className="codex-section-head">
                  <span>
                    <Sparkles size={14} />
                    Skills
                  </span>
                  <button
                    className="secondary-button"
                    onClick={() => void matchSkills()}
                    disabled={busy !== null}
                  >
                    {busy === "skills" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    匹配
                  </button>
                </div>
                <label className="codex-check-line">
                  <input
                    type="checkbox"
                    checked={useModelRerank}
                    onChange={(event) => setUseModelRerank(event.target.checked)}
                  />
                  使用模型重排前 5–8 个候选（失败自动回退）
                </label>
                {skillMatches.map((candidate) => (
                  <label className="codex-skill-option" key={candidate.skill.id}>
                    <input
                      type="checkbox"
                      checked={skillSet.has(candidate.skill.id)}
                      onChange={() =>
                        setSelectedSkillIds((current) =>
                          current.includes(candidate.skill.id)
                            ? current.filter((id) => id !== candidate.skill.id)
                            : [...current, candidate.skill.id],
                        )
                      }
                    />
                    <span>
                      <strong>{candidate.skill.name}</strong>
                      <small>{candidate.reason}</small>
                      <code>{candidate.confidence}</code>
                    </span>
                  </label>
                ))}
                {!skillMatches.length && (
                  <div className="codex-context-empty">
                    没有自动插入 skill。填写任务后可手动匹配。
                  </div>
                )}
              </section>
            </div>

            <div className="codex-preview-actions">
              <button
                className="secondary-button"
                onClick={() => void runPreview()}
                disabled={busy !== null}
              >
                {busy === "preview" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Eye size={14} />
                )}
                预览实际注入
              </button>
              <button
                className="secondary-button"
                onClick={() => void runPreview([])}
                disabled={busy !== null || !selectedSkillIds.length}
              >
                <Trash2 size={14} />
                一键移除 skill 段落
              </button>
              <div className="codex-favorite-save">
                <input
                  value={favoriteName}
                  onChange={(event) => setFavoriteName(event.target.value)}
                  placeholder="收藏名称"
                />
                <button
                  className="secondary-button"
                  onClick={() => void saveFavorite()}
                  disabled={busy !== null || !selectedThreadIds.length}
                >
                  <BookmarkPlus size={14} />
                  保存组合
                </button>
              </div>
            </div>

            {preview && (
              <section className="codex-preview-panel">
                <div className="codex-section-head">
                  <span>注入预览</span>
                  <button
                    className="secondary-button"
                    onClick={() => setShowInjected((value) => !value)}
                  >
                    {showInjected ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showInjected ? "查看原文" : "查看注入后"}
                  </button>
                </div>
                <pre>
                  {showInjected
                    ? preview.injectedPrompt
                    : preview.originalPrompt}
                </pre>
                {preview.contextText && (
                  <details>
                    <summary>查看将发送给模型的 Codex 背景</summary>
                    <pre>{preview.contextText}</pre>
                  </details>
                )}
                <div className="codex-read-manifest">
                  {preview.filesRead.map((file) => (
                    <span key={file.path}>
                      <Check size={12} />
                      {file.path} · {file.includedChars} 字符
                      {file.omitted ? " · 已截断" : ""}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {favorites.length > 0 && (
              <section className="codex-favorites">
                <div className="codex-section-head">
                  <span>
                    <Bookmark size={14} />
                    收藏组合
                  </span>
                </div>
                {favorites.map((favorite) => (
                  <div className="codex-favorite-row" key={favorite.id}>
                    <button onClick={() => loadFavorite(favorite)}>
                      {favorite.name}
                      <small>
                        {favorite.threadIds.length} 个会话 ·{" "}
                        {favorite.skillIds.length} 个 skills
                      </small>
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => void deleteFavorite(favorite.id)}
                      aria-label={`删除收藏 ${favorite.name}`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {(discovery?.diagnostics.length ?? 0) > 0 && (
          <div className="codex-diagnostics">
            <AlertTriangle size={14} />
            <div>
              {discovery?.diagnostics.map((item) => (
                <span key={`${item.code}-${item.message}`}>
                  {diagnosticText(item)}
                </span>
              ))}
            </div>
          </div>
        )}

        {(message || error) && (
          <div className={`connection-message ${error ? "error" : "success"}`}>
            {message || error}
          </div>
        )}

        <div className="modal-foot">
          <button className="danger-text" onClick={() => onApply(null)}>
            清除已应用上下文
          </button>
          <div>
            <button className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              onClick={() =>
                onApply(
                  preferences.enabled &&
                    (selectedThreadIds.length ||
                      includeProjectFiles ||
                      selectedSkillIds.length)
                    ? selection
                    : null,
                )
              }
            >
              应用本次上下文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
