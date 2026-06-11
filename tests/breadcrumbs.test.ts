import { describe, expect, it } from "vitest";
import { buildBreadcrumbs } from "@/lib/browser/breadcrumbs";

describe("buildBreadcrumbs", () => {
  it("builds breadcrumbs for a Windows path", () => {
    expect(buildBreadcrumbs("C:\\Users\\me\\Documents")).toEqual([
      { label: "C:", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "me", path: "C:\\Users\\me" },
      { label: "Documents", path: "C:\\Users\\me\\Documents" },
    ]);
  });

  it("builds breadcrumbs for a Windows drive root", () => {
    expect(buildBreadcrumbs("C:\\")).toEqual([{ label: "C:", path: "C:\\" }]);
  });

  it("builds breadcrumbs for a POSIX path", () => {
    expect(buildBreadcrumbs("/home/me/docs")).toEqual([
      { label: "/", path: "/" },
      { label: "home", path: "/home" },
      { label: "me", path: "/home/me" },
      { label: "docs", path: "/home/me/docs" },
    ]);
  });

  it("builds breadcrumbs for a virtual picker path", () => {
    expect(buildBreadcrumbs("MyFolder/sub/inner")).toEqual([
      { label: "MyFolder", path: "MyFolder" },
      { label: "sub", path: "MyFolder/sub" },
      { label: "inner", path: "MyFolder/sub/inner" },
    ]);
  });

  it("returns an empty list for an empty path", () => {
    expect(buildBreadcrumbs("")).toEqual([]);
  });
});
