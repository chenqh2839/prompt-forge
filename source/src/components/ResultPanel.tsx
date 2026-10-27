import { useState } from "react";
import {
  Clipboard,
  CopyCheck,
  FileTerminal,
  History,
  Paperclip,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import type { PromptVariant, Stage } from "../types";

interface ResultPanelProps {
  prompt: string;
  stage: Stage;
  tokensUsed: number;
  model: string;
  variants: PromptVariant[];
  activeVariantId: string | null;
  onCopy: () => void;
  onCopyAll: () => void;
  onSelectVariant: (variant: PromptVariant) => void;
  onRegenerate: () => void;
  onRevise: (feedback: string) => Promise<boolean>;
  revisionCount: number;
  batchProgress: { current: number; total: number } | null;
  attachmentNames: string[];
  sourceHistoryIds: string[];
  roleDecision: string;
}

export function ResultPanel({
  prompt,
  stage,
  tokensUsed,
  model,
  variants,
  activeVariantId,
  onCopy,
  onCopyAll,
  onSelectVariant,
  onRegenerate,
  onRevise,
  revisionCount,
  batchProgress,
  attachmentNames,
  sourceHistoryIds,
  roleDecision,
}: ResultPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [revising, setRevising] = useState(false);
  const moduleCount = (prompt.match(/^#{1,3}\s/gm) || []).length;
  const estimatedTokens = Math.ceil(prompt.length / 3.2);
  const busy = stage === "analyzing" || stage === "generating";

  const submitRevision = async (instruction = feedback) => {
    const value = instruction.trim();
    if (!value || busy) return;
    setRevising(true);
    const success = await onRevise(value);
    if (success) setFeedback("");
    setRevising(false);
  };

  return (
    <aside className="result-panel">
      <div className="result-heading">
        <div>
          <span className="eyebrow">FINAL ARTIFACT</span>
          <h2>优化提示词</h2>
        </div>
        <span className={`result-state ${prompt ? "ready" : ""}`}>
          <i />
          {prompt ? "READY" : "WAITING"}
        </span>
      </div>

      {roleDecision && (
        <div className="role-decision" role="status">
          <span>角色判断</span>
          <p>{roleDecision}</p>
        </div>
      )}

      {variants.length > 1 && (
        <div className="variant-tabs" aria-label="变量实例">
          {variants.map((variant, index) => (
            <button
              key={variant.id}
              className={variant.id === activeVariantId ? "active" : ""}
              onClick={() => onSelectVariant(variant)}
              title={variant.label}
            >
              <span>{(index + 1).toString().padStart(2, "0")}</span>
              <span className="variant-tab-label">{variant.label}</span>
            </button>
          ))}
        </div>
      )}

      {prompt ? (
        <>
          <div className="artifact-toolbar">
            <button onClick={onCopy}>
              <Clipboard size={14} />
              复制
            </button>
            {variants.length > 1 && (
              <button onClick={onCopyAll}>
                <CopyCheck size={14} />
                复制全部
              </button>
            )}
            <button onClick={onRegenerate} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              重新生成
            </button>
          </div>
          <div className="artifact-body">
            <div className="artifact-codebar">
              <span>prompt.md</span>
              <span>UTF-8</span>
            </div>
            <pre>{prompt}</pre>
          </div>
          <div className="artifact-metrics">
            <div>
              <span>MODULES</span>
              <strong>{moduleCount.toString().padStart(2, "0")}</strong>
            </div>
            <div>
              <span>CHARS</span>
              <strong>{prompt.length}</strong>
            </div>
            <div>
              <span>EST. TOKENS</span>
              <strong>~{estimatedTokens}</strong>
            </div>
          </div>
          <div className="artifact-meta">
            <span>MODEL / {model}</span>
            <span>{tokensUsed ? `API ${tokensUsed} TOKENS` : "LOCAL SAVED"}</span>
          </div>
          {attachmentNames.length > 0 && (
            <div className="artifact-attachments" aria-label="本次已读取的附件">
              <Paperclip size={13} />
              <span>已读取 {attachmentNames.length} 个上下文附件</span>
              <small>{attachmentNames.join(" · ")}</small>
            </div>
          )}
          {sourceHistoryIds.length > 0 && (
            <div className="artifact-attachments artifact-source-history">
              <History size={13} />
              <span>已引用 {sourceHistoryIds.length} 条项目历史</span>
              <small title={sourceHistoryIds.join("\n")}>
                {sourceHistoryIds.join(" · ")}
              </small>
            </div>
          )}
          <div className="prompt-revision-box">
            <div className="prompt-revision-head">
              <span>继续对话 / 要求修改</span>
              {revisionCount > 0 && <small>已迭代 {revisionCount} 次</small>}
            </div>
            <div className="prompt-revision-quick">
              {[
                ["更简洁", "在保留所有必要信息的前提下压缩篇幅。"],
                ["更详细", "补充必要细节，但不添加未提供的虚构事实。"],
                ["更可执行", "强化具体步骤、约束和可验证的验收标准。"],
                ["减少空话", "删除套话和泛泛表述，保留实质内容。"],
              ].map(([label, instruction]) => (
                <button
                  key={label}
                  onClick={() => submitRevision(instruction)}
                  disabled={busy || revising}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="prompt-revision-input">
              <textarea
                aria-label="要求修改提示词"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="指出需要修改的地方，例如：第二段太啰嗦，保留结构但强调截止时间……"
                disabled={busy}
              />
              <button
                onClick={() => submitRevision()}
                disabled={busy || revising || !feedback.trim()}
              >
                {busy || revising ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Send size={13} />
                )}
                发送修改
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-artifact">
          <div className="forge-empty-visual" aria-hidden="true">
            <span className="forge-sheet sheet-back" />
            <span className="forge-sheet sheet-middle" />
            <span className="forge-sheet sheet-front">
              <span>PROMPT</span>
              <i />
              <i />
              <i />
            </span>
            <span className="forge-spark">
              <Sparkles size={17} />
            </span>
          </div>
          <span className="empty-index">NO OUTPUT / YET</span>
          <h3>让好想法拥有清晰结构</h3>
          <p>
            描述目标并回答关键问题，最终提示词会自动组织角色、任务、上下文、约束和输出格式。
          </p>
          <div className="output-modules">
            {["ROLE", "TASK", "CONTEXT", "CONSTRAINTS", "FORMAT"].map(
              (module, index) => (
                <span key={module}>
                  <i>{(index + 1).toString().padStart(2, "0")}</i>
                  {module}
                </span>
              ),
            )}
          </div>
          <div className="empty-next-step">
            <FileTerminal size={14} />
            从左侧输入开始
          </div>
        </div>
      )}

      {stage === "generating" && (
        <div className="generation-overlay">
          <Sparkles size={22} />
          <strong>
            {batchProgress
              ? `正在生成实例 ${batchProgress.current} / ${batchProgress.total}`
              : "正在锻造最终提示词"}
          </strong>
          <span>
            {batchProgress ? "变量已注入，正在结构化输出" : "结构化并校验所有模块"}
          </span>
        </div>
      )}
    </aside>
  );
}
