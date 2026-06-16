import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Libs serveur à ne pas bundler (workers/WASM, binaires natifs).
  serverExternalPackages: ["tesseract.js", "unpdf", "sharp"],
};

export default nextConfig;
