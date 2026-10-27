import path from "node:path";

export function detectMime(filename: string, provided?: string | null): string {
  if (provided && provided !== "application/octet-stream") return provided;
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}

export function isDocx(mime: string): boolean {
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

/** Best-effort plain text for search, display, and model input. Returns "" for unsupported types. */
export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  try {
    if (isPdf(mime)) {
      const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await unpdfExtract(pdf, { mergePages: true });
      return (Array.isArray(text) ? text.join("\n") : text).trim();
    }
    if (isDocx(mime)) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    if (mime.startsWith("text/") || mime === "application/json") {
      return buffer.toString("utf8").trim();
    }
  } catch (err) {
    console.warn("Text extraction failed:", err);
  }
  return "";
}
