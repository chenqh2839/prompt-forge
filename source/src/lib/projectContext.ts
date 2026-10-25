import type {
  ProjectInteractionContext,
  ProjectInteractionSummary,
  ProviderId,
} from "../types";

export const SUMMARY_VERSION = 1;

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 3));
}

export function defaultContextBudget(provider: ProviderId, model: string) {
  const value = model.toLowerCase();
  let window = 32_000;
  if (provider === "openai") {
    window = /gpt-(4\.1|4o|5)/.test(value) ? 128_000 : 64_000;
  } else if (provider === "claude-gateway") {
    window = 200_000;
  } else if (provider === "deepseek") {
    window = 64_000;
  } else if (provider === "ollama") {
    window = /128k|long/.test(value) ? 128_000 : 32_000;
  }
  return Math.max(4_096, Math.round(window * 0.6));
}

export function summaryAsText(summary: ProjectInteractionSummary) {
  return [
    `来源历史：${summary.historyId} / ${summary.title}`,
    `摘要：${summary.summary}`,
    summary.constraints.length
      ? `约束：${summary.constraints.join("；")}`
      : "",
    summary.preferences.length
      ? `偏好：${summary.preferences.join("；")}`
      : "",
    summary.decisions.length
      ? `已确认决策：${summary.decisions.join("；")}`
      : "",
    summary.rejectedApproaches.length
      ? `已否决方案：${summary.rejectedApproaches.join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function budgetInteractionContext(
  summaries: ProjectInteractionSummary[],
  budgetTokens: number,
  baseText: string,
) {
  const baseTokens = estimateTokens(baseText);
  let usedTokens = baseTokens;
  const included: ProjectInteractionSummary[] = [];
  const truncatedHistoryIds: string[] = [];
  for (const summary of [...summaries].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )) {
    const tokens = estimateTokens(summaryAsText(summary));
    if (usedTokens + tokens <= budgetTokens) {
      included.push(summary);
      usedTokens += tokens;
    } else {
      truncatedHistoryIds.push(summary.historyId);
    }
  }
  return {
    included,
    truncatedHistoryIds,
    baseTokens,
    usedTokens,
    budgetTokens,
    utilization:
      budgetTokens > 0 ? Math.min(1, usedTokens / budgetTokens) : 1,
  };
}

export function interactionContextPayload(
  summaries: ProjectInteractionSummary[],
  estimatedTokens: number,
): ProjectInteractionContext | undefined {
  if (!summaries.length) return undefined;
  return {
    historyIds: summaries.map((summary) => summary.historyId),
    summaries,
    estimatedTokens,
  };
}
