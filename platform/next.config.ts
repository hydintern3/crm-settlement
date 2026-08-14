import type { NextConfig } from "next";
import { BASE_PATH } from "./app/lib/deployment";

const nextConfig: NextConfig = {
  // Produce a self-contained Node.js server for Docker/VPS deployments.
  output: "standalone",
  // Share one host with the existing content-pipeline site without taking over /.
  basePath: BASE_PATH,
};

export default nextConfig;
