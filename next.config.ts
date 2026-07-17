import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-tls-client", "koffi"]
};

export default nextConfig;
