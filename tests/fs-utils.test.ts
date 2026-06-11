import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertSafeFileNames,
  ensureDirectoryExists,
  findAvailableFileName,
  findAvailablePdfName,
  isPathWithinRoot,
} from "@/lib/server/fs-utils";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdflocalwork-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env.PDF_WORK_ROOT;
});

describe("assertSafeFileNames", () => {
  it("accepts plain file names", () => {
    expect(() => assertSafeFileNames(["a.pdf", "b c.png"])).not.toThrow();
  });

  it("rejects nested or traversal paths", () => {
    expect(() => assertSafeFileNames(["sub/a.pdf"])).toThrow(/Nested paths/);
    expect(() => assertSafeFileNames(["..\\a.pdf"])).toThrow(/Nested paths/);
  });
});

describe("isPathWithinRoot", () => {
  it("accepts the root itself and descendants", () => {
    const root = path.resolve("/data/pdfs");
    expect(isPathWithinRoot(root, root)).toBe(true);
    expect(isPathWithinRoot(path.join(root, "sub"), root)).toBe(true);
  });

  it("rejects siblings and parents", () => {
    const root = path.resolve("/data/pdfs");
    expect(isPathWithinRoot(path.resolve("/data"), root)).toBe(false);
    expect(isPathWithinRoot(path.resolve("/data/pdfs-other"), root)).toBe(false);
    expect(isPathWithinRoot(path.resolve("/etc"), root)).toBe(false);
  });
});

describe("ensureDirectoryExists with PDF_WORK_ROOT", () => {
  it("allows directories inside the configured root", async () => {
    process.env.PDF_WORK_ROOT = tempDir;
    const subDir = path.join(tempDir, "inside");
    await fs.mkdir(subDir);
    await expect(ensureDirectoryExists(subDir)).resolves.toBe(path.resolve(subDir));
  });

  it("rejects directories outside the configured root", async () => {
    const rootDir = path.join(tempDir, "root");
    const outsideDir = path.join(tempDir, "outside");
    await fs.mkdir(rootDir);
    await fs.mkdir(outsideDir);
    process.env.PDF_WORK_ROOT = rootDir;
    await expect(ensureDirectoryExists(outsideDir)).rejects.toThrow(/PDF_WORK_ROOT/);
  });
});

describe("findAvailableFileName", () => {
  it("returns the requested name when free", async () => {
    expect(await findAvailableFileName(tempDir, "archive.zip", ".zip")).toBe("archive.zip");
  });

  it("appends a counter when the name is taken", async () => {
    await fs.writeFile(path.join(tempDir, "archive.zip"), "x");
    expect(await findAvailableFileName(tempDir, "archive.zip", ".zip")).toBe("archive (1).zip");

    await fs.writeFile(path.join(tempDir, "archive (1).zip"), "x");
    expect(await findAvailableFileName(tempDir, "archive.zip", ".zip")).toBe("archive (2).zip");
  });

  it("applies the default extension when missing", async () => {
    expect(await findAvailableFileName(tempDir, "archive", ".zip")).toBe("archive.zip");
  });
});

describe("findAvailablePdfName", () => {
  it("defaults to the .pdf extension", async () => {
    expect(await findAvailablePdfName(tempDir, "output")).toBe("output.pdf");
  });

  it("avoids collisions", async () => {
    await fs.writeFile(path.join(tempDir, "output.pdf"), "x");
    expect(await findAvailablePdfName(tempDir, "output.pdf")).toBe("output (1).pdf");
  });
});
