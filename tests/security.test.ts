import { describe, expect, it } from "vitest";
import {
  getHostName,
  isAllowedFetchSite,
  isAllowedOrigin,
  isLocalHost,
  requireLocalRequest,
} from "@/lib/server/security";

describe("getHostName", () => {
  it("strips the port", () => {
    expect(getHostName("localhost:3002")).toBe("localhost");
    expect(getHostName("127.0.0.1:3002")).toBe("127.0.0.1");
  });

  it("handles IPv6 hosts", () => {
    expect(getHostName("[::1]:3002")).toBe("[::1]");
    expect(getHostName("[::1]")).toBe("[::1]");
  });

  it("returns hosts without port unchanged", () => {
    expect(getHostName("localhost")).toBe("localhost");
  });
});

describe("isLocalHost", () => {
  it("accepts localhost and loopback addresses", () => {
    expect(isLocalHost("localhost:3002")).toBe(true);
    expect(isLocalHost("127.0.0.1:3002")).toBe(true);
    expect(isLocalHost("[::1]:3002")).toBe(true);
    expect(isLocalHost("LOCALHOST:3002")).toBe(true);
  });

  it("rejects external hosts (DNS rebinding)", () => {
    expect(isLocalHost("evil.example.com")).toBe(false);
    expect(isLocalHost("evil.example.com:3002")).toBe(false);
    expect(isLocalHost("192.168.1.10:3002")).toBe(false);
  });

  it("rejects a missing host header", () => {
    expect(isLocalHost(null)).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("allows requests without an Origin header", () => {
    expect(isAllowedOrigin(null, "localhost:3002")).toBe(true);
  });

  it("allows a same-origin request", () => {
    expect(isAllowedOrigin("http://localhost:3002", "localhost:3002")).toBe(true);
  });

  it("rejects cross-origin requests from other websites", () => {
    expect(isAllowedOrigin("https://evil.example.com", "localhost:3002")).toBe(false);
  });

  it("rejects the opaque 'null' origin (sandboxed iframes)", () => {
    expect(isAllowedOrigin("null", "localhost:3002")).toBe(false);
  });

  it("rejects another local port", () => {
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3002")).toBe(false);
  });
});

describe("isAllowedFetchSite", () => {
  it("allows same-origin, direct navigation, and absent header", () => {
    expect(isAllowedFetchSite("same-origin")).toBe(true);
    expect(isAllowedFetchSite("none")).toBe(true);
    expect(isAllowedFetchSite(null)).toBe(true);
  });

  it("rejects cross-site and same-site requests", () => {
    expect(isAllowedFetchSite("cross-site")).toBe(false);
    expect(isAllowedFetchSite("same-site")).toBe(false);
  });
});

describe("requireLocalRequest", () => {
  function makeRequest(headers: Record<string, string>) {
    return new Request("http://localhost:3002/api/fs/list", { headers });
  }

  it("allows a same-origin local request", () => {
    const denial = requireLocalRequest(
      makeRequest({ host: "localhost:3002", origin: "http://localhost:3002", "sec-fetch-site": "same-origin" }),
    );
    expect(denial).toBeNull();
  });

  it("allows a local request without browser headers (curl)", () => {
    expect(requireLocalRequest(makeRequest({ host: "127.0.0.1:3002" }))).toBeNull();
  });

  it("blocks a drive-by request from another website", () => {
    const denial = requireLocalRequest(
      makeRequest({ host: "localhost:3002", origin: "https://evil.example.com", "sec-fetch-site": "cross-site" }),
    );
    expect(denial?.status).toBe(403);
  });

  it("blocks DNS rebinding (foreign Host header)", () => {
    const denial = requireLocalRequest(makeRequest({ host: "rebind.attacker.example" }));
    expect(denial?.status).toBe(403);
  });
});
