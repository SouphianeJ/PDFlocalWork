import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { mergePdfFiles } from "@/lib/server/pdf-utils";

const mergeSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileNames: z.array(z.string().min(1)).min(1, "Select at least one file."),
  outputName: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = mergeSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await mergePdfFiles(folderPath, parsed.fileNames, parsed.outputName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge the selected files.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
