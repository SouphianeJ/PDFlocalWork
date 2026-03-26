import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDirectoryListing } from "@/lib/server/fs-utils";

const querySchema = z.object({
  path: z.string().min(1, "Path is required."),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      path: request.nextUrl.searchParams.get("path"),
    });

    const listing = await getDirectoryListing(parsed.path);
    return NextResponse.json(listing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list this folder.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
