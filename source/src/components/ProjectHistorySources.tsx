import {
  AlertTriangle,
  CheckSquare2,
  History,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type {
  HistoryItem,
  ProjectContext,
  ProjectInteractionSummary,
} from "../types";
import type { budgetInteractionContext } from "../lib/projectContext";

interface ProjectHistorySourcesProps {
  project: ProjectContext | null;
  histories: HistoryItem[];
  selectedIds: string[];
  summaries: ProjectInteractionSummary[];
  summaryFresh: boolean;
  summarizing: boolean;
  distilling: boolean;
  budgetTokens: number;
  budget: ReturnType<typeof budgetInteractionContext>;
  disabled: boolean;
  onToggle: (id: string) => void;
  onSummarize: () => void;
  onDistill: () => void;
  onBudgetChange: (tokens: number) => void;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function promptSummary(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 90)}…` : compact;
}

function category(label: string, values: string[]) {
  if (!values.length) return null;
  return (
    <div>
      <strong>{label}</strong>
      <ul>
        {values.map((value, index) => (
          <li key={`${label}-${index}`}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectHistorySources({
  project,
  histories,
  selectedIds,
  summaries,
  summaryFresh,
  summarizing,
  distilling,
  budgetTokens,
  budget,
  disabled,
  onToggle,
  onSummarize,
  onDistill,
  onBudgetChange,
}: ProjectHistorySourcesProps) {
  const selected = new Set(selectedIds);
  const summaryMap = new Map(
    summaries.map((summary) => [summary.historyId, summary]),
  );
  const includedSet = new Set(
    budget.included.map((summary) => summary.historyId),
  );
  const referencedCounts = new Map<string, number>();
  for (const item of histories) {
    for (const sourceId of item.sourceHistoryIds ?? []) {
      referencedCounts.set(sourceId, (referencedCounts.get(sourceId) ?? 0) + 1);
    }
  }

  return (
    <section className="project-interaction-panel" aria-label="项目交互上下文">
      <div className="project-interaction-head">
        <div>
          <span className="attachment-title">
            <History size={14} />
            项目交互上下文
            {selectedIds.length > 0 && <i>已选 {selectedIds.length} 条</i>}
          </span>
          <small>
            项目固定设定、本次输入与附件始终独立保留；这里只选择历史交互摘要。
          </small>
        </div>
        <button
          className="attachment-add-button"
          onClick={onSummarize}
          disabled={disabled || summarizing || !selectedIds.length}
        >
          {summarizing ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Sparkles size={14} />
          )}
          {summarizing ? "正在摘要" : summaryFresh ? "刷新摘要" : "生成摘要"}
        </button>
      </div>

      {!project ? (
        <div className="project-source-empty">
          先在左侧选择项目，才能载入该项目的历史交互。
        </div>
      ) : histories.length === 0 ? (
        <div className="project-source-empty">
          当前项目还没有已保存的提示词生成记录。
        </div>
      ) : (
        <>
          <div className="project-history-list">
            {histories.map((item) => {
              const isSelected = selected.has(item.id);
              const count = referencedCounts.get(item.id) ?? 0;
              return (
                <label
                  className={`project-history-option ${
                    isSelected ? "selected" : ""
                  }`}
                  key={item.id}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(item.id)}
                    disabled={disabled || summarizing || distilling}
                  />
                  <span className="project-history-copy">
                    <span>
                      <strong>{item.title}</strong>
                      <time>{formatDate(item.updatedAt)}</time>
                    </span>
                    <small>{promptSummary(item.originalPrompt)}</small>
                  </span>
                  <span className="project-history-reference">
                    {count > 0 ? `被引用 ${count} 次` : "尚未被引用"}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="project-budget-row">
            <label>
              上下文预算
              <input
                type="number"
                min={4096}
                max={1000000}
                step={1000}
                value={budgetTokens}
                onChange={(event) =>
                  onBudgetChange(Number(event.target.value) || 4096)
                }
                disabled={disabled}
              />
              <span>tokens</span>
            </label>
            <span>
              预计 {budget.usedTokens.toLocaleString()} /{" "}
              {budget.budgetTokens.toLocaleString()}，占用{" "}
              {Math.round(budget.utilization * 100)}%
            </span>
          </div>
          <div
            className={`project-budget-bar ${
              budget.truncatedHistoryIds.length ? "warning" : ""
            }`}
          >
            <i style={{ width: `${budget.utilization * 100}%` }} />
          </div>

          {summaries.length > 0 && (
            <div className="project-summary-list">
              {summaries.map((summary) => (
                <article
                  className={`project-summary-card ${
                    includedSet.has(summary.historyId) ? "" : "excluded"
                  }`}
                  key={summary.historyId}
                >
                  <div className="project-summary-card-head">
                    <span>
                      <CheckSquare2 size={13} />
                      {includedSet.has(summary.historyId)
                        ? "本次将引用"
                        : "因预算未引用"}{" "}
                      · {summary.title}
                    </span>
                    <code>{summary.historyId}</code>
                  </div>
                  <p>{summary.summary}</p>
                  <div className="project-summary-grid">
                    {category("澄清约束", summary.constraints)}
                    {category("用户偏好", summary.preferences)}
                    {category("已确认决策", summary.decisions)}
                    {category("被否决方案", summary.rejectedApproaches)}
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedIds.length > 0 && !summaryFresh && (
            <div className="attachment-warning">
              <AlertTriangle size={14} />
              历史选择已变化，请重新生成摘要后再开始分析。
            </div>
          )}
          {budget.truncatedHistoryIds.length > 0 && (
            <div className="attachment-warning">
              <AlertTriangle size={14} />
              已按预算截断 {budget.truncatedHistoryIds.length} 条摘要：
              {budget.truncatedHistoryIds
                .map(
                  (id) =>
                    summaryMap.get(id)?.title ??
                    histories.find((item) => item.id === id)?.title ??
                    id,
                )
                .join("、")}
              。请提高预算或取消部分勾选。
            </div>
          )}

          <div className="project-interaction-actions">
            <span>
              {summaryFresh
                ? `将使用 ${budget.included.length} 条摘要，保留来源记录 ID`
                : "先生成摘要，才能核对本次上下文来源"}
            </span>
            <button
              className="secondary-button"
              onClick={onDistill}
              disabled={
                disabled ||
                distilling ||
                summarizing ||
                !selectedIds.length ||
                !summaryFresh
              }
            >
              {distilling ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <WandSparkles size={14} />
              )}
              {distilling ? "正在提炼" : "提炼为提示词模板"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
