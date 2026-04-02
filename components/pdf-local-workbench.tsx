"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buildBrowserPdfFromFiles,
  compressBrowserPdfFile,
  deleteBrowserFiles,
  getBrowserPdfPageCount,
  listBrowserDirectory,
  renameBrowserFile,
  rotateBrowserPdfPages,
  splitBrowserPdfFile,
  writeBrowserPdfFile,
} from "@/lib/browser/pdf-browser-utils";
import {
  COMPRESS_QUALITY_OPTIONS,
  FILE_ACCEPT_ATTRIBUTE,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_MERGE_EXTENSIONS,
  SUPPORTED_PDF_EXTENSIONS,
  type CompressQuality,
  type DirectoryListing,
  type FileItem,
  type SplitMode,
} from "@/lib/shared";

type SortKey = "name" | "type" | "date";
type SourceMode = "path" | "picker";
type BrowserStartIn = "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";

type BrowserPickerState = {
  rootHandle: FileSystemDirectoryHandle;
  currentHandle: FileSystemDirectoryHandle;
  listing: DirectoryListing;
  rootName: string;
  currentRelativePath: string;
};

type SourceDeletePrompt = {
  outputFile: string;
  fileNames: string[];
  kind: "merge" | "compress";
};

type PreviewState = {
  fileName: string;
  fileType: "pdf" | "image";
  src: string;
};

type PathSuggestion = {
  name: string;
  path: string;
  completion: string;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: BrowserStartIn;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const DEFAULT_OUTPUT_NAME = "merged-output.pdf";
const DEFAULT_SPLIT_PREFIX = "split-output";
const DEFAULT_COMPRESS_OUTPUT_NAME = "compressed-output.pdf";

function ZipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 3h6l4 4v12a2 2 0 0 1-2 2H9a4 4 0 0 1 0-8h1V3Zm6 1.5V8h3.5L15 4.5ZM11 5v2h2V5h-2Zm0 3v2h2V8h-2Zm0 3v2h2v-2h-2Zm0 3v2h2v-2h-2Zm-2 1a2 2 0 1 0 0 4h6v-4H9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function isSupportedBrowserPicker() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function isMergeableFile(file: FileItem) {
  return SUPPORTED_MERGE_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_MERGE_EXTENSIONS)[number]);
}

function isPdfFile(file: FileItem) {
  return SUPPORTED_PDF_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_PDF_EXTENSIONS)[number]);
}

function getSelectionLabel(selection: string[]) {
  if (selection.length === 0) {
    return "Nothing selected";
  }

  if (selection.length === 1) {
    return "1 file selected";
  }

  return `${selection.length} files selected`;
}

function getApiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function sortFiles(files: FileItem[], sortKey: SortKey) {
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

function buildBreadcrumbs(pathValue: string) {
  const windowsMatch = pathValue.match(/^([a-zA-Z]:)(\\.*)?$/);
  if (windowsMatch) {
    const root = `${windowsMatch[1]}\\`;
    const trailing = pathValue.slice(root.length);
    const parts = trailing.split("\\").filter(Boolean);
    const breadcrumbs = [{ label: windowsMatch[1], path: root }];
    let current = root.replace(/\\$/, "");

    for (const part of parts) {
      current = `${current}\\${part}`;
      breadcrumbs.push({ label: part, path: current });
    }

    return breadcrumbs;
  }

  const normalized = pathValue.replace(/\/+/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (normalized.startsWith("/")) {
    const breadcrumbs = [{ label: "/", path: "/" }];
    let current = "";
    for (const part of parts) {
      current = `${current}/${part}` || "/";
      breadcrumbs.push({ label: part, path: current });
    }
    return breadcrumbs;
  }

  if (parts.length === 0) {
    return [];
  }

  const breadcrumbs = [{ label: parts[0], path: parts[0] }];
  let current = parts[0];
  for (const part of parts.slice(1)) {
    current = `${current}/${part}`;
    breadcrumbs.push({ label: part, path: current });
  }

  return breadcrumbs;
}

function parseRangesInput(input: string) {
  return input
    .split(/[,\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function revokePreviewUrl(preview: PreviewState | null) {
  if (preview?.src.startsWith("blob:")) {
    URL.revokeObjectURL(preview.src);
  }
}

export function PdfLocalWorkbench() {
  const [folderPathInput, setFolderPathInput] = useState("");
  const [pathSuggestions, setPathSuggestions] = useState<PathSuggestion[]>([]);
  const [showPathSuggestions, setShowPathSuggestions] = useState(false);
  const [isPathInputFocused, setIsPathInputFocused] = useState(false);
  const [pathListing, setPathListing] = useState<DirectoryListing | null>(null);
  const [pickerState, setPickerState] = useState<BrowserPickerState | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sourceMode, setSourceMode] = useState<SourceMode>("path");
  const [outputName, setOutputName] = useState(DEFAULT_OUTPUT_NAME);
  const [splitPrefix, setSplitPrefix] = useState(DEFAULT_SPLIT_PREFIX);
  const [compressOutputName, setCompressOutputName] = useState(DEFAULT_COMPRESS_OUTPUT_NAME);
  const [compressQuality, setCompressQuality] = useState<CompressQuality>("ebook");
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [rangesInput, setRangesInput] = useState("1");
  const [sourceDeletePrompt, setSourceDeletePrompt] = useState<SourceDeletePrompt | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ file: FileItem; event: React.MouseEvent } | null>(null);
  const [rotateDegrees, setRotateDegrees] = useState<0 | 90 | 180 | 270>(90);
  const [status, setStatus] = useState("Enter a folder path or use the browser picker.");
  const [isPending, startTransition] = useTransition();

  const listing = sourceMode === "picker" ? pickerState?.listing ?? null : pathListing;

  const sortedFiles = useMemo(() => sortFiles(listing?.files ?? [], sortKey), [listing?.files, sortKey]);
  const selectedFiles = useMemo(
    () => selection.map((name) => listing?.files.find((file) => file.name === name)).filter(Boolean) as FileItem[],
    [listing?.files, selection],
  );
  const mergeSelection = selectedFiles.filter(isMergeableFile);
  const selectedPdfFiles = selectedFiles.filter(isPdfFile);
  const currentPath = listing?.path ?? "";
  const breadcrumbs = useMemo(() => (currentPath ? buildBreadcrumbs(currentPath) : []), [currentPath]);

  useEffect(() => {
    if (sourceMode !== "path") {
      setPathSuggestions([]);
      setShowPathSuggestions(false);
      return;
    }

    const trimmed = folderPathInput.trim();
    if (!trimmed) {
      setPathSuggestions([]);
      setShowPathSuggestions(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await fetchJson<{ suggestions: PathSuggestion[] }>(
          `/api/fs/suggest?path=${encodeURIComponent(folderPathInput)}&limit=5`,
        );

        if (!cancelled) {
          setPathSuggestions(result.suggestions);
          setShowPathSuggestions(isPathInputFocused && result.suggestions.length > 0);
        }
      } catch {
        if (!cancelled) {
          setPathSuggestions([]);
          setShowPathSuggestions(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [folderPathInput, sourceMode, isPathInputFocused]);

  // Fetch page counts for PDF files when listing changes
  useEffect(() => {
    if (!listing) return;
    const pdfFiles = listing.files.filter((f) =>
      SUPPORTED_PDF_EXTENSIONS.includes(f.extension as (typeof SUPPORTED_PDF_EXTENSIONS)[number]),
    );
    if (pdfFiles.length === 0) return;

    let cancelled = false;

    async function fetchCounts() {
      const counts: Record<string, number> = {};
      for (const file of pdfFiles) {
        if (cancelled) return;
        try {
          if (sourceMode === "path") {
            const res = await fetch("/api/pdf/pagecount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderPath: listing!.path, fileName: file.name }),
            });
            if (res.ok) {
              const data = (await res.json()) as { pageCount: number };
              counts[file.name] = data.pageCount;
            }
          } else if (pickerState) {
            counts[file.name] = await getBrowserPdfPageCount(pickerState.currentHandle, file.name);
          }
        } catch {
          // skip files we can't read
        }
      }
      if (!cancelled) setPageCounts(counts);
    }

    void fetchCounts();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.path, listing?.files.length, sourceMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (event.key === "Escape") {
        setSelection([]);
        setDeleteConfirm(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault();
        if (listing) {
          setSelection(listing.files.map((f) => f.name));
        }
        return;
      }

      if (event.key === "Delete" && selection.length > 0 && listing) {
        event.preventDefault();
        // Trigger batch delete with confirmation
        setDeleteConfirm(null); // clear single-file confirm in favor of batch
        startTransition(async () => {
          try {
            if (sourceMode === "path") {
              await fetchJson("/api/fs/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folderPath: listing.path, fileNames: selection }),
              });
              await openFolderByPath(listing.path);
            } else if (pickerState) {
              await deleteBrowserFiles(pickerState.currentHandle, selection);
              await navigatePickerFolder(pickerState.currentRelativePath);
            }
            setStatus(`Deleted ${selection.length} file(s).`);
            setSelection([]);
          } catch (error) {
            setStatus(getApiErrorMessage(error));
          }
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listing, selection, sourceMode, pickerState],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function openFolderByPath(nextPath: string) {
    const trimmedPath = nextPath.trim();
    if (!trimmedPath) {
      setStatus("Enter a folder path first.");
      return;
    }

    startTransition(async () => {
      try {
        const data = await fetchJson<DirectoryListing>(`/api/fs/list?path=${encodeURIComponent(trimmedPath)}`);
        revokePreviewUrl(preview);
        setPathListing(data);
        setFolderPathInput(data.path);
        setPathSuggestions([]);
        setShowPathSuggestions(false);
        setSelection([]);
        setPreview(null);
        setSourceMode("path");
        setStatus(`Loaded ${data.files.length} files from ${data.path}`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  async function openBrowserFolder() {
    if (!isSupportedBrowserPicker()) {
      setStatus("Browser folder picker is not available here. Use the folder path field instead.");
      return;
    }

    try {
      const rootHandle = await window.showDirectoryPicker?.({
        id: "pdf-local-work",
        mode: "readwrite",
        startIn: "documents",
      });

      if (!rootHandle) {
        return;
      }

      const listingData = await listBrowserDirectory(rootHandle, rootHandle.name);
      revokePreviewUrl(preview);
      setPickerState({
        rootHandle,
        currentHandle: rootHandle,
        listing: listingData,
        rootName: rootHandle.name,
        currentRelativePath: "",
      });
      setSelection([]);
      setPreview(null);
      setSourceMode("picker");
      setPathSuggestions([]);
      setShowPathSuggestions(false);
      setStatus(`Loaded browser folder "${rootHandle.name}".`);
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  async function navigatePathFolder(nextPath: string) {
    await openFolderByPath(nextPath);
  }

  function applyPathSuggestion(suggestion: PathSuggestion) {
    setFolderPathInput(suggestion.completion);
    setPathSuggestions([]);
    setShowPathSuggestions(false);

    requestAnimationFrame(() => {
      const input = pathInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const end = suggestion.completion.length;
      input.setSelectionRange(end, end);
    });
  }

  function handlePathInputTab(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Tab" || pathSuggestions.length === 0) {
      return;
    }

    event.preventDefault();
    applyPathSuggestion(pathSuggestions[0]);
  }

  async function navigatePickerFolder(relativePath: string) {
    const current = pickerState;
    if (!current) {
      return;
    }

    try {
      let handle = current.rootHandle;
      if (relativePath) {
        const segments = relativePath.split("/").filter(Boolean);
        for (const segment of segments) {
          handle = await handle.getDirectoryHandle(segment);
        }
      }

      const virtualPath = relativePath ? `${current.rootName}/${relativePath}` : current.rootName;
      const listingData = await listBrowserDirectory(handle, virtualPath);
      revokePreviewUrl(preview);
      setPickerState({
        rootHandle: current.rootHandle,
        currentHandle: handle,
        listing: listingData,
        rootName: current.rootName,
        currentRelativePath: relativePath,
      });
      setSelection([]);
      setPreview(null);
      setStatus(`Opened ${virtualPath}`);
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  function toPickerRelativePath(absoluteLikePath: string) {
    if (!pickerState) {
      return "";
    }

    if (absoluteLikePath === pickerState.rootName) {
      return "";
    }

    if (absoluteLikePath.startsWith(`${pickerState.rootName}/`)) {
      return absoluteLikePath.slice(pickerState.rootName.length + 1);
    }

    return absoluteLikePath;
  }

  function toggleSelection(fileName: string) {
    setSelection((current) => {
      if (current.includes(fileName)) {
        return current.filter((name) => name !== fileName);
      }

      return [...current, fileName];
    });
  }

  function buildPathPreviewUrl(file: FileItem) {
    if (!listing) {
      return "";
    }

    return `/api/fs/file?folderPath=${encodeURIComponent(listing.path)}&fileName=${encodeURIComponent(file.name)}`;
  }

  async function handlePreview(file: FileItem) {
    try {
      if (sourceMode === "path") {
        setPreview({
          fileName: file.name,
          fileType: isPdfFile(file) ? "pdf" : "image",
          src: buildPathPreviewUrl(file),
        });
        return;
      }

      if (!pickerState) {
        return;
      }

      const handle = await pickerState.currentHandle.getFileHandle(file.name);
      const browserFile = await handle.getFile();
      const nextUrl = URL.createObjectURL(browserFile);

      setPreview((current) => {
        if (current?.src.startsWith("blob:")) {
          URL.revokeObjectURL(current.src);
        }

        return {
          fileName: file.name,
          fileType: isPdfFile(file) ? "pdf" : "image",
          src: nextUrl,
        };
      });
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  async function handleFileClick(file: FileItem) {
    toggleSelection(file.name);
    await handlePreview(file);
  }

  function handleFileDoubleClick(file: FileItem) {
    setRenamingFile(file.name);
    setRenameValue(file.name);
    // Focus the input after React renders it
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function commitRename() {
    if (!renamingFile || !listing) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingFile) {
      setRenamingFile(null);
      return;
    }

    startTransition(async () => {
      try {
        if (sourceMode === "path") {
          await fetchJson("/api/fs/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderPath: listing.path,
              oldName: renamingFile,
              newName,
            }),
          });
          await openFolderByPath(listing.path);
        } else if (pickerState) {
          await renameBrowserFile(pickerState.currentHandle, renamingFile, newName);
          await navigatePickerFolder(pickerState.currentRelativePath);
        }
        setStatus(`Renamed "${renamingFile}" to "${newName}".`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      } finally {
        setRenamingFile(null);
      }
    });
  }

  function cancelRename() {
    setRenamingFile(null);
  }

  async function handleDeleteFile(event: React.MouseEvent, file: FileItem) {
    event.stopPropagation();
    if (!listing) return;

    // If already confirming this file, execute the delete
    if (deleteConfirm?.file.name === file.name) {
      setDeleteConfirm(null);
      startTransition(async () => {
        try {
          if (sourceMode === "path") {
            await fetchJson("/api/fs/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderPath: listing.path, fileNames: [file.name] }),
            });
            await openFolderByPath(listing.path);
          } else if (pickerState) {
            await deleteBrowserFiles(pickerState.currentHandle, [file.name]);
            await navigatePickerFolder(pickerState.currentRelativePath);
          }
          setSelection((prev) => prev.filter((n) => n !== file.name));
          setStatus(`Deleted "${file.name}".`);
        } catch (error) {
          setStatus(getApiErrorMessage(error));
        }
      });
      return;
    }

    // First click: show confirmation
    setDeleteConfirm({ file, event });
    // Auto-clear after 3 seconds
    setTimeout(() => setDeleteConfirm((prev) => (prev?.file.name === file.name ? null : prev)), 3000);
  }

  async function handleZipFolder(event: React.MouseEvent, folderPath: string, folderName: string) {
    event.stopPropagation();
    if (sourceMode !== "path") return;

    startTransition(async () => {
      try {
        setStatus(`Zipping "${folderName}"â€¦`);
        const result = await fetchJson<{ zipPath: string; zipName: string; size: number; fileCount: number }>(
          "/api/fs/zip",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: folderPath }),
          },
        );
        setStatus(
          `Created "${result.zipName}" (${formatBytes(result.size)}, ${result.fileCount} files).`,
        );
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleParentNavigation() {
    if (!listing?.parentPath) {
      return;
    }

    if (sourceMode === "path") {
      void navigatePathFolder(listing.parentPath);
      return;
    }

    void navigatePickerFolder(toPickerRelativePath(listing.parentPath));
  }

  async function handleMerge() {
    if (mergeSelection.length === 0 || !listing) {
      setStatus("Select at least one PDF or image file.");
      return;
    }

    const isSingleFile = mergeSelection.length === 1;
    const actionLabel = isSingleFile ? "Converted" : "Merged";

    startTransition(async () => {
      try {
        const mergedFileNames = mergeSelection.map((file) => file.name);

        if (sourceMode === "path") {
          const result = await fetchJson<{ outputFile: string; originalSize?: number; compressedSize?: number }>("/api/pdf/merge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              folderPath: listing.path,
              fileNames: mergedFileNames,
              outputName,
              compressQuality: compressQuality,
            }),
          });

          await openFolderByPath(listing.path);
          setSourceDeletePrompt({
            outputFile: result.outputFile,
            fileNames: mergedFileNames,
            kind: "merge",
          });
          const sizeInfo = result.originalSize != null && result.compressedSize != null
            ? ` (${formatBytes(result.originalSize)} â†’ ${formatBytes(result.compressedSize)})`
            : "";
          setStatus(`${actionLabel} into ${result.outputFile}${sizeInfo}. You can now delete the original file(s).`);
          return;
        }

        if (!pickerState) {
          return;
        }

        const files = [];
        for (const file of mergeSelection) {
          const handle = await pickerState.currentHandle.getFileHandle(file.name);
          files.push(await handle.getFile());
        }

        const mergedPdf = await buildBrowserPdfFromFiles(files);

        // Auto-compress the merged output
        const tempBlob = new Blob([mergedPdf as BlobPart], { type: "application/pdf" });
        const tempFile = new File([tempBlob], "temp.pdf", { type: "application/pdf" });
        const compressed = await compressBrowserPdfFile(tempFile, compressQuality);

        const writtenFile = await writeBrowserPdfFile(
          pickerState.currentHandle,
          outputName || DEFAULT_OUTPUT_NAME,
          compressed.bytes,
        );
        await navigatePickerFolder(pickerState.currentRelativePath);
        setSourceDeletePrompt({
          outputFile: writtenFile,
          fileNames: mergedFileNames,
          kind: "merge",
        });
        const sizeInfo = ` (${formatBytes(compressed.originalSize)} â†’ ${formatBytes(compressed.compressedSize)})`;
        setStatus(`${actionLabel} into ${writtenFile}${sizeInfo}. You can now delete the original file(s).`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  async function handleDeleteMergedSources() {
    if (!sourceDeletePrompt || !listing) {
      return;
    }

    startTransition(async () => {
      try {
        if (sourceMode === "path") {
          const result = await fetchJson<{ deletedCount: number }>("/api/fs/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              folderPath: listing.path,
              fileNames: sourceDeletePrompt.fileNames,
            }),
          });

          await openFolderByPath(listing.path);
          setSourceDeletePrompt(null);
          setStatus(`Deleted ${result.deletedCount} original file(s) used for ${sourceDeletePrompt.outputFile}.`);
          return;
        }

        if (!pickerState) {
          return;
        }

        await deleteBrowserFiles(pickerState.currentHandle, sourceDeletePrompt.fileNames);
        await navigatePickerFolder(pickerState.currentRelativePath);
        setSourceDeletePrompt(null);
        setStatus(`Deleted ${sourceDeletePrompt.fileNames.length} original file(s) used for ${sourceDeletePrompt.outputFile}.`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleKeepMergedSources() {
    if (!sourceDeletePrompt) {
      return;
    }

    setStatus(`Kept the original files. ${sourceDeletePrompt.outputFile} remains available in this folder.`);
    setSourceDeletePrompt(null);
  }

  async function handleCompress() {
    if (selectedPdfFiles.length === 0 || !listing) {
      setStatus("Select at least one PDF file to compress.");
      return;
    }

    startTransition(async () => {
      try {
        const results: { name: string; original: number; compressed: number }[] = [];

        for (const target of selectedPdfFiles) {
          const autoOutputName = selectedPdfFiles.length === 1
            ? compressOutputName
            : `compressed-${target.name}`;

          if (sourceMode === "path") {
            const result = await fetchJson<{ outputFile: string; originalSize: number; compressedSize: number }>(
              "/api/pdf/compress",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  folderPath: listing.path,
                  fileName: target.name,
                  outputName: autoOutputName,
                  quality: compressQuality,
                }),
              },
            );
            results.push({ name: result.outputFile, original: result.originalSize, compressed: result.compressedSize });
          } else if (pickerState) {
            const handle = await pickerState.currentHandle.getFileHandle(target.name);
            const sourceFile = await handle.getFile();
            const result = await compressBrowserPdfFile(sourceFile, compressQuality);
            const writtenFile = await writeBrowserPdfFile(
              pickerState.currentHandle,
              autoOutputName || `${target.name.replace(/\.pdf$/i, "")}-compressed.pdf`,
              result.bytes,
            );
            results.push({ name: writtenFile, original: result.originalSize, compressed: result.compressedSize });
          }
        }

        if (sourceMode === "path") {
          await openFolderByPath(listing.path);
        } else if (pickerState) {
          await navigatePickerFolder(pickerState.currentRelativePath);
        }

        if (results.length === 1) {
          const r = results[0];
          setSourceDeletePrompt({
            outputFile: r.name,
            fileNames: [selectedPdfFiles[0].name],
            kind: "compress",
          });
          setStatus(`Compressed into ${r.name} (${formatBytes(r.original)} â†’ ${formatBytes(r.compressed)}).`);
        } else {
          const totalOriginal = results.reduce((s, r) => s + r.original, 0);
          const totalCompressed = results.reduce((s, r) => s + r.compressed, 0);
          setSourceDeletePrompt({
            outputFile: results.map((r) => r.name).join(", "),
            fileNames: selectedPdfFiles.map((f) => f.name),
            kind: "compress",
          });
          setStatus(
            `Compressed ${results.length} PDFs (${formatBytes(totalOriginal)} â†’ ${formatBytes(totalCompressed)} total).`,
          );
        }
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  async function handleSplit() {
    const target = selectedPdfFiles[0];
    if (!target || !listing) {
      setStatus("Select exactly one PDF file to split.");
      return;
    }

    startTransition(async () => {
      try {
        if (sourceMode === "path") {
          const result = await fetchJson<{ createdFiles: string[] }>("/api/pdf/split", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              folderPath: listing.path,
              fileName: target.name,
              mode: splitMode,
              ranges: splitMode === "ranges" ? parseRangesInput(rangesInput) : undefined,
              outputPrefix: splitPrefix,
            }),
          });

          await openFolderByPath(listing.path);
          setStatus(`Created ${result.createdFiles.length} file(s).`);
          return;
        }

        if (!pickerState) {
          return;
        }

        const handle = await pickerState.currentHandle.getFileHandle(target.name);
        const sourceFile = await handle.getFile();
        const outputs = await splitBrowserPdfFile(sourceFile, {
          mode: splitMode,
          ranges: splitMode === "ranges" ? parseRangesInput(rangesInput) : [],
          outputPrefix: splitPrefix || DEFAULT_SPLIT_PREFIX,
        });

        for (const output of outputs) {
          await writeBrowserPdfFile(pickerState.currentHandle, output.fileName, output.bytes);
        }

        await navigatePickerFolder(pickerState.currentRelativePath);
        setStatus(`Created ${outputs.length} split file(s).`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  async function handleRotate() {
    const target = selectedPdfFiles[0];
    if (!target || !listing) {
      setStatus("Select exactly one PDF file to rotate.");
      return;
    }

    const pageCount = pageCounts[target.name];
    if (!pageCount) {
      setStatus("Page count not yet loaded. Please wait a moment.");
      return;
    }

    const rotations = Array.from({ length: pageCount }, (_, i) => ({
      page: i + 1,
      degrees: rotateDegrees,
    }));

    startTransition(async () => {
      try {
        if (sourceMode === "path") {
          await fetchJson("/api/pdf/rotate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderPath: listing.path,
              fileName: target.name,
              pageRotations: rotations,
            }),
          });
          await openFolderByPath(listing.path);
        } else if (pickerState) {
          await rotateBrowserPdfPages(pickerState.currentHandle, target.name, rotations);
          await navigatePickerFolder(pickerState.currentRelativePath);
        }
        setStatus(`Rotated all ${pageCount} page(s) of "${target.name}" by ${rotateDegrees}Â°.`);
        // Refresh preview if this file was previewed
        if (preview?.fileName === target.name) {
          await handlePreview(target);
        }
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  const canMerge = mergeSelection.length >= 1;
  const isSingleConvert = mergeSelection.length === 1;
  const canSplit = selectedPdfFiles.length === 1;
  const canCompress = selectedPdfFiles.length >= 1;
  const canRotate = selectedPdfFiles.length === 1;

  return (
    <main className={`shell${sourceDeletePrompt ? " shell-with-banner" : ""}`}>
      {sourceDeletePrompt ? (
        <div className="confirm-banner">
          <p>
            {sourceDeletePrompt.kind === "merge"
              ? `Merged file created: ${sourceDeletePrompt.outputFile}. Would you like to delete the ${sourceDeletePrompt.fileNames.length} original file(s) that were merged?`
              : `Compressed file created: ${sourceDeletePrompt.outputFile}. Would you like to delete the original PDF used to create this compressed version?`}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => void handleDeleteMergedSources()} disabled={isPending}>
              Delete originals
            </button>
            <button className="ghost-button" onClick={handleKeepMergedSources} disabled={isPending}>
              Keep originals
            </button>
          </div>
        </div>
      ) : null}

      <section className="hero-card compact-hero">
        <div className="hero-bar">
          <span className="hero-title">PDF Local Work</span>
          <div className="hero-input-group">
            <div className="path-input-stack">
              <input
                ref={pathInputRef}
                value={folderPathInput}
                onChange={(event) => setFolderPathInput(event.target.value)}
                onFocus={() => {
                  setIsPathInputFocused(true);
                  setShowPathSuggestions(pathSuggestions.length > 0 && sourceMode === "path");
                }}
                onBlur={() =>
                  window.setTimeout(() => {
                    setIsPathInputFocused(false);
                    setShowPathSuggestions(false);
                  }, 120)
                }
                onKeyDown={handlePathInputTab}
                placeholder="C:\\Users\\you\\Documents\\PDFs"
                spellCheck={false}
              />
              {sourceMode === "path" && showPathSuggestions ? (
                <div className="path-suggestions" role="listbox" aria-label="Folder suggestions">
                  {pathSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.path}
                      type="button"
                      className="path-suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyPathSuggestion(suggestion)}
                    >
                      <span className="path-suggestion-name">{suggestion.name}</span>
                      <span className="path-suggestion-path">{suggestion.path}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="primary-button" onClick={() => void openFolderByPath(folderPathInput)} disabled={isPending}>
              Open
            </button>
            <button className="secondary-button" onClick={() => void openBrowserFolder()} disabled={isPending}>
              Browse
            </button>
          </div>
        </div>
        <p className="status-line">{status}</p>
      </section>

      <section className="workspace">
        <div className="sidebar-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Location</p>
              <h2>{listing ? listing.name : "No folder loaded"}</h2>
            </div>
            <span className={`mode-badge mode-${sourceMode}`}>{sourceMode === "path" ? "Path mode" : "Browser mode"}</span>
          </div>

          <div className="breadcrumbs">
            {breadcrumbs.length === 0 ? <span className="muted">Open a folder to browse.</span> : null}
            {breadcrumbs.map((crumb) => (
              <button
                key={crumb.path}
                className="crumb"
                onClick={() =>
                  sourceMode === "path"
                    ? void navigatePathFolder(crumb.path)
                    : void navigatePickerFolder(toPickerRelativePath(crumb.path))
                }
                disabled={isPending}
              >
                {crumb.label}
              </button>
            ))}
          </div>

          <div className="folders-panel">
            <div className="section-header compact">
              <h3>Subfolders</h3>
              <span>{listing?.directories.length ?? 0}</span>
            </div>
            <div className="folder-list">
              <button
                className="folder-row folder-parent-row"
                onClick={handleParentNavigation}
                disabled={isPending || !listing?.parentPath}
              >
                <span>..</span>
                <span className="muted">Parent</span>
              </button>
              {(listing?.directories ?? []).map((directory) => (
                <div key={directory.path} className="folder-row">
                  <button
                    className="folder-row-open"
                    onClick={() =>
                      sourceMode === "path"
                        ? void navigatePathFolder(directory.path)
                        : void navigatePickerFolder(toPickerRelativePath(directory.path))
                    }
                    disabled={isPending}
                  >
                    <span className="folder-name">{directory.name}</span>
                    <span className="muted">Open</span>
                  </button>
                  {sourceMode === "path" && (
                    <button
                      type="button"
                      className="zip-cell"
                      aria-label={`Zip "${directory.name}"`}
                      title={`Zip "${directory.name}"`}
                      onClick={(event) => void handleZipFolder(event, directory.path, directory.name)}
                      disabled={isPending}
                    >
                      <ZipIcon />
                    </button>
                  )}
                </div>
              ))}
              {listing && listing.directories.length === 0 ? <p className="empty-state">No subfolders here.</p> : null}
            </div>
          </div>
        </div>

        <div className="main-card">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Files</p>
              <h2>{getSelectionLabel(selection)}</h2>
            </div>
            <div className="toolbar-controls">
              <label className="inline-field">
                <span>Sort</span>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="name">Name</option>
                  <option value="type">Type</option>
                  <option value="date">Date</option>
                </select>
              </label>
              <button className="ghost-button" onClick={() => setSelection([])} disabled={selection.length === 0}>
                Clear selection
              </button>
            </div>
          </div>

          <div className="file-table">
            <div className="file-row file-head">
              <span>Name</span>
              <span>Type</span>
              <span>Modified</span>
              <span>Size</span>
              <span>Pages</span>
              <span>Order</span>
              <span></span>
            </div>
            {sortedFiles.map((file) => {
              const selectedIndex = selection.indexOf(file.name);
              const selected = selectedIndex >= 0;
              const isRenaming = renamingFile === file.name;
              return (
                <button
                  key={file.name}
                  className={`file-row ${selected ? "selected" : ""}`}
                  onClick={() => void handleFileClick(file)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    handleFileDoubleClick(file);
                  }}
                >
                  <span className="file-name">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        className="rename-input"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitRename();
                          }
                          if (event.key === "Escape") {
                            cancelRename();
                          }
                          event.stopPropagation();
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onBlur={() => void commitRename()}
                      />
                    ) : (
                      <>
                        <strong>{file.name}</strong>
                        {SUPPORTED_IMAGE_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]) ? (
                          <em>image</em>
                        ) : null}
                      </>
                    )}
                  </span>
                  <span>{file.extension || "file"}</span>
                  <span>{formatDate(file.modifiedAt)}</span>
                  <span>{formatBytes(file.size)}</span>
                  <span>{pageCounts[file.name] != null ? pageCounts[file.name] : isPdfFile(file) ? "â€¦" : "-"}</span>
                  <span>{selected ? selectedIndex + 1 : "-"}</span>
                  <span
                    className={`delete-cell${deleteConfirm?.file.name === file.name ? " delete-confirm" : ""}`}
                    role="button"
                    tabIndex={0}
                    title={deleteConfirm?.file.name === file.name ? "Click again to confirm delete" : `Delete ${file.name}`}
                    onClick={(event) => void handleDeleteFile(event, file)}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        void handleDeleteFile(event as unknown as React.MouseEvent, file);
                      }
                    }}
                  >
                    ðŸ—‘ï¸
                  </span>
                </button>
              );
            })}
            {listing && sortedFiles.length === 0 ? <p className="empty-state">No supported PDF or image files in this folder.</p> : null}
          </div>

          <section className="preview-card">
            <div className="section-header compact">
              <h3>Preview</h3>
              <span>{preview?.fileName ?? "Nothing open"}</span>
            </div>
            {preview ? (
              preview.fileType === "pdf" ? (
                <iframe className="preview-frame" src={preview.src} title={preview.fileName} />
              ) : (
                <div className="preview-image-shell">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="preview-image" src={preview.src} alt={preview.fileName} />
                </div>
              )
            ) : (
              <p className="empty-state">Click a PDF or image to preview it here.</p>
            )}
          </section>

          <div className="action-grid action-grid-four">
            <section className="action-card">
              <div className="section-header compact">
                <h3>{isSingleConvert ? "Convert to PDF" : "Merge / Convert"}</h3>
                <span>{mergeSelection.length} valid</span>
              </div>
              <label className="inline-stack">
                <span>Output file name</span>
                <input value={outputName} onChange={(event) => setOutputName(event.target.value)} placeholder={DEFAULT_OUTPUT_NAME} />
              </label>
              <label className="inline-stack">
                <span>Compress quality</span>
                <select value={compressQuality} onChange={(event) => setCompressQuality(event.target.value as CompressQuality)}>
                  {COMPRESS_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="helper-copy">
                {isSingleConvert
                  ? "Converts the selected file to a compressed PDF. Works with images and PDFs."
                  : "Merges files into a single compressed PDF. Supports PDFs and images. Selection order is preserved."}
              </p>
              <button className="primary-button" onClick={() => void handleMerge()} disabled={!canMerge || isPending}>
                {isSingleConvert ? "Convert to PDF" : "Merge selected"}
              </button>
            </section>

            <section className="action-card">
              <div className="section-header compact">
                <h3>Compress PDF{selectedPdfFiles.length > 1 ? "s" : ""}</h3>
                <span>{canCompress ? `${selectedPdfFiles.length} PDF${selectedPdfFiles.length > 1 ? "s" : ""}` : "Select PDFs"}</span>
              </div>
              {selectedPdfFiles.length <= 1 && (
                <label className="inline-stack">
                  <span>Output file name</span>
                  <input
                    value={compressOutputName}
                    onChange={(event) => setCompressOutputName(event.target.value)}
                    placeholder={DEFAULT_COMPRESS_OUTPUT_NAME}
                  />
                </label>
              )}
              <label className="inline-stack">
                <span>Quality</span>
                <select value={compressQuality} onChange={(event) => setCompressQuality(event.target.value as CompressQuality)}>
                  {COMPRESS_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="helper-copy">
                {selectedPdfFiles.length > 1
                  ? `Compresses ${selectedPdfFiles.length} PDFs at the chosen quality. Each gets its own compressed output.`
                  : "Recompresses embedded images at the chosen quality level and then offers to remove the original file."}
              </p>
              <button className="primary-button" onClick={() => void handleCompress()} disabled={!canCompress || isPending}>
                {selectedPdfFiles.length > 1 ? `Compress ${selectedPdfFiles.length} PDFs` : "Compress selected PDF"}
              </button>
            </section>

            <section className="action-card">
              <div className="section-header compact">
                <h3>Split</h3>
                <span>{canSplit ? selectedPdfFiles[0].name : "Select 1 PDF"}</span>
              </div>
              <label className="inline-field">
                <span>Mode</span>
                <select value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>
                  <option value="ranges">Page ranges</option>
                  <option value="per-page">Every page</option>
                </select>
              </label>
              {splitMode === "ranges" ? (
                <label className="inline-stack">
                  <span>Ranges</span>
                  <textarea
                    value={rangesInput}
                    onChange={(event) => setRangesInput(event.target.value)}
                    rows={3}
                    placeholder="1-3, 5, 8-10"
                  />
                </label>
              ) : null}
              <label className="inline-stack">
                <span>Output prefix</span>
                <input value={splitPrefix} onChange={(event) => setSplitPrefix(event.target.value)} placeholder={DEFAULT_SPLIT_PREFIX} />
              </label>
              <button className="primary-button" onClick={() => void handleSplit()} disabled={!canSplit || isPending}>
                Split selected PDF
              </button>
            </section>

            <section className="action-card">
              <div className="section-header compact">
                <h3>Rotate</h3>
                <span>{canRotate ? selectedPdfFiles[0].name : "Select 1 PDF"}</span>
              </div>
              <label className="inline-field">
                <span>Rotation</span>
                <select value={rotateDegrees} onChange={(event) => setRotateDegrees(Number(event.target.value) as 0 | 90 | 180 | 270)}>
                  <option value={90}>90Â° clockwise</option>
                  <option value={180}>180Â°</option>
                  <option value={270}>90Â° counter-clockwise</option>
                </select>
              </label>
              <p className="helper-copy">
                Rotates all pages in the selected PDF. The file is modified in place.
              </p>
              <button className="primary-button" onClick={() => void handleRotate()} disabled={!canRotate || isPending}>
                Rotate all pages
              </button>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
