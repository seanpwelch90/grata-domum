import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "@/lib/api";
import { resetStoreForTests } from "@/lib/store";
import type { Snapshot } from "@/lib/types";

let directory = "";

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "grata-api-"));
  process.env.GRATA_DATA = directory;
  resetStoreForTests();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(new Error("External services unavailable in test")),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetStoreForTests();
  fs.rmSync(directory, { recursive: true, force: true });
});

function call(method: string, route: string, body?: unknown, cookie = "") {
  const headers = new Headers({ "Grata-API-Version": "1" });
  if (cookie) headers.set("cookie", cookie);
  return handleApi(
    new Request(`http://127.0.0.1:8787/api/v1/${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    route.split("/"),
  );
}

function sessionCookie(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("home server", () => {
  it("requires setup, then a matching API version", async () => {
    const health = await handleApi(
      new Request("http://127.0.0.1:8787/api/v1/health"),
      ["health"],
    );
    expect(await health.json()).toMatchObject({
      setupRequired: true,
      apiVersion: 1,
    });
    const missing = await handleApi(
      new Request("http://127.0.0.1:8787/api/v1/snapshot"),
      ["snapshot"],
    );
    expect(missing.status).toBe(426);
    const body = await missing.json();
    expect(body.error.serverApiVersion).toBe(1);
  });

  it("pairs a display, shows the visit, and does not leak secrets", async () => {
    const setup = await call("POST", "admin/setup", {
      name: "The House",
      password: "correct horse",
      timeZone: "America/New_York",
    });
    const admin = sessionCookie(setup);
    expect(setup.status).toBe(200);
    expect(
      (
        await call("POST", "admin/setup", {
          name: "Again",
          password: "correct horse",
          timeZone: "America/New_York",
        })
      ).status,
    ).toBe(409);

    await call(
      "PUT",
      "admin/settings",
      {
        name: "The House",
        timeZone: "America/New_York",
        showAddress: true,
        addressLine: "1 Main Street",
        postalCode: "02139",
        latitude: 42.36,
        longitude: -71.1,
        temperatureUnit: "fahrenheit",
        wifiSSID: "House",
        wifiPassword: "super-wifi-pass",
        wifiHidePassword: true,
        wifiSecurity: "WPA",
        showNotesOnTV: true,
        noteExpiryDays: 14,
        haBaseURL: "http://127.0.0.1:9",
        haToken: "super-secret-token",
      },
      admin,
    );

    expect((await call("POST", "admin/sample", {}, admin)).status).toBe(200);
    const pairing = await call(
      "POST",
      "admin/pairing-codes",
      { surface: "ipad" },
      admin,
    );
    const code = (await pairing.json()).code as string;
    const paired = await call("POST", "pair", {
      code,
      name: "Guest iPad",
      surface: "ipad",
    });
    const device = sessionCookie(paired);
    const snapshotResponse = await call("GET", "snapshot", undefined, device);
    const snapshot = (await snapshotResponse.json()) as Snapshot;
    expect(snapshot.theme.id).toBe("christmas");
    expect(snapshot.visit?.guests.map((guest) => guest.initials)).toEqual([
      "AC",
      "RM",
    ]);
    expect(snapshot.guide[0].location).toBe("Hall closet, upper shelf");
    expect(snapshot.wifi?.password).toBeNull();
    expect(snapshot.wifi?.qrPayload).toContain("super-wifi-pass");
    const visible = JSON.stringify({
      ...snapshot,
      wifi: { ...snapshot.wifi, qrDataURL: "" },
    });
    expect(visible.split("super-wifi-pass").length - 1).toBe(1);
    expect(visible).not.toContain("super-secret-token");
    expect(snapshot.actions[0]?.label).toBeUndefined();

    const room = (
      await (await call("GET", "admin/overview", undefined, admin)).json()
    ).rooms.find((item: { name: string }) => item.name === "Guest room");
    const devices = (
      await (await call("GET", "admin/overview", undefined, admin)).json()
    ).devices;
    await call(
      "PATCH",
      `admin/devices/${devices[0].id}`,
      {
        name: "Guest iPad",
        surface: "ipad",
        roomId: room.id,
        canPostNotes: true,
      },
      admin,
    );
    const withRoom = (await (
      await call("GET", "snapshot", undefined, device)
    ).json()) as Snapshot;
    expect(withRoom.actions.map((action) => action.label)).toEqual([
      "Room lights",
    ]);
    expect(withRoom.actions[0].availability).toBe("unavailable");
    expect(JSON.stringify(withRoom.actions)).not.toContain("light.guest_room");

    const locked = await call(
      "POST",
      "admin/actions",
      {
        roomId: room.id,
        label: "Front door",
        kind: "toggle",
        entityId: "lock.front",
      },
      admin,
    );
    expect(locked.status).toBe(400);

    const first = await call(
      "POST",
      "notes",
      {
        clientRequestId: "note-req-1",
        authorName: "Avery",
        body: "Cocoa is out.",
      },
      device,
    );
    const second = await call(
      "POST",
      "notes",
      {
        clientRequestId: "note-req-1",
        authorName: "Avery",
        body: "Cocoa is out.",
      },
      device,
    );
    expect((await first.json()).id).toBe((await second.json()).id);
    const notes = (
      await (await call("GET", "snapshot", undefined, device)).json()
    ).notes;
    expect(notes).toHaveLength(1);

    await call("DELETE", `admin/devices/${devices[0].id}`, undefined, admin);
    expect((await call("GET", "snapshot", undefined, device)).status).toBe(401);
  });
});
