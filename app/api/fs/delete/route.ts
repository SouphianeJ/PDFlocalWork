import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteFilesFromDirectory, ensureDirectoryExists } from "@/lib/server/fs-utils";

const deleteSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileNames: z.array(z.string().min(1)).min(1, "Select at least one file."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = deleteSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await deleteFilesFromDirectory(folderPath, parsed.fileNames);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete the selected files.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
