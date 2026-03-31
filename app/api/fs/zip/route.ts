import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { z } from "zod";
import { ensureDirectoryExists } from "@/lib/server/fs-utils";

const bodySchema = z.object({
  path: z.string().min(1, "Path is required."),
});

export const runtime = "nodejs";

/**
 * Sanitise a single path segment (file or directory name) so it is safe
 * for virtually every zip extractor across all OSes.
 *
 * - Replaces characters that are illegal on Windows: \ / : * ? " < > |
 * - Normalises Unicode (NFC) so accented chars like é, ë, ï are kept intact
 *   as single code-points rather than combining sequences.
 * - Collapses multiple spaces / leading-trailing whitespace.
 */
function sanitiseSegment(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "unnamed";
}

/**
 * Recursively walk a directory and emit { diskPath, zipEntryPath } pairs.
 */
async function* walk(
  dirPath: string,
  relativePrefix: string,
): AsyncGenerator<{ diskPath: string; zipPath: string }> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const diskPath = path.join(dirPath, entry.name);
    const safeName = sanitiseSegment(entry.name);
    const zipPath = relativePrefix ? `${relativePrefix}/${safeName}` : safeName;

    if (entry.isDirectory()) {
      yield* walk(diskPath, zipPath);
    } else if (entry.isFile()) {
      yield { diskPath, zipPath };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: inputPath } = bodySchema.parse(body);
    const resolvedDir = await ensureDirectoryExists(inputPath);
    const dirName = sanitiseSegment(path.basename(resolvedDir) || "archive");
    const zipName = `${dirName}.zip`;
    const zipPath = path.join(path.dirname(resolvedDir), zipName);

    // Create the archive
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
      // archiver sets the UTF-8 flag (General Purpose Bit 11) automatically
    });

    const finished = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.on("warning", (err) => {
        // Non-fatal warnings (e.g. stat failures) — skip the file
        if (err.code === "ENOENT") return;
        reject(err);
      });
    });

    archive.pipe(output);

    let fileCount = 0;
    for await (const { diskPath, zipPath: entryPath } of walk(resolvedDir, dirName)) {
      archive.file(diskPath, { name: entryPath });
      fileCount++;
    }

    await archive.finalize();
    await finished;

    const stat = await fs.stat(zipPath);

    return NextResponse.json({
      zipPath,
      zipName,
      size: stat.size,
      fileCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create zip archive.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
