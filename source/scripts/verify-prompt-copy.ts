import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_CONTEXT_BLOCK_END,
  CODEX_CONTEXT_BLOCK_START,
  copyablePrompt,
} from "../src/lib/prompt-copy.ts";

const contextBlock = [
  CODEX_CONTEXT_BLOCK_START,
  "## Codex 上下文注入",
  "这段内容不得进入剪贴板。",
  CODEX_CONTEXT_BLOCK_END,
].join("\n");

test("removes Codex context while preserving the optimized prompt", () => {
  const prompt = `# 角色\n发布工程师\n\n${contextBlock}`;
  assert.equal(copyablePrompt(prompt), "# 角色\n发布工程师");
});

test("keeps a prompt without Codex context unchanged", () => {
  const prompt = "# 任务\n\n生成一份验收清单。";
  assert.equal(copyablePrompt(prompt), prompt);
});

test("removes repeated context blocks and preserves trailing skill guidance", () => {
  const skill =
    "## Skills\n\n- 使用 Codex skill `documents` 生成文档。";
  const prompt = `# 任务\r\n撰写报告\r\n\r\n${contextBlock}\r\n\r\n${skill}\r\n${contextBlock}`;
  assert.equal(
    copyablePrompt(prompt),
    "# 任务\n撰写报告\n\n## Skills\n\n- 使用 Codex skill `documents` 生成文档。",
  );
});
