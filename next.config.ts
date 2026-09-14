import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strands has optional integrations (S3, Bedrock, OTEL) loaded via dynamic import; load it from node_modules instead of bundling.
  serverExternalPackages: ["@strands-agents/sdk"],
};

export default nextConfig;
