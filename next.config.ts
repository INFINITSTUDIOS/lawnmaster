import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nearly every page is per-user or per-tenant, so Cache Components (which
  // requires a Suspense boundary around each cookie read) is left off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
