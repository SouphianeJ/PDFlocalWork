"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildBrowserPdfFromFiles,
  deleteBrowserFiles,
  listBrowserDirectory,
  splitBrowserPdfFile,
  writeBrowserPdfFile,
} from "@/lib/browser/pdf-browser-utils";
import {
  FILE_ACCEPT_ATTRIBUTE,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_MERGE_EXTENSIONS,
  SUPPORTED_PDF_EXTENSIONS,
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

type MergeDeletePrompt = {
  outputFile: string;
  fileNames: string[];
};

type PreviewState = {
  fileName: string;
  fileType: "pdf" | "image";
  src: string;
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
  const [pathListing, setPathListing] = useState<DirectoryListing | null>(null);
  const [pickerState, setPickerState] = useState<BrowserPickerState | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sourceMode, setSourceMode] = useState<SourceMode>("path");
  const [outputName, setOutputName] = useState(DEFAULT_OUTPUT_NAME);
  const [splitPrefix, setSplitPrefix] = useState(DEFAULT_SPLIT_PREFIX);
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [rangesInput, setRangesInput] = useState("1");
  const [mergeDeletePrompt, setMergeDeletePrompt] = useState<MergeDeletePrompt | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
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
      setStatus(`Loaded browser folder "${rootHandle.name}".`);
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  async function navigatePathFolder(nextPath: string) {
    await openFolderByPath(nextPath);
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
      setStatus("Select at least one PDF or image file to merge.");
      return;
    }

    startTransition(async () => {
      try {
        const mergedFileNames = mergeSelection.map((file) => file.name);

        if (sourceMode === "path") {
          const result = await fetchJson<{ outputFile: string }>("/api/pdf/merge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              folderPath: listing.path,
              fileNames: mergedFileNames,
              outputName,
            }),
          });

          await openFolderByPath(listing.path);
          setMergeDeletePrompt({
            outputFile: result.outputFile,
            fileNames: mergedFileNames,
          });
          setStatus(`Merged into ${result.outputFile}. You can now delete the original files used in this merge.`);
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
        const writtenFile = await writeBrowserPdfFile(
          pickerState.currentHandle,
          outputName || DEFAULT_OUTPUT_NAME,
          mergedPdf,
        );
        await navigatePickerFolder(pickerState.currentRelativePath);
        setMergeDeletePrompt({
          outputFile: writtenFile,
          fileNames: mergedFileNames,
        });
        setStatus(`Merged into ${writtenFile}. You can now delete the original files used in this merge.`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  async function handleDeleteMergedSources() {
    if (!mergeDeletePrompt || !listing) {
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
              fileNames: mergeDeletePrompt.fileNames,
            }),
          });

          await openFolderByPath(listing.path);
          setMergeDeletePrompt(null);
          setStatus(`Deleted ${result.deletedCount} original file(s) used for ${mergeDeletePrompt.outputFile}.`);
          return;
        }

        if (!pickerState) {
          return;
        }

        await deleteBrowserFiles(pickerState.currentHandle, mergeDeletePrompt.fileNames);
        await navigatePickerFolder(pickerState.currentRelativePath);
        setMergeDeletePrompt(null);
        setStatus(`Deleted ${mergeDeletePrompt.fileNames.length} original file(s) used for ${mergeDeletePrompt.outputFile}.`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleKeepMergedSources() {
    if (!mergeDeletePrompt) {
      return;
    }

    setStatus(`Kept the original files. ${mergeDeletePrompt.outputFile} remains available in this folder.`);
    setMergeDeletePrompt(null);
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

  const canMerge = mergeSelection.length > 0;
  const canSplit = selectedPdfFiles.length === 1;

  return (
    <main className="shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Local PDF helper</p>
          <h1>Merge and split PDFs at desktop speed.</h1>
          <p className="hero-copy">
            Browse a real folder path for the reliable workflow, or use the browser directory picker when available.
            Files stay local and output lands next to the source files.
          </p>
        </div>
        <div className="hero-grid">
          <label className="field-card">
            <span>Folder path</span>
            <input
              value={folderPathInput}
              onChange={(event) => setFolderPathInput(event.target.value)}
              placeholder="C:\\Users\\you\\Documents\\PDFs"
              spellCheck={false}
            />
          </label>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => void openFolderByPath(folderPathInput)} disabled={isPending}>
              Open path
            </button>
            <button className="secondary-button" onClick={() => void openBrowserFolder()} disabled={isPending}>
              Browser folder
            </button>
          </div>
        </div>
        <p className="status-line">{status}</p>
        {mergeDeletePrompt ? (
          <div className="confirm-banner">
            <p>
              {`Merged file created: ${mergeDeletePrompt.outputFile}. Would you like to delete the ${mergeDeletePrompt.fileNames.length} original file(s) that were merged?`}
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
                <button
                  key={directory.path}
                  className="folder-row"
                  onClick={() =>
                    sourceMode === "path"
                      ? void navigatePathFolder(directory.path)
                      : void navigatePickerFolder(toPickerRelativePath(directory.path))
                  }
                  disabled={isPending}
                >
                  <span>{directory.name}</span>
                  <span className="muted">Open</span>
                </button>
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
              <span>Order</span>
            </div>
            {sortedFiles.map((file) => {
              const selectedIndex = selection.indexOf(file.name);
              const selected = selectedIndex >= 0;
              return (
                <button
                  key={file.name}
                  className={`file-row ${selected ? "selected" : ""}`}
                  onClick={() => void handleFileClick(file)}
                >
                  <span className="file-name">
                    <strong>{file.name}</strong>
                    {SUPPORTED_IMAGE_EXTENSIONS.includes(file.extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]) ? (
                      <em>image</em>
                    ) : null}
                  </span>
                  <span>{file.extension || "file"}</span>
                  <span>{formatDate(file.modifiedAt)}</span>
                  <span>{formatBytes(file.size)}</span>
                  <span>{selected ? selectedIndex + 1 : "-"}</span>
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

          <div className="action-grid">
            <section className="action-card">
              <div className="section-header compact">
                <h3>Merge</h3>
                <span>{mergeSelection.length} valid</span>
              </div>
              <label className="inline-stack">
                <span>Output file name</span>
                <input value={outputName} onChange={(event) => setOutputName(event.target.value)} placeholder={DEFAULT_OUTPUT_NAME} />
              </label>
              <p className="helper-copy">
                Supported: {FILE_ACCEPT_ATTRIBUTE}. Selection order is preserved. Images are converted silently into PDF pages.
              </p>
              <button className="primary-button" onClick={() => void handleMerge()} disabled={!canMerge || isPending}>
                Merge selected
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
          </div>
        </div>
      </section>
    </main>
  );
}
