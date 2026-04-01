import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { getPageCount } from "@/lib/server/pdf-utils";

const schema = z.object({
  folderPath: z.string().min(1),
  fileName: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());
    const folderPath = await ensureDirectoryExists(parsed.folderPath);
    const pageCount = await getPageCount(folderPath, parsed.fileName);
    return NextResponse.json({ pageCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read page count.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
