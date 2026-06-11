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
import type { CompressQuality, DirectoryListing, FileItem, SplitMode } from "@/lib/shared";
import type { RotationDegrees } from "./types";
import { fetchJson, postJson } from "./utils";

type BrowserStartIn = "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: BrowserStartIn;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function isSupportedBrowserPicker() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export type PageRotation = { page: number; degrees: RotationDegrees };

export type MergeOutcome = {
  outputFile: string;
  originalSize?: number;
  compressedSize?: number;
};

export type CompressOutcome = {
  outputFile: string;
  originalSize: number;
  compressedSize: number;
};

export type SplitOptions = {
  mode: SplitMode;
  ranges: string[];
  outputPrefix: string;
};

export type ZipOutcome = {
  zipName: string;
  size: number;
  fileCount: number;
};

/**
 * One implementation per source mode (server path API vs. browser
 * File System Access API), so UI handlers never branch on the mode.
 * Instances are immutable: navigation returns a new backend.
 */
export interface FileBackend {
  readonly kind: "path" | "picker";
  readonly listing: DirectoryListing;
  navigate(displayPath: string): Promise<FileBackend>;
  refresh(): Promise<FileBackend>;
  deleteFiles(fileNames: string[]): Promise<void>;
  renameFile(oldName: string, newName: string): Promise<void>;
  merge(fileNames: string[], outputName: string, quality: CompressQuality): Promise<MergeOutcome>;
  compress(fileName: string, outputName: string, quality: CompressQuality): Promise<CompressOutcome>;
  split(fileName: string, options: SplitOptions): Promise<number>;
  rotate(fileName: string, rotations: PageRotation[]): Promise<void>;
  getPageCounts(fileNames: string[]): Promise<Record<string, number>>;
  getPreviewSrc(file: FileItem): Promise<string>;
  zipFolder?(folderPath: string): Promise<ZipOutcome>;
}

export class PathBackend implements FileBackend {
  readonly kind = "path" as const;

  private constructor(readonly listing: DirectoryListing) {}

  static async open(folderPath: string) {
    const listing = await fetchJson<DirectoryListing>(`/api/fs/list?path=${encodeURIComponent(folderPath)}`);
    return new PathBackend(listing);
  }

  navigate(displayPath: string): Promise<FileBackend> {
    return PathBackend.open(displayPath);
  }

  refresh(): Promise<FileBackend> {
    return PathBackend.open(this.listing.path);
  }

  async deleteFiles(fileNames: string[]) {
    await fetchJson("/api/fs/delete", postJson({ folderPath: this.listing.path, fileNames }));
  }

  async renameFile(oldName: string, newName: string) {
    await fetchJson("/api/fs/rename", postJson({ folderPath: this.listing.path, oldName, newName }));
  }

  merge(fileNames: string[], outputName: string, quality: CompressQuality) {
    return fetchJson<MergeOutcome>(
      "/api/pdf/merge",
      postJson({ folderPath: this.listing.path, fileNames, outputName, compressQuality: quality }),
    );
  }

  compress(fileName: string, outputName: string, quality: CompressQuality) {
    return fetchJson<CompressOutcome>(
      "/api/pdf/compress",
      postJson({ folderPath: this.listing.path, fileName, outputName, quality }),
    );
  }

  async split(fileName: string, options: SplitOptions) {
    const result = await fetchJson<{ createdFiles: string[] }>(
      "/api/pdf/split",
      postJson({
        folderPath: this.listing.path,
        fileName,
        mode: options.mode,
        ranges: options.mode === "ranges" ? options.ranges : undefined,
        outputPrefix: options.outputPrefix,
      }),
    );
    return result.createdFiles.length;
  }

  async rotate(fileName: string, rotations: PageRotation[]) {
    await fetchJson(
      "/api/pdf/rotate",
      postJson({ folderPath: this.listing.path, fileName, pageRotations: rotations }),
    );
  }

  async getPageCounts(fileNames: string[]) {
    const result = await fetchJson<{ pageCounts: Record<string, number> }>(
      "/api/pdf/pagecount",
      postJson({ folderPath: this.listing.path, fileNames }),
    );
    return result.pageCounts;
  }

  async getPreviewSrc(file: FileItem) {
    // The timestamp forces the iframe to reload when a file is modified in
    // place (e.g. rotation) and previewed again with an otherwise stable URL.
    const params = new URLSearchParams({ folderPath: this.listing.path, fileName: file.name });
    return `/api/fs/file?${params.toString()}&t=${Date.now()}`;
  }

  async zipFolder(folderPath: string) {
    return fetchJson<ZipOutcome>("/api/fs/zip", postJson({ path: folderPath }));
  }
}

export class PickerBackend implements FileBackend {
  readonly kind = "picker" as const;

  private constructor(
    private readonly rootHandle: FileSystemDirectoryHandle,
    private readonly currentHandle: FileSystemDirectoryHandle,
    private readonly rootName: string,
    private readonly relativePath: string,
    readonly listing: DirectoryListing,
  ) {}

  static async open(rootHandle: FileSystemDirectoryHandle) {
    const listing = await listBrowserDirectory(rootHandle, rootHandle.name);
    return new PickerBackend(rootHandle, rootHandle, rootHandle.name, "", listing);
  }

  private toRelativePath(displayPath: string) {
    if (displayPath === this.rootName) {
      return "";
    }

    if (displayPath.startsWith(`${this.rootName}/`)) {
      return displayPath.slice(this.rootName.length + 1);
    }

    return displayPath;
  }

  private async openRelative(relativePath: string) {
    let handle = this.rootHandle;
    if (relativePath) {
      for (const segment of relativePath.split("/").filter(Boolean)) {
        handle = await handle.getDirectoryHandle(segment);
      }
    }

    const virtualPath = relativePath ? `${this.rootName}/${relativePath}` : this.rootName;
    const listing = await listBrowserDirectory(handle, virtualPath);
    return new PickerBackend(this.rootHandle, handle, this.rootName, relativePath, listing);
  }

  navigate(displayPath: string): Promise<FileBackend> {
    return this.openRelative(this.toRelativePath(displayPath));
  }

  refresh(): Promise<FileBackend> {
    return this.openRelative(this.relativePath);
  }

  async deleteFiles(fileNames: string[]) {
    await deleteBrowserFiles(this.currentHandle, fileNames);
  }

  async renameFile(oldName: string, newName: string) {
    await renameBrowserFile(this.currentHandle, oldName, newName);
  }

  async merge(fileNames: string[], outputName: string, quality: CompressQuality): Promise<MergeOutcome> {
    const files: File[] = [];
    for (const fileName of fileNames) {
      const handle = await this.currentHandle.getFileHandle(fileName);
      files.push(await handle.getFile());
    }

    const mergedPdf = await buildBrowserPdfFromFiles(files);

    // Auto-compress the merged output, mirroring the server-side merge flow.
    const tempBlob = new Blob([mergedPdf as BlobPart], { type: "application/pdf" });
    const tempFile = new File([tempBlob], "temp.pdf", { type: "application/pdf" });
    const compressed = await compressBrowserPdfFile(tempFile, quality);

    const writtenFile = await writeBrowserPdfFile(
      this.currentHandle,
      outputName || "merged-output.pdf",
      compressed.bytes,
    );

    return {
      outputFile: writtenFile,
      originalSize: compressed.originalSize,
      compressedSize: compressed.compressedSize,
    };
  }

  async compress(fileName: string, outputName: string, quality: CompressQuality): Promise<CompressOutcome> {
    const handle = await this.currentHandle.getFileHandle(fileName);
    const result = await compressBrowserPdfFile(await handle.getFile(), quality);
    const writtenFile = await writeBrowserPdfFile(
      this.currentHandle,
      outputName || `${fileName.replace(/\.pdf$/i, "")}-compressed.pdf`,
      result.bytes,
    );

    return {
      outputFile: writtenFile,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
    };
  }

  async split(fileName: string, options: SplitOptions) {
    const handle = await this.currentHandle.getFileHandle(fileName);
    const outputs = await splitBrowserPdfFile(await handle.getFile(), {
      mode: options.mode,
      ranges: options.mode === "ranges" ? options.ranges : [],
      outputPrefix: options.outputPrefix,
    });

    for (const output of outputs) {
      await writeBrowserPdfFile(this.currentHandle, output.fileName, output.bytes);
    }

    return outputs.length;
  }

  async rotate(fileName: string, rotations: PageRotation[]) {
    await rotateBrowserPdfPages(this.currentHandle, fileName, rotations);
  }

  async getPageCounts(fileNames: string[]) {
    const pageCounts: Record<string, number> = {};
    for (const fileName of fileNames) {
      try {
        pageCounts[fileName] = await getBrowserPdfPageCount(this.currentHandle, fileName);
      } catch {
        // skip files we can't read
      }
    }
    return pageCounts;
  }

  async getPreviewSrc(file: FileItem) {
    const handle = await this.currentHandle.getFileHandle(file.name);
    const browserFile = await handle.getFile();
    return URL.createObjectURL(browserFile);
  }
}
