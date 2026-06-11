import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists, renameFileInDirectory } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";

const renameSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  oldName: z.string().min(1, "Current file name is required."),
  newName: z.string().min(1, "New file name is required."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = renameSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await renameFileInDirectory(folderPath, parsed.oldName, parsed.newName);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to rename the file.");
  }
}
