"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { buildBreadcrumbs } from "@/lib/browser/breadcrumbs";
import type { DirectoryItem, FileItem } from "@/lib/shared";
import {
  isSupportedBrowserPicker,
  PathBackend,
  PickerBackend,
  type CompressOutcome,
  type FileBackend,
} from "./workbench/backend";
import {
  ActionPanels,
  type CompressFormOptions,
  type MergeFormOptions,
  type SplitFormOptions,
} from "./workbench/ActionPanels";
import { FileTable } from "./workbench/FileTable";
import { FolderSidebar } from "./workbench/FolderSidebar";
import { PathBar } from "./workbench/PathBar";
import { PreviewPanel } from "./workbench/PreviewPanel";
import type { PreviewState, RotationDegrees, SortKey, SourceDeletePrompt } from "./workbench/types";
import {
  formatBytes,
  getApiErrorMessage,
  isMergeableFile,
  isPdfFile,
  revokePreviewUrl,
  sortFiles,
} from "./workbench/utils";

export function PdfLocalWorkbench() {
  const [backend, setBackend] = useState<FileBackend | null>(null);
  const [folderPathInput, setFolderPathInput] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [sourceDeletePrompt, setSourceDeletePrompt] = useState<SourceDeletePrompt | null>(null);
  const [batchDeletePrompt, setBatchDeletePrompt] = useState<string[] | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null);
  const [status, setStatus] = useState("Enter a folder path or use the browser picker.");
  const [isPending, startTransition] = useTransition();

  const listing = backend?.listing ?? null;
  const sourceMode = backend?.kind ?? "path";

  const sortedFiles = useMemo(() => sortFiles(listing?.files ?? [], sortKey), [listing?.files, sortKey]);
  const selectedFiles = useMemo(
    () => selection.map((name) => listing?.files.find((file) => file.name === name)).filter(Boolean) as FileItem[],
    [listing?.files, selection],
  );
  const mergeSelection = selectedFiles.filter(isMergeableFile);
  const selectedPdfFiles = selectedFiles.filter(isPdfFile);
  const breadcrumbs = useMemo(() => (listing ? buildBreadcrumbs(listing.path) : []), [listing]);

  const adoptBackend = useCallback((next: FileBackend) => {
    setPreview((current) => {
      revokePreviewUrl(current);
      return null;
    });
    setBackend(next);
    setSelection([]);
    setPageCounts({});
  }, []);

  // Fetch page counts for PDF files whenever the listing changes.
  useEffect(() => {
    if (!backend) {
      return;
    }

    const pdfNames = backend.listing.files.filter(isPdfFile).map((file) => file.name);
    if (pdfNames.length === 0) {
      return;
    }

    let cancelled = false;
    backend
      .getPageCounts(pdfNames)
      .then((counts) => {
        if (!cancelled) {
          setPageCounts(counts);
        }
      })
      .catch(() => {
        // leave the placeholder page counts in place
      });

    return () => {
      cancelled = true;
    };
  }, [backend]);

  const runDeleteFiles = useCallback(
    (fileNames: string[], successStatus: string) => {
      if (!backend) {
        return;
      }

      startTransition(async () => {
        try {
          await backend.deleteFiles(fileNames);
          adoptBackend(await backend.refresh());
          setStatus(successStatus);
        } catch (error) {
          setStatus(getApiErrorMessage(error));
        }
      });
    },
    [backend, adoptBackend],
  );

  const confirmBatchDelete = useCallback(() => {
    if (!batchDeletePrompt) {
      return;
    }

    const fileNames = batchDeletePrompt;
    setBatchDeletePrompt(null);
    runDeleteFiles(fileNames, `Deleted ${fileNames.length} file(s).`);
  }, [batchDeletePrompt, runDeleteFiles]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      if (event.key === "Escape") {
        setSelection([]);
        setDeleteConfirmName(null);
        setBatchDeletePrompt(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (backend) {
          setSelection(backend.listing.files.map((file) => file.name));
        }
        return;
      }

      if (event.key === "Delete" && selection.length > 0 && backend) {
        event.preventDefault();
        if (batchDeletePrompt) {
          confirmBatchDelete();
        } else {
          setBatchDeletePrompt([...selection]);
        }
      }
    },
    [backend, selection, batchDeletePrompt, confirmBatchDelete],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function openPath(pathValue: string) {
    const trimmedPath = pathValue.trim();
    if (!trimmedPath) {
      setStatus("Enter a folder path first.");
      return;
    }

    startTransition(async () => {
      try {
        const next = await PathBackend.open(trimmedPath);
        adoptBackend(next);
        setFolderPathInput(next.listing.path);
        setStatus(`Loaded ${next.listing.files.length} files from ${next.listing.path}`);
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

      const next = await PickerBackend.open(rootHandle);
      adoptBackend(next);
      setStatus(`Loaded browser folder "${rootHandle.name}".`);
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  function navigateTo(displayPath: string) {
    if (!backend) {
      return;
    }

    startTransition(async () => {
      try {
        const next = await backend.navigate(displayPath);
        adoptBackend(next);
        if (next.kind === "path") {
          setFolderPathInput(next.listing.path);
          setStatus(`Loaded ${next.listing.files.length} files from ${next.listing.path}`);
        } else {
          setStatus(`Opened ${next.listing.path}`);
        }
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleParentNavigation() {
    if (!listing?.parentPath) {
      return;
    }

    navigateTo(listing.parentPath);
  }

  async function previewFile(activeBackend: FileBackend, file: FileItem) {
    try {
      const src = await activeBackend.getPreviewSrc(file);
      setPreview((current) => {
        revokePreviewUrl(current);
        return {
          fileName: file.name,
          fileType: isPdfFile(file) ? "pdf" : "image",
          src,
        };
      });
    } catch (error) {
      setStatus(getApiErrorMessage(error));
    }
  }

  async function handleFileClick(file: FileItem) {
    setSelection((current) =>
      current.includes(file.name) ? current.filter((name) => name !== file.name) : [...current, file.name],
    );

    if (backend) {
      await previewFile(backend, file);
    }
  }

  function handleRename(oldName: string, newName: string) {
    if (!backend) {
      return;
    }

    startTransition(async () => {
      try {
        await backend.renameFile(oldName, newName);
        adoptBackend(await backend.refresh());
        setStatus(`Renamed "${oldName}" to "${newName}".`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleDeleteClick(file: FileItem) {
    if (!backend) {
      return;
    }

    // Second click within 3 seconds confirms the delete.
    if (deleteConfirmName === file.name) {
      setDeleteConfirmName(null);
      runDeleteFiles([file.name], `Deleted "${file.name}".`);
      return;
    }

    setDeleteConfirmName(file.name);
    window.setTimeout(() => {
      setDeleteConfirmName((current) => (current === file.name ? null : current));
    }, 3000);
  }

  function handleZipFolder(directory: DirectoryItem) {
    const zipFolder = backend?.zipFolder?.bind(backend);
    if (!zipFolder) {
      return;
    }

    startTransition(async () => {
      try {
        setStatus(`Zipping "${directory.name}"…`);
        const result = await zipFolder(directory.path);
        setStatus(`Created "${result.zipName}" (${formatBytes(result.size)}, ${result.fileCount} files).`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleMerge(options: MergeFormOptions) {
    if (!backend || mergeSelection.length === 0) {
      setStatus("Select at least one PDF or image file.");
      return;
    }

    const fileNames = mergeSelection.map((file) => file.name);
    const actionLabel = fileNames.length === 1 ? "Converted" : "Merged";

    startTransition(async () => {
      try {
        const result = await backend.merge(fileNames, options.outputName, options.quality);
        adoptBackend(await backend.refresh());
        setSourceDeletePrompt({ outputFile: result.outputFile, fileNames, kind: "merge" });
        const sizeInfo =
          result.originalSize != null && result.compressedSize != null
            ? ` (${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)})`
            : "";
        setStatus(`${actionLabel} into ${result.outputFile}${sizeInfo}. You can now delete the original file(s).`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleCompress(options: CompressFormOptions) {
    if (!backend || selectedPdfFiles.length === 0) {
      setStatus("Select at least one PDF file to compress.");
      return;
    }

    const targets = selectedPdfFiles;

    startTransition(async () => {
      try {
        const results: CompressOutcome[] = [];
        for (const target of targets) {
          const outputName = targets.length === 1 ? options.outputName : `compressed-${target.name}`;
          results.push(await backend.compress(target.name, outputName, options.quality));
        }

        adoptBackend(await backend.refresh());

        if (results.length === 1) {
          setSourceDeletePrompt({
            outputFile: results[0].outputFile,
            fileNames: [targets[0].name],
            kind: "compress",
          });
          setStatus(
            `Compressed into ${results[0].outputFile} (${formatBytes(results[0].originalSize)} → ${formatBytes(results[0].compressedSize)}).`,
          );
        } else {
          const totalOriginal = results.reduce((sum, result) => sum + result.originalSize, 0);
          const totalCompressed = results.reduce((sum, result) => sum + result.compressedSize, 0);
          setSourceDeletePrompt({
            outputFile: results.map((result) => result.outputFile).join(", "),
            fileNames: targets.map((file) => file.name),
            kind: "compress",
          });
          setStatus(
            `Compressed ${results.length} PDFs (${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)} total).`,
          );
        }
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleSplit(options: SplitFormOptions) {
    const target = selectedPdfFiles[0];
    if (!backend || !target) {
      setStatus("Select exactly one PDF file to split.");
      return;
    }

    startTransition(async () => {
      try {
        const createdCount = await backend.split(target.name, options);
        adoptBackend(await backend.refresh());
        setStatus(`Created ${createdCount} file(s).`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleRotate(degrees: RotationDegrees) {
    const target = selectedPdfFiles[0];
    if (!backend || !target) {
      setStatus("Select exactly one PDF file to rotate.");
      return;
    }

    const pageCount = pageCounts[target.name];
    if (!pageCount) {
      setStatus("Page count not yet loaded. Please wait a moment.");
      return;
    }

    const rotations = Array.from({ length: pageCount }, (_, index) => ({ page: index + 1, degrees }));
    const wasPreviewed = preview?.fileName === target.name;

    startTransition(async () => {
      try {
        await backend.rotate(target.name, rotations);
        const next = await backend.refresh();
        adoptBackend(next);
        setStatus(`Rotated all ${pageCount} page(s) of "${target.name}" by ${degrees}°.`);

        if (wasPreviewed) {
          const refreshedFile = next.listing.files.find((file) => file.name === target.name);
          if (refreshedFile) {
            await previewFile(next, refreshedFile);
          }
        }
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleDeleteOriginals() {
    if (!backend || !sourceDeletePrompt) {
      return;
    }

    const prompt = sourceDeletePrompt;

    startTransition(async () => {
      try {
        await backend.deleteFiles(prompt.fileNames);
        adoptBackend(await backend.refresh());
        setSourceDeletePrompt(null);
        setStatus(`Deleted ${prompt.fileNames.length} original file(s) used for ${prompt.outputFile}.`);
      } catch (error) {
        setStatus(getApiErrorMessage(error));
      }
    });
  }

  function handleKeepOriginals() {
    if (!sourceDeletePrompt) {
      return;
    }

    setStatus(`Kept the original files. ${sourceDeletePrompt.outputFile} remains available in this folder.`);
    setSourceDeletePrompt(null);
  }

  const hasBanner = Boolean(batchDeletePrompt || sourceDeletePrompt);

  return (
    <main className={`shell${hasBanner ? " shell-with-banner" : ""}`}>
      {batchDeletePrompt ? (
        <div className="confirm-banner">
          <p>
            Delete {batchDeletePrompt.length} selected file(s)? This cannot be undone. (Press Delete again to
            confirm.)
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={confirmBatchDelete} disabled={isPending}>
              Delete files
            </button>
            <button className="ghost-button" onClick={() => setBatchDeletePrompt(null)} disabled={isPending}>
              Cancel
            </button>
          </div>
        </div>
      ) : sourceDeletePrompt ? (
        <div className="confirm-banner">
          <p>
            {sourceDeletePrompt.kind === "merge"
              ? `Merged file created: ${sourceDeletePrompt.outputFile}. Would you like to delete the ${sourceDeletePrompt.fileNames.length} original file(s) that were merged?`
              : `Compressed file created: ${sourceDeletePrompt.outputFile}. Would you like to delete the original PDF used to create this compressed version?`}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={handleDeleteOriginals} disabled={isPending}>
              Delete originals
            </button>
            <button className="ghost-button" onClick={handleKeepOriginals} disabled={isPending}>
              Keep originals
            </button>
          </div>
        </div>
      ) : null}

      <PathBar
        value={folderPathInput}
        onValueChange={setFolderPathInput}
        onOpenPath={openPath}
        onBrowse={() => void openBrowserFolder()}
        suggestionsEnabled={sourceMode === "path"}
        isPending={isPending}
        status={status}
      />

      <section className="workspace">
        <FolderSidebar
          listing={listing}
          sourceMode={sourceMode}
          breadcrumbs={breadcrumbs}
          isPending={isPending}
          canZip={sourceMode === "path" && Boolean(backend?.zipFolder)}
          onNavigate={navigateTo}
          onNavigateParent={handleParentNavigation}
          onZipFolder={handleZipFolder}
        />

        <div className="main-card">
          <FileTable
            files={sortedFiles}
            hasListing={listing !== null}
            selection={selection}
            pageCounts={pageCounts}
            sortKey={sortKey}
            deleteConfirmName={deleteConfirmName}
            onSortKeyChange={setSortKey}
            onClearSelection={() => setSelection([])}
            onFileClick={(file) => void handleFileClick(file)}
            onRename={handleRename}
            onDeleteClick={handleDeleteClick}
          />

          <PreviewPanel preview={preview} />

          <ActionPanels
            mergeCount={mergeSelection.length}
            selectedPdfNames={selectedPdfFiles.map((file) => file.name)}
            isPending={isPending}
            onMerge={handleMerge}
            onCompress={handleCompress}
            onSplit={handleSplit}
            onRotate={handleRotate}
          />
        </div>
      </section>
    </main>
  );
}
