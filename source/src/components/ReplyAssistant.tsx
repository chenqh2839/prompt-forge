import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  CornerDownLeft,
  LoaderCircle,
  MessageCircleReply,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { bridge } from "../lib/bridge";
import type {
  ClarificationQuestion,
  ClarificationTurn,
  ProjectContext,
  ReplyAnalysis,
  ReplyOption,
  Stage,
} from "../types";

interface ReplyAssistantProps {
  project: ProjectContext | null;
  model: string;
  onExit: () => void;
  onOpenSettings: () => void;
  onToast: (message: string) => void;
}

const identities = [
  { value: "朋友或熟人", hint: "轻松自然" },
  { value: "家人", hint: "亲近照顾" },
  { value: "同事", hint: "专业协作" },
  { value: "上级或老师", hint: "尊重清晰" },
  { value: "客户或合作方", hint: "稳妥得体" },
  { value: "伴侣", hint: "真诚体贴" },
  { value: "其他", hint: "自行填写" },
];

function readableError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请重试。";
}

export function ReplyAssistant({
  project,
  model,
  onExit,
  onOpenSettings,
  onToast,
}: ReplyAssistantProps) {
  const [message, setMessage] = useState("");
  const [conversationMode, setConversationMode] = useState<
    "reply" | "compose"
  >("reply");
  const [senderIdentity, setSenderIdentity] = useState("朋友或熟人");
  const [customIdentity, setCustomIdentity] = useState("");
  const [backgroundInfo, setBackgroundInfo] = useState("");
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [revisionCount, setRevisionCount] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [rounds, setRounds] = useState<ClarificationTurn[]>([]);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rationale, setRationale] = useState("");
  const [replies, setReplies] = useState<ReplyOption[]>([]);
  const [error, setError] = useState("");
  const [tokensUsed, setTokensUsed] = useState(0);

  const busy = stage === "analyzing" || stage === "generating";
  const resolvedIdentity =
    senderIdentity === "其他"
      ? customIdentity.trim() || "身份未说明的人"
      : senderIdentity;
  const isComposeMode = conversationMode === "compose";

  const projectPayload = project
    ? {
        name: project.name,
        goal: project.goal,
        style: project.style,
        characters: project.characters,
        historyContext: project.historyContext,
        materials: project.materials,
      }
    : undefined;

  const runAnalysis = async (
    transcriptRounds: ClarificationTurn[],
    forceGenerate = false,
  ) => {
    if (!message.trim()) {
      setError("请先粘贴收到的消息。");
      return;
    }
    if (!isComposeMode && senderIdentity === "其他" && !customIdentity.trim()) {
      setError("请填写发送者的具体身份。");
      return;
    }
    setError("");
    setStage(forceGenerate ? "generating" : "analyzing");
    try {
      const result: ReplyAnalysis = await bridge.analyzeReply({
        message,
        senderIdentity: isComposeMode ? "" : resolvedIdentity,
        conversationMode,
        backgroundContext: backgroundInfo.trim() || undefined,
        ...(projectPayload ? { projectContext: projectPayload } : {}),
        rounds: transcriptRounds.map((round) => ({
          round: round.round,
          turns: round.questions.map((question) => ({
            question: question.question,
            why: question.why,
            answer: round.answers[question.id] ?? "",
          })),
        })),
        forceGenerate,
      });
      setRationale(result.rationale);
      setTokensUsed((current) => current + (result.tokensUsed ?? 0));
      if (result.action === "complete") {
        if (!result.replies.length) {
          throw new Error("模型没有返回可用的回复话术。");
        }
        setReplies(result.replies);
        setQuestions([]);
        setStage("complete");
        return;
      }
      if (!result.questions.length) {
        throw new Error("模型没有返回澄清问题。");
      }
      setQuestions(result.questions.slice(0, 5));
      setAnswers(
        Object.fromEntries(
          result.questions
            .slice(0, 5)
            .map((question) => [question.id, ""]),
        ),
      );
      setStage("clarifying");
    } catch (analysisError) {
      setStage(transcriptRounds.length ? "clarifying" : "idle");
      setError(`分析失败：${readableError(analysisError)}`);
    }
  };

  const handleStart = async () => {
    setRounds([]);
    setQuestions([]);
    setAnswers({});
    setReplies([]);
    setRationale("");
    setTokensUsed(0);
    setRevisionFeedback("");
    setRevisionCount(0);
    await runAnalysis([]);
  };

  const handleSubmitAnswers = async () => {
    if (questions.some((question) => !answers[question.id]?.trim())) {
      setError("请回答本轮所有问题；不确定时可以填写“暂不清楚”。");
      return;
    }
    const nextRound: ClarificationTurn = {
      round: rounds.length + 1,
      questions,
      answers: { ...answers },
    };
    const transcript = [...rounds, nextRound];
    setRounds(transcript);
    await runAnalysis(transcript);
  };

  const handleRegenerate = async () => {
    if (!message.trim()) return;
    setError("");
    setStage("generating");
    try {
      const result = await bridge.analyzeReply({
        message,
        senderIdentity: isComposeMode ? "" : resolvedIdentity,
        conversationMode,
        backgroundContext: backgroundInfo.trim() || undefined,
        ...(projectPayload ? { projectContext: projectPayload } : {}),
        rounds: rounds.map((round) => ({
          round: round.round,
          turns: round.questions.map((question) => ({
            question: question.question,
            why: question.why,
            answer: round.answers[question.id] ?? "",
          })),
        })),
        forceGenerate: true,
      });
      if (!result.replies.length) {
        throw new Error("模型没有返回可用的回复话术。");
      }
      setReplies(result.replies);
      setRationale(result.rationale);
      setTokensUsed((current) => current + (result.tokensUsed ?? 0));
      setRevisionCount(0);
      setStage("complete");
    } catch (regenerateError) {
      setStage("complete");
      setError(`重新生成失败：${readableError(regenerateError)}`);
    }
  };

  const handleNew = () => {
    setMessage("");
    setRounds([]);
    setQuestions([]);
    setAnswers({});
    setReplies([]);
    setRationale("");
    setStage("idle");
    setError("");
    setTokensUsed(0);
    setBackgroundInfo("");
    setRevisionFeedback("");
    setRevisionCount(0);
  };

  const switchConversationMode = (mode: "reply" | "compose") => {
    if (mode === conversationMode) return;
    setConversationMode(mode);
    setMessage("");
    setRounds([]);
    setQuestions([]);
    setAnswers({});
    setReplies([]);
    setRationale("");
    setError("");
    setStage("idle");
    setRevisionFeedback("");
    setRevisionCount(0);
  };

  const handleRevision = async (requestedChange?: string) => {
    const feedback = (requestedChange ?? revisionFeedback).trim();
    if (!replies.length || !feedback) {
      setError("请填写希望调整的内容。");
      return;
    }
    setError("");
    setStage("generating");
    try {
      const result = await bridge.analyzeReply({
        message,
        senderIdentity: isComposeMode ? "" : resolvedIdentity,
        conversationMode,
        backgroundContext: backgroundInfo.trim() || undefined,
        ...(projectPayload ? { projectContext: projectPayload } : {}),
        revisionContext: {
          feedback,
          previousReplies: replies,
        },
        rounds: rounds.map((round) => ({
          round: round.round,
          turns: round.questions.map((question) => ({
            question: question.question,
            why: question.why,
            answer: round.answers[question.id] ?? "",
          })),
        })),
        forceGenerate: true,
      });
      if (!result.replies.length) {
        throw new Error("模型没有返回修改后的回复。");
      }
      setReplies(result.replies);
      setRationale(result.rationale);
      setTokensUsed((current) => current + (result.tokensUsed ?? 0));
      setRevisionCount((current) => current + 1);
      setRevisionFeedback("");
      setStage("complete");
    } catch (revisionError) {
      setStage("complete");
      setError(`修改失败：${readableError(revisionError)}`);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast("回复已复制，可以直接发送");
    } catch {
      setError("复制失败，请手动选择文字。");
    }
  };

  return (
    <section className="reply-assistant">
      <header className="reply-heading">
        <div>
          <span className="eyebrow">CONVERSATION COPILOT</span>
          <h1>日常对话回复助手</h1>
          <p>
            {isComposeMode
              ? "输入一个目的或大白话，先补全角色、背景、语气与格式，再生成可发送内容。"
              : "先理解关系和前情，再给出可以选择的回复，而不是机械地立即作答。"}
          </p>
        </div>
        <div className="reply-heading-actions">
          {project && (
            <span className="project-context-pill">
              <i />
              {project.name}
            </span>
          )}
          <button className="reply-exit-button" onClick={onExit}>
            <ArrowLeft size={14} />
            返回提示词工坊
          </button>
        </div>
      </header>

      <div className="conversation-mode-tabs">
        <button
          className={conversationMode === "reply" ? "active" : ""}
          onClick={() => switchConversationMode("reply")}
          disabled={busy}
        >
          <MessageCircleReply size={14} />
          <span>
            <strong>回复收到的消息</strong>
            <small>先理解对方，再选择回复</small>
          </span>
        </button>
        <button
          className={conversationMode === "compose" ? "active" : ""}
          onClick={() => switchConversationMode("compose")}
          disabled={busy}
        >
          <Send size={14} />
          <span>
            <strong>主动发起沟通</strong>
            <small>说一个目的，生成可发送内容</small>
          </span>
        </button>
      </div>

      {error && (
        <div className="error-banner reply-error" role="alert">
          <span>{error}</span>
          {error.includes("API Key") && (
            <button className="error-settings-button" onClick={onOpenSettings}>
              <Settings2 size={12} />
              打开设置
            </button>
          )}
          <button onClick={() => setError("")} aria-label="关闭错误提示">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="reply-layout">
        <section className="reply-conversation">
          <div className="reply-section-heading">
            <span>
              01 / {isComposeMode ? "这次想主动说什么" : "收到的消息"}
            </span>
            <span>{message.length} CHARS</span>
          </div>

          <div className="reply-background-context">
            <div className="reply-label">
              <CornerDownLeft size={14} />
              前置背景信息（可选）
            </div>
            <textarea
              aria-label="前置背景信息"
              value={backgroundInfo}
              onChange={(event) => setBackgroundInfo(event.target.value)}
              placeholder="可以随时补充关系、前情、已确认事项、手头情况或其他约束；后续提问、生成和修改都会参考。"
              disabled={busy}
            />
          </div>

          {!isComposeMode && (
            <div className="identity-panel">
              <div className="reply-label">
                <UserRound size={14} />
                发送者身份
              </div>
              <div className="identity-grid">
                {identities.map((identity) => (
                  <button
                    key={identity.value}
                    className={
                      senderIdentity === identity.value ? "active" : ""
                    }
                    onClick={() => setSenderIdentity(identity.value)}
                    disabled={busy}
                  >
                    <span>{identity.value}</span>
                    <small>{identity.hint}</small>
                  </button>
                ))}
              </div>
              {senderIdentity === "其他" && (
                <input
                  className="custom-identity-input"
                  aria-label="自定义发送者身份"
                  value={customIdentity}
                  onChange={(event) => setCustomIdentity(event.target.value)}
                  placeholder="例如：房东、多年未联系的同学、面试官"
                  disabled={busy}
                />
              )}
            </div>
          )}

          <div className="received-message-card">
            <textarea
              aria-label={isComposeMode ? "主动沟通目的" : "收到的消息"}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                isComposeMode
                  ? "用大白话写下目的，例如：写封请假邮件、约老板面谈、问候生病的朋友……"
                  : "粘贴对方发来的消息，例如：你最近是不是很忙？上次说的事情考虑得怎么样了？"
              }
              disabled={busy}
            />
            {isComposeMode && !message && (
              <div className="compose-examples">
                <span>试试：</span>
                {[
                  "写封请假邮件",
                  "约老板面谈",
                  "问候生病的朋友",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setMessage(example)}
                    disabled={busy}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
            <div className="received-message-footer">
              <span>
                {isComposeMode
                  ? "模式：主动发起"
                  : `发送者：${resolvedIdentity}`}
                {project ? ` · 项目背景：${project.name}` : ""}
              </span>
              <button
                className="primary-button"
                onClick={handleStart}
                disabled={busy || !message.trim()}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={15} />
                    {stage === "analyzing"
                      ? isComposeMode
                        ? "正在补全沟通要素"
                        : "正在理解语境"
                      : isComposeMode
                        ? "正在生成内容"
                        : "正在生成回复"}
                  </>
                ) : replies.length ? (
                  <>
                    <RotateCcw size={15} />
                      {isComposeMode ? "重新补全" : "重新分析"}
                  </>
                ) : stage === "clarifying" ? (
                  <>
                    <RotateCcw size={15} />
                    重新开始分析
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    {isComposeMode ? "开始构思" : "开始理解"}
                  </>
                )}
              </button>
            </div>
          </div>

          {rounds.length > 0 && (
            <details className="reply-rounds">
              <summary>
                <span>
                  <Check size={13} />
                  已完成 {rounds.length} 轮背景澄清
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
            <div className="thinking-card reply-thinking">
              <div className="thinking-orbit">
                <span />
                <span />
                <span />
              </div>
              <div>
                <strong>
                  {stage === "analyzing"
                    ? isComposeMode
                      ? "AI 正在补全角色、背景和表达目标"
                      : "AI 正在判断还缺少哪些背景"
                    : isComposeMode
                      ? "正在生成不同语气和长度的发送内容"
                      : "正在打磨不同语气的回复"}
                </strong>
                <p>
                  {stage === "analyzing"
                    ? isComposeMode
                      ? "确认你的角色、沟通对象、任务背景、语气与输出格式……"
                      : "分析双方关系、前情、真实意图与表达边界……"
                    : "生成可直接发送的版本，并保持表达边界一致……"}
                </p>
              </div>
            </div>
          )}

          {stage === "clarifying" && questions.length > 0 && (
            <section className="reply-questions">
              <div className="clarification-head">
                <div className="round-badge">
                  <MessageCircleReply size={15} />
                  ROUND {rounds.length + 1}
                  <span>/ 05</span>
                </div>
                <span className="answer-progress">
                  {
                    questions.filter((question) =>
                      answers[question.id]?.trim(),
                    ).length
                  }{" "}
                  / {questions.length} 已回答
                </span>
              </div>
              {rationale && (
                <div className="ai-rationale">
                  <span>AI 判断</span>
                  <p>{rationale}</p>
                </div>
              )}
              <div className="question-list">
                {questions.map((question, index) => (
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
                        placeholder="补充背景；不确定时可以写“暂不清楚”"
                        disabled={busy}
                      />
                    </span>
                  </label>
                ))}
              </div>
              <div className="clarification-footer">
                <span>
                  <CornerDownLeft size={13} />
                  AI 可能继续追问，直到足以写出合适回复
                </span>
                <button
                  className="primary-button"
                  onClick={handleSubmitAnswers}
                  disabled={busy}
                >
                  提交背景
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}
        </section>

        <aside className="reply-result">
          <div className="reply-result-heading">
            <div>
              <span className="eyebrow">REPLY OPTIONS</span>
              <h2>{isComposeMode ? "选择一条发送内容" : "选择一条回复"}</h2>
            </div>
            {replies.length > 0 && (
              <button
                className="reply-regenerate-button"
                onClick={handleRegenerate}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <RotateCcw size={13} />
                )}
                换一组
              </button>
            )}
          </div>

          {replies.length > 0 ? (
            <>
              <div className="reply-options">
                {replies.map((reply, index) => (
                  <article className="reply-option" key={reply.id}>
                    <div className="reply-option-head">
                      <span>{(index + 1).toString().padStart(2, "0")}</span>
                      <strong>{reply.label}</strong>
                      <button
                        onClick={() => handleCopy(reply.text)}
                        title="复制这条回复"
                      >
                        <Clipboard size={13} />
                        复制
                      </button>
                    </div>
                    <p>{reply.text}</p>
                    {reply.why && (
                      <small>
                        <i>策略</i>
                        {reply.why}
                      </small>
                    )}
                  </article>
                ))}
              </div>
              <div className="conversation-refinement">
                <div className="refinement-head">
                  <span>继续对话 / 要求修改</span>
                  {revisionCount > 0 && (
                    <small>已迭代 {revisionCount} 次</small>
                  )}
                </div>
                <div className="refinement-quick-actions">
                  {[
                    ["更正式", "把整体语气调整得更正式、专业。"],
                    ["更亲切", "让语气更自然、亲切，但保持得体。"],
                    ["更简短", "压缩篇幅，保留核心意思和必要信息。"],
                    ["更详细", "补充必要的背景和细节，让表达更完整。"],
                  ].map(([label, instruction]) => (
                    <button
                      key={label}
                      onClick={() => handleRevision(instruction)}
                      disabled={busy}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="refinement-input">
                  <textarea
                    aria-label="修改意见"
                    value={revisionFeedback}
                    onChange={(event) =>
                      setRevisionFeedback(event.target.value)
                    }
                    placeholder={
                      isComposeMode
                        ? "例如：第二句太生硬，加一句说明我手头有项目很忙"
                        : "例如：第二条太卑微了，加一句强调我手头有项目很忙"
                    }
                    disabled={busy}
                  />
                  <button
                    onClick={() => handleRevision()}
                    disabled={busy || !revisionFeedback.trim()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <Send size={13} />
                    )}
                    发送修改
                  </button>
                </div>
              </div>
              <div className="reply-result-footer">
                <span>
                  {rationale || "可根据对方回复继续调整语气。"}
                </span>
                <div>
                  <span>MODEL / {model}</span>
                  {tokensUsed > 0 && <span>API {tokensUsed} TOKENS</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="reply-empty">
              <div className="reply-orbits">
                <span className="reply-bubble bubble-one" />
                <span className="reply-bubble bubble-two" />
                <MessageCircleReply size={40} strokeWidth={1.1} />
              </div>
              <span>REPLIES WILL APPEAR HERE</span>
              <h3>{isComposeMode ? "先补全，再发送" : "先理解，再回复"}</h3>
              <p>
                {isComposeMode
                  ? "AI 会先询问你的角色、沟通背景、语气和格式，再给出几种可直接发送的内容。"
                  : "AI 会先询问缺失的关系、前情和目标，再给出几种语气不同、可直接复制的话术。"}
              </p>
            </div>
          )}
        </aside>
      </div>

      <button className="reply-new-button" onClick={handleNew} disabled={busy}>
        清空并开始新的对话
      </button>
    </section>
  );
}
