import type { NextConfig } from "next";

// Served at heshammourad.com/soccer-predictions through heshammourad-portal's proxy.
// Set NEXT_PUBLIC_SUBPATH_PREFIX=/soccer-predictions on the Vercel project; leave it
// unset locally to serve from the root. It is read at build time, so changing it
// needs a redeploy.
const rawPrefix = process.env.NEXT_PUBLIC_SUBPATH_PREFIX || "";
const SUBPATH_PREFIX = rawPrefix
  ? (rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`).replace(/\/$/, "")
  : "";

const nextConfig: NextConfig = {
  // Points _next/static (JS/CSS/font) URLs at this deployment's own origin instead of the
  // portal's domain, so assets are served by Vercel's CDN directly rather than each one
  // costing a portal function invocation (heshammourad-portal#4). An absolute assetPrefix
  // must include basePath itself, since files are still served under it.
  assetPrefix:
    process.env.VERCEL_ENV === "production"
      ? `https://soccer-predictions-sand.vercel.app${SUBPATH_PREFIX}`
      : undefined,
  basePath: SUBPATH_PREFIX || undefined,
  serverExternalPackages: ["node-tls-client", "koffi"],
  async redirects() {
    if (!SUBPATH_PREFIX) return [];
    return [
      {
        source: "/",
        destination: SUBPATH_PREFIX,
        permanent: false,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
