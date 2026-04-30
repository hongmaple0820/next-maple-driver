import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Optimize package imports to reduce memory usage during compilation.
  // Without this, importing a single icon from lucide-react causes the
  // entire package (1000+ icons) to be compiled, leading to OOM crashes.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-icons",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "recharts",
      "date-fns",
      "react-syntax-highlighter",
      "react-markdown",
      "cmdk",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "sonner",
      "qrcode",
      "@hookform/resolvers",
      "react-hook-form",
      "zod",
      "next-auth",
      "next-intl",
      "next-themes",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "vaul",
      "react-resizable-panels",
      "react-day-picker",
      "embla-carousel-react",
      "input-otp",
      "class-variance-authority",
      "@mdxeditor/editor",
    ],
  },
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "ssh2",
    "basic-ftp",
    "webdav",
    "archiver",
    "sharp",
    "bcryptjs",
    "jsonwebtoken",
  ],
  output: "standalone",
  allowedDevOrigins: [
    ".space.z.ai",
    ".z.ai",
    "preview-chat-0ac4acf7-8835-4d4b-a280-d5212a915c.space.z.ai",
    "preview-chat-0ac4acf7-8835-4d4b-a280-d5212a915f8c.space.z.ai",
    "21.0.22.157",
    "localhost",
    "127.0.0.1",
    "21.0.12.9",
  ],
};

export default nextConfig;
