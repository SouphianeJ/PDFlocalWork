import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { compressPdfFile } from "@/lib/server/pdf-utils";

const compressSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileName: z.string().min(1, "A PDF file name is required."),
  outputName: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = compressSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await compressPdfFile({
      folderPath,
      fileName: parsed.fileName,
      outputName: parsed.outputName,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compress the selected PDF.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
