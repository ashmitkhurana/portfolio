import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lets a dev server and a production lab build coexist (NEXT_DIST_DIR=.next-dev)
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
