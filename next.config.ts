import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Allow the web-preview proxy host to load Next dev resources; Next 16
  // blocks these cross-origin otherwise and the page fails to hydrate through
  // the proxy. Dev-only.
  allowedDevOrigins: ["webpreview.hazeruno.dpdns.org"],
};

export default nextConfig;
