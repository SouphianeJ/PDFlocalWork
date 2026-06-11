import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_MERGE_EXTENSIONS,
  SUPPORTED_PDF_EXTENSIONS,
  type FileItem,
} from "@/lib/shared";
import type { PreviewState, SortKey } from "./types";

export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

export function isMergeableFile(file: FileItem) {
  return SUPPORTED_MERGE_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_MERGE_EXTENSIONS)[number]);
}

export function isPdfFile(file: FileItem) {
  return SUPPORTED_PDF_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_PDF_EXTENSIONS)[number]);
}

export function isImageFile(file: FileItem) {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]);
}

export function getSelectionLabel(selection: string[]) {
  if (selection.length === 0) {
    return "Nothing selected";
  }

  if (selection.length === 1) {
    return "1 file selected";
  }

  return `${selection.length} files selected`;
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function sortFiles(files: FileItem[], sortKey: SortKey) {
  return [...files].sort((left, right) => {
    if (sortKey === "type") {
      const typeCompare = left.extension.localeCompare(right.extension);
      if (typeCompare !== 0) {
        return typeCompare;
      }
    }

    if (sortKey === "date") {
      const leftTime = new Date(left.modifiedAt).getTime();
      const rightTime = new Date(right.modifiedAt).getTime();
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function parseRangesInput(input: string) {
  return input
    .split(/[,\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function revokePreviewUrl(preview: PreviewState | null) {
  if (preview?.src.startsWith("blob:")) {
    URL.revokeObjectURL(preview.src);
  }
}
