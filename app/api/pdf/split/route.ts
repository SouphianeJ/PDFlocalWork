import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { splitPdfFile } from "@/lib/server/pdf-utils";

const splitSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileName: z.string().min(1, "A PDF file name is required."),
  mode: z.enum(["ranges", "per-page"]),
  ranges: z.array(z.string().min(1)).optional(),
  outputPrefix: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = splitSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await splitPdfFile({
      folderPath,
      fileName: parsed.fileName,
      mode: parsed.mode,
      ranges: parsed.ranges,
      outputPrefix: parsed.outputPrefix,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to split the selected PDF.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
