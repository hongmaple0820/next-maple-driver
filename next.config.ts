import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    ".space.z.ai",
    ".z.ai",
    "preview-chat-0ac4acf7-8835-4d4b-a280-d5212a915c.space.z.ai",
    "preview-chat-0ac4acf7-8835-4d4b-a280-d5212a915f8c.space.z.ai",
    "21.0.22.157",
    "localhost",
  ],
};

export default nextConfig;
