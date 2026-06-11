export const SUPPORTED_PDF_EXTENSIONS = [".pdf"] as const;
export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
export const SUPPORTED_MERGE_EXTENSIONS = [
  ...SUPPORTED_PDF_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
] as const;
export const FILE_ACCEPT_ATTRIBUTE = ".pdf, .png, .jpg, .jpeg, .webp";

export type SupportedMergeExtension = (typeof SUPPORTED_MERGE_EXTENSIONS)[number];
export type SplitMode = "ranges" | "per-page";
export type CompressQuality = "screen" | "ebook" | "printer";
export const COMPRESS_QUALITY_OPTIONS: { value: CompressQuality; label: string }[] = [
  { value: "screen", label: "Screen (smaller file, lower quality)" },
  { value: "ebook", label: "Ebook (balanced)" },
  { value: "printer", label: "Printer (larger file, higher quality)" },
];

export type DirectoryItem = {
  name: string;
  path: string;
};

export type FileItem = {
  name: string;
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
};

export type DirectoryListing = {
  name: string;
  path: string;
  parentPath: string | null;
  directories: DirectoryItem[];
  files: FileItem[];
};

export function isSupportedMergeExtension(extension: string) {
  return SUPPORTED_MERGE_EXTENSIONS.includes(extension.toLowerCase() as SupportedMergeExtension);
}

export function isSupportedPdfExtension(extension: string) {
  return SUPPORTED_PDF_EXTENSIONS.includes(extension.toLowerCase() as (typeof SUPPORTED_PDF_EXTENSIONS)[number]);
}

export function normalizeFileName(input: string, fallback: string) {
  const trimmed = input.trim();
  const candidate = trimmed || fallback;
  const sanitized = candidate.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
}

export function getBaseName(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

export type PageRange = {
  start: number;
  end: number;
};

export function parsePageRangeToken(token: string): PageRange {
  const match = token.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid range token "${token}". Use formats like 3 or 5-8.`);
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start <= 0 || end <= 0 || start > end) {
    throw new Error(`Invalid range token "${token}".`);
  }

  return { start, end };
}

export function parsePageRanges(tokens: string[], totalPages: number): PageRange[] {
  if (tokens.length === 0) {
    throw new Error("Provide at least one page range.");
  }

  const parsed = tokens.map(parsePageRangeToken).sort((left, right) => left.start - right.start);

  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    if (current.end > totalPages) {
      throw new Error(`Range ${current.start}-${current.end} exceeds the document page count (${totalPages}).`);
    }

    if (index > 0 && current.start <= parsed[index - 1].end) {
      throw new Error("Page ranges cannot overlap.");
    }
  }

  return parsed;
}
