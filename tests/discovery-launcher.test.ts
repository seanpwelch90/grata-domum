import { expect, it } from "vitest";
import {
  advertisementCommand,
  discoveryConfig,
} from "../scripts/serve-with-discovery.mjs";

it("advertises the external origin and preserves shell metacharacters as literal arguments", () => {
  const config = discoveryConfig({
    GRATA_PORT: "8790",
    GRATA_DISCOVERY_PORT: "443",
    GRATA_DISCOVERY_SCHEME: "https",
    GRATA_DISCOVERY_LABEL: "Test $(literal) server",
  });
  expect(advertisementCommand("darwin", config)).toEqual({
    command: "/usr/bin/dns-sd",
    args: [
      "-R",
      "Test $(literal) server",
      "_grata-domum._tcp",
      "local.",
      "443",
      "api=1",
      "scheme=https",
      "path=/",
    ],
  });
  expect(advertisementCommand("linux", config)?.args).toEqual([
    "Test $(literal) server",
    "_grata-domum._tcp",
    "443",
    "api=1",
    "scheme=https",
    "path=/",
  ]);
  expect(advertisementCommand("win32", config)).toBeNull();
  expect(discoveryConfig({ GRATA_DISCOVERY: "0" }).enabled).toBe(false);
});

it("rejects malformed ports, schemes and labels before launching processes", () => {
  for (const port of ["0", "65536", "8787;echo", "2.5", ""]) {
    expect(() => discoveryConfig({ GRATA_PORT: port })).toThrow();
    expect(() => discoveryConfig({ GRATA_DISCOVERY_PORT: port })).toThrow();
  }
  expect(() => discoveryConfig({ GRATA_DISCOVERY_SCHEME: "ftp" })).toThrow();
  for (const label of ["", "  ", "a\nb", "x".repeat(64)]) {
    expect(() => discoveryConfig({ GRATA_DISCOVERY_LABEL: label })).toThrow();
  }
});
