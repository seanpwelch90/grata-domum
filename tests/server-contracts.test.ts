import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleApi } from "@/lib/api";
import { getStore, resetStoreForTests } from "@/lib/store";
import { subscribe } from "@/lib/live";
import { performAction } from "@/lib/ha";

let directory = "";
let admin = "";
const core = {
  title: "Winter visit",
  message: "Welcome!",
  startsOn: "2030-12-20",
  endsOn: "2030-12-28",
  themeId: "christmas",
};
function call(method: string, route: string, body?: unknown, cookie = admin) {
  return handleApi(
    new Request(`http://localhost/api/v1/${route}`, {
      method,
      headers: { "Grata-API-Version": "1", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    route.split("/"),
  );
}
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "grata-contracts-"));
  process.env.GRATA_DATA = directory;
  resetStoreForTests();
  const setup = await call(
    "POST",
    "admin/setup",
    {
      name: "Test home",
      password: "fictional-password",
      timeZone: "America/New_York",
    },
    "",
  );
  admin = (setup.headers.get("set-cookie") ?? "").split(";")[0];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetStoreForTests();
  fs.rmSync(directory, { recursive: true, force: true });
});

it("saves details and guests atomically with one notification and preserves legacy assignments", async () => {
  const store = getStore();
  const person = store.createPerson("Morgan", new Date());
  const notifications: string[] = [];
  const unsubscribe = subscribe((event) => notifications.push(event));
  try {
    const created = await call("POST", "admin/visits", {
      ...core,
      guestIds: [person.id],
    });
    expect(created.status).toBe(200);
    const { id } = await created.json();
    expect(notifications).toHaveLength(1);
    expect(store.visits()[0].guestIds).toEqual([person.id]);
    expect(
      await (
        await call("PATCH", `admin/visits/${id}`, { ...core, title: "Updated" })
      ).json(),
    ).toEqual({ ok: true });
    expect(store.visits()[0].guestIds).toEqual([person.id]);
    for (const guestIds of [
      [person.id, person.id],
      ["unknown"],
      [false],
      null,
    ]) {
      expect(
        (
          await call("PATCH", `admin/visits/${id}`, {
            ...core,
            title: "Must not save",
            guestIds,
          })
        ).status,
      ).toBe(400);
    }
    expect(store.visits()[0].title).toBe("Updated");
    expect(store.visits()[0].guestIds).toEqual([person.id]);
    expect(notifications).toHaveLength(2);
    expect(
      (await call("POST", "admin/visits", { ...core, guestIds: ["unknown"] }))
        .status,
    ).toBe(400);
    expect(store.visits()).toHaveLength(1);
    expect(
      (await call("PUT", `admin/visits/${id}/guests`, { personIds: [] }))
        .status,
    ).toBe(200);
    expect(store.visits()[0].guestIds).toEqual([]);
  } finally {
    unsubscribe();
  }
});

it("rolls back both core and assignments if the database rejects a guest insert", async () => {
  const store = getStore();
  const person = store.createPerson("Morgan", new Date());
  const id = store.createVisit({ ...core, guestIds: [person.id] }, new Date());
  // Force a database-level constraint failure after core UPDATE and DELETE have run.
  vi.spyOn(store, "validateGuestIds").mockImplementation(() => undefined);
  expect(() =>
    store.updateVisit(id, {
      ...core,
      title: "Unsaved",
      guestIds: [person.id, person.id],
    }),
  ).toThrow();
  expect(store.visits()[0]).toMatchObject({
    title: core.title,
    guestIds: [person.id],
  });
});

it("previews saved and unsaved visits without writes, broadcasts, credentials, or external requests", async () => {
  const store = getStore();
  const person = store.createPerson("Morgan", new Date());
  const room = store.createRoom("Guest room");
  store.createAction({
    roomId: room.id,
    label: "Lamp",
    kind: "toggle",
    entityId: "light.fictional",
    brightnessMin: 1,
    brightnessMax: 100,
  });
  const id = store.createVisit({ ...core, guestIds: [person.id] }, new Date());
  store.createEvent({
    id: "",
    visitId: id,
    title: "Dinner",
    allDay: true,
    eventDate: "2030-12-21",
    startsAt: null,
    endsAt: null,
    location: "Kitchen",
    notes: "",
    link: "",
  });
  store.archiveVisit(id);
  store.updateSettings({
    ...store.household(),
    latitude: 35,
    longitude: -78,
    haBaseURL: "http://example.invalid",
    haToken: "fictional-test-token",
  });
  store.setWeatherCache(
    JSON.stringify({
      unit: "fahrenheit",
      current: { temperature: 55, code: 0, label: "Clear" },
      daily: [],
    }),
    new Date("2030-10-01T00:00:00Z"),
  );
  const before = {
    home: store.household(),
    visits: store.visits(),
    devices: store.devices(),
    cache: store.weatherCache(),
    notes: store.notesSince(new Date(0)),
  };
  const fetchMock = vi.fn(() => {
    throw new Error("Preview must not fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
  const notifications: string[] = [];
  const unsubscribe = subscribe((event) => notifications.push(event));
  try {
    const response = await call("POST", "admin/preview", {
      visitId: id,
      surface: "ipad",
      roomId: room.id,
      at: "2030-11-01T12:00:00Z",
      visit: { ...core, title: "Unsaved title", guestIds: [person.id] },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.preview).toBe(true);
    expect(result.snapshot.visit).toMatchObject({ id, title: "Unsaved title" });
    expect(result.snapshot.visit.guests[0].displayName).toBe("Morgan");
    expect(result.snapshot.events).toHaveLength(1);
    expect(result.snapshot.weather.stale).toBe(true);
    expect(result.snapshot.actions[0].availability).toBe("unavailable");
    expect(result.snapshot.device).toMatchObject({
      id: "preview",
      canPostNotes: false,
    });
    expect(result.warnings).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("light.fictional");
    const fresh = await (
      await call("POST", "admin/preview", {
        surface: "tv",
        visit: { ...core, guestIds: [] },
      })
    ).json();
    expect(fresh.snapshot.visit.coverURL).toBe("");
    expect(fresh.snapshot.events).toEqual([]);
    expect(fresh.snapshot.actions).toEqual([]);
    expect({
      home: store.household(),
      visits: store.visits(),
      devices: store.devices(),
      cache: store.weatherCache(),
      notes: store.notesSince(new Date(0)),
    }).toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notifications).toEqual([]);
  } finally {
    unsubscribe();
  }
});

it("authenticates and validates preview inputs and resolves schedule in household timezone", async () => {
  expect(
    (await call("POST", "admin/preview", { surface: "tv" }, "")).status,
  ).toBe(401);
  for (const input of [
    { surface: "invalid" },
    { surface: "tv", roomId: "unknown" },
    { surface: "tv", visitId: "unknown" },
    { surface: "tv", at: "2030-02-30T12:00:00Z" },
    { surface: "tv", visit: { ...core, guestIds: ["unknown"] } },
  ]) {
    expect(
      (await call("POST", "admin/preview", input)).status,
    ).toBeGreaterThanOrEqual(400);
  }
  getStore().createVisit(core, new Date());
  const before = await (
    await call("POST", "admin/preview", {
      surface: "tv",
      at: "2030-12-20T02:00:00Z",
    })
  ).json();
  const during = await (
    await call("POST", "admin/preview", {
      surface: "tv",
      at: "2030-12-20T06:00:00Z",
    })
  ).json();
  expect(before.snapshot.visit).toBeNull();
  expect(during.snapshot.visit.title).toBe(core.title);
});

it("denies TV actions and notes even with room assignment and denies other-room iPad actions", async () => {
  const store = getStore();
  const room = store.createRoom("Guest room");
  const actionId = store.createAction({
    roomId: room.id,
    label: "Lamp",
    kind: "toggle",
    entityId: "light.fictional",
    brightnessMin: 1,
    brightnessMax: 100,
  });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  for (const surface of ["tv", "ipad"] as const) {
    const pair = store.redeemPairing(
      store.createPairingCode(new Date()).code,
      "Test display",
      surface,
      new Date(),
    );
    store.updateDevice(pair.deviceId, {
      name: "Test display",
      surface,
      roomId: surface === "tv" ? room.id : "",
      canPostNotes: true,
    });
    const cookie = `gd_device=${pair.token}`;
    expect(
      (await call("POST", `actions/${actionId}`, { command: "toggle" }, cookie))
        .status,
    ).toBe(surface === "tv" ? 403 : 404);
    if (surface === "tv")
      expect(
        (
          await call(
            "POST",
            "notes",
            { clientRequestId: "note", authorName: "Morgan", body: "Hello" },
            cookie,
          )
        ).status,
      ).toBe(403);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects invalid dates, timezone-free instants, pin references and missing map coordinates", async () => {
  expect(
    (await call("POST", "admin/visits", { ...core, startsOn: "2030-02-30" }))
      .status,
  ).toBe(400);
  const { id } = await (await call("POST", "admin/visits", core)).json();
  expect(
    (
      await call("POST", `admin/visits/${id}/events`, {
        title: "Dinner",
        startsAt: "2030-12-21T18:00",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("POST", `admin/visits/${id}/events`, {
        title: "Dinner",
        startsAt: "2030-12-21T18:00:00-05:00",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("POST", "admin/guide", {
        title: "Blankets",
        location: "Closet",
        pinId: "unknown",
      })
    ).status,
  ).toBe(404);
  expect(
    (await call("POST", "admin/pins", { title: "Closet", x: null, y: null }))
      .status,
  ).toBe(400);
});

it("does not claim a timed-out physical command failed to run", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: "off" })))
    .mockRejectedValueOnce(new Error("timeout"));
  await expect(
    performAction({
      baseURL: "http://example.invalid",
      token: "fictional",
      entityId: "light.test",
      kind: "toggle",
      command: "toggle",
      brightnessMin: 1,
      brightnessMax: 100,
      fetchImpl,
    }),
  ).rejects.toThrow("Could not confirm the change");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
