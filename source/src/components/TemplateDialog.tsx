import { useEffect, useState } from "react";
import {
  LoaderCircle,
  Palette,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { TemplateDefinition, TemplateInput } from "../types";

interface TemplateDialogProps {
  template?: TemplateDefinition;
  onClose: () => void;
  onSave: (input: TemplateInput) => Promise<void>;
  onDelete: (template: TemplateDefinition) => Promise<void>;
}

const accents = [
  "#b99aff",
  "#70e1b6",
  "#7ca7ff",
  "#ffb86b",
  "#ff8fa8",
  "#75d5e8",
];

function errorText(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "未知错误";
}

export function TemplateDialog({
  template,
  onClose,
  onSave,
  onDelete,
}: TemplateDialogProps) {
  const [draft, setDraft] = useState<TemplateInput>({
    id: template?.id,
    name: template?.name ?? "",
    description: template?.description ?? "",
    focus: template?.focus ?? "",
    accent: template?.accent ?? accents[0],
    example: template?.example ?? "",
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

  const update = (field: keyof TemplateInput, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError("请输入场景名称。");
      return;
    }
    if (!draft.description.trim()) {
      setError("请填写一句简短的场景说明。");
      return;
    }
    if (!draft.focus.trim()) {
      setError("请说明 AI 在这个场景中应重点关注什么。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        focus: draft.focus.trim(),
        example: draft.example.trim(),
      });
    } catch (saveError) {
      setError(`保存失败：${errorText(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (
      !window.confirm(
        `删除自定义场景“${template.name}”？已有历史记录不会被删除。`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await onDelete(template);
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
        className="template-modal"
        role="dialog"
        aria-modal="true"
        aria-label={template ? "编辑自定义场景" : "新建自定义场景"}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">SCENE PROFILE / CUSTOM</span>
            <h2>{template ? "编辑自定义场景" : "新建自定义场景"}</h2>
            <p>
              场景说明会作为领域上下文交给 AI，用于决定追问重点和最终质量标准。
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div
          className="template-preview"
          style={
            {
              "--template-accent": draft.accent,
            } as React.CSSProperties
          }
        >
          <span className="template-preview-icon">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>{draft.name || "你的场景名称"}</strong>
            <small>{draft.description || "一句话解释这个场景适合什么任务"}</small>
          </span>
          <i>CUSTOM</i>
        </div>

        <div className="template-form">
          <label>
            <span>场景名称</span>
            <input
              value={draft.name}
              maxLength={30}
              onChange={(event) => update("name", event.target.value)}
              placeholder="例如：产品需求评审"
              autoFocus
            />
          </label>
          <label>
            <span>简短说明</span>
            <input
              value={draft.description}
              maxLength={80}
              onChange={(event) => update("description", event.target.value)}
              placeholder="例如：把零散想法整理成可评审的需求"
            />
          </label>
          <label>
            <span>
              AI 重点澄清内容
              <em>{draft.focus.length}/1000</em>
            </span>
            <textarea
              value={draft.focus}
              maxLength={1000}
              onChange={(event) => update("focus", event.target.value)}
              placeholder="说明 AI 应优先了解哪些背景、受众、约束和质量标准。例如：先澄清业务目标、用户角色、范围边界、验收标准与发布形式……"
            />
          </label>
          <label>
            <span>输入示例（可选）</span>
            <textarea
              className="short-textarea"
              value={draft.example}
              maxLength={500}
              onChange={(event) => update("example", event.target.value)}
              placeholder="用于输入框中的占位示例"
            />
          </label>
          <div className="accent-picker">
            <span>
              <Palette size={13} />
              识别色
            </span>
            <div>
              {accents.map((accent) => (
                <button
                  type="button"
                  key={accent}
                  className={draft.accent === accent ? "active" : ""}
                  style={{ "--swatch": accent } as React.CSSProperties}
                  onClick={() => update("accent", accent)}
                  aria-label={`选择颜色 ${accent}`}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <div className="connection-message error">{error}</div>}

        <div className="modal-foot">
          {template ? (
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
              删除场景
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
              {template ? "保存修改" : "创建场景"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
