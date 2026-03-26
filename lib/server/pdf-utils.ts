import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { getBaseName, isSupportedPdfExtension, normalizeFileName } from "@/lib/shared";
import { assertSafeFileNames, findAvailablePdfName } from "@/lib/server/fs-utils";

type SplitRequest = {
  folderPath: string;
  fileName: string;
  mode: "ranges" | "per-page";
  ranges?: string[];
  outputPrefix?: string;
};

type CompressRequest = {
  folderPath: string;
  fileName: string;
  outputName?: string;
};

type PageRange = {
  start: number;
  end: number;
};

const MERGE_IMAGE_MAX_DIMENSION = 2200;
const MERGE_IMAGE_QUALITY = 82;

async function addImageToPdf(mergedPdf: PDFDocument, filePath: string) {
  const inputBuffer = await fs.readFile(filePath);
  const optimizedImage = sharp(inputBuffer)
    .rotate()
    .resize({
      width: MERGE_IMAGE_MAX_DIMENSION,
      height: MERGE_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({
      quality: MERGE_IMAGE_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    });

  const jpegBuffer = await optimizedImage.toBuffer();
  const metadata = await sharp(jpegBuffer).metadata();
  const image = await mergedPdf.embedJpg(jpegBuffer);
  const page = mergedPdf.addPage([metadata.width ?? image.width, metadata.height ?? image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
  });
}

export async function mergePdfFiles(folderPath: string, fileNames: string[], requestedOutputName?: string) {
  assertSafeFileNames(fileNames);

  const mergedPdf = await PDFDocument.create();

  for (const fileName of fileNames) {
    const filePath = path.join(folderPath, fileName);
    const extension = path.extname(fileName).toLowerCase();

    if (isSupportedPdfExtension(extension)) {
      const sourceBytes = await fs.readFile(filePath);
      const sourcePdf = await PDFDocument.load(sourceBytes);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
      }
      continue;
    }

    await addImageToPdf(mergedPdf, filePath);
  }

  const outputName = await findAvailablePdfName(
    folderPath,
    normalizeFileName(requestedOutputName ?? "", "merged-output.pdf"),
  );
  const outputPath = path.join(folderPath, outputName);
  const bytes = await mergedPdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  await fs.writeFile(outputPath, bytes);

  return {
    outputFile: outputName,
    outputPath,
  };
}

export async function compressPdfFile({ folderPath, fileName, outputName }: CompressRequest) {
  assertSafeFileNames([fileName]);

  const sourcePath = path.join(folderPath, fileName);
  const sourceBytes = await fs.readFile(sourcePath);
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const optimizedPdf = await PDFDocument.create();
  const copiedPages = await optimizedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
  for (const page of copiedPages) {
    optimizedPdf.addPage(page);
  }

  const requestedName = normalizeFileName(outputName ?? "", `${getBaseName(fileName)}-compressed.pdf`);
  const nextFileName = await findAvailablePdfName(folderPath, requestedName);
  const outputPath = path.join(folderPath, nextFileName);
  const compressedBytes = await optimizedPdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
    objectsPerTick: 100,
  });

  await fs.writeFile(outputPath, compressedBytes);

  return {
    outputFile: nextFileName,
    outputPath,
    originalSize: sourceBytes.byteLength,
    compressedSize: compressedBytes.byteLength,
  };
}

function parseRangeToken(token: string): PageRange {
  const match = token.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid range token "${token}". Use formats like 3 or 5-8.`);
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start <= 0 || end <= 0 || start > end) {
    throw new Error(`Invalid range token "${token}".`);
  }

  return { start, end };
}

function parseRanges(tokens: string[], totalPages: number) {
  if (tokens.length === 0) {
    throw new Error("Provide at least one page range.");
  }

  const parsed = tokens.map(parseRangeToken).sort((left, right) => left.start - right.start);

  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    if (current.end > totalPages) {
      throw new Error(`Range ${current.start}-${current.end} exceeds the document page count (${totalPages}).`);
    }

    if (index > 0) {
      const previous = parsed[index - 1];
      if (current.start <= previous.end) {
        throw new Error("Page ranges cannot overlap.");
      }
    }
  }

  return parsed;
}

export async function splitPdfFile({ folderPath, fileName, mode, ranges = [], outputPrefix }: SplitRequest) {
  assertSafeFileNames([fileName]);

  const sourcePath = path.join(folderPath, fileName);
  const sourceBytes = await fs.readFile(sourcePath);
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const pageCount = sourcePdf.getPageCount();
  const prefix = (outputPrefix?.trim() || `${getBaseName(fileName)}-split`).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
  const createdFiles: string[] = [];

  const jobs =
    mode === "per-page"
      ? sourcePdf.getPageIndices().map((pageIndex) => ({ start: pageIndex + 1, end: pageIndex + 1 }))
      : parseRanges(ranges, pageCount);

  for (const job of jobs) {
    const nextPdf = await PDFDocument.create();
    const pageIndexes = Array.from({ length: job.end - job.start + 1 }, (_, index) => job.start - 1 + index);
    const copiedPages = await nextPdf.copyPages(sourcePdf, pageIndexes);
    for (const page of copiedPages) {
      nextPdf.addPage(page);
    }

    const fileLabel =
      job.start === job.end
        ? `${prefix}-page-${String(job.start).padStart(3, "0")}.pdf`
        : `${prefix}-pages-${String(job.start).padStart(3, "0")}-${String(job.end).padStart(3, "0")}.pdf`;

    const outputName = await findAvailablePdfName(folderPath, normalizeFileName(fileLabel, fileLabel));
    await fs.writeFile(path.join(folderPath, outputName), await nextPdf.save());
    createdFiles.push(outputName);
  }

  return {
    pageCount,
    createdFiles,
  };
}
