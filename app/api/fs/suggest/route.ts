import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { getDirectorySuggestions } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";

const querySchema = z.object({
  path: z.string().min(1, "Path is required."),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = querySchema.parse({
      path: request.nextUrl.searchParams.get("path"),
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    const suggestions = await getDirectorySuggestions(parsed.path, parsed.limit ?? 5);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return errorResponse(error, "Unable to suggest folders.");
  }
}
