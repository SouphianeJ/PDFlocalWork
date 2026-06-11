"use client";

import { useRef, useState } from "react";
import type { FileItem } from "@/lib/shared";
import type { SortKey } from "./types";
import { formatBytes, formatDate, getSelectionLabel, isImageFile, isPdfFile } from "./utils";

type FileTableProps = {
  files: FileItem[];
  hasListing: boolean;
  selection: string[];
  pageCounts: Record<string, number>;
  sortKey: SortKey;
  deleteConfirmName: string | null;
  onSortKeyChange: (sortKey: SortKey) => void;
  onClearSelection: () => void;
  onFileClick: (file: FileItem) => void;
  onRename: (oldName: string, newName: string) => void;
  onDeleteClick: (file: FileItem) => void;
};

export function FileTable({
  files,
  hasListing,
  selection,
  pageCounts,
  sortKey,
  deleteConfirmName,
  onSortKeyChange,
  onClearSelection,
  onFileClick,
  onRename,
  onDeleteClick,
}: FileTableProps) {
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename(file: FileItem) {
    setRenamingFile(file.name);
    setRenameValue(file.name);
    // Focus the input after React renders it
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (!renamingFile) {
      return;
    }

    const newName = renameValue.trim();
    setRenamingFile(null);
    if (!newName || newName === renamingFile) {
      return;
    }

    onRename(renamingFile, newName);
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <p className="eyebrow">Files</p>
          <h2>{getSelectionLabel(selection)}</h2>
        </div>
        <div className="toolbar-controls">
          <label className="inline-field">
            <span>Sort</span>
            <select value={sortKey} onChange={(event) => onSortKeyChange(event.target.value as SortKey)}>
              <option value="name">Name</option>
              <option value="type">Type</option>
              <option value="date">Date</option>
            </select>
          </label>
          <button className="ghost-button" onClick={onClearSelection} disabled={selection.length === 0}>
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
        {files.map((file) => {
          const selectedIndex = selection.indexOf(file.name);
          const selected = selectedIndex >= 0;
          const isRenaming = renamingFile === file.name;
          return (
            <button
              key={file.name}
              className={`file-row ${selected ? "selected" : ""}`}
              onClick={() => onFileClick(file)}
              onDoubleClick={(event) => {
                event.preventDefault();
                startRename(file);
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
                        commitRename();
                      }
                      if (event.key === "Escape") {
                        setRenamingFile(null);
                      }
                      event.stopPropagation();
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onBlur={() => commitRename()}
                  />
                ) : (
                  <>
                    <strong>{file.name}</strong>
                    {isImageFile(file) ? <em>image</em> : null}
                  </>
                )}
              </span>
              <span>{file.extension || "file"}</span>
              <span>{formatDate(file.modifiedAt)}</span>
              <span>{formatBytes(file.size)}</span>
              <span>{pageCounts[file.name] != null ? pageCounts[file.name] : isPdfFile(file) ? "…" : "-"}</span>
              <span>{selected ? selectedIndex + 1 : "-"}</span>
              <span
                className={`delete-cell${deleteConfirmName === file.name ? " delete-confirm" : ""}`}
                role="button"
                tabIndex={0}
                title={deleteConfirmName === file.name ? "Click again to confirm delete" : `Delete ${file.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteClick(file);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    onDeleteClick(file);
                  }
                }}
              >
                🗑️
              </span>
            </button>
          );
        })}
        {hasListing && files.length === 0 ? (
          <p className="empty-state">No supported PDF or image files in this folder.</p>
        ) : null}
      </div>
    </>
  );
}
