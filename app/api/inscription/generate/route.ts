import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";
import { generateDossiers } from "@/lib/server/inscription/generate";
import type { StudentRecord } from "@/lib/inscription/types";

const schema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  students: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1, "No student to generate."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const { folderPath, students } = schema.parse(await request.json());
    const resolved = await ensureDirectoryExists(folderPath);
    const results = await generateDossiers(resolved, students as unknown as StudentRecord[]);
    return NextResponse.json({ folderPath: resolved, results });
  } catch (error) {
    return errorResponse(error, "Unable to generate the inscription dossiers.");
  }
}
