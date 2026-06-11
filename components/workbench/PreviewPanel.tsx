"use client";

import type { PreviewState } from "./types";

type PreviewPanelProps = {
  preview: PreviewState | null;
};

export function PreviewPanel({ preview }: PreviewPanelProps) {
  return (
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
  );
}
