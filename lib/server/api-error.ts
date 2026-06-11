import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

/**
 * Map any caught error to a JSON error response. Zod validation errors are
 * prettified instead of leaking their raw JSON `message` payload.
 */
export function errorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: z.prettifyError(error) }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 400 });
}
