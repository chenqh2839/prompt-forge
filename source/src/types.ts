export type Stage =
  | "idle"
  | "analyzing"
  | "clarifying"
  | "generating"
  | "complete";

export type ProviderId = "openai" | "deepseek" | "claude-gateway" | "ollama";

export type AttachmentKind = "image" | "document";

export interface PromptAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
  content: string;
  previewUrl?: string;
  truncated?: boolean;
}

export interface AttachmentPayload {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
  content: string;
  truncated?: boolean;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  why: string;
}

export interface ClarificationTurn {
  round: number;
  questions: ClarificationQuestion[];
  answers: Record<string, string>;
}

export interface PromptAnalysis {
  action: "clarify" | "complete";
  rationale: string;
  questions: ClarificationQuestion[];
  optimizedPrompt?: string;
  tokensUsed?: number;
}

export interface AppSettings {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface SettingsInput {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export type DataRootChangeMode = "existing" | "migrate";

export interface DataLocationStatus {
  currentRoot: string;
  configuredRoot?: string | null;
  defaultRoot: string;
  databasePath: string;
  webviewPath: string;
  bootstrapConfigPath: string;
  pendingRoot?: string | null;
  pendingMode?: DataRootChangeMode | null;
  restartRequired: boolean;
  warning?: string | null;
}

export interface DataRootInspection {
  targetRoot: string;
  hasExistingData: boolean;
  hasManagedData: boolean;
  hasForeignEntries: boolean;
}

export interface DataRootChangeRequest {
  targetRoot: string;
  mode: DataRootChangeMode;
}

export interface ProjectContext {
  id: string;
  name: string;
  goal: string;
  style: string;
  characters: string;
  historyContext: string;
  materials: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectInput {
  id?: string;
  name: string;
  goal: string;
  style: string;
  characters: string;
  historyContext: string;
  materials: string;
}

export interface ProjectContextPayload {
  name: string;
  goal: string;
  style: string;
  characters: string;
  historyContext: string;
  materials: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  originalPrompt: string;
  templateId: string;
  optimizedPrompt: string;
  transcriptJson: string;
  model: string;
  projectId?: string | null;
  attachmentsJson?: string;
  sourceHistoryIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryDraft {
  id?: string;
  title: string;
  originalPrompt: string;
  templateId: string;
  optimizedPrompt: string;
  transcriptJson: string;
  model: string;
  projectId?: string | null;
  attachmentsJson?: string;
  sourceHistoryIds?: string[];
}

export interface ProjectInteractionSummary {
  historyId: string;
  title: string;
  summary: string;
  constraints: string[];
  preferences: string[];
  decisions: string[];
  rejectedApproaches: string[];
  updatedAt: number;
}

export interface SummarizeProjectHistoriesInput {
  projectId: string;
  historyIds: string[];
  summaryVersion: number;
}

export interface ProjectHistorySummaryResult {
  cacheKey: string;
  sourceFingerprint: string;
  summaries: ProjectInteractionSummary[];
  createdAt: number;
}

export interface ProjectInteractionContext {
  historyIds: string[];
  summaries: ProjectInteractionSummary[];
  estimatedTokens: number;
}

export interface AnalyzeRequest {
  originalPrompt: string;
  templateId: string;
  templateName: string;
  templateFocus: string;
  backgroundContext?: string;
  revisionContext?: {
    feedback: string;
    previousOutput: string;
  };
  projectContext?: ProjectContextPayload;
  variableContext?: VariableRunContext;
  attachments?: AttachmentPayload[];
  projectInteractionContext?: ProjectInteractionContext;
  rounds: Array<{
    round: number;
    turns: Array<{
      question: string;
      why: string;
      answer: string;
    }>;
  }>;
  forceGenerate: boolean;
}

export interface VariableRunContext {
  workflowName: string;
  values: Array<{
    label: string;
    value: string;
  }>;
  rules: string[];
  examples: string[];
}

export interface VariableDefinition {
  key: string;
  label: string;
  description: string;
  defaultValue: string;
}

export type TemplateSectionKind =
  | "role"
  | "task"
  | "context"
  | "variables"
  | "rules"
  | "examples"
  | "output"
  | "quality"
  | "custom";

export interface TemplateSection {
  id: string;
  title: string;
  kind: TemplateSectionKind;
  content: string;
}

export interface VariableWorkflow {
  id: string;
  name: string;
  shortName: string;
  description: string;
  role: string;
  task: string;
  skeleton: string;
  variables: VariableDefinition[];
  rules: string[];
  examples: string[];
  outputFormat: string;
  qualityCheck: string;
  sections: TemplateSection[];
  sourceHistoryIds?: string[];
  sourceMappings?: TemplateSourceMapping[];
  isCustom?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface VariableWorkflowInput {
  id?: string;
  name: string;
  description: string;
  role: string;
  task: string;
  skeleton: string;
  variables: VariableDefinition[];
  rules: string[];
  examples: string[];
  outputFormat: string;
  qualityCheck: string;
  sections: TemplateSection[];
  sourceHistoryIds?: string[];
  sourceMappings?: TemplateSourceMapping[];
}

export interface TemplateSourceMapping {
  historyId: string;
  sourceTitle: string;
  targetType: "section" | "variable";
  targetId: string;
  targetLabel: string;
  reason: string;
}

export interface DistillTemplateInput {
  projectId: string;
  historyIds: string[];
}

export interface TemplateDistillationResult {
  name: string;
  description: string;
  sections: TemplateSection[];
  variables: VariableDefinition[];
  sourceHistoryIds: string[];
  sourceMappings: TemplateSourceMapping[];
}

export interface VariableTemplateFileExport {
  content: string;
  suggestedName: string;
}

export interface VariableInstance {
  id: string;
  label: string;
  values: Record<string, string>;
  sourcePrompt: string;
}

export interface PromptVariant {
  id: string;
  label: string;
  values: Record<string, string>;
  sourcePrompt: string;
  optimizedPrompt: string;
  tokensUsed?: number;
  historyId?: string;
}

export interface ReplyRequest {
  message: string;
  senderIdentity: string;
  conversationMode: "reply" | "compose";
  backgroundContext?: string;
  revisionContext?: {
    feedback: string;
    previousReplies: ReplyOption[];
  };
  projectContext?: ProjectContextPayload;
  rounds: Array<{
    round: number;
    turns: Array<{
      question: string;
      why: string;
      answer: string;
    }>;
  }>;
  forceGenerate: boolean;
}

export interface ReplyOption {
  id: string;
  label: string;
  text: string;
  why: string;
}

export interface ReplyAnalysis {
  action: "clarify" | "complete";
  rationale: string;
  questions: ClarificationQuestion[];
  replies: ReplyOption[];
  tokensUsed?: number;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  focus: string;
  accent: string;
  example: string;
  isCustom?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface TemplateInput {
  id?: string;
  name: string;
  description: string;
  focus: string;
  accent: string;
  example: string;
}
