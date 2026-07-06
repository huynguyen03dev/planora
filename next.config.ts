import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Allow the web-preview proxy host to load Next dev resources (/_next/*,
  // HMR socket, dev tools). Without this, Next 16 blocks these cross-origin and
  // the page fails to hydrate when viewed through the proxy. Dev-only setting.
  allowedDevOrigins: ["webpreview.hazeruno.dpdns.org"],
};

export default nextConfig;
