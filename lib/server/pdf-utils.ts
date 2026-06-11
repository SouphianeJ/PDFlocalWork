import path from "node:path";
import { promises as fs } from "node:fs";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream, PDFRef, degrees as pdfDegrees } from "pdf-lib";
import {
  getBaseName,
  isSupportedPdfExtension,
  normalizeFileName,
  parsePageRanges,
  type CompressQuality,
} from "@/lib/shared";
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
  quality?: CompressQuality;
};

const QUALITY_TO_JPEG: Record<CompressQuality, number> = {
  screen: 40,
  ebook: 65,
  printer: 85,
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

export async function compressPdfFile({ folderPath, fileName, outputName, quality }: CompressRequest) {
  assertSafeFileNames([fileName]);
  const sourcePath = path.join(folderPath, fileName);
  const sourceBytes = await fs.readFile(sourcePath);
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const jpegQuality = QUALITY_TO_JPEG[quality ?? "ebook"];

  for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    const filter = dict.get(PDFName.of("Filter"))?.toString();

    const originalBytes = obj.getContents();

    if (filter === "/DCTDecode") {
      try {
        const recompressed = await sharp(Buffer.from(originalBytes))
          .jpeg({ quality: jpegQuality, mozjpeg: true })
          .toBuffer();

        if (recompressed.byteLength < originalBytes.byteLength) {
          pdfDoc.context.assign(ref as PDFRef, PDFRawStream.of(dict, new Uint8Array(recompressed)));
        }
      } catch {
        // skip images that sharp cannot process
      }
      continue;
    }

    if (filter === "/FlateDecode") {
      try {
        const width = Number(dict.get(PDFName.of("Width"))?.toString());
        const height = Number(dict.get(PDFName.of("Height"))?.toString());
        const bpc = Number(dict.get(PDFName.of("BitsPerComponent"))?.toString() || "8");
        if (!width || !height || bpc !== 8) continue;

        const cs = dict.get(PDFName.of("ColorSpace"))?.toString() ?? "";
        let channels: 1 | 3;
        if (cs.includes("DeviceGray")) channels = 1;
        else if (cs.includes("DeviceRGB")) channels = 3;
        else continue; // skip CMYK, ICCBased, Indexed, etc.

        const rawPixels = inflateSync(Buffer.from(originalBytes));
        if (rawPixels.byteLength !== width * height * channels) continue; // unexpected size, skip

        const recompressed = await sharp(rawPixels, { raw: { width, height, channels } })
          .jpeg({ quality: jpegQuality, mozjpeg: true })
          .toBuffer();

        if (recompressed.byteLength < originalBytes.byteLength) {
          dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
          dict.delete(PDFName.of("DecodeParms"));
          if (channels === 3) dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
          pdfDoc.context.assign(ref as PDFRef, PDFRawStream.of(dict, new Uint8Array(recompressed)));
        }
      } catch {
        // skip images that cannot be processed
      }
      continue;
    }
  }

  const requestedName = normalizeFileName(outputName ?? "", `${getBaseName(fileName)}-compressed.pdf`);
  const nextFileName = await findAvailablePdfName(folderPath, requestedName);
  const outputPath = path.join(folderPath, nextFileName);
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  await fs.writeFile(outputPath, compressedBytes);

  return {
    outputFile: nextFileName,
    outputPath,
    originalSize: sourceBytes.byteLength,
    compressedSize: compressedBytes.byteLength,
  };
}

export async function rotatePdfPages(
  folderPath: string,
  fileName: string,
  pageRotations: { page: number; degrees: 0 | 90 | 180 | 270 }[],
) {
  assertSafeFileNames([fileName]);
  const filePath = path.join(folderPath, fileName);
  const sourceBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const pageCount = pdfDoc.getPageCount();

  for (const { page, degrees } of pageRotations) {
    if (page < 1 || page > pageCount) {
      throw new Error(`Page ${page} is out of range (1-${pageCount}).`);
    }
    const pdfPage = pdfDoc.getPage(page - 1);
    const currentRotation = pdfPage.getRotation().angle;
    pdfPage.setRotation(pdfDegrees((currentRotation + degrees) % 360));
  }

  const rotatedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  await fs.writeFile(filePath, rotatedBytes);

  return { fileName, pageCount, rotationsApplied: pageRotations.length };
}

export async function getPageCounts(folderPath: string, fileNames: string[]) {
  assertSafeFileNames(fileNames);
  const pageCounts: Record<string, number> = {};

  for (const fileName of fileNames) {
    try {
      const sourceBytes = await fs.readFile(path.join(folderPath, fileName));
      const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
      pageCounts[fileName] = pdfDoc.getPageCount();
    } catch {
      // skip files that cannot be read or parsed
    }
  }

  return pageCounts;
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
      : parsePageRanges(ranges, pageCount);

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
