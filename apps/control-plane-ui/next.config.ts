import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.CONTROL_PLANE_API_URL || "http://localhost:1337"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
