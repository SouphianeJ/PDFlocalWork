import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";
import { analyzeFolder } from "@/lib/server/inscription/analyze";

const schema = z.object({ folderPath: z.string().min(1, "Folder path is required.") });

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const { folderPath } = schema.parse(await request.json());
    const resolved = await ensureDirectoryExists(folderPath);
    const students = await analyzeFolder(resolved);
    return NextResponse.json({ folderPath: resolved, students });
  } catch (error) {
    return errorResponse(error, "Unable to analyze the inscription folder.");
  }
}
