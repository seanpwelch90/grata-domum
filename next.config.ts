import os from "os";
import type { NextConfig } from "next";

function devOrigins(): string[] {
  const hosts = new Set(["127.0.0.1"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.add(entry.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
