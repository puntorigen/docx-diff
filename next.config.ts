import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Docker deployment
  devIndicators: false, // Hide "Rendering" badge during server actions
};

export default nextConfig;
