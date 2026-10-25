import type {
  AttachmentPayload,
  PromptAttachment,
  ProviderId,
} from "../types";

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 60_000;

const FORMATS = {
  png: { type: "image/png", kind: "image", maxBytes: 6 * 1024 * 1024 },
  jpg: { type: "image/jpeg", kind: "image", maxBytes: 6 * 1024 * 1024 },
  jpeg: { type: "image/jpeg", kind: "image", maxBytes: 6 * 1024 * 1024 },
  webp: { type: "image/webp", kind: "image", maxBytes: 6 * 1024 * 1024 },
  txt: { type: "text/plain", kind: "document", maxBytes: 2 * 1024 * 1024 },
  md: { type: "text/markdown", kind: "document", maxBytes: 2 * 1024 * 1024 },
  pdf: { type: "application/pdf", kind: "document", maxBytes: 15 * 1024 * 1024 },
  docx: {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    maxBytes: 10 * 1024 * 1024,
  },
} as const;

export const ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.txt,.md,.pdf,.docx,image/png,image/jpeg,image/webp,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type SupportedFormat = (typeof FORMATS)[keyof typeof FORMATS];

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function formatFor(file: File): SupportedFormat | null {
  const extension = extensionOf(file.name);
  return extension in FORMATS
    ? FORMATS[extension as keyof typeof FORMATS]
    : null;
}

function makeId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hasImageAttachments(attachments: PromptAttachment[]) {
  return attachments.some((attachment) => attachment.kind === "image");
}

export function supportsVision(provider: ProviderId, model: string) {
  const value = model.trim().toLowerCase();
  if (provider === "openai") {
    return /gpt-(4o|4\.1|5)|vision|^o[134]/.test(value);
  }
  if (provider === "claude-gateway") {
    return /claude-(3|4)/.test(value);
  }
  if (provider === "deepseek") {
    return /vision|(^|[-_])vl([-_]|$)/.test(value);
  }
  return /llava|vision|minicpm-v|qwen.*vl|gemma3/.test(value);
}

function normalizeExtractedText(text: string, limit: number) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (normalized.length <= limit) {
    return { text: normalized, truncated: false };
  }
  return {
    text: `${normalized.slice(0, Math.max(0, limit - 24)).trimEnd()}\n\n[内容已截断]`,
    truncated: true,
  };
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new Error(`读取 ${file.name} 失败，请重新选择文件。`));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File, limit: number) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const document = await loadingTask.promise;
  try {
    const pages: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      if (pageText) {
        pages.push(pageText);
        length += pageText.length;
      }
      if (length >= limit) break;
    }
    const text = pages.join("\n\n");
    if (!text.trim()) {
      throw new Error(
        `${file.name} 没有可提取的文字。扫描版 PDF 需要先进行 OCR。`,
      );
    }
    return normalizeExtractedText(text, limit);
  } finally {
    await loadingTask.destroy();
  }
}

async function extractDocxText(file: File, limit: number) {
  const module = await import("mammoth");
  const mammoth = module.default ?? module;
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  if (!result.value.trim()) {
    throw new Error(`${file.name} 没有可提取的正文文字。`);
  }
  return normalizeExtractedText(result.value, limit);
}

async function readAttachment(
  file: File,
  format: SupportedFormat,
  textBudget: number,
): Promise<PromptAttachment> {
  const id = makeId();
  const base = {
    id,
    name: file.name,
    type: format.type,
    size: file.size,
    kind: format.kind,
  } as const;

  if (format.kind === "image") {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isPng =
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47;
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isWebp =
      String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...header.slice(8, 12)) === "WEBP";
    const validImage =
      (format.type === "image/png" && isPng) ||
      (format.type === "image/jpeg" && isJpeg) ||
      (format.type === "image/webp" && isWebp);
    if (!validImage) {
      throw new Error(`${file.name} 不是有效的图片文件。`);
    }
    const dataUrl = await readDataUrl(file);
    const separator = dataUrl.indexOf(",");
    if (separator < 0) throw new Error(`${file.name} 的图片数据无效。`);
    const content = `data:${format.type};base64,${dataUrl.slice(separator + 1)}`;
    return { ...base, content, previewUrl: content };
  }

  let extracted: { text: string; truncated: boolean };
  if (extensionOf(file.name) === "pdf") {
    extracted = await extractPdfText(file, textBudget);
  } else if (extensionOf(file.name) === "docx") {
    extracted = await extractDocxText(file, textBudget);
  } else {
    extracted = normalizeExtractedText(await file.text(), textBudget);
  }
  if (!extracted.text.trim()) {
    throw new Error(`${file.name} 没有可用的正文文字。`);
  }
  return {
    ...base,
    content: extracted.text,
    truncated: extracted.truncated,
  };
}

export async function readAttachmentFiles(
  files: File[],
  existing: PromptAttachment[],
) {
  const accepted = [...existing];
  const errors: string[] = [];

  for (const file of files) {
    if (accepted.length >= MAX_ATTACHMENTS) {
      errors.push(`最多附加 ${MAX_ATTACHMENTS} 个文件。`);
      break;
    }
    const format = formatFor(file);
    if (!format) {
      errors.push(
        `${file.name} 格式不支持。请使用 PNG、JPG、WEBP、TXT、MD、PDF 或 DOCX。`,
      );
      continue;
    }
    if (file.size > format.maxBytes) {
      errors.push(
        `${file.name} 超过大小限制（${formatFileSize(format.maxBytes)}）。`,
      );
      continue;
    }
    const totalBytes = accepted.reduce(
      (sum, attachment) => sum + attachment.size,
      0,
    );
    if (totalBytes + file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(
        `附件总大小不能超过 ${formatFileSize(MAX_ATTACHMENT_BYTES)}。`,
      );
      continue;
    }
    const usedText = accepted
      .filter((attachment) => attachment.kind === "document")
      .reduce((sum, attachment) => sum + attachment.content.length, 0);
    const textBudget = Math.min(
      MAX_EXTRACTED_TEXT_CHARS - usedText,
      format.kind === "document" ? MAX_EXTRACTED_TEXT_CHARS : 0,
    );
    if (format.kind === "document" && textBudget <= 0) {
      errors.push("文档提取文本已达到上限，请先移除部分文档。");
      continue;
    }
    try {
      accepted.push(await readAttachment(file, format, textBudget));
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `读取 ${file.name} 失败。`,
      );
    }
  }

  return { attachments: accepted, errors };
}

export function serializeAttachments(attachments: PromptAttachment[]) {
  return JSON.stringify(
    attachments.map(({ previewUrl: _previewUrl, ...attachment }) => attachment),
  );
}

export function parseStoredAttachments(json: string | undefined) {
  if (!json || json === "[]") return [];
  try {
    const parsed = JSON.parse(json) as Partial<PromptAttachment>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is PromptAttachment =>
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.type === "string" &&
          typeof item.size === "number" &&
          (item.kind === "image" || item.kind === "document") &&
          typeof item.content === "string" &&
          (item.kind !== "image" || item.content.startsWith("data:image/")),
      )
      .slice(0, MAX_ATTACHMENTS)
      .map((item) => ({
        ...item,
        previewUrl: item.kind === "image" ? item.content : undefined,
      }));
  } catch {
    return [];
  }
}

export function attachmentPayloads(
  attachments: PromptAttachment[],
): AttachmentPayload[] {
  return attachments.map(({ previewUrl: _previewUrl, ...attachment }) => attachment);
}
