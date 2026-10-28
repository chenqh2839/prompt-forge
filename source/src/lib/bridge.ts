import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyzeRequest,
  AppSettings,
  DataLocationStatus,
  DataRootChangeRequest,
  DataRootInspection,
  DistillTemplateInput,
  HistoryDraft,
  HistoryItem,
  MoveHistoryResult,
  PromptAnalysis,
  ProjectHistorySummaryResult,
  ProjectContext,
  ProjectInput,
  ReplyAnalysis,
  ReplyRequest,
  SettingsInput,
  TemplateDefinition,
  TemplateDistillationResult,
  TemplateInput,
  VariableWorkflow,
  VariableTemplateFileExport,
  VariableWorkflowInput,
  SummarizeProjectHistoriesInput,
} from "../types";

export const bridge = {
  getDataLocation: () => invoke<DataLocationStatus>("get_data_location"),
  chooseDataRoot: () =>
    invoke<DataRootInspection | null>("choose_data_root"),
  scheduleDataRootChange: (input: DataRootChangeRequest) =>
    invoke<DataLocationStatus>("schedule_data_root_change", { input }),
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (input: SettingsInput) =>
    invoke<AppSettings>("save_settings", { input }),
  clearApiKey: () => invoke<AppSettings>("clear_api_key"),
  testConnection: (input: SettingsInput) =>
    invoke<string>("test_connection", { input }),
  analyzePrompt: (request: AnalyzeRequest, requestId: string) =>
    invoke<PromptAnalysis>("analyze_prompt", { request, requestId }),
  cancelPromptAnalysis: (requestId: string) =>
    invoke<boolean>("cancel_prompt_analysis", { requestId }),
  analyzeReply: (request: ReplyRequest) =>
    invoke<ReplyAnalysis>("analyze_reply", { request }),
  saveHistory: (draft: HistoryDraft) =>
    invoke<HistoryItem>("save_history", { draft }),
  listHistory: () => invoke<HistoryItem[]>("list_history"),
  moveHistoryToProject: (ids: string[], projectId: string | null) =>
    invoke<MoveHistoryResult>("move_history_to_project", { ids, projectId }),
  getHistoryAttachments: (id: string) =>
    invoke<string>("get_history_attachments", { id }),
  deleteHistory: (id: string) => invoke<void>("delete_history", { id }),
  clearHistory: () => invoke<void>("clear_history"),
  exportHistory: () => invoke<string | null>("export_history"),
  listProjects: () => invoke<ProjectContext[]>("list_projects"),
  saveProject: (input: ProjectInput) =>
    invoke<ProjectContext>("save_project", { input }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  listCustomTemplates: () =>
    invoke<TemplateDefinition[]>("list_custom_templates"),
  saveCustomTemplate: (input: TemplateInput) =>
    invoke<TemplateDefinition>("save_custom_template", { input }),
  deleteCustomTemplate: (id: string) =>
    invoke<void>("delete_custom_template", { id }),
  listVariableTemplates: () =>
    invoke<VariableWorkflow[]>("list_variable_templates"),
  saveVariableTemplate: (input: VariableWorkflowInput) =>
    invoke<VariableWorkflow>("save_variable_template", { input }),
  deleteVariableTemplate: (id: string) =>
    invoke<void>("delete_variable_template", { id }),
  summarizeProjectHistories: (input: SummarizeProjectHistoriesInput) =>
    invoke<ProjectHistorySummaryResult>("summarize_project_histories", {
      input,
    }),
  distillProjectTemplate: (input: DistillTemplateInput) =>
    invoke<TemplateDistillationResult>("distill_project_template", { input }),
  importVariableTemplateFile: () =>
    invoke<string | null>("import_variable_template_file"),
  exportVariableTemplateFile: (input: VariableTemplateFileExport) =>
    invoke<string | null>("export_variable_template_file", { input }),
};
