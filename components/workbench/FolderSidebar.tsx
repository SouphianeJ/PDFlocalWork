"use client";

import type { Breadcrumb } from "@/lib/browser/breadcrumbs";
import type { DirectoryItem, DirectoryListing } from "@/lib/shared";

type FolderSidebarProps = {
  listing: DirectoryListing | null;
  sourceMode: "path" | "picker";
  breadcrumbs: Breadcrumb[];
  isPending: boolean;
  canZip: boolean;
  onNavigate: (displayPath: string) => void;
  onNavigateParent: () => void;
  onZipFolder: (directory: DirectoryItem) => void;
};

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

export function FolderSidebar({
  listing,
  sourceMode,
  breadcrumbs,
  isPending,
  canZip,
  onNavigate,
  onNavigateParent,
  onZipFolder,
}: FolderSidebarProps) {
  return (
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
          <button key={crumb.path} className="crumb" onClick={() => onNavigate(crumb.path)} disabled={isPending}>
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
            onClick={onNavigateParent}
            disabled={isPending || !listing?.parentPath}
          >
            <span>..</span>
            <span className="muted">Parent</span>
          </button>
          {(listing?.directories ?? []).map((directory) => (
            <div key={directory.path} className="folder-row">
              <button className="folder-row-open" onClick={() => onNavigate(directory.path)} disabled={isPending}>
                <span className="folder-name">{directory.name}</span>
                <span className="muted">Open</span>
              </button>
              {canZip && (
                <button
                  type="button"
                  className="zip-cell"
                  aria-label={`Zip "${directory.name}"`}
                  title={`Zip "${directory.name}"`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onZipFolder(directory);
                  }}
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
  );
}
