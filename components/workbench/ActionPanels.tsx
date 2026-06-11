"use client";

import { useState } from "react";
import { COMPRESS_QUALITY_OPTIONS, type CompressQuality, type SplitMode } from "@/lib/shared";
import type { RotationDegrees } from "./types";
import { parseRangesInput } from "./utils";

export const DEFAULT_OUTPUT_NAME = "merged-output.pdf";
export const DEFAULT_SPLIT_PREFIX = "split-output";
export const DEFAULT_COMPRESS_OUTPUT_NAME = "compressed-output.pdf";

export type MergeFormOptions = {
  outputName: string;
  quality: CompressQuality;
};

export type CompressFormOptions = {
  outputName: string;
  quality: CompressQuality;
};

export type SplitFormOptions = {
  mode: SplitMode;
  ranges: string[];
  outputPrefix: string;
};

type ActionPanelsProps = {
  mergeCount: number;
  selectedPdfNames: string[];
  isPending: boolean;
  onMerge: (options: MergeFormOptions) => void;
  onCompress: (options: CompressFormOptions) => void;
  onSplit: (options: SplitFormOptions) => void;
  onRotate: (degrees: RotationDegrees) => void;
};

export function ActionPanels({
  mergeCount,
  selectedPdfNames,
  isPending,
  onMerge,
  onCompress,
  onSplit,
  onRotate,
}: ActionPanelsProps) {
  const [outputName, setOutputName] = useState(DEFAULT_OUTPUT_NAME);
  const [compressOutputName, setCompressOutputName] = useState(DEFAULT_COMPRESS_OUTPUT_NAME);
  const [compressQuality, setCompressQuality] = useState<CompressQuality>("ebook");
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [rangesInput, setRangesInput] = useState("1");
  const [splitPrefix, setSplitPrefix] = useState(DEFAULT_SPLIT_PREFIX);
  const [rotateDegrees, setRotateDegrees] = useState<RotationDegrees>(90);

  const pdfCount = selectedPdfNames.length;
  const canMerge = mergeCount >= 1;
  const isSingleConvert = mergeCount === 1;
  const canSplit = pdfCount === 1;
  const canCompress = pdfCount >= 1;
  const canRotate = pdfCount === 1;

  return (
    <div className="action-grid action-grid-four">
      <section className="action-card">
        <div className="section-header compact">
          <h3>{isSingleConvert ? "Convert to PDF" : "Merge / Convert"}</h3>
          <span>{mergeCount} valid</span>
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
        <button
          className="primary-button"
          onClick={() => onMerge({ outputName, quality: compressQuality })}
          disabled={!canMerge || isPending}
        >
          {isSingleConvert ? "Convert to PDF" : "Merge selected"}
        </button>
      </section>

      <section className="action-card">
        <div className="section-header compact">
          <h3>Compress PDF{pdfCount > 1 ? "s" : ""}</h3>
          <span>{canCompress ? `${pdfCount} PDF${pdfCount > 1 ? "s" : ""}` : "Select PDFs"}</span>
        </div>
        {pdfCount <= 1 && (
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
          {pdfCount > 1
            ? `Compresses ${pdfCount} PDFs at the chosen quality. Each gets its own compressed output.`
            : "Recompresses embedded images at the chosen quality level and then offers to remove the original file."}
        </p>
        <button
          className="primary-button"
          onClick={() => onCompress({ outputName: compressOutputName, quality: compressQuality })}
          disabled={!canCompress || isPending}
        >
          {pdfCount > 1 ? `Compress ${pdfCount} PDFs` : "Compress selected PDF"}
        </button>
      </section>

      <section className="action-card">
        <div className="section-header compact">
          <h3>Split</h3>
          <span>{canSplit ? selectedPdfNames[0] : "Select 1 PDF"}</span>
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
        <button
          className="primary-button"
          onClick={() =>
            onSplit({
              mode: splitMode,
              ranges: splitMode === "ranges" ? parseRangesInput(rangesInput) : [],
              outputPrefix: splitPrefix || DEFAULT_SPLIT_PREFIX,
            })
          }
          disabled={!canSplit || isPending}
        >
          Split selected PDF
        </button>
      </section>

      <section className="action-card">
        <div className="section-header compact">
          <h3>Rotate</h3>
          <span>{canRotate ? selectedPdfNames[0] : "Select 1 PDF"}</span>
        </div>
        <label className="inline-field">
          <span>Rotation</span>
          <select
            value={rotateDegrees}
            onChange={(event) => setRotateDegrees(Number(event.target.value) as RotationDegrees)}
          >
            <option value={90}>90° clockwise</option>
            <option value={180}>180°</option>
            <option value={270}>90° counter-clockwise</option>
          </select>
        </label>
        <p className="helper-copy">Rotates all pages in the selected PDF. The file is modified in place.</p>
        <button className="primary-button" onClick={() => onRotate(rotateDegrees)} disabled={!canRotate || isPending}>
          Rotate all pages
        </button>
      </section>
    </div>
  );
}
