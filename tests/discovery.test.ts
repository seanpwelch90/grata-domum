import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { handleApi } from "@/lib/api";
import { getStore, resetStoreForTests, Store } from "@/lib/store";

const directories: string[] = [];
function directory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grata-discovery-"));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  resetStoreForTests();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

it("creates an installation identity once, including before setup and across simultaneous store handles", () => {
  const filename = path.join(directory(), "grata.db");
  const first = new Store(filename);
  const id = first.serverId();
  const second = new Store(filename);
  try {
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.isSetup()).toBe(false);
    expect(second.serverId()).toBe(id);
  } finally {
    first.close();
    second.close();
  }
  const reopened = new Store(filename);
  const independent = new Store(path.join(directory(), "grata.db"));
  try {
    expect(reopened.serverId()).toBe(id);
    expect(independent.serverId()).not.toBe(id);
  } finally {
    reopened.close();
    independent.close();
  }
});

it("adds product and identity to public health without revealing household data or mutating pairing state", async () => {
  process.env.GRATA_DATA = directory();
  resetStoreForTests();
  const store = getStore();
  const health = () =>
    handleApi(new Request("http://localhost/api/v1/health"), ["health"]);
  const response = await health();
  expect(response.status).toBe(200);
  const before = await response.json();
  expect(before).toEqual({
    apiVersion: 1,
    status: "ok",
    setupRequired: true,
    product: "grata-domum",
    serverId: store.serverId(),
  });
  store.setup("Fictional home", "fictional-password", "America/New_York");
  const code = store.createPairingCode(new Date());
  const after = await (await health()).json();
  expect(after).toEqual({ ...before, setupRequired: false });
  expect(store.devices()).toHaveLength(0);
  expect(
    store.redeemPairing(code.code, "Test iPad", "ipad", new Date()),
  ).toHaveProperty("deviceId");
});

it("migrates an existing household without losing content or pairing codes, and preserves identity through backup", () => {
  const dir = directory();
  const filename = path.join(dir, "grata.db");
  const legacy = new Store(filename);
  legacy.setup(
    "Fictional existing home",
    "fictional-password",
    "America/New_York",
  );
  const code = legacy.createPairingCode(new Date());
  legacy.db.exec("DROP TABLE server_metadata");
  legacy.close();
  const migrated = new Store(filename);
  const backup = path.join(directory(), "backup.db");
  const id = migrated.serverId();
  try {
    expect(migrated.household().name).toBe("Fictional existing home");
    expect(
      migrated.redeemPairing(code.code, "Test display", "ipad", new Date()),
    ).toHaveProperty("deviceId");
    migrated.db.prepare("VACUUM INTO ?").run(backup);
  } finally {
    migrated.close();
  }
  const restored = new Store(backup);
  try {
    expect(restored.serverId()).toBe(id);
    expect(restored.devices()).toHaveLength(1);
  } finally {
    restored.close();
  }
});
