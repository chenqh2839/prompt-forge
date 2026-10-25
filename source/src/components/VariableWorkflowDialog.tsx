import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  ClipboardCopy,
  CopyPlus,
  Download,
  Eye,
  FileJson,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { bridge } from "../lib/bridge";
import {
  buildCopyablePromptTemplate,
  buildVariableTemplateBundle,
  createBlankSection,
  createNeutralSections,
  ensureWorkflowSections,
  findUndefinedPlaceholders,
  legacyFieldsFromSections,
  parseVariableTemplateBundle,
  renderWorkflowPrompt,
  variableWorkflows as builtInWorkflows,
} from "../lib/variableWorkflows";
import type {
  TemplateSection,
  TemplateDistillationResult,
  VariableDefinition,
  VariableWorkflow,
  VariableWorkflowInput,
} from "../types";

interface VariableWorkflowDialogProps {
  onClose: () => void;
  onToast: (message: string) => void;
  distillation?: TemplateDistillationResult | null;
}

type DialogMode = "use" | "create" | "edit";

function workflowToInput(workflow: VariableWorkflow): VariableWorkflowInput {
  const sections = ensureWorkflowSections(workflow);
  const legacy = legacyFieldsFromSections(sections);
  return {
    id: workflow.isCustom ? workflow.id : undefined,
    name: workflow.name,
    description: workflow.description,
    sections,
    variables: workflow.variables.map((variable) => ({ ...variable })),
    sourceHistoryIds: [...(workflow.sourceHistoryIds ?? [])],
    sourceMappings: [...(workflow.sourceMappings ?? [])],
    ...legacy,
  };
}

function emptyWorkflowInput(): VariableWorkflowInput {
  const sections = createNeutralSections();
  const legacy = legacyFieldsFromSections(sections);
  return {
    name: "我的通用提示词模板",
    description: "通过有序章节和变量占位符，形成可重复使用的提示词模板",
    sections,
    sourceHistoryIds: [],
    sourceMappings: [],
    variables: [
      {
        key: "topic",
        label: "主题",
        description: "本次任务的主题或问题",
        defaultValue: "待填写主题",
      },
      {
        key: "audience",
        label: "目标受众",
        description: "内容面向的人群",
        defaultValue: "待填写受众",
      },
      {
        key: "goal",
        label: "任务目标",
        description: "希望得到的具体成果",
        defaultValue: "待填写目标",
      },
      {
        key: "context",
        label: "任务上下文",
        description: "已有背景、事实、限制和参考资料",
        defaultValue: "待填写上下文",
      },
    ],
    ...legacy,
  };
}

function validateDraft(draft: VariableWorkflowInput) {
  if (!draft.name.trim()) return "请输入模板名称。";
  if (!draft.description.trim()) return "请填写模板用途说明。";
  if (!draft.sections.length) return "模板至少需要一个章节。";
  if (!draft.sections.some((section) => section.kind === "variables")) {
    return "模板必须包含一个“变量说明”章节。";
  }
  if (draft.sections.some((section) => !section.title.trim())) {
    return "章节名称不能为空。";
  }
  if (!draft.variables.length) return "模板至少需要一个变量。";

  const keys = new Set<string>();
  for (const variable of draft.variables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(variable.key.trim())) {
      return `变量 key“${variable.key}”无效，只能使用英文字母、数字和下划线，且不能以数字开头。`;
    }
    const normalized = variable.key.trim().toLowerCase();
    if (keys.has(normalized)) return `变量 key“${variable.key}”重复。`;
    keys.add(normalized);
    if (!variable.label.trim() || !variable.defaultValue.trim()) {
      return `请补全变量“${variable.key}”的名称和默认值。`;
    }
  }

  const bodyText = draft.sections
    .filter((section) => section.kind !== "variables")
    .map((section) => section.content)
    .join("\n");
  const placeholders = [
    ...bodyText.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g),
  ].map((match) => match[1]);
  const undefined = placeholders.filter(
    (key) => !keys.has(key.toLowerCase()),
  );
  if (undefined.length) {
    return `模板包含未定义变量：${[...new Set(undefined)]
      .map((key) => `{{${key}}}`)
      .join("、")}`;
  }
  const missing = [...keys].filter(
    (key) => !placeholders.some((item) => item.toLowerCase() === key),
  );
  if (missing.length) {
    return `以下变量没有出现在模板章节中：${missing.join("、")}`;
  }
  return "";
}

function formatFileName(value: string) {
  const safe = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${safe || "prompt-template"}.json`;
}

export function VariableWorkflowDialog({
  onClose,
  onToast,
  distillation,
}: VariableWorkflowDialogProps) {
  const [workflows, setWorkflows] =
    useState<VariableWorkflow[]>(builtInWorkflows);
  const [selectedId, setSelectedId] = useState(builtInWorkflows[0].id);
  const [mode, setMode] = useState<DialogMode>("use");
  const [editorDraft, setEditorDraft] =
    useState<VariableWorkflowInput | null>(null);
  const [candidateValues, setCandidateValues] = useState<Record<string, string>>(
    Object.fromEntries(
      builtInWorkflows[0].variables.map((variable) => [
        variable.key,
        variable.defaultValue,
      ]),
    ),
  );
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [previewMode, setPreviewMode] = useState<"original" | "filled" | null>(
    null,
  );
  const [copyMessage, setCopyMessage] = useState("");

  const workflow =
    workflows.find((item) => item.id === selectedId) ?? workflows[0];
  const sections = useMemo(
    () => ensureWorkflowSections(workflow),
    [workflow],
  );
  const originalPrompt = useMemo(
    () => buildCopyablePromptTemplate(workflow),
    [workflow],
  );
  const filledPrompt = useMemo(
    () => renderWorkflowPrompt(workflow, candidateValues),
    [candidateValues, workflow],
  );
  const undefinedPlaceholders = useMemo(
    () => findUndefinedPlaceholders("", workflow),
    [workflow],
  );

  useEffect(() => {
    void bridge
      .listVariableTemplates()
      .then((customTemplates) => {
        setWorkflows([...builtInWorkflows, ...customTemplates]);
      })
      .catch((loadError) => {
        setError(
          `读取自定义变量模板失败：${
            loadError instanceof Error ? loadError.message : String(loadError)
          }`,
        );
      })
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    if (!distillation) return;
    const legacy = legacyFieldsFromSections(distillation.sections);
    setEditorDraft({
      name: distillation.name,
      description: distillation.description,
      sections: distillation.sections,
      variables: distillation.variables,
      sourceHistoryIds: distillation.sourceHistoryIds,
      sourceMappings: distillation.sourceMappings,
      ...legacy,
    });
    setMode("create");
    setError("");
    setPreviewMode(null);
    setCopyMessage("");
  }, [distillation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mode === "use") onClose();
      else {
        setMode("use");
        setEditorDraft(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onClose]);

  const initializeCandidates = (next: VariableWorkflow) => {
    setCandidateValues(
      Object.fromEntries(
        next.variables.map((variable) => [
          variable.key,
          variable.defaultValue,
        ]),
      ),
    );
  };

  const selectWorkflow = (next: VariableWorkflow) => {
    setSelectedId(next.id);
    initializeCandidates(next);
    setMode("use");
    setError("");
    setPreviewMode(null);
    setCopyMessage("");
  };

  const openEditor = (next: VariableWorkflow, asCopy: boolean) => {
    const draft = workflowToInput(next);
    if (asCopy || !next.isCustom) {
      draft.id = undefined;
      draft.name = `${next.name}（自定义）`;
    }
    setEditorDraft(draft);
    setMode(asCopy || !next.isCustom ? "create" : "edit");
    setError("");
    setCopyMessage("");
  };

  const beginCreate = () => {
    setEditorDraft(emptyWorkflowInput());
    setMode("create");
    setError("");
  };

  const handleSave = async () => {
    if (!editorDraft) return;
    const prepared: VariableWorkflowInput = {
      ...editorDraft,
      name: editorDraft.name.trim(),
      description: editorDraft.description.trim(),
      sections: editorDraft.sections.map((section) => ({
        ...section,
        title: section.title.trim(),
        content: section.content.trim(),
      })),
      ...legacyFieldsFromSections(editorDraft.sections),
    };
    const validationError = validateDraft(prepared);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await bridge.saveVariableTemplate(prepared);
      setWorkflows((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      setSelectedId(saved.id);
      initializeCandidates(saved);
      setEditorDraft(null);
      setMode("use");
      onToast("变量模板已保存");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow.isCustom) return;
    if (!window.confirm(`删除变量模板“${workflow.name}”？`)) return;
    setError("");
    try {
      await bridge.deleteVariableTemplate(workflow.id);
      const nextWorkflows = workflows.filter(
        (item) => item.id !== workflow.id,
      );
      setWorkflows(nextWorkflows);
      selectWorkflow(nextWorkflows[0] ?? builtInWorkflows[0]);
      onToast("变量模板已删除");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError("");
    try {
      const raw = await bridge.importVariableTemplateFile();
      if (!raw) return;
      const imported = parseVariableTemplateBundle(raw);
      setEditorDraft(imported);
      setMode("create");
      onToast("模板已导入，请检查后保存");
    } catch (importError) {
      setError(
        `导入失败：${
          importError instanceof Error
            ? importError.message
            : String(importError)
        }`,
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const path = await bridge.exportVariableTemplateFile({
        content: buildVariableTemplateBundle(workflow),
        suggestedName: formatFileName(workflow.name),
      });
      if (path) onToast(`模板已导出到 ${path}`);
    } catch (exportError) {
      setError(
        `导出失败：${
          exportError instanceof Error
            ? exportError.message
            : String(exportError)
        }`,
      );
    } finally {
      setExporting(false);
    }
  };

  const copyText = async (kind: "original" | "filled") => {
    setError("");
    setCopyMessage("");
    const text = kind === "original" ? originalPrompt : filledPrompt;
    try {
      await navigator.clipboard.writeText(text);
      setPreviewMode(kind);
      setCopyMessage(
        kind === "original"
          ? "已复制原始模板，变量占位符和填写说明均已保留。"
          : "已复制已填值提示词，可以直接发送给 AI。",
      );
    } catch {
      setPreviewMode(kind);
      setError("复制失败，请从预览中手动选择文本。");
    }
  };

  const updateSection = (
    id: string,
    field: keyof Pick<TemplateSection, "title" | "content">,
    value: string,
  ) => {
    setEditorDraft((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((section) =>
              section.id === id ? { ...section, [field]: value } : section,
            ),
          }
        : current,
    );
    setError("");
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setEditorDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
  };

  const updateVariable = (
    index: number,
    field: keyof VariableDefinition,
    value: string,
  ) => {
    setEditorDraft((current) =>
      current
        ? {
            ...current,
            variables: current.variables.map((variable, variableIndex) =>
              variableIndex === index
                ? { ...variable, [field]: value }
                : variable,
            ),
          }
        : current,
    );
    setError("");
  };

  const isEditing = mode !== "use" && editorDraft;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="variable-modal"
        role="dialog"
        aria-modal="true"
        aria-label="变量提示词模板"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">
              REUSABLE PROMPT / {mode === "use" ? "TEMPLATE" : "EDITOR"}
            </span>
            <h2>
              {isEditing
                ? mode === "edit"
                  ? "编辑提示词模板"
                  : "新建提示词模板"
                : workflow.name}
            </h2>
            <p>
              {isEditing
                ? "章节名称、顺序和内容均可调整；变量说明会自动生成填写提示。"
                : workflow.description}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {isEditing ? (
          <div className="variable-editor">
            <div className="variable-editor-grid">
              <label>
                <span>模板名称</span>
                <input
                  value={editorDraft.name}
                  maxLength={50}
                  onChange={(event) =>
                    setEditorDraft({ ...editorDraft, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>用途说明</span>
                <input
                  value={editorDraft.description}
                  maxLength={160}
                  onChange={(event) =>
                    setEditorDraft({
                      ...editorDraft,
                      description: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            {editorDraft.sourceMappings?.length ? (
              <div className="template-source-mapping">
                <div>
                  <strong>交互内容 → 模板章节映射</strong>
                  <small>保存前请核对每条来源是否被合理归纳</small>
                </div>
                <div className="template-map-table">
                  {editorDraft.sourceMappings.map((mapping, index) => (
                    <div key={`${mapping.historyId}-${index}`}>
                      <span>{mapping.sourceTitle}</span>
                      <code>{mapping.historyId}</code>
                      <span>
                        {mapping.targetType === "section" ? "章节" : "变量"} ·{" "}
                        {mapping.targetLabel}
                      </span>
                      <p>{mapping.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="editor-section-head">
              <span>模板章节</span>
              <button
                onClick={() =>
                  setEditorDraft({
                    ...editorDraft,
                    sections: [...editorDraft.sections, createBlankSection()],
                  })
                }
              >
                <Plus size={12} />
                添加章节
              </button>
            </div>
            <div className="template-section-editor-list">
              {editorDraft.sections.map((section, index) => (
                <article className="template-section-editor" key={section.id}>
                  <div className="template-section-editor-head">
                    <input
                      value={section.title}
                      aria-label={`章节 ${index + 1} 名称`}
                      onChange={(event) =>
                        updateSection(section.id, "title", event.target.value)
                      }
                    />
                    <button
                      onClick={() => moveSection(index, -1)}
                      disabled={index === 0}
                      aria-label="上移章节"
                      title="上移"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => moveSection(index, 1)}
                      disabled={index === editorDraft.sections.length - 1}
                      aria-label="下移章节"
                      title="下移"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() =>
                        setEditorDraft({
                          ...editorDraft,
                          sections: editorDraft.sections.filter(
                            (item) => item.id !== section.id,
                          ),
                        })
                      }
                      disabled={section.kind === "variables"}
                      aria-label="删除章节"
                      title={
                        section.kind === "variables"
                          ? "变量说明章节用于承载填写提示，不能删除"
                          : "删除章节"
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <textarea
                    value={section.content}
                    aria-label={`${section.title}内容`}
                    onChange={(event) =>
                      updateSection(section.id, "content", event.target.value)
                    }
                    placeholder={
                      section.kind === "variables"
                        ? "可补充变量填写规则；变量列表会自动附在本章节后。"
                        : "填写章节正文，可使用 {{variable_key}} 占位符"
                    }
                  />
                  {section.kind === "variables" && (
                    <small className="template-section-editor-note">
                      变量 key、名称、说明和参考值在下方统一维护，并自动加入此章节。
                    </small>
                  )}
                </article>
              ))}
            </div>

            <div className="editor-section-head">
              <span>变量定义</span>
              <button
                onClick={() =>
                  setEditorDraft({
                    ...editorDraft,
                    variables: [
                      ...editorDraft.variables,
                      {
                        key: `variable_${editorDraft.variables.length + 1}`,
                        label: "新变量",
                        description: "",
                        defaultValue: "",
                      },
                    ],
                  })
                }
              >
                <Plus size={12} />
                添加变量
              </button>
            </div>
            <div className="variable-editor-list">
              {editorDraft.variables.map((variable, index) => (
                <div className="variable-editor-row" key={index}>
                  <input
                    value={variable.key}
                    onChange={(event) =>
                      updateVariable(index, "key", event.target.value)
                    }
                    placeholder="key"
                    aria-label={`变量 ${index + 1} key`}
                  />
                  <input
                    value={variable.label}
                    onChange={(event) =>
                      updateVariable(index, "label", event.target.value)
                    }
                    placeholder="显示名称"
                    aria-label={`变量 ${index + 1} 名称`}
                  />
                  <input
                    value={variable.defaultValue}
                    onChange={(event) =>
                      updateVariable(index, "defaultValue", event.target.value)
                    }
                    placeholder="参考默认值"
                    aria-label={`变量 ${index + 1} 默认值`}
                  />
                  <input
                    value={variable.description}
                    onChange={(event) =>
                      updateVariable(index, "description", event.target.value)
                    }
                    placeholder="填写说明"
                    aria-label={`变量 ${index + 1} 说明`}
                  />
                  <button
                    onClick={() =>
                      setEditorDraft({
                        ...editorDraft,
                        variables: editorDraft.variables.filter(
                          (_, variableIndex) => variableIndex !== index,
                        ),
                      })
                    }
                    disabled={editorDraft.variables.length <= 1}
                    title="删除变量"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="ip-warning">
              <TriangleAlert size={15} />
              <span>
                使用知名 IP、角色、真实人物或品牌时，请核验版权、商标、肖像权和平台政策。
                此处仅作提醒，不会阻止保存或生成。
              </span>
            </div>

            {error && <div className="connection-message error">{error}</div>}
            <div className="modal-foot">
              <button
                className="secondary-button"
                onClick={() => {
                  setMode("use");
                  setEditorDraft(null);
                  setError("");
                }}
              >
                取消
              </button>
              <button
                className="primary-button"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                保存提示词模板
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="template-library-bar">
              <select
                value={workflow.id}
                onChange={(event) => {
                  const next = workflows.find(
                    (item) => item.id === event.target.value,
                  );
                  if (next) selectWorkflow(next);
                }}
                disabled={loadingTemplates}
              >
                <optgroup label="内置模板">
                  {workflows
                    .filter((item) => !item.isCustom)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </optgroup>
                {workflows.some((item) => item.isCustom) && (
                  <optgroup label="自定义模板">
                    {workflows
                      .filter((item) => item.isCustom)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <button onClick={beginCreate} title="新建提示词模板">
                <Plus size={13} />
                新建
              </button>
              <button
                onClick={() => openEditor(workflow, true)}
                title="复制为自定义模板"
              >
                <CopyPlus size={13} />
                复制
              </button>
              <button
                onClick={() => openEditor(workflow, false)}
                title={
                  workflow.isCustom
                    ? "编辑当前模板"
                    : "复制并编辑内置模板"
                }
              >
                <Pencil size={13} />
                {workflow.isCustom ? "编辑" : "编辑模板"}
              </button>
              <button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Upload size={13} />
                )}
                导入
              </button>
              <button onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Download size={13} />
                )}
                导出
              </button>
              {workflow.isCustom && (
                <button
                  className="danger"
                  onClick={handleDelete}
                  title="删除当前模板"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div className="variable-context-strip">
              <span>
                <Braces size={13} />
                {workflow.isCustom ? "自定义模板" : "内置模板"}
              </span>
              <span>
                <FileJson size={13} />
                {sections.length} 个章节
              </span>
              <span>{workflow.variables.length} 个变量</span>
            </div>

            {workflow.sourceMappings?.length ? (
              <details className="template-provenance">
                <summary>
                  来源追溯 · {workflow.sourceHistoryIds?.length ?? 0} 条项目历史
                </summary>
                <div className="template-map-table">
                  {workflow.sourceMappings.map((mapping, index) => (
                    <div key={`${mapping.historyId}-${index}`}>
                      <span>{mapping.sourceTitle}</span>
                      <code>{mapping.historyId}</code>
                      <span>
                        {mapping.targetType === "section" ? "章节" : "变量"} ·{" "}
                        {mapping.targetLabel}
                      </span>
                      <p>{mapping.reason}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="template-structure-panel">
              <div className="template-structure-head">
                <div>
                  <strong>模板结构</strong>
                  <small>章节按当前顺序组合；变量说明由变量定义自动生成</small>
                </div>
                <button onClick={() => openEditor(workflow, false)}>
                  <Pencil size={12} />
                  编辑章节
                </button>
              </div>
              <div className="template-section-list">
                {sections.map((section) => (
                  <article
                    className={
                      section.kind === "context" ? "template-section-main" : ""
                    }
                    key={section.id}
                  >
                    <span>{section.title}</span>
                    {section.kind === "variables" ? (
                      <>
                        {section.content && <p>{section.content}</p>}
                        <ul>
                          {workflow.variables.map((variable) => (
                            <li key={variable.key}>
                              <code>{`{{${variable.key}}}`}</code>
                              {variable.label}：{variable.description}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <pre>{section.content || "（空白章节）"}</pre>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="variable-grid">
              {workflow.variables.map((variable) => (
                <label key={variable.key}>
                  <span>
                    {variable.label}
                    <code>{`{{${variable.key}}}`}</code>
                  </span>
                  <input
                    value={candidateValues[variable.key] ?? ""}
                    onChange={(event) => {
                      setCandidateValues((current) => ({
                        ...current,
                        [variable.key]: event.target.value,
                      }));
                      setCopyMessage("");
                    }}
                    placeholder={variable.description}
                  />
                </label>
              ))}
            </div>

            <div className="template-export-bar">
              <div>
                <strong>两种可直接使用的版本</strong>
                <small>原始模板保留占位符；填值版本会替换全部变量</small>
              </div>
              <button onClick={() => setPreviewMode("original")}>
                <Eye size={13} />
                查看原始模板
              </button>
              <button onClick={() => setPreviewMode("filled")}>
                <Eye size={13} />
                查看已填值版本
              </button>
              <button onClick={() => copyText("original")}>
                <ClipboardCopy size={14} />
                复制原始模板
              </button>
              <button className="primary-button" onClick={() => copyText("filled")}>
                <Sparkles size={14} />
                复制已填值提示词
              </button>
            </div>
            {copyMessage && (
              <div className="template-copy-note" role="status">
                {copyMessage}
              </div>
            )}
            {undefinedPlaceholders.length > 0 && (
              <div className="connection-message error">
                未定义变量：
                {[...new Set(undefinedPlaceholders)]
                  .map((key) => `{{${key}}}`)
                  .join("、")}
              </div>
            )}
            {error && <div className="connection-message error">{error}</div>}
            {previewMode && (
              <label className="template-prompt-preview">
                <span>
                  {previewMode === "original"
                    ? "原始模板：保留变量占位符与填写说明"
                    : "已填值版本：可直接发送给 AI"}
                </span>
                <textarea
                  readOnly
                  value={
                    previewMode === "original" ? originalPrompt : filledPrompt
                  }
                  spellCheck={false}
                />
              </label>
            )}

            <div className="ip-warning">
              <TriangleAlert size={15} />
              <span>
                使用知名 IP、角色、真实人物或品牌时，请核验版权、商标、肖像权和平台政策。
                此处仅作提醒，不会阻止复制或使用。
              </span>
            </div>

            <div className="modal-foot">
              <span className="variable-token-note">
                模板编辑与复制仅在本机完成，不调用模型，也不会产生 Token 费用
              </span>
              <div>
                <button className="secondary-button" onClick={onClose}>
                  关闭
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
