import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@second-brain/shared", "@second-brain/editor"],
  experimental: {
    // monorepo: trace server files from the workspace root so hoisted deps deploy
    outputFileTracingRoot: path.join(appDir, "../../"),
  },
};

export default nextConfig;
