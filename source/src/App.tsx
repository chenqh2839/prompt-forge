import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Menu,
  MessageCircleReply,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { bridge } from "./lib/bridge";
import { findTemplate, templates as builtInTemplates } from "./lib/templates";
import type {
  AppSettings,
  ClarificationQuestion,
  ClarificationTurn,
  HistoryItem,
  PromptAttachment,
  PromptAnalysis,
  PromptVariant,
  ProjectContext,
  ProjectContextPayload,
  ProjectHistorySummaryResult,
  ProjectInput,
  Stage,
  TemplateDefinition,
  TemplateDistillationResult,
  TemplateInput,
  VariableInstance,
  VariableWorkflow,
} from "./types";
import { PromptWorkspace } from "./components/PromptWorkspace";
import { ResultPanel } from "./components/ResultPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { TemplateDialog } from "./components/TemplateDialog";
import { ProjectDialog } from "./components/ProjectDialog";
import { VariableWorkflowDialog } from "./components/VariableWorkflowDialog";
import { ProjectHistorySources } from "./components/ProjectHistorySources";
import { ReplyAssistant } from "./components/ReplyAssistant";
import { BrandMark } from "./components/BrandMark";
import {
  attachmentPayloads,
  hasImageAttachments,
  parseStoredAttachments,
  serializeAttachments,
  supportsVision,
} from "./lib/attachments";
import {
  SUMMARY_VERSION,
  budgetInteractionContext,
  defaultContextBudget,
  interactionContextPayload,
} from "./lib/projectContext";
import {
  CommandPalette,
  type PaletteAction,
} from "./components/CommandPalette";
import {
  DARK_THEME,
  LIGHT_THEME,
  useTheme,
} from "./theme/ThemeContext";

const DEFAULT_SETTINGS: AppSettings = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  hasApiKey: false,
  reuseProjectRole: true,
};

const KEEP_ATTACHMENTS_STORAGE_KEY = "prompt-forge-keep-attachments-v1";

function readableError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请重试。";
}

function projectPayload(project: ProjectContext | null): ProjectContextPayload | undefined {
  if (!project) return undefined;
  return {
    name: project.name,
    goal: project.goal,
    style: project.style,
    characters: project.characters,
    historyContext: project.historyContext,
    materials: project.materials,
  };
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((value) => values.has(value));
}

export default function App() {
  const { theme, saveTheme } = useTheme();
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellSize, setShellSize] = useState<"compact" | "medium" | "wide">(
    "wide",
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"prompt" | "reply">(
    "prompt",
  );
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<
    TemplateDefinition[]
  >([]);
  const [templateEditor, setTemplateEditor] = useState<
    TemplateDefinition | "new" | null
  >(null);
  const [projects, setProjects] = useState<ProjectContext[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<
    ProjectContext | "new" | null
  >(null);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [templateDistillation, setTemplateDistillation] =
    useState<TemplateDistillationResult | null>(null);
  const [variableWorkflow, setVariableWorkflow] =
    useState<VariableWorkflow | null>(null);
  const [variants, setVariants] = useState<PromptVariant[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState(
    builtInTemplates[0].id,
  );
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [backgroundInfo, setBackgroundInfo] = useState("");
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historySummaryResult, setHistorySummaryResult] =
    useState<ProjectHistorySummaryResult | null>(null);
  const [summarizingHistories, setSummarizingHistories] = useState(false);
  const [distillingTemplate, setDistillingTemplate] = useState(false);
  const [contextBudgetTokens, setContextBudgetTokens] = useState(() =>
    defaultContextBudget(DEFAULT_SETTINGS.provider, DEFAULT_SETTINGS.model),
  );
  const [lastSourceHistoryIds, setLastSourceHistoryIds] = useState<string[]>(
    [],
  );
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [lastReadAttachmentNames, setLastReadAttachmentNames] = useState<
    string[]
  >([]);
  const [
    keepAttachmentsAfterSubmit,
    setKeepAttachmentsAfterSubmitState,
  ] = useState(() => {
    try {
      return localStorage.getItem(KEEP_ATTACHMENTS_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const historyAttachmentsRequestRef = useRef(0);
  const [rounds, setRounds] = useState<ClarificationTurn[]>([]);
  const [currentQuestions, setCurrentQuestions] = useState<
    ClarificationQuestion[]
  >([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rationale, setRationale] = useState("");
  const [roleDecision, setRoleDecision] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [revisionCount, setRevisionCount] = useState(0);

  const availableTemplates = useMemo(
    () => [...builtInTemplates, ...customTemplates],
    [customTemplates],
  );

  const activeTemplate = useMemo(
    () => findTemplate(activeTemplateId, availableTemplates),
    [activeTemplateId, availableTemplates],
  );

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const projectHistories = useMemo(
    () =>
      history.filter(
        (item) =>
          item.projectId === activeProjectId && item.id !== activeHistoryId,
      ),
    [activeHistoryId, activeProjectId, history],
  );

  const summaryFresh = useMemo(() => {
    if (!selectedHistoryIds.length) return true;
    if (!historySummaryResult) return false;
    const summarizedIds = historySummaryResult.summaries.map(
      (summary) => summary.historyId,
    );
    if (!sameStringSet(selectedHistoryIds, summarizedIds)) return false;
    return historySummaryResult.summaries.every(
      (summary) =>
        projectHistories.find((item) => item.id === summary.historyId)
          ?.updatedAt === summary.updatedAt,
    );
  }, [historySummaryResult, projectHistories, selectedHistoryIds]);

  const contextBaseText = useMemo(
    () =>
      [
        originalPrompt,
        backgroundInfo,
        activeProject?.goal ?? "",
        activeProject?.style ?? "",
        activeProject?.characters ?? "",
        activeProject?.historyContext ?? "",
        activeProject?.materials ?? "",
        ...attachments.map((attachment) =>
          attachment.kind === "document"
            ? `${attachment.name}\n${attachment.content}`
            : attachment.name,
        ),
      ].join("\n"),
    [activeProject, attachments, backgroundInfo, originalPrompt],
  );

  const interactionBudget = useMemo(
    () =>
      budgetInteractionContext(
        historySummaryResult?.summaries ?? [],
        contextBudgetTokens,
        contextBaseText,
      ),
    [contextBaseText, contextBudgetTokens, historySummaryResult],
  );
  const interactionContextReady =
    selectedHistoryIds.length === 0 ||
    (summaryFresh && interactionBudget.included.length > 0);
  const projectInteractionPayload = useMemo(
    () =>
      interactionContextPayload(
        interactionBudget.included,
        interactionBudget.usedTokens,
      ),
    [interactionBudget.included, interactionBudget.usedTokens],
  );
  const activeSourceHistoryIds = interactionBudget.included.map(
    (summary) => summary.historyId,
  );
  const sourceHistoryIdsToSave =
    selectedHistoryIds.length > 0
      ? activeSourceHistoryIds
      : (history.find((item) => item.id === activeHistoryId)?.sourceHistoryIds ??
        []);

  const visionSupported = supportsVision(settings.provider, settings.model);
  const imageAttachmentBlocked =
    hasImageAttachments(attachments) && !visionSupported;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? window.innerWidth;
      const nextSize = width < 860 ? "compact" : width < 1240 ? "medium" : "wide";
      setShellSize(nextSize);
      shell.dataset.shellSize = nextSize;
      shell.style.setProperty("--shell-width", `${Math.round(width)}px`);
      if (nextSize === "compact") setSidebarOpen(false);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setContextBudgetTokens(
      defaultContextBudget(settings.provider, settings.model),
    );
  }, [settings.model, settings.provider]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const handleSelectProject = useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    setSelectedHistoryIds([]);
    setHistorySummaryResult(null);
    setLastSourceHistoryIds([]);
  }, []);

  const handleToggleHistory = useCallback((historyId: string) => {
    setSelectedHistoryIds((current) =>
      current.includes(historyId)
        ? current.filter((id) => id !== historyId)
        : [...current, historyId],
    );
    setHistorySummaryResult(null);
  }, []);

  const handleSummarizeHistories = useCallback(async () => {
    if (!activeProject || !selectedHistoryIds.length) {
      setError("请先选择项目和至少一条历史交互。");
      return;
    }
    setSummarizingHistories(true);
    setError("");
    try {
      const result = await bridge.summarizeProjectHistories({
        projectId: activeProject.id,
        historyIds: selectedHistoryIds,
        summaryVersion: SUMMARY_VERSION,
      });
      setHistorySummaryResult(result);
      showToast("项目交互摘要已生成或从本地缓存恢复");
    } catch (summaryError) {
      setError(`项目交互摘要失败：${readableError(summaryError)}`);
    } finally {
      setSummarizingHistories(false);
    }
  }, [activeProject, selectedHistoryIds, showToast]);

  const handleDistillTemplate = useCallback(async () => {
    if (!activeProject || !selectedHistoryIds.length || !summaryFresh) {
      setError("请先选择历史交互并生成最新摘要。");
      return;
    }
    setDistillingTemplate(true);
    setError("");
    try {
      const result = await bridge.distillProjectTemplate({
        projectId: activeProject.id,
        historyIds: selectedHistoryIds,
      });
      setTemplateDistillation(result);
      setVariableDialogOpen(true);
      showToast("已生成模板草稿，请检查映射和章节后保存");
    } catch (distillError) {
      setError(`模板提炼失败：${readableError(distillError)}`);
    } finally {
      setDistillingTemplate(false);
    }
  }, [activeProject, selectedHistoryIds, showToast, summaryFresh]);

  const setKeepAttachmentsAfterSubmit = useCallback((value: boolean) => {
    setKeepAttachmentsAfterSubmitState(value);
    try {
      localStorage.setItem(KEEP_ATTACHMENTS_STORAGE_KEY, String(value));
    } catch {
      // The preference still applies for this session.
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await bridge.listHistory());
    } catch (historyError) {
      setError(`读取历史记录失败：${readableError(historyError)}`);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      bridge.getSettings(),
      bridge.listHistory(),
      bridge.listCustomTemplates(),
      bridge.listProjects(),
    ])
      .then(([savedSettings, savedHistory, savedTemplates, savedProjects]) => {
        setSettings(savedSettings);
        setHistory(savedHistory);
        setCustomTemplates(savedTemplates);
        setProjects(savedProjects);
      })
      .catch((bootstrapError) => {
        setError(
          `应用初始化失败：${readableError(bootstrapError)}。请从桌面应用启动。`,
        );
      });
  }, []);

  useEffect(() => {
    void bridge
      .getDataLocation()
      .then((location) => {
        if (location.warning) showToast(location.warning);
      })
      .catch((locationError) => {
        setError(`数据目录状态检查失败：${readableError(locationError)}`);
      });
  }, [showToast]);

  const persistCompletedPrompt = useCallback(
    async (
      prompt: string,
      transcriptRounds: ClarificationTurn[],
      previousId?: string | null,
    ) => {
      const titleSource = originalPrompt.trim().replace(/\s+/g, " ");
      const saved = await bridge.saveHistory({
        id: previousId ?? undefined,
        title:
          titleSource.length > 44
            ? `${titleSource.slice(0, 44)}…`
            : titleSource || "未命名提示词",
        originalPrompt,
        templateId: activeTemplateId,
        optimizedPrompt: prompt,
        transcriptJson: JSON.stringify(transcriptRounds),
        model: settings.model,
        projectId: activeProject?.id ?? null,
        attachmentsJson: serializeAttachments(attachments),
        sourceHistoryIds: sourceHistoryIdsToSave,
      });
      setActiveHistoryId(saved.id);
      await refreshHistory();
      return saved;
    },
    [
      activeTemplateId,
      activeProject?.id,
      sourceHistoryIdsToSave,
      attachments,
      originalPrompt,
      refreshHistory,
      settings.model,
    ],
  );

  const handleComplete = useCallback(
    async (
      prompt: string,
      transcriptRounds: ClarificationTurn[],
      usage?: number,
    ) => {
      const submittedAttachmentNames = attachments.map(
        (attachment) => attachment.name,
      );
      setLastReadAttachmentNames(submittedAttachmentNames);
      setLastSourceHistoryIds(sourceHistoryIdsToSave);
      setOptimizedPrompt(prompt);
      setCurrentQuestions([]);
      setVariants([]);
      setActiveVariantId(null);
      setVariableWorkflow(null);
      setBatchProgress(null);
      setRevisionCount(0);
      setStage("complete");
      setTokensUsed((current) => current + (usage ?? 0));
      try {
        await persistCompletedPrompt(
          prompt,
          transcriptRounds,
          activeHistoryId,
        );
        showToast("优化完成，已保存到本机");
      } catch (saveError) {
        setError(`提示词已生成，但保存失败：${readableError(saveError)}`);
      } finally {
        if (!keepAttachmentsAfterSubmit) setAttachments([]);
      }
    },
    [
      activeHistoryId,
      sourceHistoryIdsToSave,
      attachments,
      keepAttachmentsAfterSubmit,
      persistCompletedPrompt,
      showToast,
    ],
  );

  const runAnalysis = useCallback(
    async (
      transcriptRounds: ClarificationTurn[],
      forceGenerate = false,
    ) => {
      if (!originalPrompt.trim()) {
        setError("请先输入原始提示词。");
        return;
      }
      setError("");
      setStage(forceGenerate ? "generating" : "analyzing");
      try {
        const result: PromptAnalysis = await bridge.analyzePrompt({
          originalPrompt,
          templateId: activeTemplateId,
          templateName: activeTemplate.name,
          templateFocus: activeTemplate.focus,
          backgroundContext: backgroundInfo.trim() || undefined,
          attachments: attachmentPayloads(attachments),
          ...(projectInteractionPayload
            ? { projectInteractionContext: projectInteractionPayload }
            : {}),
          ...(activeProject
            ? { projectContext: projectPayload(activeProject) }
            : {}),
          rounds: transcriptRounds.map((turn) => ({
            round: turn.round,
            turns: turn.questions.map((question) => ({
              question: question.question,
              why: question.why,
              answer: turn.answers[question.id] ?? "",
            })),
          })),
          forceGenerate,
        });

        setRationale(result.rationale);
        setRoleDecision(result.roleDecision ?? "");
        if (result.action === "complete" && result.optimizedPrompt) {
          await handleComplete(
            result.optimizedPrompt,
            transcriptRounds,
            result.tokensUsed,
          );
          return;
        }

        setTokensUsed((current) => current + (result.tokensUsed ?? 0));
        if (!result.questions.length) {
          throw new Error("模型没有返回澄清问题，请点击重新生成或检查模型配置。");
        }
        const safeQuestions = result.questions.slice(0, 5);
        setCurrentQuestions(safeQuestions);
        setAnswers(
          Object.fromEntries(safeQuestions.map((question) => [question.id, ""])),
        );
        setStage("clarifying");
      } catch (analysisError) {
        setStage(transcriptRounds.length ? "clarifying" : "idle");
        setError(`模型调用失败：${readableError(analysisError)}`);
      }
    },
    [
      activeTemplateId,
      activeTemplate.focus,
      activeTemplate.name,
      activeProject,
      attachments,
      backgroundInfo,
      handleComplete,
      originalPrompt,
      projectInteractionPayload,
    ],
  );

  const handleStart = async () => {
    if (attachmentBusy) {
      setError("附件仍在读取，请稍候。");
      return;
    }
    if (imageAttachmentBlocked) {
      setError(
        `当前模型 ${settings.model} 未确认支持图片输入，请切换视觉模型或移除图片。`,
      );
      return;
    }
    if (!interactionContextReady) {
      setError(
        "请先生成最新的项目交互摘要，并确保至少一条摘要处于上下文预算内。",
      );
      return;
    }
    setRounds([]);
    setCurrentQuestions([]);
    setOptimizedPrompt("");
    setRationale("");
    setRoleDecision("");
    setTokensUsed(0);
    setActiveHistoryId(null);
    setLastReadAttachmentNames([]);
    setLastSourceHistoryIds([]);
    setVariants([]);
    setActiveVariantId(null);
    setVariableWorkflow(null);
    setBatchProgress(null);
    setRevisionCount(0);
    await runAnalysis([]);
  };

  const handleSubmitAnswers = async () => {
    const missing = currentQuestions.some(
      (question) => !answers[question.id]?.trim(),
    );
    if (missing) {
      setError("请回答本轮所有问题；不确定时可以填写“暂不清楚”。");
      return;
    }
    const nextRound: ClarificationTurn = {
      round: rounds.length + 1,
      questions: currentQuestions,
      answers: { ...answers },
    };
    const transcript = [...rounds, nextRound];
    setRounds(transcript);
    await runAnalysis(transcript);
  };

  const generateVariantBatch = async (
    workflow: VariableWorkflow,
    items: Array<{
      id: string;
      label: string;
      values: Record<string, string>;
      sourcePrompt: string;
      historyId?: string;
    }>,
  ) => {
    if (!items.length) return;
    setError("");
    setStage("generating");
    setVariants([]);
    setActiveVariantId(null);
    setRationale("");
    setRoleDecision("");
    setCurrentQuestions([]);
    setRounds([]);
    setTokensUsed(0);
    setActiveHistoryId(null);
    setVariableWorkflow(workflow);
    setRevisionCount(0);
    setBatchProgress({ current: 1, total: items.length });

    const completed: PromptVariant[] = [];
    try {
      for (const [index, item] of items.entries()) {
        setBatchProgress({ current: index + 1, total: items.length });
        const result = await bridge.analyzePrompt({
          originalPrompt: item.sourcePrompt,
          templateId: activeTemplateId,
          templateName: activeTemplate.name,
          templateFocus: activeTemplate.focus,
          backgroundContext: backgroundInfo.trim() || undefined,
          attachments: attachmentPayloads(attachments),
          ...(projectInteractionPayload
            ? { projectInteractionContext: projectInteractionPayload }
            : {}),
          ...(activeProject
            ? { projectContext: projectPayload(activeProject) }
            : {}),
          variableContext: {
            workflowName: workflow.name,
            values: workflow.variables.map((variable) => ({
              label: variable.label,
              value: item.values[variable.key] ?? "",
            })),
            rules: workflow.rules,
            examples: workflow.examples,
          },
          rounds: [],
          forceGenerate: true,
        });
        if (!result.optimizedPrompt) {
          throw new Error("模型返回了空提示词。");
        }
        const title = `${
          activeProject ? `${activeProject.name} · ` : ""
        }${workflow.name} · ${item.label}`;
        const saved = await bridge.saveHistory({
          id: item.historyId,
          title: title.length > 72 ? `${title.slice(0, 72)}…` : title,
          originalPrompt: item.sourcePrompt,
          templateId: activeTemplateId,
          optimizedPrompt: result.optimizedPrompt,
          transcriptJson: JSON.stringify([]),
          model: settings.model,
          projectId: activeProject?.id ?? null,
          attachmentsJson: serializeAttachments(attachments),
          sourceHistoryIds: sourceHistoryIdsToSave,
        });
        completed.push({
          id: item.id,
          label: item.label,
          values: item.values,
          sourcePrompt: item.sourcePrompt,
          optimizedPrompt: result.optimizedPrompt,
          roleDecision: result.roleDecision,
          tokensUsed: result.tokensUsed,
          historyId: saved.id,
        });
        setTokensUsed((current) => current + (result.tokensUsed ?? 0));
        setVariants([...completed]);
        setActiveVariantId(completed[0].id);
        setOptimizedPrompt(completed[0].optimizedPrompt);
        setRoleDecision(completed[0].roleDecision ?? "");
      }
      setRationale(
        `变量流程“${workflow.name}”已生成 ${completed.length} 个实例。`,
      );
      setStage("complete");
      setLastReadAttachmentNames(
        attachments.map((attachment) => attachment.name),
      );
      setLastSourceHistoryIds(sourceHistoryIdsToSave);
      if (!keepAttachmentsAfterSubmit) setAttachments([]);
      await refreshHistory();
      showToast(`已生成并保存 ${completed.length} 个实例`);
    } catch (batchError) {
      setVariants(completed);
      if (completed.length) {
        setActiveVariantId(completed[0].id);
        setOptimizedPrompt(completed[0].optimizedPrompt);
        setStage("complete");
        setLastReadAttachmentNames(
          attachments.map((attachment) => attachment.name),
        );
        setLastSourceHistoryIds(sourceHistoryIdsToSave);
        if (!keepAttachmentsAfterSubmit) setAttachments([]);
        setError(
          `批量生成在第 ${completed.length + 1} 个实例中断：${readableError(
            batchError,
          )}`,
        );
        await refreshHistory();
      } else {
        setStage("idle");
        setError(`批量生成失败：${readableError(batchError)}`);
      }
    } finally {
      setBatchProgress(null);
    }
  };

  const handleGenerateVariableWorkflow = async (
    workflow: VariableWorkflow,
    _skeleton: string,
    instances: VariableInstance[],
    additionalInstructions: string,
  ) => {
    setVariableDialogOpen(false);
    const shared = additionalInstructions
      ? `\n\n所有实例的共同补充要求：\n${additionalInstructions}`
      : "";
    await generateVariantBatch(
      workflow,
      instances.map((instance) => ({
        ...instance,
        sourcePrompt: `${instance.sourcePrompt}${shared}`,
      })),
    );
  };

  const handleRegenerate = async () => {
    if (variants.length) {
      if (!variableWorkflow) {
        setError("变量流程信息缺失，请重新打开变量模板。");
        return;
      }
      await generateVariantBatch(
        variableWorkflow,
        variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          values: variant.values,
          sourcePrompt: variant.sourcePrompt,
          historyId: variant.historyId,
        })),
      );
      return;
    }
    if (!originalPrompt.trim()) {
      setError("没有可重新生成的原始提示词。");
      return;
    }
    setError("");
    setStage("generating");
    try {
      const result = await bridge.analyzePrompt({
        originalPrompt,
        templateId: activeTemplateId,
        templateName: activeTemplate.name,
        templateFocus: activeTemplate.focus,
        backgroundContext: backgroundInfo.trim() || undefined,
        attachments: attachmentPayloads(attachments),
        ...(projectInteractionPayload
          ? { projectInteractionContext: projectInteractionPayload }
          : {}),
        ...(activeProject
          ? { projectContext: projectPayload(activeProject) }
          : {}),
        rounds: rounds.map((turn) => ({
          round: turn.round,
          turns: turn.questions.map((question) => ({
            question: question.question,
            why: question.why,
            answer: turn.answers[question.id] ?? "",
          })),
        })),
        forceGenerate: true,
      });
      if (!result.optimizedPrompt) {
        throw new Error("模型返回了空结果。");
      }
      await handleComplete(
        result.optimizedPrompt,
        rounds,
        result.tokensUsed,
      );
      showToast("已重新生成并更新历史记录");
    } catch (regenerateError) {
      setStage("complete");
      setError(`重新生成失败：${readableError(regenerateError)}`);
    }
  };

  const handleRevisePrompt = async (feedback: string) => {
    const instruction = feedback.trim();
    if (!instruction || !optimizedPrompt.trim()) return false;
    const selectedVariant =
      variants.find((variant) => variant.id === activeVariantId) ?? null;
    const sourcePrompt = selectedVariant?.sourcePrompt ?? originalPrompt;
    setError("");
    setStage("generating");
    try {
      const result = await bridge.analyzePrompt({
        originalPrompt: sourcePrompt,
        templateId: activeTemplateId,
        templateName: activeTemplate.name,
        templateFocus: activeTemplate.focus,
        backgroundContext: backgroundInfo.trim() || undefined,
        attachments: attachmentPayloads(attachments),
        ...(projectInteractionPayload
          ? { projectInteractionContext: projectInteractionPayload }
          : {}),
        revisionContext: {
          feedback: instruction,
          previousOutput: optimizedPrompt,
        },
        ...(activeProject
          ? { projectContext: projectPayload(activeProject) }
          : {}),
        ...(selectedVariant && variableWorkflow
          ? {
              variableContext: {
                workflowName: variableWorkflow.name,
                values: variableWorkflow.variables.map((variable) => ({
                  label: variable.label,
                  value: selectedVariant.values[variable.key] ?? "",
                })),
                rules: variableWorkflow.rules,
                examples: variableWorkflow.examples,
              },
            }
          : {}),
        rounds: selectedVariant
          ? []
          : rounds.map((turn) => ({
              round: turn.round,
              turns: turn.questions.map((question) => ({
                question: question.question,
                why: question.why,
                answer: turn.answers[question.id] ?? "",
              })),
            })),
        forceGenerate: true,
      });
      if (!result.optimizedPrompt) {
        throw new Error("模型没有返回修改后的提示词。");
      }
      setOptimizedPrompt(result.optimizedPrompt);
      if (attachments.length) {
        setLastReadAttachmentNames(
          attachments.map((attachment) => attachment.name),
        );
      }
      setLastSourceHistoryIds(sourceHistoryIdsToSave);
      setRationale(result.rationale);
      setRoleDecision(result.roleDecision ?? "");
      setTokensUsed((current) => current + (result.tokensUsed ?? 0));
      setRevisionCount((current) => current + 1);
      setStage("complete");

      if (selectedVariant) {
        const existing = history.find(
          (item) => item.id === selectedVariant.historyId,
        );
        const title =
          existing?.title ??
          `${
            activeProject ? `${activeProject.name} · ` : ""
          }${variableWorkflow?.name ?? "变量模板"} · ${selectedVariant.label}`;
        const saved = await bridge.saveHistory({
          id: selectedVariant.historyId,
          title,
          originalPrompt: selectedVariant.sourcePrompt,
          templateId: activeTemplateId,
          optimizedPrompt: result.optimizedPrompt,
          transcriptJson: JSON.stringify([]),
          model: settings.model,
          projectId: activeProject?.id ?? null,
          attachmentsJson: serializeAttachments(attachments),
          sourceHistoryIds: sourceHistoryIdsToSave,
        });
        setVariants((current) =>
          current.map((variant) =>
            variant.id === selectedVariant.id
              ? {
                  ...variant,
                  optimizedPrompt: result.optimizedPrompt!,
                  historyId: saved.id,
                }
              : variant,
          ),
        );
        await refreshHistory();
      } else {
        await persistCompletedPrompt(
          result.optimizedPrompt,
          rounds,
          activeHistoryId,
        );
      }
      showToast("已按修改意见更新当前结果");
      return true;
    } catch (revisionError) {
      setStage("complete");
      setError(`修改失败：${readableError(revisionError)}`);
      return false;
    }
  };

  const handleNew = () => {
    setWorkspaceMode("prompt");
    setOriginalPrompt("");
    setBackgroundInfo("");
    historyAttachmentsRequestRef.current += 1;
    setAttachments([]);
    setAttachmentBusy(false);
    setLastReadAttachmentNames([]);
    setSelectedHistoryIds([]);
    setHistorySummaryResult(null);
    setLastSourceHistoryIds([]);
    setRounds([]);
    setCurrentQuestions([]);
    setAnswers({});
    setRationale("");
    setRoleDecision("");
    setOptimizedPrompt("");
    setStage("idle");
    setError("");
    setActiveHistoryId(null);
    setTokensUsed(0);
    setVariants([]);
    setActiveVariantId(null);
    setVariableWorkflow(null);
    setBatchProgress(null);
    setRevisionCount(0);
  };

  const handleSelectHistory = (item: HistoryItem) => {
    const attachmentRequest = historyAttachmentsRequestRef.current + 1;
    historyAttachmentsRequestRef.current = attachmentRequest;
    setWorkspaceMode("prompt");
    let transcript: ClarificationTurn[] = [];
    try {
      transcript = JSON.parse(item.transcriptJson) as ClarificationTurn[];
    } catch {
      transcript = [];
    }
    setActiveHistoryId(item.id);
    setActiveTemplateId(
      availableTemplates.some((template) => template.id === item.templateId)
        ? item.templateId
        : "general",
    );
    setOriginalPrompt(item.originalPrompt);
    setBackgroundInfo("");
    setAttachments([]);
    setLastReadAttachmentNames([]);
    setSelectedHistoryIds([]);
    setHistorySummaryResult(null);
    setLastSourceHistoryIds(item.sourceHistoryIds ?? []);
    setAttachmentBusy(true);
    setRounds(transcript);
    setCurrentQuestions([]);
    setAnswers({});
    setRationale("已从本地历史记录恢复。");
    setRoleDecision("");
    setOptimizedPrompt(item.optimizedPrompt);
    setStage("complete");
    setError("");
    setTokensUsed(0);
    setVariants([]);
    setActiveVariantId(null);
    setVariableWorkflow(null);
    setBatchProgress(null);
    setRevisionCount(0);
    setActiveProjectId(
      item.projectId &&
        projects.some((project) => project.id === item.projectId)
        ? item.projectId
        : null,
    );
    void bridge
      .getHistoryAttachments(item.id)
      .then((json) => {
        if (historyAttachmentsRequestRef.current === attachmentRequest) {
          const restored = parseStoredAttachments(json);
          setAttachments(restored);
          setLastReadAttachmentNames(
            restored.map((attachment) => attachment.name),
          );
        }
      })
      .catch((attachmentError) => {
        if (historyAttachmentsRequestRef.current === attachmentRequest) {
          setError(`附件恢复失败：${readableError(attachmentError)}`);
        }
      })
      .finally(() => {
        if (historyAttachmentsRequestRef.current === attachmentRequest) {
          setAttachmentBusy(false);
        }
      });
  };

  const handleSelectTemplate = (templateId: string) => {
    setWorkspaceMode("prompt");
    setActiveTemplateId(templateId);
    if (stage === "complete") {
      showToast("模板已切换；点击“重新生成”应用新风格");
    }
  };

  const handleSaveTemplate = async (input: TemplateInput) => {
    const saved = await bridge.saveCustomTemplate(input);
    setCustomTemplates((current) => [
      ...current.filter((template) => template.id !== saved.id),
      saved,
    ]);
    setActiveTemplateId(saved.id);
    setTemplateEditor(null);
    showToast(input.id ? "自定义场景已更新" : "自定义场景已创建");
    if (stage === "complete") {
      showToast("场景已更新；点击“重新生成”应用新场景");
    }
  };

  const handleDeleteTemplate = async (template: TemplateDefinition) => {
    await bridge.deleteCustomTemplate(template.id);
    setCustomTemplates((current) =>
      current.filter((item) => item.id !== template.id),
    );
    if (activeTemplateId === template.id) {
      setActiveTemplateId("general");
    }
    setTemplateEditor(null);
    showToast("自定义场景已删除，历史记录仍然保留");
  };

  const handleSaveProject = async (input: ProjectInput) => {
    const saved = await bridge.saveProject(input);
    setProjects((current) => [
      ...current.filter((project) => project.id !== saved.id),
      saved,
    ]);
    handleSelectProject(saved.id);
    setProjectEditor(null);
    showToast(input.id ? "项目上下文已更新" : "项目已创建");
  };

  const handleDeleteProject = async (project: ProjectContext) => {
    await bridge.deleteProject(project.id);
    setProjects((current) =>
      current.filter((item) => item.id !== project.id),
    );
    if (activeProjectId === project.id) {
      handleSelectProject(null);
    }
    setProjectEditor(null);
    showToast("项目已删除，历史提示词仍然保留");
  };

  const handleSelectVariant = (variant: PromptVariant) => {
    setActiveVariantId(variant.id);
    setOptimizedPrompt(variant.optimizedPrompt);
    setRoleDecision(variant.roleDecision ?? "");
    setRevisionCount(0);
  };

  const handleDeleteHistory = async (id: string) => {
    if (!window.confirm("删除这条历史记录？此操作不可撤销。")) return;
    try {
      await bridge.deleteHistory(id);
      if (activeHistoryId === id) handleNew();
      await refreshHistory();
      showToast("历史记录已删除");
    } catch (deleteError) {
      setError(`删除失败：${readableError(deleteError)}`);
    }
  };

  const handleClearHistory = async () => {
    if (!history.length || !window.confirm("清空全部历史记录？此操作不可撤销。")) {
      return;
    }
    try {
      await bridge.clearHistory();
      setHistory([]);
      if (activeHistoryId) handleNew();
      showToast("全部历史记录已清空");
    } catch (clearError) {
      setError(`清空失败：${readableError(clearError)}`);
    }
  };

  const handleExport = async () => {
    try {
      const path = await bridge.exportHistory();
      if (path) showToast(`历史记录已导出到 ${path}`);
    } catch (exportError) {
      setError(`导出失败：${readableError(exportError)}`);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制到剪贴板");
    } catch {
      setError("复制失败，请手动选择文本。");
    }
  };

  const handleCopyAllVariants = async () => {
    const text = variants
      .map(
        (variant, index) =>
          `# ${(index + 1).toString().padStart(2, "0")} · ${variant.label}\n\n${
            variant.optimizedPrompt
          }`,
      )
      .join("\n\n---\n\n");
    await handleCopy(text);
  };

  const commandActions: PaletteAction[] = [
    {
      id: "new-task",
      label: "新建提示词任务",
      detail: "清空当前工作区并返回提示词工坊",
      group: "快速开始",
      shortcut: "Ctrl N",
      keywords: "new prompt",
      run: handleNew,
    },
    {
      id: "prompt-workspace",
      label: "打开提示词工坊",
      detail: "多轮澄清并生成结构化提示词",
      group: "工作模式",
      shortcut: "Alt 1",
      run: () => setWorkspaceMode("prompt"),
    },
    {
      id: "reply-workspace",
      label: "打开日常对话助手",
      detail: "回复消息或主动发起沟通",
      group: "工作模式",
      shortcut: "Alt 2",
      run: () => setWorkspaceMode("reply"),
    },
    {
      id: "variable-workflow",
      label: "使用变量模板",
      detail: "从固定骨架批量生成不同实例",
      group: "创作工具",
      run: () => {
        setWorkspaceMode("prompt");
        setVariableDialogOpen(true);
      },
    },
    {
      id: "new-project",
      label: "新建项目上下文",
      detail: "保存目标、角色、前情和素材",
      group: "创作工具",
      run: () => setProjectEditor("new"),
    },
    {
      id: "new-scene",
      label: "新建自定义场景",
      detail: "定义领域追问重点和输出标准",
      group: "创作工具",
      run: () => setTemplateEditor("new"),
    },
    {
      id: "toggle-theme",
      label: theme.mode === "light" ? "切换到深色主题" : "切换到浅色主题",
      detail: "立即切换并保存界面明暗模式",
      group: "外观",
      keywords: "theme dark light 主题",
      run: () => {
        const preset = theme.mode === "light" ? DARK_THEME : LIGHT_THEME;
        saveTheme({ ...preset, baseFontSize: theme.baseFontSize });
      },
    },
    {
      id: "settings",
      label: "打开应用设置",
      detail: "模型连接、浅色/深色和自定义外观",
      group: "系统",
      shortcut: "Ctrl ,",
      run: () => setSettingsOpen(true),
    },
    ...availableTemplates.map<PaletteAction>((template) => ({
      id: `template-${template.id}`,
      label: `切换到「${template.name}」`,
      detail: template.description,
      group: "场景模板",
      keywords: `template ${template.shortName}`,
      run: () => handleSelectTemplate(template.id),
    })),
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        setSidebarOpen(false);
      } else if (modifier && event.key === ",") {
        event.preventDefault();
        setPaletteOpen(false);
        setSettingsOpen(true);
      } else if (modifier && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setPaletteOpen(false);
        handleNew();
      } else if (event.altKey && event.key === "1") {
        event.preventDefault();
        setWorkspaceMode("prompt");
      } else if (event.altKey && event.key === "2") {
        event.preventDefault();
        setWorkspaceMode("reply");
      } else if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      className="app-shell"
      ref={shellRef}
      data-shell-size={shellSize}
    >
      <a className="skip-link" href="#main-workspace">
        跳至主工作区
      </a>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="mobile-menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开导航"
          >
            <Menu size={18} />
          </button>
          <button className="brand" onClick={handleNew} title="开始一个新任务">
            <BrandMark />
            <span className="brand-copy">
              <strong>PROMPT FORGE</strong>
              <span>AI ORCHESTRATION STUDIO</span>
            </span>
          </button>
        </div>
        <div className="topbar-center">
          <button
            className="command-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="打开快捷操作"
          >
            <Search size={15} />
            <span>搜索命令与操作</span>
            <kbd>Ctrl / ⌘ K</kbd>
          </button>
        </div>
        <div className="topbar-actions">
          <span className="model-readout" title={settings.model}>
            <i className="live-dot" />
            {settings.provider} / {settings.model}
          </span>
          <button
            className="compact-command-button"
            onClick={() => setPaletteOpen(true)}
            aria-label="打开快捷操作"
            title="快捷操作"
          >
            <Search size={16} />
          </button>
          <button className="text-button" onClick={handleNew}>
            <Plus size={15} />
            <span>新建</span>
          </button>
          <button
            className="theme-quick-toggle"
            onClick={() => {
              const preset = theme.mode === "light" ? DARK_THEME : LIGHT_THEME;
              saveTheme({ ...preset, baseFontSize: theme.baseFontSize });
            }}
            title={theme.mode === "light" ? "切换到深色主题" : "切换到浅色主题"}
            aria-label={theme.mode === "light" ? "切换到深色主题" : "切换到浅色主题"}
          >
            {theme.mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            className={`reply-mode-button ${
              workspaceMode === "reply" ? "active" : ""
            }`}
            onClick={() => setWorkspaceMode("reply")}
          >
            <MessageCircleReply size={15} />
            <span>日常回复</span>
          </button>
          <button
            className="config-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={16} />
            <span>设置</span>
            <span
              className={`config-dot ${settings.hasApiKey ? "ready" : ""}`}
            />
          </button>
        </div>
      </header>

      <button
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-label="关闭导航"
        tabIndex={sidebarOpen ? 0 : -1}
      />
      <div className="app-body">
        <Sidebar
          templates={availableTemplates}
          projects={projects}
          activeTemplateId={activeTemplateId}
          history={history}
          activeHistoryId={activeHistoryId}
          activeProjectId={activeProjectId}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectTemplate={handleSelectTemplate}
          onCreateTemplate={() => setTemplateEditor("new")}
          onEditTemplate={setTemplateEditor}
          onSelectProject={handleSelectProject}
          onCreateProject={() => setProjectEditor("new")}
          onEditProject={setProjectEditor}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
          onClearHistory={handleClearHistory}
          onExport={handleExport}
        />

        <main
          id="main-workspace"
          aria-busy={stage === "analyzing" || stage === "generating"}
          className={`studio ${
            workspaceMode === "reply" ? "reply-mode" : ""
          }`}
        >
          {workspaceMode === "reply" ? (
            <ReplyAssistant
              project={activeProject}
              model={settings.model}
              onExit={() => setWorkspaceMode("prompt")}
              onOpenSettings={() => setSettingsOpen(true)}
              onToast={showToast}
            />
          ) : (
            <>
              <PromptWorkspace
            template={activeTemplate}
            project={activeProject}
            backgroundInfo={backgroundInfo}
            setBackgroundInfo={setBackgroundInfo}
            attachments={attachments}
            setAttachments={setAttachments}
            attachmentBusy={attachmentBusy}
            setAttachmentBusy={setAttachmentBusy}
            interactionContextPanel={
              <ProjectHistorySources
                project={activeProject}
                histories={projectHistories}
                selectedIds={selectedHistoryIds}
                summaries={historySummaryResult?.summaries ?? []}
                summaryFresh={summaryFresh}
                summarizing={summarizingHistories}
                distilling={distillingTemplate}
                budgetTokens={contextBudgetTokens}
                budget={interactionBudget}
                disabled={stage === "analyzing" || stage === "generating"}
                onToggle={handleToggleHistory}
                onSummarize={handleSummarizeHistories}
                onDistill={handleDistillTemplate}
                onBudgetChange={(tokens) =>
                  setContextBudgetTokens(
                    Math.min(1_000_000, Math.max(4_096, tokens)),
                  )
                }
              />
            }
            interactionContextReady={interactionContextReady}
            visionSupported={visionSupported}
            model={settings.model}
            keepAttachmentsAfterSubmit={keepAttachmentsAfterSubmit}
            setKeepAttachmentsAfterSubmit={setKeepAttachmentsAfterSubmit}
            originalPrompt={originalPrompt}
            setOriginalPrompt={setOriginalPrompt}
            rounds={rounds}
            currentQuestions={currentQuestions}
            answers={answers}
            setAnswers={setAnswers}
            rationale={rationale}
            stage={stage}
            error={error}
            onDismissError={() => setError("")}
            onStart={handleStart}
            onSubmitAnswers={handleSubmitAnswers}
            onNew={handleNew}
            onOpenVariableWorkflow={() => {
              setTemplateDistillation(null);
              setVariableDialogOpen(true);
            }}
            batchProgress={batchProgress}
              />
              <ResultPanel
            prompt={optimizedPrompt}
            stage={stage}
            tokensUsed={tokensUsed}
            model={settings.model}
            variants={variants}
            activeVariantId={activeVariantId}
            onCopy={() => handleCopy(optimizedPrompt)}
            onCopyAll={handleCopyAllVariants}
            onSelectVariant={handleSelectVariant}
            onRegenerate={handleRegenerate}
            onRevise={handleRevisePrompt}
            revisionCount={revisionCount}
            batchProgress={batchProgress}
            attachmentNames={lastReadAttachmentNames}
            sourceHistoryIds={lastSourceHistoryIds}
            roleDecision={roleDecision}
              />
            </>
          )}
        </main>
      </div>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(nextSettings) => {
            setSettings(nextSettings);
            setSettingsOpen(false);
            showToast("模型配置已保存");
          }}
        />
      )}

      {templateEditor && (
        <TemplateDialog
          template={templateEditor === "new" ? undefined : templateEditor}
          onClose={() => setTemplateEditor(null)}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
        />
      )}

      {projectEditor && (
        <ProjectDialog
          project={projectEditor === "new" ? undefined : projectEditor}
          onClose={() => setProjectEditor(null)}
          onSave={handleSaveProject}
          onDelete={handleDeleteProject}
        />
      )}

      {variableDialogOpen && (
        <VariableWorkflowDialog
          distillation={templateDistillation}
          onClose={() => {
            setVariableDialogOpen(false);
            setTemplateDistillation(null);
          }}
          onToast={showToast}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          actions={commandActions}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
