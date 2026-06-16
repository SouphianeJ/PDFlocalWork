import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";
import { verifyDossiers } from "@/lib/server/inscription/verify";
import type { StudentRecord } from "@/lib/inscription/types";

const schema = z.object({
  folderPath: z.string().min(1, "Folder path is required."),
  students: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1, "No student to verify."),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const { folderPath, students } = schema.parse(await request.json());
    const resolved = await ensureDirectoryExists(folderPath);
    const report = await verifyDossiers(resolved, students as unknown as StudentRecord[]);
    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error, "Unable to verify the inscription dossiers.");
  }
}
