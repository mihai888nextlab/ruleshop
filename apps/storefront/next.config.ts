import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The storefront renders decisions it receives from the control plane; it
  // never computes them. Keeping images unoptimized avoids a second service
  // in the demo environment.
  images: { unoptimized: true },
};

export default nextConfig;
