import { resolve } from "node:path";
import type { NextConfig } from "next";

// Same pattern as apps/web: the browser talks to this origin only; /api/* is proxied to apps/api.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone server includes packages/core and packages/ui.
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
