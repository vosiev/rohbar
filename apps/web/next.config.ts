import path from "node:path";
import type { NextConfig } from "next";

const apiProxyTarget = process.env.ROHBAR_API_PROXY_TARGET || "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
