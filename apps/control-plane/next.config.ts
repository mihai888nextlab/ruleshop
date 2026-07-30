import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/docs": ["./content/**/*"],
  },
};

export default nextConfig;
