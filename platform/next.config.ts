import type { NextConfig } from "next";
import { BASE_PATH } from "./app/lib/deployment";

const nextConfig: NextConfig = {
  // Produce a self-contained Node.js server for Docker/VPS deployments.
  output: "standalone",
  // Share one host with the existing content-pipeline site without taking over /.
  basePath: BASE_PATH,
  experimental: {
    // Vinext currently classifies multipart route-handler requests as progressive
    // server actions before dispatching them. Keep this above the API's 105 MiB
    // request guard so oversized uploads reach the route and return JSON errors.
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
