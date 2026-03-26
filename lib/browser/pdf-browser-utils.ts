import { PDFDocument } from "pdf-lib";
import {
  getBaseName,
  isSupportedPdfExtension,
  normalizeFileName,
  type DirectoryListing,
  type SplitMode,
} from "@/lib/shared";

type BrowserSplitRequest = {
  mode: SplitMode;
  ranges: string[];
  outputPrefix: string;
};

type BrowserSplitOutput = {
  fileName: string;
  bytes: Uint8Array;
};

type DirectoryEntryHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterable<[string, DirectoryEntryHandle]>;
};
type RemovableDirectoryHandle = FileSystemDirectoryHandle & {
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

const MERGE_IMAGE_MAX_DIMENSION = 2200;
const MERGE_IMAGE_QUALITY = 0.82;

async function imageFileToJpegBytes(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error(`Unable to read image file ${file.name}`));
      node.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    const ratio = Math.min(
      1,
      MERGE_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is not available.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", MERGE_IMAGE_QUALITY),
    );
    if (!blob) {
      throw new Error(`Unable to convert image file ${file.name} to JPEG.`);
    }

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function buildBrowserPdfFromFiles(files: File[]) {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;

    if (isSupportedPdfExtension(extension)) {
      const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
      }
      continue;
    }

    const optimizedImage = await imageFileToJpegBytes(file);
    const image = await mergedPdf.embedJpg(optimizedImage.bytes);
    const page = mergedPdf.addPage([optimizedImage.width, optimizedImage.height]);
    page.drawImage(image, { x: 0, y: 0, width: optimizedImage.width, height: optimizedImage.height });
  }

  return await mergedPdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}

function parseRangeToken(token: string) {
  const match = token.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid range token "${token}".`);
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start <= 0 || end <= 0 || start > end) {
    throw new Error(`Invalid range token "${token}".`);
  }

  return { start, end };
}

function parseRanges(tokens: string[], pageCount: number) {
  if (tokens.length === 0) {
    throw new Error("Provide at least one page range.");
  }

  const ranges = tokens.map(parseRangeToken).sort((left, right) => left.start - right.start);

  for (let index = 0; index < ranges.length; index += 1) {
    const current = ranges[index];
    if (current.end > pageCount) {
      throw new Error(`Range ${current.start}-${current.end} exceeds ${pageCount} page(s).`);
    }

    if (index > 0 && current.start <= ranges[index - 1].end) {
      throw new Error("Page ranges cannot overlap.");
    }
  }

  return ranges;
}

export async function splitBrowserPdfFile(sourceFile: File, request: BrowserSplitRequest): Promise<BrowserSplitOutput[]> {
  const sourcePdf = await PDFDocument.load(await sourceFile.arrayBuffer());
  const pageCount = sourcePdf.getPageCount();
  const prefix = request.outputPrefix.trim() || `${getBaseName(sourceFile.name)}-split`;
  const jobs =
    request.mode === "per-page"
      ? sourcePdf.getPageIndices().map((pageIndex) => ({ start: pageIndex + 1, end: pageIndex + 1 }))
      : parseRanges(request.ranges, pageCount);

  const outputs: BrowserSplitOutput[] = [];

  for (const job of jobs) {
    const nextPdf = await PDFDocument.create();
    const pageIndexes = Array.from({ length: job.end - job.start + 1 }, (_, index) => job.start - 1 + index);
    const copiedPages = await nextPdf.copyPages(sourcePdf, pageIndexes);
    for (const page of copiedPages) {
      nextPdf.addPage(page);
    }

    const fileName =
      job.start === job.end
        ? `${prefix}-page-${String(job.start).padStart(3, "0")}.pdf`
        : `${prefix}-pages-${String(job.start).padStart(3, "0")}-${String(job.end).padStart(3, "0")}.pdf`;

    outputs.push({
      fileName: normalizeFileName(fileName, fileName),
      bytes: await nextPdf.save(),
    });
  }

  return outputs;
}

export async function listBrowserDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  displayPath: string,
): Promise<DirectoryListing> {
  const directories: DirectoryListing["directories"] = [];
  const files: DirectoryListing["files"] = [];

  for await (const [name, handle] of (directoryHandle as IterableDirectoryHandle).entries()) {
    const itemPath = displayPath ? `${displayPath}/${name}` : name;

    if (handle.kind === "directory") {
      directories.push({ name, path: itemPath });
      continue;
    }

    const file = await handle.getFile();
    const extension = `.${name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      continue;
    }

    files.push({
      name,
      path: itemPath,
      extension,
      size: file.size,
      modifiedAt: new Date(file.lastModified).toISOString(),
    });
  }

  directories.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  files.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  const segments = displayPath.split("/").filter(Boolean);
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join("/") : null;

  return {
    name: segments[segments.length - 1] ?? directoryHandle.name,
    path: displayPath || directoryHandle.name,
    parentPath,
    directories,
    files,
  };
}

export async function writeBrowserPdfFile(
  directoryHandle: FileSystemDirectoryHandle,
  requestedName: string,
  bytes: Uint8Array,
) {
  const normalizedName = normalizeFileName(requestedName, "output.pdf");
  const dotIndex = normalizedName.lastIndexOf(".");
  const stem = dotIndex > 0 ? normalizedName.slice(0, dotIndex) : normalizedName;
  const ext = dotIndex > 0 ? normalizedName.slice(dotIndex) : ".pdf";

  let candidate = `${stem}${ext}`;
  let index = 1;

  while (true) {
    try {
      await directoryHandle.getFileHandle(candidate, { create: false });
      candidate = `${stem} (${index})${ext}`;
      index += 1;
    } catch {
      const handle = await directoryHandle.getFileHandle(candidate, { create: true });
      const writable = await handle.createWritable();
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      await writable.write(arrayBuffer);
      await writable.close();
      return candidate;
    }
  }
}

export async function deleteBrowserFiles(
  directoryHandle: FileSystemDirectoryHandle,
  fileNames: string[],
) {
  const removableHandle = directoryHandle as RemovableDirectoryHandle;

  for (const fileName of fileNames) {
    await removableHandle.removeEntry(fileName);
  }

  return {
    deletedCount: fileNames.length,
    deletedFiles: fileNames,
  };
}
