import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/api-error";
import { getDirectoryListing } from "@/lib/server/fs-utils";
import { requireLocalRequest } from "@/lib/server/security";

const querySchema = z.object({
  path: z.string().min(1, "Path is required."),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denial = requireLocalRequest(request);
  if (denial) return denial;

  try {
    const parsed = querySchema.parse({
      path: request.nextUrl.searchParams.get("path"),
    });

    const listing = await getDirectoryListing(parsed.path);
    return NextResponse.json(listing);
  } catch (error) {
    return errorResponse(error, "Unable to list this folder.");
  }
}
