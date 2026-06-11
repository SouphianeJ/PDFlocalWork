import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { rotatePdfPages } from "@/lib/server/pdf-utils";
import { requireLocalRequest } from "@/lib/server/security";

const rotateSchema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  fileName: z.string().min(1, "A PDF file name is required."),
  pageRotations: z.array(
    z.object({
      page: z.number().int().min(1),
      degrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    }),
  ).min(1, "At least one page rotation is required."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = rotateSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await rotatePdfPages(folderPath, parsed.fileName, parsed.pageRotations);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to rotate pages.");
  }
}
