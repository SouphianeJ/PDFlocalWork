import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";
import { findByPrefix, studentDir } from "@/lib/server/inscription/extract";
import { ocrRecover } from "@/lib/server/inscription/ocr";

const schema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  id: z.string().min(1),
  kind: z.enum(["bac", "bts"]),
});

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const { folderPath, id, kind } = schema.parse(await request.json());
    const resolved = await ensureDirectoryExists(folderPath);
    if (path.basename(id) !== id) throw new Error("Nested paths are not allowed.");

    const docs = path.join(await studentDir(resolved, id), "Documents");
    const prefix = kind === "bts" ? "releve-de-notes-de-bac2" : "releve-de-notes-de-bac.";
    const file = await findByPrefix(docs, prefix);
    if (!file) throw new Error(`Aucun relevé ${kind} trouvé pour ${id}.`);

    const recovery = await ocrRecover(file, kind);
    return NextResponse.json(recovery);
  } catch (error) {
    return errorResponse(error, "OCR indisponible pour ce document.");
  }
}
