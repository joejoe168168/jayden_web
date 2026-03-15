import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sounds/:path*",
        headers: [
          {
            key: "Content-Type",
            value: "audio/mpeg",
          },
          {
            key: "Content-Disposition",
            value: "inline",
          },
          {
            key: "Accept-Ranges",
            value: "bytes",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
