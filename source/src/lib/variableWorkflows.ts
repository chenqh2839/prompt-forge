import type {
  TemplateSection,
  TemplateSectionKind,
  TemplateSourceMapping,
  VariableDefinition,
  VariableWorkflow,
  VariableWorkflowInput,
} from "../types";

const DEFAULT_SECTION_ORDER: Array<{
  title: string;
  kind: TemplateSectionKind;
}> = [
  { title: "角色", kind: "role" },
  { title: "任务", kind: "task" },
  { title: "上下文", kind: "context" },
  { title: "变量说明", kind: "variables" },
  { title: "规则", kind: "rules" },
  { title: "示例", kind: "examples" },
  { title: "输出格式", kind: "output" },
  { title: "质量检查", kind: "quality" },
];

function newSectionId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeSection(
  title: string,
  kind: TemplateSectionKind,
  content: string,
): TemplateSection {
  return { id: newSectionId(), title, kind, content };
}

export function createNeutralSections(): TemplateSection[] {
  const variables = new Map([
    ["role", "你是一名善于分析需求、组织信息并交付可执行结果的专业助手。"],
    ["task", "围绕 {{topic}}，为 {{audience}} 完成以下任务：\n\n{{goal}}\n\n请结合 {{context}} 展开，避免脱离已知信息。"],
    ["context", "补充与本次任务有关的事实、已有决策、限制条件和参考材料。\n\n{{context}}"],
    ["variables", "发送前请替换以下占位符；某项不适用时可填写“不适用”，不要删除本说明。"],
    ["rules", "- 只使用已知信息，不编造事实或来源。\n- 明确区分事实、推断和建议。\n- 严格遵守用户给出的范围与限制。"],
    ["examples", "示例输入：为主题 X、受众 Y 写一份执行方案。\n\n示例输出：先说明目标与受众，再给出分步骤执行建议和验收标准。"],
    ["output", "使用 Markdown 输出，包含清晰标题、分段说明、可执行步骤和结论。"],
    ["quality", "- [ ] 是否准确回应任务目标？\n- [ ] 是否遵守上下文和约束？\n- [ ] 是否存在无法核验的虚构内容？\n- [ ] 结果是否可以直接使用？"],
  ]);
  return DEFAULT_SECTION_ORDER.map(({ title, kind }) =>
    makeSection(title, kind, variables.get(kind) ?? ""),
  );
}

export function createBlankSection(
  title = "自定义章节",
  kind: TemplateSectionKind = "custom",
): TemplateSection {
  return makeSection(title, kind, "");
}

export const variableWorkflows: VariableWorkflow[] = [
  {
    id: "general-prompt-template",
    name: "通用提示词模板",
    shortName: "GENERAL",
    description: "适用于大多数任务的可复用提示词骨架，通过变量适配不同主题、受众与背景",
    role: "你是一名善于分析需求、组织信息并交付可执行结果的专业助手。",
    task: "围绕 {{topic}}，为 {{audience}} 完成以下任务：\n\n{{goal}}\n\n请结合 {{context}} 展开，避免脱离已知信息。",
    skeleton:
      "补充与本次任务有关的事实、已有决策、限制条件和参考材料。\n\n{{context}}",
    rules: [
      "只使用已知信息，不编造事实或来源。",
      "明确区分事实、推断和建议。",
      "严格遵守用户给出的范围与限制。",
    ],
    examples: [
      "示例输入：为主题 X、受众 Y 写一份执行方案。",
      "示例输出：先说明目标与受众，再给出分步骤执行建议和验收标准。",
    ],
    outputFormat:
      "使用 Markdown 输出，包含清晰标题、分段说明、可执行步骤和结论。",
    qualityCheck:
      "检查是否准确回应任务目标、是否遵守上下文和约束、是否存在无法核验的虚构内容、结果是否可以直接使用。",
    sections: createNeutralSections(),
    sourceHistoryIds: [],
    sourceMappings: [],
    variables: [
      {
        key: "topic",
        label: "主题",
        description: "本次提示词要处理的主题或问题",
        defaultValue: "如何提升团队协作效率",
      },
      {
        key: "audience",
        label: "目标受众",
        description: "最终内容的阅读者或服务对象",
        defaultValue: "中小团队负责人",
      },
      {
        key: "goal",
        label: "任务目标",
        description: "希望 AI 最终完成的具体成果",
        defaultValue: "形成一份可以在两周内落地的改进方案",
      },
      {
        key: "context",
        label: "任务上下文",
        description: "已有背景、限制、资料和必须保留的信息",
        defaultValue: "团队目前使用异步协作，会议过多，决策记录分散",
      },
    ],
  },
];

export function renderVariableSkeleton(
  skeleton: string,
  values: Record<string, string>,
) {
  return skeleton.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (token, key) => {
    return values[key] ?? token;
  });
}

export function ensureWorkflowSections(
  workflow: VariableWorkflow | VariableWorkflowInput,
): TemplateSection[] {
  if (Array.isArray(workflow.sections) && workflow.sections.length) {
    return workflow.sections.map((section) => ({ ...section }));
  }
  const legacy = workflow as VariableWorkflowInput;
  return [
    legacy.role
      ? makeSection("角色", "role", legacy.role)
      : null,
    legacy.task
      ? makeSection("任务", "task", legacy.task)
      : null,
    makeSection("上下文", "context", legacy.skeleton || ""),
    makeSection(
      "变量说明",
      "variables",
      "发送前请替换以下占位符；某项不适用时可填写“不适用”。",
    ),
    makeSection("规则", "rules", legacy.rules?.join("\n") || ""),
    makeSection("示例", "examples", legacy.examples?.join("\n\n") || ""),
    makeSection("输出格式", "output", legacy.outputFormat || ""),
    makeSection("质量检查", "quality", legacy.qualityCheck || ""),
  ].filter((section): section is TemplateSection => Boolean(section));
}

function effectiveSections(
  workflow: VariableWorkflow | VariableWorkflowInput,
) {
  const sections = ensureWorkflowSections(workflow);
  if (!sections.some((section) => section.kind === "variables")) {
    sections.push(
      makeSection("变量说明", "variables", "发送前请替换以下占位符。"),
    );
  }
  return sections;
}

function variableGuide(
  variables: VariableDefinition[],
  values?: Record<string, string>,
) {
  return variables
    .map((variable) => {
      if (values) {
        return `- ${variable.label}：${values[variable.key] || "未填写"}`;
      }
      return `- {{${variable.key}}} — ${variable.label}：${
        variable.description || "按本次任务填写"
      }。参考值：${variable.defaultValue}`;
    })
    .join("\n");
}

function renderSections(
  workflow: VariableWorkflow,
  values?: Record<string, string>,
) {
  return effectiveSections(workflow).map((section) => {
    const content =
      section.kind === "variables"
        ? [section.content.trim(), variableGuide(workflow.variables, values)]
            .filter(Boolean)
            .join("\n\n")
        : values
          ? renderVariableSkeleton(section.content, values)
          : section.content;
    return content.trim() ? `## ${section.title}\n${content.trim()}` : "";
  });
}

export function renderWorkflowPrompt(
  workflow: VariableWorkflow,
  values: Record<string, string>,
) {
  return [`# ${workflow.name}`, ...renderSections(workflow, values)]
    .filter(Boolean)
    .join("\n\n");
}

export function buildCopyablePromptTemplate(workflow: VariableWorkflow) {
  return [
    `# ${workflow.name}`,
    "> 使用说明：复制后先替换下方所有 {{变量占位符}}，再发送给任意 AI 对话工具。",
    ...renderSections(workflow),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function findUndefinedPlaceholders(
  _skeleton: string,
  workflow: VariableWorkflow,
) {
  const defined = new Set(workflow.variables.map((variable) => variable.key));
  const searchable = ensureWorkflowSections(workflow)
    .filter((section) => section.kind !== "variables")
    .map((section) => section.content)
    .join("\n");
  return [...searchable.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((key) => !defined.has(key));
}

const SECTION_KINDS: TemplateSectionKind[] = [
  "role",
  "task",
  "context",
  "variables",
  "rules",
  "examples",
  "output",
  "quality",
  "custom",
];

export function parseVariableTemplateBundle(raw: string): VariableWorkflowInput {
  const parsed = JSON.parse(raw) as {
    format?: string;
    version?: number;
    template?: {
      name?: unknown;
      description?: unknown;
      sections?: unknown;
      variables?: unknown;
      sourceHistoryIds?: unknown;
      sourceMappings?: unknown;
    };
  };
  if (
    parsed.format !== "prompt-forge-variable-template" ||
    parsed.version !== 1 ||
    !parsed.template
  ) {
    throw new Error("不是有效的 Prompt Forge 变量模板文件。");
  }
  const name = typeof parsed.template.name === "string" ? parsed.template.name : "";
  const description =
    typeof parsed.template.description === "string"
      ? parsed.template.description
      : "";
  const variables = Array.isArray(parsed.template.variables)
    ? (parsed.template.variables as VariableDefinition[])
    : [];
  const sections = Array.isArray(parsed.template.sections)
    ? (parsed.template.sections as TemplateSection[])
        .filter(
          (section) =>
            typeof section?.id === "string" &&
            typeof section?.title === "string" &&
            typeof section?.content === "string" &&
            SECTION_KINDS.includes(section?.kind),
        )
        .map((section) => ({
          ...section,
          id: newSectionId(),
        }))
    : [];
  const sourceHistoryIds = Array.isArray(parsed.template.sourceHistoryIds)
    ? (parsed.template.sourceHistoryIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && Boolean(id.trim()),
      )
    : [];
  const sourceMappings = Array.isArray(parsed.template.sourceMappings)
    ? (parsed.template.sourceMappings as TemplateSourceMapping[]).filter(
        (mapping) =>
          typeof mapping?.historyId === "string" &&
          typeof mapping?.targetType === "string" &&
          typeof mapping?.targetId === "string" &&
          typeof mapping?.reason === "string",
      )
    : [];
  if (!name.trim() || !sections.length || !variables.length) {
    throw new Error("模板文件缺少名称、章节或变量定义。");
  }
  const legacy = legacyFieldsFromSections(sections);
  return {
    name,
    description,
    sections,
    variables,
    sourceHistoryIds,
    sourceMappings,
    ...legacy,
  };
}

export function buildVariableTemplateBundle(workflow: VariableWorkflow) {
  return JSON.stringify(
    {
      format: "prompt-forge-variable-template",
      version: 1,
      exportedAt: new Date().toISOString(),
      template: {
        name: workflow.name,
        description: workflow.description,
        sections: effectiveSections(workflow),
        variables: workflow.variables,
        sourceHistoryIds: workflow.sourceHistoryIds ?? [],
        sourceMappings: workflow.sourceMappings ?? [],
      },
    },
    null,
    2,
  );
}

export function legacyFieldsFromSections(sections: TemplateSection[]) {
  const contentFor = (kind: TemplateSectionKind) =>
    sections.find((section) => section.kind === kind)?.content.trim() ?? "";
  return {
    role: contentFor("role"),
    task: contentFor("task"),
    skeleton: contentFor("context"),
    rules: contentFor("rules")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*\d.、]+\s*/, "").trim())
      .filter(Boolean),
    examples: contentFor("examples")
      .split(/\r?\n\s*\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    outputFormat: contentFor("output"),
    qualityCheck: contentFor("quality"),
  };
}
