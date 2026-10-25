import { useEffect, useState } from "react";
import {
  BookOpenText,
  Clapperboard,
  LoaderCircle,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type { ProjectContext, ProjectInput } from "../types";

interface ProjectDialogProps {
  project?: ProjectContext;
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
  onDelete: (project: ProjectContext) => Promise<void>;
}

function errorText(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "未知错误";
}

export function ProjectDialog({
  project,
  onClose,
  onSave,
  onDelete,
}: ProjectDialogProps) {
  const [draft, setDraft] = useState<ProjectInput>({
    id: project?.id,
    name: project?.name ?? "",
    goal: project?.goal ?? "",
    style: project?.style ?? "",
    characters: project?.characters ?? "",
    historyContext: project?.historyContext ?? "",
    materials: project?.materials ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const update = (field: keyof ProjectInput, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError("请输入项目名称。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
      });
    } catch (saveError) {
      setError(`保存失败：${errorText(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (
      !window.confirm(
        `删除项目“${project.name}”？已生成的历史提示词不会被删除。`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await onDelete(project);
    } catch (deleteError) {
      setError(`删除失败：${errorText(deleteError)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="template-modal project-modal"
        role="dialog"
        aria-modal="true"
        aria-label={project ? "编辑项目" : "新建项目"}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">PROJECT CONTEXT / 03</span>
            <h2>{project ? "编辑项目" : "新建项目"}</h2>
            <p>
              项目上下文会在每次分析与变量实例生成时被引用，并随历史记录关联保存。
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="project-form">
          <label className="project-name-field">
            <span>
              <Clapperboard size={14} />
              项目名称
            </span>
            <input
              value={draft.name}
              maxLength={50}
              onChange={(event) => update("name", event.target.value)}
              placeholder="例如：品牌短剧第二季"
              autoFocus
            />
          </label>

          <label>
            <span>
              <BookOpenText size={14} />
              项目目标
            </span>
            <textarea
              value={draft.goal}
              maxLength={4000}
              onChange={(event) => update("goal", event.target.value)}
              placeholder="这个项目最终要完成什么？面向谁？"
            />
          </label>

          <div className="project-form-grid">
            <label>
              <span>风格</span>
              <textarea
                value={draft.style}
                maxLength={2000}
                onChange={(event) => update("style", event.target.value)}
                placeholder="语气、视觉、叙事节奏、品牌规范……"
              />
            </label>
            <label>
              <span>
                <UsersRound size={14} />
                角色
              </span>
              <textarea
                value={draft.characters}
                maxLength={3000}
                onChange={(event) => update("characters", event.target.value)}
                placeholder="角色关系、性格、外观、称呼……"
              />
            </label>
          </div>

          <label>
            <span>历史对话与已定决策</span>
            <textarea
              value={draft.historyContext}
              maxLength={8000}
              onChange={(event) =>
                update("historyContext", event.target.value)
              }
              placeholder="粘贴前情提要、历史讨论或已经确认过的事项"
            />
          </label>

          <label>
            <span>素材</span>
            <textarea
              value={draft.materials}
              maxLength={8000}
              onChange={(event) => update("materials", event.target.value)}
              placeholder="粘贴脚本片段、产品资料、参考链接说明或其他事实材料"
            />
          </label>
        </div>

        {error && <div className="connection-message error">{error}</div>}

        <div className="modal-foot">
          {project ? (
            <button
              className="danger-text template-delete-button"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <LoaderCircle className="spin" size={13} />
              ) : (
                <Trash2 size={13} />
              )}
              删除项目
            </button>
          ) : (
            <span />
          )}
          <div>
            <button className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <LoaderCircle className="spin" size={14} />}
              {project ? "保存修改" : "创建项目"}
            </button>
          </div>
        </div>

        <div className="token-warning">
          CONTEXT NOTICE：项目上下文会在每次模型调用时重复发送，请避免粘贴无关的大量文本。
        </div>
      </div>
    </div>
  );
}
