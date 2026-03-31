import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists, renameFileInDirectory } from "@/lib/server/fs-utils";

const renameSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  oldName: z.string().min(1, "Current file name is required."),
  newName: z.string().min(1, "New file name is required."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = renameSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await renameFileInDirectory(folderPath, parsed.oldName, parsed.newName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to rename the file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
