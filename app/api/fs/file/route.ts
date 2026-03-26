import path from "node:path";
import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { isSupportedMergeExtension } from "@/lib/shared";

const querySchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileName: z.string().min(1, "File name is required."),
});

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      folderPath: request.nextUrl.searchParams.get("folderPath"),
      fileName: request.nextUrl.searchParams.get("fileName"),
    });

    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    if (path.basename(parsed.fileName) !== parsed.fileName) {
      throw new Error("Nested paths are not allowed.");
    }

    const extension = path.extname(parsed.fileName).toLowerCase();
    if (!isSupportedMergeExtension(extension)) {
      throw new Error("Unsupported preview file type.");
    }

    const filePath = path.join(folderPath, parsed.fileName);
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the preview file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
