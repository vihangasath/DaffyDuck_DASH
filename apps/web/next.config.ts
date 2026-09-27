import { resolve } from "node:path";
import type { NextConfig } from "next";

// The API (apps/api) owns the database. The browser only ever talks to this app's origin:
// /api/* is proxied to the API, so there is no CORS and each app keeps its own sign-in.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Small self-contained server for the Docker image.
  output: "standalone",
  // Trace from the monorepo root so the standalone server includes packages/core and packages/ui.
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
