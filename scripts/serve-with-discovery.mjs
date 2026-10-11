import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";

/** @param {Record<string, string | undefined>} env */
export function discoveryConfig(env = process.env) {
  const port = parsePort(env.GRATA_PORT ?? "8787");
  const advertisedPort = parsePort(env.GRATA_DISCOVERY_PORT ?? String(port));
  const scheme = env.GRATA_DISCOVERY_SCHEME ?? "http";
  if (!["http", "https"].includes(scheme)) {
    throw new Error("GRATA_DISCOVERY_SCHEME must be http or https.");
  }
  const label = env.GRATA_DISCOVERY_LABEL ?? "Grata Domum home server";
  if (
    !label.trim() ||
    Buffer.byteLength(label) > 63 ||
    [...label].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      "GRATA_DISCOVERY_LABEL must be 1–63 bytes without control characters.",
    );
  }
  return {
    port,
    advertisedPort,
    scheme,
    label,
    enabled: env.GRATA_DISCOVERY !== "0",
  };
}

function parsePort(raw) {
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(
      "Server and discovery ports must be integers from 1 to 65535.",
    );
  }
  return Number(raw);
}

export function advertisementCommand(platform, config) {
  const txt = ["api=1", `scheme=${config.scheme}`, "path=/"];
  if (platform === "darwin") {
    return {
      command: "/usr/bin/dns-sd",
      args: [
        "-R",
        config.label,
        "_grata-domum._tcp",
        "local.",
        String(config.advertisedPort),
        ...txt,
      ],
    };
  }
  if (platform === "linux") {
    return {
      command: "avahi-publish-service",
      args: [
        config.label,
        "_grata-domum._tcp",
        String(config.advertisedPort),
        ...txt,
      ],
    };
  }
  return null;
}

export function serve({
  env = process.env,
  platform = process.platform,
  dev = false,
} = {}) {
  const config = discoveryConfig(env);
  const next = resolve("node_modules/next/dist/bin/next");
  if (!existsSync(next))
    throw new Error("Install project dependencies with npm ci first.");
  const childEnv = {
    ...env,
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --experimental-sqlite`.trim(),
  };
  const server = spawn(
    process.execPath,
    [
      next,
      dev ? "dev" : "start",
      "-p",
      String(config.port),
      "--hostname",
      "0.0.0.0",
    ],
    {
      env: childEnv,
      stdio: "inherit",
    },
  );
  let advertiser;
  const command = config.enabled
    ? advertisementCommand(platform, config)
    : null;
  if (command) {
    advertiser = spawn(command.command, command.args, { stdio: "ignore" });
    advertiser.on("error", () => {
      console.warn(
        "Bonjour advertisement unavailable. Manual server addresses still work. See docs/operations/discovery.md.",
      );
    });
    advertiser.on("exit", (code, signal) => {
      if (code !== 0 && !signal)
        console.warn(
          "Bonjour advertisement stopped. Check OS discovery tooling; the server remains available.",
        );
    });
  } else if (config.enabled) {
    console.warn(
      "Bonjour advertisement is not supported on this OS. Use manual server addresses.",
    );
  }
  const stop = (signal) => {
    advertiser?.kill(signal);
    server.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  server.on("error", () => {
    advertiser?.kill();
    console.error("Could not start the home server.");
    process.exitCode = 1;
  });
  server.on("exit", (code, signal) => {
    advertiser?.kill();
    process.exitCode =
      code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
  });
  return { server, advertiser };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--dev"))
      throw new Error("Usage: node scripts/serve-with-discovery.mjs [--dev]");
    serve({ dev: process.argv.includes("--dev") });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Could not start the server.",
    );
    process.exitCode = 1;
  }
}
