import fs from "fs";
import { randomUUID } from "crypto";
import path from "path";
import QRCode from "qrcode";
import {
  builtinThemes,
  localDate,
  selectActiveVisit,
  validateAction,
  validateTheme,
} from "@/lib/domain";
import { ActionError, performAction } from "@/lib/ha";
import { publish, subscribe } from "@/lib/live";
import { suggestedBase } from "@/lib/network";
import {
  buildPreviewSnapshot,
  buildSnapshot,
  safeMediaPath,
  versioned,
} from "@/lib/snapshot";
import { StoreError, getStore, type Store } from "@/lib/store";
import { API_VERSION } from "@/lib/types";
import type {
  ActionKind,
  Overview,
  Surface,
  TemperatureUnit,
  ThemeTokens,
  WiFiSecurity,
} from "@/lib/types";
import { lookupZip } from "@/lib/weather";

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const loginFailures: number[] = [];

export async function handleApi(
  request: Request,
  parts: string[],
): Promise<Response> {
  try {
    return await dispatch(request, parts);
  } catch (error) {
    if (error instanceof HttpError)
      return fail(error.status, error.code, error.message);
    if (error instanceof StoreError) {
      const status =
        error.code === "not_found"
          ? 404
          : error.code === "conflict"
            ? 409
            : 400;
      return fail(status, error.code, error.message);
    }
    if (error instanceof ActionError)
      return fail(error.status, "unavailable", error.message);
    console.error(error);
    return fail(500, "internal", "Something went wrong.");
  }
}

async function dispatch(request: Request, parts: string[]): Promise<Response> {
  const store = getStore();
  const method = request.method;
  const route = parts.join("/");
  if (method === "GET" && route === "health") {
    return json({
      apiVersion: API_VERSION,
      status: "ok",
      setupRequired: !store.isSetup(),
      product: "grata-domum",
      serverId: store.serverId(),
    });
  }
  if (route !== "live" && !route.startsWith("media/") && !versionOk(request)) {
    return fail(
      426,
      "incompatible_api",
      "This display and the home server are not compatible. Update the server or the app.",
    );
  }

  if (method === "POST" && route === "admin/setup")
    return setup(store, request);
  if (method === "POST" && route === "admin/login")
    return login(store, request);
  if (method === "POST" && route === "admin/logout")
    return logout(store, request);
  if (method === "GET" && route === "admin/overview") {
    requireAdmin(store, request);
    return json(overview(store, request));
  }
  if (method === "POST" && route === "admin/preview")
    return preview(store, request);
  if (method === "PUT" && route === "admin/settings")
    return updateSettings(store, request);
  if (method === "POST" && route === "admin/pairing-codes")
    return createPairing(store, request);
  if (method === "POST" && route === "admin/sample") {
    requireAdmin(store, request);
    store.seedSample(new Date());
    changed();
    return json({ ok: true });
  }
  if (method === "POST" && route === "admin/geocode")
    return geocode(store, request);
  if (method === "POST" && route === "admin/home-assistant/test")
    return testHomeAssistant(store, request);
  if (method === "POST" && route === "admin/themes")
    return saveTheme(store, request);
  if (method === "POST" && route === "admin/active-visit")
    return setActive(store, request);
  if (method === "POST" && route === "pair") return pair(store, request);
  if (method === "GET" && route === "snapshot") return snapshot(store, request);
  if (method === "POST" && route === "notes") return createNote(store, request);
  if (method === "GET" && route === "live") return live(store, request);

  const id = parts.at(-1) ?? "";
  const head = parts.slice(0, -1).join("/");
  if (method === "PATCH" && head === "admin/devices")
    return updateDevice(store, request, id);
  if (method === "DELETE" && head === "admin/devices")
    return revoke(store, request, id);
  if (method === "POST" && route === "admin/rooms")
    return createRoom(store, request);
  if (method === "PATCH" && head === "admin/rooms")
    return updateRoom(store, request, id);
  if (method === "DELETE" && head === "admin/rooms")
    return remove(store, request, () => store.deleteRoom(id));
  if (method === "POST" && route === "admin/people")
    return createPerson(store, request);
  if (method === "PATCH" && head === "admin/people")
    return updatePerson(store, request, id);
  if (method === "DELETE" && head === "admin/people")
    return deletePerson(store, request, id);
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "people" &&
    parts[3] === "avatar"
  ) {
    return uploadAvatar(store, request, parts[2]);
  }
  if (
    method === "DELETE" &&
    parts[0] === "admin" &&
    parts[1] === "people" &&
    parts[3] === "avatar"
  ) {
    return clearAvatar(store, request, parts[2]);
  }
  if (method === "POST" && route === "admin/visits")
    return createVisit(store, request);
  if (method === "PATCH" && head === "admin/visits")
    return updateVisit(store, request, id);
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "visits" &&
    parts[3] === "archive"
  ) {
    return remove(store, request, () => store.archiveVisit(parts[2]));
  }
  if (
    method === "PUT" &&
    parts[0] === "admin" &&
    parts[1] === "visits" &&
    parts[3] === "guests"
  ) {
    return setGuests(store, request, parts[2]);
  }
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "visits" &&
    parts[3] === "cover"
  ) {
    return uploadCover(store, request, parts[2]);
  }
  if (
    method === "DELETE" &&
    parts[0] === "admin" &&
    parts[1] === "visits" &&
    parts[3] === "cover"
  ) {
    return clearCover(store, request, parts[2]);
  }
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "visits" &&
    parts[3] === "events"
  ) {
    return createEvent(store, request, parts[2]);
  }
  if (method === "PATCH" && head === "admin/events")
    return updateEvent(store, request, id);
  if (method === "DELETE" && head === "admin/events")
    return remove(store, request, () => store.deleteEvent(id));
  if (method === "POST" && route === "admin/actions")
    return createAction(store, request);
  if (method === "PATCH" && head === "admin/actions")
    return updateAction(store, request, id);
  if (method === "DELETE" && head === "admin/actions")
    return remove(store, request, () => store.deleteAction(id));
  if (method === "POST" && route === "admin/pins")
    return createPin(store, request);
  if (method === "PATCH" && head === "admin/pins")
    return updatePin(store, request, id);
  if (method === "DELETE" && head === "admin/pins")
    return remove(store, request, () => store.deletePin(id));
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "pins" &&
    parts[3] === "photo"
  ) {
    return uploadPinPhoto(store, request, parts[2]);
  }
  if (method === "POST" && route === "admin/map")
    return uploadMap(store, request);
  if (method === "DELETE" && route === "admin/map")
    return clearMap(store, request);
  if (method === "POST" && route === "admin/guide")
    return createGuide(store, request);
  if (method === "PATCH" && head === "admin/guide")
    return updateGuide(store, request, id);
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "guide" &&
    parts[3] === "archive"
  ) {
    return remove(store, request, () => store.archiveGuide(parts[2]));
  }
  if (
    method === "POST" &&
    parts[0] === "admin" &&
    parts[1] === "guide" &&
    parts[3] === "photo"
  ) {
    return uploadGuidePhoto(store, request, parts[2]);
  }
  if (method === "DELETE" && head === "admin/themes")
    return deleteTheme(store, request, id);
  if (method === "DELETE" && head === "admin/notes")
    return remove(store, request, () => store.removeNote(id));
  if (method === "POST" && head === "actions")
    return runAction(store, request, id);
  if (method === "GET" && parts[0] === "media")
    return media(store, request, parts.slice(1));
  return fail(404, "not_found", "That page is not part of the home server.");
}

function overview(store: Store, request: Request): Overview {
  const home = store.household();
  const today = localDate(new Date(), home.timeZone);
  const visits = store.visits();
  const active = selectActiveVisit(
    today,
    visits.map((visit) => ({
      id: visit.id,
      startsOn: visit.startsOn,
      endsOn: visit.endsOn,
      archived: visit.archived,
    })),
    home.activeVisitOverride,
  );
  const cutoff = new Date(
    Date.now() - home.noteExpiryDays * 24 * 60 * 60 * 1000,
  );
  return {
    household: {
      name: home.name,
      timeZone: home.timeZone,
      showAddress: home.showAddress,
      addressLine: home.addressLine,
      postalCode: home.postalCode,
      latitude: home.latitude,
      longitude: home.longitude,
      temperatureUnit: home.temperatureUnit,
      wifiSSID: home.wifiSSID,
      wifiPassword: home.wifiPassword,
      wifiHidePassword: home.wifiHidePassword,
      wifiSecurity: home.wifiSecurity,
      showNotesOnTV: home.showNotesOnTV,
      noteExpiryDays: home.noteExpiryDays,
      haBaseURL: home.haBaseURL,
      haConfigured: Boolean(home.haBaseURL && home.haToken),
    },
    suggestedBaseURL: suggestedBase(request),
    activeVisitId: active?.id ?? "",
    pinnedVisitId: home.activeVisitOverride,
    rooms: store.rooms(),
    people: store.people().map((person) => ({
      id: person.id,
      displayName: person.displayName,
      avatarURL: person.avatarPath
        ? versioned(
            store,
            `/api/v1/media/avatars/${person.id}`,
            person.avatarPath,
          )
        : "",
      createdAt: person.createdAt,
    })),
    visits: visits.map((visit) => ({
      id: visit.id,
      title: visit.title,
      message: visit.message,
      startsOn: visit.startsOn,
      endsOn: visit.endsOn,
      themeId: visit.themeId,
      coverURL: visit.coverPath
        ? versioned(store, `/api/v1/media/visits/${visit.id}`, visit.coverPath)
        : "",
      archived: visit.archived,
      guestIds: visit.guestIds,
      events: visit.events,
    })),
    devices: store.devices(),
    actions: store.actions(),
    pins: store.pins().map((pin) => ({
      id: pin.id,
      title: pin.title,
      description: pin.description,
      category: pin.category,
      roomId: pin.roomId,
      roomName: pin.roomName,
      x: pin.x,
      y: pin.y,
      photoURL: pin.photoPath
        ? versioned(store, `/api/v1/media/pins/${pin.id}`, pin.photoPath)
        : "",
    })),
    mapImageURL: store.mapImagePath()
      ? versioned(store, "/api/v1/media/map", store.mapImagePath())
      : "",
    guide: store.guide(true).map((entry) => ({
      id: entry.id,
      title: entry.title,
      synonyms: entry.synonyms,
      category: entry.category,
      location: entry.location,
      details: entry.details,
      pinId: entry.pinId,
      photoURL: entry.photoPath
        ? versioned(store, `/api/v1/media/guide/${entry.id}`, entry.photoPath)
        : "",
      archived: entry.archived,
    })),
    notes: store
      .notesSince(cutoff)
      .map(({ removed: _removed, ...note }) => note),
    themes: [...builtinThemes(), ...store.themes()],
  };
}

async function setup(store: Store, request: Request) {
  const body = await readBody(request);
  const name = required(body.name, 80, "Household name");
  const password = required(body.password, 200, "Password");
  if ([...password].length < 8)
    throw new HttpError(
      400,
      "invalid",
      "Use a password of at least 8 characters.",
    );
  const timeZone = timeZoneOf(body.timeZone);
  store.setup(name, password, timeZone);
  const token = store.createSession(new Date());
  changed();
  return json(
    overview(store, request),
    200,
    cookieHeader(request, "gd_session", token, 60 * 60 * 24 * 30),
  );
}

async function login(store: Store, request: Request) {
  const now = Date.now();
  while (loginFailures.length && now - loginFailures[0] > 10 * 60 * 1000)
    loginFailures.shift();
  if (loginFailures.length >= 8)
    throw new HttpError(
      429,
      "slow_down",
      "Too many sign-in attempts. Wait a few minutes and try again.",
    );
  const body = await readBody(request);
  const password = required(body.password, 200, "Password");
  if (!store.checkPassword(password)) {
    loginFailures.push(now);
    throw new HttpError(401, "unauthorized", "That password is not right.");
  }
  const token = store.createSession(new Date());
  return json(
    overview(store, request),
    200,
    cookieHeader(request, "gd_session", token, 60 * 60 * 24 * 30),
  );
}

function logout(store: Store, request: Request) {
  const token = cookie(request, "gd_session");
  if (token) store.deleteSession(token);
  return json({ ok: true }, 200, expireCookie("gd_session"));
}

async function updateSettings(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const current = store.household();
  const name = required(body.name, 80, "Household name");
  const timeZone = timeZoneOf(body.timeZone);
  const temperatureUnit: TemperatureUnit =
    body.temperatureUnit === "celsius" ? "celsius" : "fahrenheit";
  const wifiSecurity: WiFiSecurity =
    body.wifiSecurity === "WEP" || body.wifiSecurity === "nopass"
      ? body.wifiSecurity
      : "WPA";
  const noteExpiryDays = Number(body.noteExpiryDays);
  if (
    !Number.isInteger(noteExpiryDays) ||
    noteExpiryDays < 1 ||
    noteExpiryDays > 90
  ) {
    throw new HttpError(
      400,
      "invalid",
      "Note expiry must be between 1 and 90 days.",
    );
  }
  const haBaseURL = optional(body.haBaseURL, 300);
  if (haBaseURL) assertHttpUrl(haBaseURL, "Home Assistant address");
  let latitude = current.latitude;
  let longitude = current.longitude;
  if (body.latitude == null || body.latitude === "") latitude = null;
  else latitude = coordinate(body.latitude, -90, 90, "Latitude");
  if (body.longitude == null || body.longitude === "") longitude = null;
  else longitude = coordinate(body.longitude, -180, 180, "Longitude");
  if ((latitude == null) !== (longitude == null)) {
    throw new HttpError(
      400,
      "invalid",
      "Enter both latitude and longitude, or leave both empty.",
    );
  }
  let haToken = current.haToken;
  if (body.clearHAToken === true) haToken = "";
  else if (optional(body.haToken, 400)) haToken = optional(body.haToken, 400);
  store.updateSettings({
    name,
    timeZone,
    showAddress: body.showAddress === true,
    addressLine: optional(body.addressLine, 160),
    postalCode: optional(body.postalCode, 20),
    latitude,
    longitude,
    temperatureUnit,
    wifiSSID: optional(body.wifiSSID, 80),
    wifiPassword: optional(body.wifiPassword, 120),
    wifiHidePassword: body.wifiHidePassword === true,
    wifiSecurity,
    showNotesOnTV: body.showNotesOnTV !== false,
    noteExpiryDays,
    haBaseURL: haBaseURL.replace(/\/$/, ""),
    haToken,
  });
  changed();
  return json({ ok: true });
}

async function createPairing(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const surface: Surface = body.surface === "tv" ? "tv" : "ipad";
  const created = store.createPairingCode(new Date());
  const url = `${suggestedBase(request)}/${surface === "tv" ? "tv" : "display"}?code=${created.code}`;
  const qrDataURL = await QRCode.toDataURL(url, {
    margin: 4,
    width: 480,
    errorCorrectionLevel: "M",
  });
  return json({ ...created, url, qrDataURL, surface });
}

async function geocode(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const postalCode = required(body.postalCode, 10, "ZIP code");
  if (!/^\d{5}$/.test(postalCode)) {
    throw new HttpError(
      400,
      "invalid",
      "Enter a 5-digit ZIP code, or type the latitude and longitude yourself.",
    );
  }
  try {
    return json(await lookupZip(postalCode));
  } catch {
    throw new HttpError(
      400,
      "invalid",
      "That ZIP code could not be found. You can type the latitude and longitude instead.",
    );
  }
}

async function testHomeAssistant(store: Store, request: Request) {
  requireAdmin(store, request);
  const home = store.household();
  if (!home.haBaseURL || !home.haToken)
    throw new HttpError(
      400,
      "invalid",
      "Add the Home Assistant address and token first.",
    );
  try {
    const response = await fetch(`${home.haBaseURL.replace(/\/$/, "")}/api/`, {
      headers: { authorization: `Bearer ${home.haToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401)
      throw new HttpError(
        502,
        "unavailable",
        "Home Assistant rejected the token.",
      );
    if (!response.ok)
      throw new HttpError(
        502,
        "unavailable",
        "Home Assistant did not respond. Check the address and token.",
      );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "unavailable",
      "Home Assistant did not respond. Check the address and token.",
    );
  }
  return json({ ok: true, message: "Home Assistant responded." });
}

async function saveTheme(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = (await readBody(request)) as Partial<ThemeTokens>;
  if (body.id === "default" || body.id === "christmas") {
    throw new HttpError(
      400,
      "invalid",
      "The built-in themes stay as they are. Save a new name instead.",
    );
  }
  const theme: ThemeTokens = {
    id: required(body.id, 32, "Theme id").toLowerCase(),
    name: required(body.name, 40, "Theme name"),
    background: String(body.background ?? ""),
    backgroundSecondary: String(body.backgroundSecondary ?? ""),
    text: String(body.text ?? ""),
    textSecondary: String(body.textSecondary ?? ""),
    accent: String(body.accent ?? ""),
    accentText: String(body.accentText ?? ""),
    surface: String(body.surface ?? ""),
    surfaceText: String(body.surfaceText ?? ""),
    surfaceMuted: String(body.surfaceMuted ?? ""),
    motion: body.motion === "gentle" ? "gentle" : "none",
    greetingStyle: body.greetingStyle === "festive" ? "festive" : "plain",
  };
  const problem = validateTheme(theme);
  if (problem) throw new HttpError(400, "invalid", problem);
  store.saveTheme(theme);
  changed();
  return json({ ok: true });
}

async function deleteTheme(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  if (id === "default" || id === "christmas")
    throw new HttpError(
      400,
      "invalid",
      "The built-in themes stay as they are.",
    );
  store.deleteTheme(id);
  changed();
  return json({ ok: true });
}

async function setActive(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  store.setActiveVisit(optional(body.id, 80));
  changed();
  return json({ ok: true });
}

async function pair(store: Store, request: Request) {
  const body = await readBody(request);
  const surface: Surface = body.surface === "tv" ? "tv" : "ipad";
  const name =
    optional(body.name, 40) || (surface === "tv" ? "Apple TV" : "iPad");
  const code = required(body.code, 12, "Pairing code").toUpperCase();
  const paired = store.redeemPairing(code, name, surface, new Date());
  changed();
  return json(
    {
      deviceId: paired.deviceId,
      deviceToken: paired.token,
      apiVersion: API_VERSION,
      surface,
    },
    200,
    cookieHeader(request, "gd_device", paired.token, 60 * 60 * 24 * 400),
  );
}

async function snapshot(store: Store, request: Request) {
  const device = requireDevice(store, request);
  return json(await buildSnapshot(store, device));
}

async function preview(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  if (body.surface !== "ipad" && body.surface !== "tv")
    throw new HttpError(400, "invalid", "Choose an iPad or TV preview.");
  const now =
    body.at === undefined
      ? new Date()
      : new Date(instant(body.at, "Preview time"));
  const roomId = optional(body.roomId, 80);
  const room = store.rooms().find((item) => item.id === roomId);
  if (roomId && !room)
    throw new HttpError(400, "invalid", "Choose a room that exists.");
  const visitId =
    body.visitId === undefined
      ? undefined
      : required(body.visitId, 80, "Visit");
  let visit = store.visits().find((item) => item.id === visitId);
  if (visitId && !visit)
    throw new HttpError(404, "not_found", "That visit is no longer there.");
  const warnings: string[] = [];
  if (visit?.archived) warnings.push("This visit is archived.");
  if (body.visit !== undefined) {
    if (
      !body.visit ||
      typeof body.visit !== "object" ||
      Array.isArray(body.visit)
    )
      throw new HttpError(
        400,
        "invalid",
        "Enter the visit details to preview.",
      );
    const draft = body.visit as Record<string, unknown>;
    for (const field of ["title", "startsOn", "endsOn", "message", "themeId"]) {
      if (typeof draft[field] !== "string")
        throw new HttpError(400, "invalid", `Visit ${field} is required.`);
    }
    const input = visitInput(store, draft);
    if (input.guestIds === undefined)
      throw new HttpError(
        400,
        "invalid",
        "Choose the preview guests, or use an empty list.",
      );
    visit = {
      ...visit,
      ...input,
      id: visit?.id ?? "preview",
      createdAt: visit?.createdAt ?? now.toISOString(),
      archived: visit?.archived ?? false,
      coverPath: visit?.coverPath ?? "",
      events: visit?.events ?? [],
      guestIds: input.guestIds,
    };
  }
  const today = localDate(now, store.household().timeZone);
  if (visit && (today < visit.startsOn || today > visit.endsOn))
    warnings.push("This visit is outside the preview date.");
  const snapshot = await buildPreviewSnapshot(
    store,
    {
      id: "preview",
      name: "Preview",
      surface: body.surface,
      roomId,
      roomName: room?.name ?? "",
      canPostNotes: false,
    },
    now,
    visit,
  );
  return json({ preview: true, snapshot, warnings });
}

async function createNote(store: Store, request: Request) {
  const device = requireDevice(store, request);
  if (device.surface === "tv" || !device.canPostNotes)
    throw new HttpError(403, "forbidden", "This display cannot post notes.");
  const body = await readBody(request);
  const clientRequestId = required(body.clientRequestId, 80, "Request id");
  if (!/^[A-Za-z0-9-]{8,80}$/.test(clientRequestId))
    throw new HttpError(400, "invalid", "The note could not be identified.");
  const authorName = required(body.authorName, 40, "Name");
  const text = required(body.body, 280, "Note");
  const result = store.createNote(
    { clientRequestId, authorName, body: text },
    new Date(),
  );
  if (result.created && !result.note.removed) {
    publish({ type: "note.created", id: result.note.id });
    changed();
  }
  const { removed: _removed, ...note } = result.note;
  return json(note);
}

async function runAction(store: Store, request: Request, id: string) {
  const device = requireDevice(store, request);
  if (device.surface === "tv")
    throw new HttpError(403, "forbidden", "TV displays are read-only.");
  const action = store.action(id);
  if (!action || action.roomId !== device.roomId)
    throw new HttpError(
      404,
      "not_found",
      "That control is not on this display.",
    );
  const body = await readBody(request);
  const command = String(body.command ?? "");
  if (action.kind === "toggle" && command !== "toggle")
    throw new HttpError(400, "invalid", "This control turns on and off.");
  if (action.kind === "brightness" && command !== "brightness")
    throw new HttpError(400, "invalid", "This control sets a brightness.");
  if (action.kind === "script" && command !== "run")
    throw new HttpError(400, "invalid", "This control runs a script.");
  if (
    action.kind === "brightness" &&
    (typeof body.level !== "number" || !Number.isFinite(body.level))
  )
    throw new HttpError(400, "invalid", "Choose a valid brightness level.");
  const home = store.household();
  const result = await performAction({
    baseURL: home.haBaseURL,
    token: home.haToken,
    entityId: action.entityId,
    kind: action.kind,
    command,
    level: body.level == null ? undefined : Number(body.level),
    brightnessMin: action.brightnessMin,
    brightnessMax: action.brightnessMax,
  });
  return json({ ...result, id: action.id, label: action.label });
}

function live(store: Store, request: Request) {
  if (!actor(store, request))
    throw new HttpError(
      401,
      "unauthorized",
      "Sign in or pair this display first.",
    );
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      send(JSON.stringify({ type: "hello", apiVersion: API_VERSION }));
      unsubscribe = subscribe(send);
      timer = setInterval(
        () => controller.enqueue(encoder.encode(`: ping\n\n`)),
        20000,
      );
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function media(store: Store, request: Request, parts: string[]) {
  if (!actor(store, request))
    throw new HttpError(401, "unauthorized", "This display is not paired.");
  if (parts[0] === "avatars" && parts[1]) {
    const person = store.people().find((item) => item.id === parts[1]);
    return sendFile(store, person?.avatarPath ?? "");
  }
  if (parts[0] === "map") return sendFile(store, store.mapImagePath());
  if (parts[0] === "pins" && parts[1])
    return sendFile(
      store,
      store.pins().find((item) => item.id === parts[1])?.photoPath ?? "",
    );
  if (parts[0] === "guide" && parts[1])
    return sendFile(
      store,
      store.guide(true).find((item) => item.id === parts[1])?.photoPath ?? "",
    );
  if (parts[0] === "visits" && parts[1])
    return sendFile(
      store,
      store.visits().find((item) => item.id === parts[1])?.coverPath ?? "",
    );
  return fail(404, "not_found", "That image is not there.");
}

async function createRoom(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  store.createRoom(required(body.name, 40, "Room name"));
  changed();
  return json({ ok: true });
}

async function updateRoom(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const body = await readBody(request);
  store.updateRoom(id, required(body.name, 40, "Room name"));
  changed();
  return json({ ok: true });
}

async function createPerson(store: Store, request: Request) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const person = store.createPerson(
    required(body.name, 60, "Name"),
    new Date(),
  );
  changed();
  return json(person);
}

async function updatePerson(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const body = await readBody(request);
  store.updatePerson(id, required(body.name, 60, "Name"));
  changed();
  return json({ ok: true });
}

function deletePerson(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const person = store.people().find((item) => item.id === id);
  store.deletePerson(id);
  if (person?.avatarPath) removeFile(store, person.avatarPath);
  changed();
  return json({ ok: true });
}

async function uploadAvatar(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const person = store.people().find((item) => item.id === id);
  if (!person)
    throw new StoreError("not_found", "That person is no longer there.");
  const image = await readImage(request);
  const rel = await writeImage(store, "avatars", id, image);
  store.setAvatar(id, rel);
  if (person.avatarPath) removeFile(store, person.avatarPath);
  changed();
  return json({ ok: true });
}

function clearAvatar(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const person = store.people().find((item) => item.id === id);
  if (!person)
    throw new StoreError("not_found", "That person is no longer there.");
  if (person.avatarPath) removeFile(store, person.avatarPath);
  store.setAvatar(id, "");
  changed();
  return json({ ok: true });
}

async function createVisit(store: Store, request: Request) {
  requireAdmin(store, request);
  const id = store.createVisit(
    visitInput(store, await readBody(request)),
    new Date(),
  );
  changed();
  return json({ id });
}

async function updateVisit(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  store.updateVisit(id, visitInput(store, await readBody(request)));
  changed();
  return json({ ok: true });
}

function visitInput(store: Store, body: Record<string, unknown>) {
  const startsOn = dateField(body.startsOn, "Start date");
  const endsOn = dateField(body.endsOn, "End date");
  if (endsOn < startsOn)
    throw new HttpError(
      400,
      "invalid",
      "The visit has to end on or after it starts.",
    );
  const themeId = optional(body.themeId, 32) || "default";
  if (
    !builtinThemes().some((theme) => theme.id === themeId) &&
    !store.theme(themeId)
  ) {
    throw new HttpError(400, "invalid", "Choose a theme that exists.");
  }
  return {
    title: required(body.title, 80, "Visit title"),
    message: optional(body.message, 280),
    startsOn,
    endsOn,
    themeId,
    guestIds:
      body.guestIds === undefined
        ? undefined
        : guestIdsInput(store, body.guestIds),
  };
}

function guestIdsInput(store: Store, value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === "string" && id.length > 0)
  )
    throw new HttpError(
      400,
      "invalid",
      "Choose guests from the saved people list.",
    );
  store.validateGuestIds(value);
  return value;
}

async function setGuests(store: Store, request: Request, visitId: string) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const personIds = guestIdsInput(store, body.personIds);
  store.setGuests(visitId, personIds);
  changed();
  return json({ ok: true });
}

async function uploadCover(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const visit = store.visits().find((item) => item.id === id);
  if (!visit)
    throw new StoreError("not_found", "That visit is no longer there.");
  const image = await readImage(request);
  store.setCover(id, await writeImage(store, "visits", id, image));
  if (visit.coverPath) removeFile(store, visit.coverPath);
  changed();
  return json({ ok: true });
}

function clearCover(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const visit = store.visits().find((item) => item.id === id);
  if (!visit)
    throw new StoreError("not_found", "That visit is no longer there.");
  if (visit.coverPath) removeFile(store, visit.coverPath);
  store.setCover(id, "");
  changed();
  return json({ ok: true });
}

async function createEvent(store: Store, request: Request, visitId: string) {
  requireAdmin(store, request);
  const event = eventInput(await readBody(request));
  const id = store.createEvent({ ...event, id: "", visitId });
  changed();
  return json({ id });
}

async function updateEvent(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const existing = store
    .visits()
    .flatMap((visit) => visit.events)
    .find((event) => event.id === id);
  if (!existing)
    throw new StoreError("not_found", "That event is no longer there.");
  store.updateEvent({
    ...eventInput(await readBody(request)),
    id,
    visitId: existing.visitId,
  });
  changed();
  return json({ ok: true });
}

function eventInput(body: Record<string, unknown>) {
  const title = required(body.title, 80, "Event title");
  const allDay = body.allDay === true;
  const eventDate = allDay ? dateField(body.eventDate, "Event date") : "";
  const startsAt = allDay ? null : instant(body.startsAt, "Start time");
  const endsAt =
    !allDay && body.endsAt ? instant(body.endsAt, "End time") : null;
  if (!allDay && !startsAt)
    throw new HttpError(
      400,
      "invalid",
      "Add a start time, or mark the event as all day.",
    );
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new HttpError(
      400,
      "invalid",
      "The event has to end after it starts.",
    );
  }
  const link = optional(body.link, 300);
  if (link) assertHttpUrl(link, "Link");
  return {
    title,
    allDay,
    eventDate,
    startsAt,
    endsAt: allDay ? null : endsAt,
    location: optional(body.location, 120),
    notes: optional(body.notes, 400),
    link,
  };
}

async function createAction(store: Store, request: Request) {
  requireAdmin(store, request);
  const action = actionInput(await readBody(request));
  const id = store.createAction(action);
  changed();
  return json({ id });
}

async function updateAction(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  store.updateAction({ ...actionInput(await readBody(request)), id });
  changed();
  return json({ ok: true });
}

function actionInput(body: Record<string, unknown>) {
  const kind = String(body.kind ?? "") as ActionKind;
  const entityId = required(body.entityId, 120, "Entity").toLowerCase();
  const brightnessMin =
    kind === "brightness" ? Number(body.brightnessMin ?? 1) : 1;
  const brightnessMax =
    kind === "brightness" ? Number(body.brightnessMax ?? 100) : 100;
  const problem = validateAction(kind, entityId, brightnessMin, brightnessMax);
  if (problem) throw new HttpError(400, "invalid", problem);
  return {
    roomId: required(body.roomId, 80, "Room"),
    label: required(body.label, 40, "Label"),
    kind,
    entityId,
    brightnessMin,
    brightnessMax,
  };
}

async function updateDevice(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const body = await readBody(request);
  const surface: Surface = body.surface === "tv" ? "tv" : "ipad";
  store.updateDevice(id, {
    name: required(body.name, 40, "Display name"),
    surface,
    roomId: optional(body.roomId, 80),
    canPostNotes: body.canPostNotes === true,
  });
  changed();
  return json({ ok: true });
}

function revoke(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  store.revokeDevice(id);
  changed();
  return json({ ok: true });
}

async function createPin(store: Store, request: Request) {
  requireAdmin(store, request);
  const id = store.createPin(pinInput(await readBody(request)));
  changed();
  return json({ id });
}

async function updatePin(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  store.updatePin({ ...pinInput(await readBody(request)), id });
  changed();
  return json({ ok: true });
}

function pinInput(body: Record<string, unknown>) {
  const x = Number(body.x);
  const y = Number(body.y);
  if (
    body.x == null ||
    body.y == null ||
    body.x === "" ||
    body.y === "" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    throw new HttpError(400, "invalid", "Place the pin on the map.");
  }
  return {
    title: required(body.title, 80, "Pin title"),
    description: optional(body.description, 200),
    category: optional(body.category, 40),
    roomId: optional(body.roomId, 80),
    x,
    y,
  };
}

async function uploadPinPhoto(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const pin = store.pins().find((item) => item.id === id);
  if (!pin) throw new StoreError("not_found", "That pin is no longer there.");
  const image = await readImage(request);
  store.setPinPhoto(id, await writeImage(store, "pins", id, image));
  if (pin.photoPath) removeFile(store, pin.photoPath);
  changed();
  return json({ ok: true });
}

async function uploadMap(store: Store, request: Request) {
  requireAdmin(store, request);
  const image = await readImage(request);
  const previous = store.mapImagePath();
  store.setMapImage(await writeImage(store, "map", "floor", image));
  if (previous) removeFile(store, previous);
  changed();
  return json({ ok: true });
}

function clearMap(store: Store, request: Request) {
  requireAdmin(store, request);
  const previous = store.mapImagePath();
  if (previous) removeFile(store, previous);
  store.setMapImage("");
  changed();
  return json({ ok: true });
}

async function createGuide(store: Store, request: Request) {
  requireAdmin(store, request);
  const id = store.createGuide(guideInput(await readBody(request)));
  changed();
  return json({ id });
}

async function updateGuide(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  store.updateGuide({ ...guideInput(await readBody(request)), id });
  changed();
  return json({ ok: true });
}

function guideInput(body: Record<string, unknown>) {
  const synonyms = Array.isArray(body.synonyms)
    ? body.synonyms
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 12)
    : String(body.synonyms ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);
  return {
    title: required(body.title, 80, "Title"),
    synonyms,
    category: optional(body.category, 40),
    location: required(body.location, 160, "Location"),
    details: optional(body.details, 600),
    pinId: optional(body.pinId, 80),
  };
}

async function uploadGuidePhoto(store: Store, request: Request, id: string) {
  requireAdmin(store, request);
  const entry = store.guide(true).find((item) => item.id === id);
  if (!entry)
    throw new StoreError("not_found", "That entry is no longer there.");
  const image = await readImage(request);
  store.setGuidePhoto(id, await writeImage(store, "guide", id, image));
  if (entry.photoPath) removeFile(store, entry.photoPath);
  changed();
  return json({ ok: true });
}

function remove(store: Store, request: Request, fn: () => void) {
  requireAdmin(store, request);
  fn();
  changed();
  return json({ ok: true });
}

function requireAdmin(store: Store, request: Request) {
  const token = cookie(request, "gd_session");
  if (!token || !store.validSession(token, new Date())) {
    throw new HttpError(401, "unauthorized", "Sign in to continue.");
  }
}

function requireDevice(store: Store, request: Request) {
  const token = cookie(request, "gd_device") || bearer(request);
  const device = token ? store.deviceByToken(token) : null;
  if (!device)
    throw new HttpError(401, "unauthorized", "This display is not paired.");
  return device;
}

function actor(store: Store, request: Request) {
  const admin = cookie(request, "gd_session");
  if (admin && store.validSession(admin, new Date())) return true;
  const token = cookie(request, "gd_device") || bearer(request);
  return Boolean(token && store.deviceByToken(token));
}

function versionOk(request: Request) {
  return request.headers.get("Grata-API-Version") === String(API_VERSION);
}

function changed() {
  publish({ type: "snapshot.changed" });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("bad");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid", "The request could not be read.");
  }
}

function required(value: unknown, max: number, label: string) {
  if (typeof value !== "string")
    throw new HttpError(400, "invalid", `${label} must be text.`);
  const clean = String(value ?? "").trim();
  if (!clean) throw new HttpError(400, "invalid", `${label} is required.`);
  if ([...clean].length > max)
    throw new HttpError(400, "invalid", `${label} is too long.`);
  return clean;
}

function optional(value: unknown, max: number) {
  if (value != null && typeof value !== "string")
    throw new HttpError(400, "invalid", "Enter text for this field.");
  const clean = String(value ?? "").trim();
  if ([...clean].length > max)
    throw new HttpError(400, "invalid", "That text is too long.");
  return clean;
}

function dateField(value: unknown, label: string) {
  const clean = required(value, 10, label);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(clean) ||
    Number.isNaN(new Date(`${clean}T00:00:00Z`).getTime()) ||
    new Date(`${clean}T00:00:00Z`).toISOString().slice(0, 10) !== clean
  ) {
    throw new HttpError(400, "invalid", `${label} needs a real date.`);
  }
  return clean;
}

function instant(value: unknown, label: string) {
  const clean = required(value, 40, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      clean,
    )
  )
    throw new HttpError(
      400,
      "invalid",
      `${label} must include a time zone (Z or an offset).`,
    );
  dateField(clean.slice(0, 10), label);
  const date = new Date(clean);
  if (Number.isNaN(date.getTime()))
    throw new HttpError(400, "invalid", `${label} needs a real time.`);
  return date.toISOString();
}

function timeZoneOf(value: unknown) {
  const timeZone = required(value, 80, "Time zone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new HttpError(400, "invalid", "That time zone is not recognized.");
  }
}

function coordinate(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (Number.isNaN(number) || number < min || number > max)
    throw new HttpError(400, "invalid", `${label} is not in range.`);
  return number;
}

function assertHttpUrl(value: string, label: string) {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.host)
      throw new Error("bad");
  } catch {
    throw new HttpError(
      400,
      "invalid",
      `${label} needs to start with http:// or https://.`,
    );
  }
}

async function readImage(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    throw new HttpError(400, "invalid", "Choose an image.");
  if (file.size > 8 * 1024 * 1024)
    throw new HttpError(400, "invalid", "Use an image smaller than 8MB.");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : file.type === "image/jpeg"
            ? "jpg"
            : "";
  if (!ext)
    throw new HttpError(400, "invalid", "Use a JPEG, PNG, GIF, or WebP image.");
  return { bytes: Buffer.from(await file.arrayBuffer()), ext };
}

async function writeImage(
  store: Store,
  folder: string,
  id: string,
  image: { bytes: Buffer; ext: string },
) {
  const rel = `${folder}/${id}-${randomUUID()}.${image.ext}`;
  const full = safeMediaPath(store, rel);
  if (!full)
    throw new HttpError(400, "invalid", "That image could not be stored.");
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, image.bytes);
  return rel;
}

function removeFile(store: Store, rel: string) {
  const full = safeMediaPath(store, rel);
  if (full && fs.existsSync(full)) fs.unlinkSync(full);
}

function sendFile(store: Store, rel: string) {
  const full = rel ? safeMediaPath(store, rel) : null;
  if (!full || !fs.existsSync(full))
    return fail(404, "not_found", "That image is not there.");
  const ext = path.extname(full).slice(1);
  const type =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";
  return new Response(fs.readFileSync(full), {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=86400",
    },
  });
}

function cookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function cookieHeader(
  request: Request,
  name: string,
  value: string,
  maxAge: number,
) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return { "set-cookie": parts.join("; ") };
}

function expireCookie(name: string) {
  return {
    "set-cookie": `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  };
}

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  if (extra)
    for (const [key, value] of Object.entries(extra))
      headers.append(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(status: number, code: string, message: string) {
  const error: Record<string, unknown> = { code, message };
  if (code === "incompatible_api") error.serverApiVersion = API_VERSION;
  return json({ error }, status);
}
