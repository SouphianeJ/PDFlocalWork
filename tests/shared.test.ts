import { describe, expect, it } from "vitest";
import {
  getBaseName,
  isSupportedMergeExtension,
  isSupportedPdfExtension,
  normalizeFileName,
  parsePageRanges,
  parsePageRangeToken,
} from "@/lib/shared";

describe("normalizeFileName", () => {
  it("appends .pdf when missing", () => {
    expect(normalizeFileName("report", "fallback.pdf")).toBe("report.pdf");
  });

  it("keeps an existing .pdf extension", () => {
    expect(normalizeFileName("report.PDF", "fallback.pdf")).toBe("report.PDF");
  });

  it("uses the fallback for empty input", () => {
    expect(normalizeFileName("   ", "fallback.pdf")).toBe("fallback.pdf");
  });

  it("replaces characters that are invalid in file names", () => {
    expect(normalizeFileName('a<b>:c"/d\\e|f?g*h', "fallback.pdf")).toBe("a-b--c--d-e-f-g-h.pdf");
  });

  it("collapses whitespace", () => {
    expect(normalizeFileName("my   report", "fallback.pdf")).toBe("my report.pdf");
  });
});

describe("getBaseName", () => {
  it("strips the extension", () => {
    expect(getBaseName("document.pdf")).toBe("document");
  });

  it("keeps names without extension intact", () => {
    expect(getBaseName("document")).toBe("document");
  });

  it("only strips the last extension", () => {
    expect(getBaseName("archive.tar.gz")).toBe("archive.tar");
  });

  it("keeps dotfiles intact", () => {
    expect(getBaseName(".gitignore")).toBe(".gitignore");
  });
});

describe("extension checks", () => {
  it("accepts supported extensions case-insensitively", () => {
    expect(isSupportedPdfExtension(".PDF")).toBe(true);
    expect(isSupportedMergeExtension(".JPG")).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isSupportedPdfExtension(".docx")).toBe(false);
    expect(isSupportedMergeExtension(".gif")).toBe(false);
  });
});

describe("parsePageRangeToken", () => {
  it("parses a single page", () => {
    expect(parsePageRangeToken("3")).toEqual({ start: 3, end: 3 });
  });

  it("parses a page range", () => {
    expect(parsePageRangeToken("5-8")).toEqual({ start: 5, end: 8 });
  });

  it("rejects malformed tokens", () => {
    expect(() => parsePageRangeToken("abc")).toThrow(/Invalid range token/);
    expect(() => parsePageRangeToken("3-")).toThrow(/Invalid range token/);
    expect(() => parsePageRangeToken("-3")).toThrow(/Invalid range token/);
  });

  it("rejects zero and inverted ranges", () => {
    expect(() => parsePageRangeToken("0")).toThrow(/Invalid range token/);
    expect(() => parsePageRangeToken("8-5")).toThrow(/Invalid range token/);
  });
});

describe("parsePageRanges", () => {
  it("sorts ranges by start page", () => {
    expect(parsePageRanges(["5-8", "1-3"], 10)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 8 },
    ]);
  });

  it("requires at least one range", () => {
    expect(() => parsePageRanges([], 10)).toThrow(/at least one page range/);
  });

  it("rejects ranges beyond the page count", () => {
    expect(() => parsePageRanges(["1-11"], 10)).toThrow(/exceeds the document page count/);
  });

  it("rejects overlapping ranges", () => {
    expect(() => parsePageRanges(["1-5", "5-8"], 10)).toThrow(/cannot overlap/);
  });

  it("accepts adjacent non-overlapping ranges", () => {
    expect(parsePageRanges(["1-4", "5-8"], 10)).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 8 },
    ]);
  });
});
