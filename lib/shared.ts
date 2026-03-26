export const SUPPORTED_PDF_EXTENSIONS = [".pdf"] as const;
export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
export const SUPPORTED_MERGE_EXTENSIONS = [
  ...SUPPORTED_PDF_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
] as const;
export const FILE_ACCEPT_ATTRIBUTE = ".pdf, .png, .jpg, .jpeg, .webp";

export type SupportedMergeExtension = (typeof SUPPORTED_MERGE_EXTENSIONS)[number];
export type SplitMode = "ranges" | "per-page";

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
