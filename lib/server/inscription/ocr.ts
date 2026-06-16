/**
 * OCR optionnel des relevés fournis en SCAN-IMAGE (sans couche texte).
 * 100 % JS/local : unpdf.extractImages (pas de rasterisation/canvas) →
 * sharp (niveaux de gris) → tesseract.js avec traineddata LOCAUX (hors réseau),
 * avec redressement d'orientation (essai 90/180/270° si la confiance est faible).
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

/**
 * OCR de toutes les images embarquées d'un PDF scanné, à une rotation donnée
 * (0 par défaut). Renvoie le texte concaténé.
 */
export async function ocrPdf(filePath: string, angle = 0): Promise<string> {
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
        let pipe = sharp(Buffer.from(im.data), {
          raw: { width: im.width, height: im.height, channels: im.channels as 1 | 2 | 3 | 4 },
        }).grayscale().normalize();
        if (angle) pipe = pipe.rotate(angle);
        const { data } = await worker.recognize(await pipe.png().toBuffer());
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

// Score d'un résultat d'extraction : le code établissement (présent seulement
// sur un relevé bien orienté) pèse lourd, les autres champs comptent pour 1.
function scoreInfo(info: BacInfo | BtsInfo | null): number {
  if (!info) return -1;
  const code = "codeEtablissement" in info ? info.codeEtablissement : "";
  let s = code ? 4 : 0;
  for (const v of Object.values(info)) if (typeof v === "string" && v && v !== code) s += 1;
  return s;
}

// "Assez bon" pour s'arrêter : un code établissement a été lu (donc orientation OK).
function isGood(info: BacInfo | BtsInfo | null): boolean {
  return Boolean(info && "codeEtablissement" in info && info.codeEtablissement);
}

function extract(kind: "bac" | "bts", text: string) {
  return kind === "bts" ? extraireBts(text) : extraireBac(text);
}

/**
 * OCR d'un relevé puis ré-extraction des champs. Redressement « sans
 * régression » : on lit à 0° d'abord ; on ne tente 90/180/270° que si 0° n'a
 * pas livré de code établissement, et on ne garde une rotation que si elle
 * récupère STRICTEMENT plus (score supérieur).
 */
export async function ocrRecover(filePath: string, kind: "bac" | "bts"): Promise<OcrRecovery> {
  let bestText = await ocrPdf(filePath, 0);
  let best = extract(kind, bestText);
  let bestScore = scoreInfo(best.info);

  if (!isGood(best.info)) {
    for (const angle of [90, 180, 270]) {
      const text = await ocrPdf(filePath, angle);
      const res = extract(kind, text);
      const score = scoreInfo(res.info);
      if (score > bestScore) {
        best = res;
        bestText = text;
        bestScore = score;
      }
      if (isGood(best.info)) break;
    }
  }

  const info = best.info && { ...best.info, source: "ocr" as const };
  return { kind, info, anomalies: best.anomalies, chars: bestText.trim().length } as OcrRecovery;
}
