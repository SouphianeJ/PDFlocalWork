import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { getPageCounts } from "@/lib/server/pdf-utils";
import { requireLocalRequest } from "@/lib/server/security";

const schema = z.object({
  folderPath: z.string().min(1),
  fileNames: z.array(z.string().min(1)).min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = schema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const pageCounts = await getPageCounts(folderPath, parsed.fileNames);
    return NextResponse.json({ pageCounts });
  } catch (error) {
    return errorResponse(error, "Unable to read page counts.");
  }
}
