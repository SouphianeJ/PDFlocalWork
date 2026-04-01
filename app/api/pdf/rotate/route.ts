import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { rotatePdfPages } from "@/lib/server/pdf-utils";

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
  try {
    const parsed = rotateSchema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const result = await rotatePdfPages(folderPath, parsed.fileName, parsed.pageRotations);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to rotate pages.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
