export const CODEX_CONTEXT_BLOCK_START =
  "<!-- PROMPT_FORGE_CODEX_CONTEXT_START -->";
export const CODEX_CONTEXT_BLOCK_END =
  "<!-- PROMPT_FORGE_CODEX_CONTEXT_END -->";

export function copyablePrompt(prompt: string): string {
  let result = prompt;

  while (true) {
    const start = result.indexOf(CODEX_CONTEXT_BLOCK_START);
    if (start < 0) break;

    const end = result.indexOf(
      CODEX_CONTEXT_BLOCK_END,
      start + CODEX_CONTEXT_BLOCK_START.length,
    );
    if (end < 0) {
      result = result.slice(0, start).trimEnd();
      break;
    }

    const before = result.slice(0, start).trimEnd();
    const after = result
      .slice(end + CODEX_CONTEXT_BLOCK_END.length)
      .trimStart();
    result = [before, after].filter(Boolean).join("\n\n");
  }

  return result.replace(/\r\n/g, "\n").trim();
}
