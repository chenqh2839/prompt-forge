import { useMemo, useState } from "react";
import {
  ArrowRight,
  FolderKanban,
  Inbox,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type {
  HistoryItem,
  MoveHistoryResult,
  ProjectContext,
} from "../types";

const UNFILED_TARGET = "__unfiled__";

interface MoveHistoryDialogProps {
  histories: HistoryItem[];
  projects: ProjectContext[];
  ids: string[];
  onClose: () => void;
  onMove: (
    ids: string[],
    projectId: string | null,
  ) => Promise<MoveHistoryResult>;
}

export function MoveHistoryDialog({
  histories,
  projects,
  ids,
  onClose,
  onMove,
}: MoveHistoryDialogProps) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState<
    MoveHistoryResult["failures"]
  >([]);

  const selected = useMemo(
    () =>
      ids
        .map((id) => histories.find((item) => item.id === id))
        .filter((item): item is HistoryItem => Boolean(item)),
    [histories, ids],
  );

  const originNames = useMemo(() => {
    const names = new Set(
      selected.map(
        (item) =>
          projects.find((project) => project.id === item.projectId)?.name ??
          "未归档",
      ),
    );
    return [...names];
  }, [projects, selected]);

  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
  const visibleProjects = projects.filter((project) =>
    project.name.toLocaleLowerCase("zh-CN").includes(normalizedSearch),
  );
  const showUnfiled =
    !normalizedSearch || "未归档".toLocaleLowerCase("zh-CN").includes(normalizedSearch);
  const targetProject =
    target && target !== UNFILED_TARGET
      ? projects.find((project) => project.id === target) ?? null
      : null;
  const targetName = target === UNFILED_TARGET ? "未归档" : targetProject?.name;
  const alreadyInTarget =
    target !== null &&
    selected.length > 0 &&
    selected.every(
      (item) =>
        (target === UNFILED_TARGET ? null : target) === (item.projectId ?? null),
    );

  const handleMove = async () => {
    if (busy) return;
    if (target === null) {
      setError("请选择目标项目或“未归档”。");
      return;
    }
    if (alreadyInTarget) {
      setError(`所选历史记录已经位于「${targetName}」。`);
      return;
    }
    const confirmed = window.confirm(
      `将从「${originNames.join("、")}」移动到「${targetName}」。原历史记录会保留，不创建副本。是否继续？`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setFailures([]);
    try {
      const result = await onMove(
        ids,
        target === UNFILED_TARGET ? null : target,
      );
      if (result.failures.length > 0) {
        setFailures(result.failures);
        setError(`有 ${result.failures.length} 条历史记录未移动；本次事务未修改任何记录。`);
        return;
      }
      onClose();
    } catch (moveError) {
      setError(
        typeof moveError === "string"
          ? moveError
          : moveError instanceof Error
            ? moveError.message
            : "移动历史记录失败。",
      );
    } finally {
      setBusy(false);
    }
  };

  const projectName = (projectId?: string | null) =>
    projects.find((project) => project.id === projectId)?.name ?? "未归档";
  const titleForId = (id: string) =>
    histories.find((item) => item.id === id)?.title ?? `历史 ID ${id}`;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="template-modal move-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-history-title"
      >
        <div className="modal-head">
          <div>
            <span className="modal-kicker">历史记录 / 移动</span>
            <h2 id="move-history-title">移动历史记录</h2>
            <p>
              已选择 {ids.length} 条记录。移动只更新项目归属，原记录不会删除或复制。
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭移动历史记录窗口"
          >
            <X size={16} />
          </button>
        </div>

        <div className="move-origin-summary">
          <span>当前归属</span>
          <strong>{originNames.join("、")}</strong>
          <ArrowRight size={14} />
          <strong>{targetName ?? "请选择目标"}</strong>
        </div>

        <label className="move-project-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索项目"
            autoFocus
          />
        </label>

        <div className="move-project-list" role="listbox" aria-label="目标项目">
          {showUnfiled && (
            <button
              type="button"
              className={target === UNFILED_TARGET ? "selected" : ""}
              onClick={() => setTarget(UNFILED_TARGET)}
              role="option"
              aria-selected={target === UNFILED_TARGET}
            >
              <Inbox size={15} />
              <span>
                <strong>未归档</strong>
                <small>移出当前项目，保留在本地历史中</small>
              </span>
            </button>
          )}
          {visibleProjects.map((project) => (
            <button
              type="button"
              className={target === project.id ? "selected" : ""}
              key={project.id}
              onClick={() => setTarget(project.id)}
              role="option"
              aria-selected={target === project.id}
            >
              <FolderKanban size={15} />
              <span>
                <strong>{project.name}</strong>
                <small>{project.goal || "暂无项目目标"}</small>
              </span>
            </button>
          ))}
          {!showUnfiled && visibleProjects.length === 0 && (
            <p className="move-empty">没有匹配的项目。</p>
          )}
        </div>

        {selected.length > 0 && (
          <details className="move-selected-list">
            <summary>查看所选记录</summary>
            {selected.map((item) => (
              <p key={item.id}>
                <span>{item.title}</span>
                <small>{projectName(item.projectId)}</small>
              </p>
            ))}
          </details>
        )}

        {error && <div className="move-history-error">{error}</div>}
        {failures.length > 0 && (
          <ul className="move-failure-list">
            {failures.map((failure) => (
              <li key={failure.id}>
                <strong>{titleForId(failure.id)}</strong>
                <span>{failure.reason}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-foot">
          <span>未选择“未归档”时，请指定一个现有项目。</span>
          <div>
            <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleMove}
              disabled={busy || target === null || alreadyInTarget}
            >
              {busy ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
              {busy ? "正在移动" : "确认移动"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
