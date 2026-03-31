import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { compressPdfFile, mergePdfFiles } from "@/lib/server/pdf-utils";

const mergeSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileNames: z.array(z.string().min(1)).min(1, "Select at least one file."),
  outputName: z.string().optional(),
  compressQuality: z.enum(["screen", "ebook", "printer"]).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = mergeSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const mergeResult = await mergePdfFiles(folderPath, parsed.fileNames, parsed.outputName);

    if (parsed.compressQuality) {
      const compressResult = await compressPdfFile({
        folderPath,
        fileName: mergeResult.outputFile,
        outputName: mergeResult.outputFile,
        quality: parsed.compressQuality,
      });
      // Remove the uncompressed intermediate file if names differ
      if (compressResult.outputFile !== mergeResult.outputFile) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        await fs.unlink(path.join(folderPath, mergeResult.outputFile));
      }
      return NextResponse.json({
        outputFile: compressResult.outputFile,
        originalSize: compressResult.originalSize,
        compressedSize: compressResult.compressedSize,
      });
    }

    return NextResponse.json(mergeResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge the selected files.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
