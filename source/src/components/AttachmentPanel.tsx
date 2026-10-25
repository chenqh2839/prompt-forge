import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  formatFileSize,
  readAttachmentFiles,
} from "../lib/attachments";
import type { PromptAttachment } from "../types";

interface AttachmentPanelProps {
  attachments: PromptAttachment[];
  onChange: (attachments: PromptAttachment[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
  loading: boolean;
  visionSupported: boolean;
  model: string;
  keepAfterSubmit: boolean;
  onKeepAfterSubmitChange: (value: boolean) => void;
}

export function AttachmentPanel({
  attachments,
  onChange,
  onBusyChange,
  disabled,
  loading,
  visionSupported,
  model,
  keepAfterSubmit,
  onKeepAfterSubmitChange,
}: AttachmentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState("");
  const working = processing || loading;

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || working) return;
      setProcessing(true);
      onBusyChange(true);
      setNotice("");
      try {
        const result = await readAttachmentFiles(files, attachments);
        onChange(result.attachments);
        if (result.errors.length) {
          setNotice(result.errors.slice(0, 2).join(" "));
        }
      } finally {
        setProcessing(false);
        onBusyChange(false);
      }
    },
    [attachments, onChange, onBusyChange, working],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (!files.length || disabled || working) return;
      event.preventDefault();
      void addFiles(files);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addFiles, disabled, working]);

  const images = attachments.filter(
    (attachment) => attachment.kind === "image",
  );
  const imageBlocked = images.length > 0 && !visionSupported;

  return (
    <section
      className={`attachment-panel ${dragActive ? "drag-active" : ""}`}
      aria-label="上下文附件"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (!disabled) void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        className="attachment-file-input"
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        aria-label="选择上下文附件"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="attachment-panel-head">
        <div>
          <span className="attachment-title">
            <Paperclip size={14} />
            上下文附件
            {attachments.length > 0 && (
              <i>已附加 {attachments.length} 个文件</i>
            )}
          </span>
          <small>支持拖拽、粘贴图片，或读取 PDF / Word / 文本内容</small>
        </div>
        <button
          type="button"
          className="attachment-add-button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || working || attachments.length >= MAX_ATTACHMENTS}
        >
          {working ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Upload size={14} />
          )}
          {working ? "正在读取" : "添加文件"}
        </button>
      </div>

      {attachments.length > 0 && (
        <div className="attachment-grid">
          {attachments.map((attachment) => (
            <article className="attachment-card" key={attachment.id}>
              {attachment.kind === "image" ? (
                <img
                  src={attachment.previewUrl ?? attachment.content}
                  alt={attachment.name}
                />
              ) : (
                <span className="attachment-document-icon" aria-hidden="true">
                  <FileText size={21} />
                </span>
              )}
              <span className="attachment-copy">
                <strong title={attachment.name}>{attachment.name}</strong>
                <small>
                  {attachment.kind === "image" ? "图片" : "已提取文本"} ·{" "}
                  {formatFileSize(attachment.size)}
                  {attachment.truncated ? " · 已截断" : ""}
                </small>
              </span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() =>
                  onChange(attachments.filter((item) => item.id !== attachment.id))
                }
                disabled={disabled || working}
                aria-label={`删除附件 ${attachment.name}`}
                title="删除附件"
              >
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      )}

      {imageBlocked && (
        <div className="attachment-warning" role="alert">
          <AlertTriangle size={14} />
          <span>
            当前模型 <strong>{model}</strong>{" "}
            未确认支持图片输入。请切换至视觉模型或移除图片；图片不会被静默丢弃。
          </span>
        </div>
      )}
      {images.length > 0 && visionSupported && (
        <div className="attachment-support">
          <ImageIcon size={13} />
          已识别视觉模型，图片将以 image_url 随请求发送
        </div>
      )}
      {notice && (
        <div className="attachment-notice" role="status">
          {notice}
        </div>
      )}
      {attachments.length === 0 && (
        <div className="attachment-empty">
          <Paperclip size={14} />
          将文件拖到这里，图片也可以直接粘贴
        </div>
      )}
      <div className="attachment-privacy">
        <ShieldCheck size={12} />
        文件仅在本机读取；发送给模型时按需上传，不会进入其他第三方服务。
        <label className="attachment-retention">
          <input
            type="checkbox"
            checked={keepAfterSubmit}
            onChange={(event) => onKeepAfterSubmitChange(event.target.checked)}
            disabled={disabled}
          />
          完成后保留附件
        </label>
      </div>
    </section>
  );
}
