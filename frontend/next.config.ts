import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
    middlewareClientMaxBodySize: "2gb",
  },
  // Allow Cloudflare tunnels and external hosts in dev mode
  // @ts-ignore
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
