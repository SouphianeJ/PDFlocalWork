import { NextResponse } from "next/server";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Extract the hostname (without port) from a Host header value.
 * Handles "localhost:3002", "127.0.0.1:3002" and "[::1]:3002".
 */
export function getHostName(hostHeader: string) {
  const trimmed = hostHeader.trim();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }

  const colonIndex = trimmed.lastIndexOf(":");
  return colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex);
}

/**
 * The Host header must point at the local machine. A non-local Host means the
 * request reached us through a hostname an attacker controls (DNS rebinding).
 */
export function isLocalHost(hostHeader: string | null) {
  if (!hostHeader) {
    return false;
  }

  return LOCAL_HOSTNAMES.has(getHostName(hostHeader.toLowerCase()));
}

/**
 * When a browser sends an Origin header it must match the Host the app is
 * served from. An absent header is fine (same-origin GET navigations and
 * non-browser clients omit it), but "null" or a foreign origin means the
 * request was triggered by another website and must be rejected.
 */
export function isAllowedOrigin(originHeader: string | null, hostHeader: string | null) {
  if (originHeader === null) {
    return true;
  }

  if (!hostHeader) {
    return false;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader);
  } catch {
    return false;
  }

  return parsedOrigin.host.toLowerCase() === hostHeader.trim().toLowerCase();
}

/**
 * Sec-Fetch-Site is set by modern browsers and cannot be spoofed from a web
 * page. "cross-site"/"same-site" means another website initiated the request.
 */
export function isAllowedFetchSite(secFetchSiteHeader: string | null) {
  if (secFetchSiteHeader === null) {
    return true;
  }

  return secFetchSiteHeader === "same-origin" || secFetchSiteHeader === "none";
}

/**
 * Guard for every API route: this server can read, write and delete local
 * files, so requests must come from the app itself on localhost, never from
 * another website open in the user's browser.
 */
export function requireLocalRequest(request: Request): NextResponse | null {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (!isLocalHost(host) || !isAllowedOrigin(origin, host) || !isAllowedFetchSite(secFetchSite)) {
    return NextResponse.json(
      { error: "Forbidden: this API only accepts requests from the local app." },
      { status: 403 },
    );
  }

  return null;
}
