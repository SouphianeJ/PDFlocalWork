/**
 * OCR optionnel des relevés fournis en SCAN-IMAGE (sans couche texte).
 * 100 % JS/local : unpdf.extractImages (pas de rasterisation/canvas) →
 * sharp (niveaux de gris) → tesseract.js avec traineddata LOCAUX (hors réseau).
 * Port best-effort de 02_ocr_scans.py.
 */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";
import { createWorker } from "tesseract.js";
import { extraireBac, extraireBts } from "@/lib/server/inscription/extract";
import type { BacInfo, BtsInfo } from "@/lib/inscription/types";

// Dossier des traineddata Tesseract (fra/eng), surchargé par INSCRIPTION_TESSDATA.
function tessdataDir(): string {
  return (
    process.env.INSCRIPTION_TESSDATA?.trim() ||
    path.join(os.homedir(), "scoop", "persist", "tesseract", "tessdata")
  );
}

async function assertLang(): Promise<string> {
  const dir = tessdataDir();
  try {
    await fs.access(path.join(dir, "fra.traineddata"));
  } catch {
    throw new Error(
      `OCR indisponible : fra.traineddata introuvable dans « ${dir} ». ` +
        "Installez Tesseract (langues fra/eng) ou pointez INSCRIPTION_TESSDATA vers le dossier tessdata.",
    );
  }
  return dir;
}

/** OCR de toutes les images embarquées d'un PDF scanné -> texte concaténé. */
export async function ocrPdf(filePath: string): Promise<string> {
  const langPath = await assertLang();
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const pdf = await getDocumentProxy(bytes);
  const total: number = pdf.numPages;

  const worker = await createWorker("fra+eng", 1, { langPath, gzip: false, cacheMethod: "none" });
  try {
    const chunks: string[] = [];
    for (let page = 1; page <= total; page += 1) {
      const images = await extractImages(pdf, page).catch(() => []);
      for (const im of images) {
        const png = await sharp(Buffer.from(im.data), {
          raw: { width: im.width, height: im.height, channels: im.channels as 1 | 2 | 3 | 4 },
        })
          .grayscale()
          .normalize()
          .png()
          .toBuffer();
        const { data } = await worker.recognize(png);
        if (data.text) chunks.push(data.text);
      }
    }
    return chunks.join("\n");
  } finally {
    await worker.terminate();
  }
}

export type OcrRecovery =
  | { kind: "bac"; info: BacInfo | null; anomalies: string[]; chars: number }
  | { kind: "bts"; info: BtsInfo | null; anomalies: string[]; chars: number };

/** OCR d'un relevé puis ré-extraction des champs (mêmes extracteurs que la couche texte). */
export async function ocrRecover(filePath: string, kind: "bac" | "bts"): Promise<OcrRecovery> {
  const text = await ocrPdf(filePath);
  if (kind === "bts") {
    const { info, anomalies } = extraireBts(text);
    return { kind, info: info && { ...info, source: "ocr" }, anomalies, chars: text.trim().length };
  }
  const { info, anomalies } = extraireBac(text);
  return { kind, info: info && { ...info, source: "ocr" }, anomalies, chars: text.trim().length };
}
