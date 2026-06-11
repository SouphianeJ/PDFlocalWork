import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { compressPdfFile } from "@/lib/server/pdf-utils";
import { requireLocalRequest } from "@/lib/server/security";

const compressSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileName: z.string().min(1, "A PDF file name is required."),
  outputName: z.string().optional(),
  quality: z.enum(["screen", "ebook", "printer"]).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = compressSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await compressPdfFile({
      folderPath,
      fileName: parsed.fileName,
      outputName: parsed.outputName,
      quality: parsed.quality,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to compress the selected PDF.");
  }
}
