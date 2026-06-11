import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { deleteFilesFromDirectory, ensureDirectoryExists } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";

const deleteSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileNames: z.array(z.string().min(1)).min(1, "Select at least one file."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = deleteSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await deleteFilesFromDirectory(folderPath, parsed.fileNames);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to delete the selected files.");
  }
}
