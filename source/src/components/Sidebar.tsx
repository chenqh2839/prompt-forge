import { useState } from "react";
import {
  BookOpen,
  Braces,
  Check,
  Download,
  FileText,
  FolderKanban,
  History,
  Image,
  LibraryBig,
  Megaphone,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  HistoryItem,
  ProjectContext,
  TemplateDefinition,
} from "../types";

interface SidebarProps {
  templates: TemplateDefinition[];
  activeTemplateId: string;
  history: HistoryItem[];
  projects: ProjectContext[];
  activeHistoryId: string | null;
  activeProjectId: string | null;
  mobileOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onCreateTemplate: () => void;
  onEditTemplate: (template: TemplateDefinition) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
  onEditProject: (project: ProjectContext) => void;
  onSelectHistory: (item: HistoryItem) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
  onExport: () => void;
}

type SidebarTab = "scenes" | "projects" | "history";

const templateIcons = {
  general: Sparkles,
  academic: BookOpen,
  code: Braces,
  copywriting: Megaphone,
  "image-generation": Image,
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function contextCount(project: ProjectContext) {
  return [
    project.goal,
    project.style,
    project.characters,
    project.historyContext,
    project.materials,
  ].filter((value) => value.trim()).length;
}

export function Sidebar({
  templates,
  activeTemplateId,
  history,
  projects,
  activeHistoryId,
  activeProjectId,
  mobileOpen,
  onClose,
  onSelectTemplate,
  onCreateTemplate,
  onEditTemplate,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onSelectHistory,
  onDeleteHistory,
  onClearHistory,
  onExport,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("scenes");
  const customTemplates = templates.filter((template) => template.isCustom);
  const builtInTemplates = templates.filter((template) => !template.isCustom);

  const selectTemplate = (templateId: string) => {
    onSelectTemplate(templateId);
    if (window.innerWidth < 980) onClose();
  };

  const selectProject = (projectId: string | null) => {
    onSelectProject(projectId);
    if (window.innerWidth < 980) onClose();
  };

  const selectHistory = (item: HistoryItem) => {
    onSelectHistory(item);
    if (window.innerWidth < 980) onClose();
  };

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-mobile-head">
        <span>WORKSPACE NAVIGATION</span>
        <button onClick={onClose} aria-label="关闭导航">
          <X size={16} />
        </button>
      </div>

      <nav className="sidebar-tabs" aria-label="工作区导航">
        <button
          className={activeTab === "scenes" ? "active" : ""}
          onClick={() => setActiveTab("scenes")}
        >
          <LibraryBig size={15} />
          场景
        </button>
        <button
          className={activeTab === "projects" ? "active" : ""}
          onClick={() => setActiveTab("projects")}
        >
          <FolderKanban size={15} />
          项目
        </button>
        <button
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          <History size={15} />
          历史
          {history.length > 0 && <i>{history.length}</i>}
        </button>
      </nav>

      <div className="sidebar-content">
        {activeTab === "scenes" && (
          <div className="sidebar-panel sidebar-scenes">
            <div className="section-heading">
              <span>预设场景</span>
              <button
                className="add-template-button"
                onClick={() => {
                  onCreateTemplate();
                  if (window.innerWidth < 980) onClose();
                }}
                title="新建自定义场景"
                aria-label="新建自定义场景"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="template-list">
              {builtInTemplates.map((template, index) => {
                const active = template.id === activeTemplateId;
                const Icon =
                  templateIcons[template.id as keyof typeof templateIcons] ??
                  FileText;
                return (
                  <button
                    key={template.id}
                    className={`template-button ${active ? "active" : ""}`}
                    style={
                      {
                        "--template-accent": template.accent,
                      } as React.CSSProperties
                    }
                    onClick={() => selectTemplate(template.id)}
                  >
                    <span className="template-number">
                      {(index + 1).toString().padStart(2, "0")}
                    </span>
                    <span className="template-icon">
                      <Icon size={17} />
                    </span>
                    <span className="template-copy">
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                    {active && <Check className="template-check" size={14} />}
                  </button>
                );
              })}
            </div>

            <div className="custom-template-heading">
              <span>我的场景</span>
              <span>{customTemplates.length}</span>
            </div>
            <div className="template-list custom-template-list">
              {customTemplates.map((template) => (
                <div
                  className={`template-row ${
                    template.id === activeTemplateId ? "active" : ""
                  }`}
                  key={template.id}
                  style={
                    {
                      "--template-accent": template.accent,
                    } as React.CSSProperties
                  }
                >
                  <button
                    className="template-button"
                    onClick={() => selectTemplate(template.id)}
                  >
                    <span className="template-number">··</span>
                    <span className="template-icon">
                      <SlidersHorizontal size={16} />
                    </span>
                    <span className="template-copy">
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                  </button>
                  <button
                    className="template-edit-button"
                    title={`编辑“${template.name}”`}
                    aria-label={`编辑“${template.name}”`}
                    onClick={() => onEditTemplate(template)}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              <button
                className="new-template-row"
                onClick={() => {
                  onCreateTemplate();
                  if (window.innerWidth < 980) onClose();
                }}
              >
                <Plus size={14} />
                新建场景模板
              </button>
            </div>
          </div>
        )}

        {activeTab === "projects" && (
          <div className="sidebar-panel">
            <div className="section-heading">
              <span>项目上下文</span>
              <button
                className="add-template-button"
                onClick={() => {
                  onCreateProject();
                  if (window.innerWidth < 980) onClose();
                }}
                title="新建项目"
                aria-label="新建项目"
              >
                <Plus size={14} />
              </button>
            </div>
            <p className="sidebar-helper">
              复用项目目标、角色、前情和素材，让连续创作保持一致。
            </p>
            <div className="project-list">
              <div
                className={`project-list-item ${
                  !activeProjectId ? "active" : ""
                }`}
              >
                <button
                  className="project-select-button"
                  onClick={() => selectProject(null)}
                >
                  <span className="project-icon">
                    <Sparkles size={15} />
                  </span>
                  <span>
                    <strong>不使用项目</strong>
                    <small>只使用本次输入与前置背景</small>
                  </span>
                  {!activeProjectId && <Check size={14} />}
                </button>
              </div>
              {projects.map((project) => (
                <div
                  className={`project-list-item ${
                    activeProjectId === project.id ? "active" : ""
                  }`}
                  key={project.id}
                >
                  <button
                    className="project-select-button"
                    onClick={() => selectProject(project.id)}
                  >
                    <span className="project-icon">
                      <FolderKanban size={15} />
                    </span>
                    <span>
                      <strong>{project.name}</strong>
                      <small>{contextCount(project)}/5 项上下文</small>
                    </span>
                    {activeProjectId === project.id && <Check size={14} />}
                  </button>
                  <button
                    className="project-edit-button"
                    onClick={() => onEditProject(project)}
                    aria-label={`编辑${project.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="sidebar-panel sidebar-history">
            <div className="section-heading">
              <span>本地历史</span>
              <span className="history-count">{history.length}</span>
            </div>
            <div className="history-tools">
              <button onClick={onExport} disabled={!history.length}>
                <Download size={14} />
                导出
              </button>
              <button onClick={onClearHistory} disabled={!history.length}>
                <Trash2 size={14} />
                清空
              </button>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="empty-history">
                  <History size={24} strokeWidth={1.3} />
                  <p>完成的创作会保存在这里</p>
                  <span>SQLite · 仅本机</span>
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    className={`history-item ${
                      item.id === activeHistoryId ? "active" : ""
                    }`}
                    onClick={() => selectHistory(item)}
                  >
                    <span className="history-meta">
                      <span>{formatDate(item.updatedAt)}</span>
                      <span>
                        {templates.find((t) => t.id === item.templateId)
                          ?.shortName ?? "CUSTOM"}
                      </span>
                    </span>
                    <strong>{item.title}</strong>
                    {item.projectId && (
                      <span className="history-project">
                        {projects.find(
                          (project) => project.id === item.projectId,
                        )?.name ?? "已删除项目"}
                      </span>
                    )}
                    <span
                      className="history-delete"
                      role="button"
                      tabIndex={0}
                      title="删除记录"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteHistory(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          onDeleteHistory(item.id);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <span>PF / LOCAL STUDIO</span>
        <span>v0.10.1</span>
      </div>
    </aside>
  );
}
