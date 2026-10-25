import {
  AlertCircle,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  CornerDownLeft,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  ClarificationQuestion,
  ClarificationTurn,
  PromptAttachment,
  Stage,
  TemplateDefinition,
  ProjectContext,
} from "../types";
import { AttachmentPanel } from "./AttachmentPanel";
import { hasImageAttachments } from "../lib/attachments";

interface PromptWorkspaceProps {
  template: TemplateDefinition;
  project: ProjectContext | null;
  backgroundInfo: string;
  setBackgroundInfo: (value: string) => void;
  attachments: PromptAttachment[];
  setAttachments: (attachments: PromptAttachment[]) => void;
  attachmentBusy: boolean;
  setAttachmentBusy: (busy: boolean) => void;
  interactionContextPanel: ReactNode;
  interactionContextReady: boolean;
  visionSupported: boolean;
  model: string;
  keepAttachmentsAfterSubmit: boolean;
  setKeepAttachmentsAfterSubmit: (value: boolean) => void;
  originalPrompt: string;
  setOriginalPrompt: (value: string) => void;
  rounds: ClarificationTurn[];
  currentQuestions: ClarificationQuestion[];
  answers: Record<string, string>;
  setAnswers: (value: Record<string, string>) => void;
  rationale: string;
  stage: Stage;
  error: string;
  onDismissError: () => void;
  onStart: () => void;
  onSubmitAnswers: () => void;
  onNew: () => void;
  onOpenVariableWorkflow: () => void;
  batchProgress: { current: number; total: number } | null;
}

const stageIndex: Record<Stage, number> = {
  idle: 0,
  analyzing: 1,
  clarifying: 1,
  generating: 2,
  complete: 3,
};

export function PromptWorkspace({
  template,
  project,
  backgroundInfo,
  setBackgroundInfo,
  attachments,
  setAttachments,
  attachmentBusy,
  setAttachmentBusy,
  interactionContextPanel,
  interactionContextReady,
  visionSupported,
  model,
  keepAttachmentsAfterSubmit,
  setKeepAttachmentsAfterSubmit,
  originalPrompt,
  setOriginalPrompt,
  rounds,
  currentQuestions,
  answers,
  setAnswers,
  rationale,
  stage,
  error,
  onDismissError,
  onStart,
  onSubmitAnswers,
  onNew,
  onOpenVariableWorkflow,
  batchProgress,
}: PromptWorkspaceProps) {
  const busy = stage === "analyzing" || stage === "generating";
  const activeRound = rounds.length + 1;
  const imageBlocked =
    hasImageAttachments(attachments) && !visionSupported;
  const answeredCount = currentQuestions.filter(
    (question) => answers[question.id]?.trim(),
  ).length;

  return (
    <section className="prompt-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">INTERVIEW STREAM</span>
          <h1>从模糊意图，到精确指令。</h1>
        </div>
        <div className="stage-track" aria-label="优化进度">
          {["原始输入", "智能澄清", "专业输出"].map((label, index) => (
            <span
              key={label}
              className={`stage-step ${
                stageIndex[stage] >= index + 1 ? "reached" : ""
              } ${stageIndex[stage] === index + 1 ? "current" : ""}`}
            >
              <i>{stageIndex[stage] > index + 1 ? <Check size={10} /> : index + 1}</i>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="workspace-mode-bar">
        <button
          className="variable-workflow-trigger"
          onClick={onOpenVariableWorkflow}
          disabled={busy}
        >
          <Braces size={15} />
          <span>
            <strong>变量模板</strong>
            <small>主题、角色与数据多实例生成</small>
          </span>
          <ArrowRight size={14} />
        </button>
        {project && (
          <span className="project-context-pill">
            <i />
            项目上下文：{project.name}
          </span>
        )}
      </div>

      <div className="prompt-background-context">
        <div className="reply-label">
          <Braces size={13} />
          前置背景信息（可选）
          <small>会用于后续提问、生成与修改</small>
        </div>
        <textarea
          aria-label="前置背景信息"
          value={backgroundInfo}
          onChange={(event) => setBackgroundInfo(event.target.value)}
          disabled={busy}
          placeholder="在开始前补充已有背景，例如项目现状、已有决策、受众信息、必须保留的约束或参考资料摘要……"
        />
      </div>

      {interactionContextPanel}

      <AttachmentPanel
        attachments={attachments}
        onChange={setAttachments}
        onBusyChange={setAttachmentBusy}
        disabled={busy || attachmentBusy}
        loading={attachmentBusy}
        visionSupported={visionSupported}
        model={model}
        keepAfterSubmit={keepAttachmentsAfterSubmit}
        onKeepAfterSubmitChange={setKeepAttachmentsAfterSubmit}
      />

      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={onDismissError} aria-label="关闭错误提示">
            <X size={14} />
          </button>
        </div>
      )}

      <article className="input-card">
        <div className="card-kicker">
          <span>
            <span className="pulse-square" />
            RAW INPUT
          </span>
          <span>
            {originalPrompt.length.toString().padStart(3, "0")} CHARS
          </span>
        </div>
        <textarea
          value={originalPrompt}
          onChange={(event) => setOriginalPrompt(event.target.value)}
          disabled={busy}
          placeholder={template.example}
          aria-label="原始提示词"
        />
        <div className="input-footer">
          <div className="template-context">
            <span style={{ color: template.accent }}>●</span>
            当前场景：{template.name}
            {project && (
              <span className="project-inline">
                <span>·</span>
                项目：{project.name}
              </span>
            )}
            {originalPrompt.length === 0 && (
              <button
                className="example-button"
                onClick={() => setOriginalPrompt(template.example)}
              >
                填入示例
              </button>
            )}
          </div>
          <button
            className="primary-button"
            onClick={stage === "complete" ? onNew : onStart}
            disabled={
              busy ||
              attachmentBusy ||
              imageBlocked ||
              !interactionContextReady ||
              (stage !== "complete" && !originalPrompt.trim())
            }
          >
            {busy || attachmentBusy ? (
              <>
                <LoaderCircle className="spin" size={16} />
                {attachmentBusy
                  ? "正在读取附件"
                  : stage === "analyzing"
                    ? "正在识别信息缺口"
                    : batchProgress
                      ? `批量生成 ${batchProgress.current}/${batchProgress.total}`
                      : "正在生成提示词"}
              </>
            ) : stage === "complete" ? (
              <>
                <RotateCcw size={16} />
                开始新任务
              </>
            ) : (
              <>
                <Sparkles size={16} />
                开始分析
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </article>

      {rounds.length > 0 && (
        <details className="answered-rounds">
          <summary>
            <span>
              <Check size={13} />
              已完成 {rounds.length} 轮澄清
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="round-archive">
            {rounds.map((round) => (
              <div className="round-archive-group" key={round.round}>
                <span className="round-label">ROUND {round.round}</span>
                {round.questions.map((question) => (
                  <div className="archive-qa" key={question.id}>
                    <p>{question.question}</p>
                    <span>{round.answers[question.id]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {busy && (
        <div className="thinking-card">
          <div className="thinking-orbit">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>
              {stage === "analyzing"
                ? "正在定位关键信息缺口"
                : batchProgress
                  ? `正在生成第 ${batchProgress.current} / ${batchProgress.total} 个实例`
                  : "正在编排专业提示词"}
            </strong>
            <p>
              {stage === "analyzing"
                ? "分析目的、背景、受众、边界与交付形式……"
                : batchProgress
                  ? "逐项注入变量，并关联当前项目的长期上下文……"
                  : "组装角色、任务、约束、输出格式与质量标准……"}
            </p>
          </div>
          <span className="thinking-code">MODEL / PROCESSING</span>
        </div>
      )}

      {stage === "clarifying" && currentQuestions.length > 0 && (
        <section className="clarification-panel">
          <div className="clarification-head">
            <div className="round-badge">
              <MessageSquareText size={15} />
              ROUND {activeRound}
              <span>/ 05</span>
            </div>
            <div className="answer-progress">
              {answeredCount} / {currentQuestions.length} 已回答
            </div>
          </div>

          {rationale && (
            <div className="ai-rationale">
              <span>AI 判断</span>
              <p>{rationale}</p>
            </div>
          )}

          <div className="question-list">
            {currentQuestions.map((question, index) => (
              <label className="question-card" key={question.id}>
                <span className="question-index">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <span className="question-content">
                  <strong>{question.question}</strong>
                  <span className="question-why">
                    <i>WHY</i>
                    {question.why}
                  </span>
                  <textarea
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [question.id]: event.target.value,
                      })
                    }
                    placeholder="输入你的回答；不确定时可以写“暂不清楚”"
                    disabled={busy}
                  />
                </span>
              </label>
            ))}
          </div>

          <div className="clarification-footer">
            <span>
              <CornerDownLeft size={13} />
              AI 将持续追问，直到信息足够
            </span>
            <button
              className="primary-button"
              onClick={onSubmitAnswers}
              disabled={busy}
            >
              提交本轮回答
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {stage === "idle" && rounds.length === 0 && (
        <div className="idle-prompt">
          <span className="idle-line" />
          <p>
            好的提示词不是一次写成的。先描述你的目标，AI
            会找出真正影响结果的信息缺口。
          </p>
          <span className="idle-line" />
        </div>
      )}

      {stage === "complete" && (
        <div className="completion-note">
          <Check size={15} />
          信息已充分，专业提示词已生成并保存到本地。
        </div>
      )}
    </section>
  );
}
