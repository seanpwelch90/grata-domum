import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import {
  builtinTheme,
  defaultTheme,
  initials,
  localDate,
  selectActiveVisit,
  wifiPayload,
} from "@/lib/domain";
import { describeActions } from "@/lib/ha";
import type { Store } from "@/lib/store";
import type { Snapshot, Weather } from "@/lib/types";
import { fetchForecast } from "@/lib/weather";

type Device = Snapshot["device"];
type StoredVisit = ReturnType<Store["visits"]>[number];

export async function buildSnapshot(
  store: Store,
  device: Device,
  options: { now?: Date; fetchImpl?: typeof fetch; weatherBase?: string } = {},
): Promise<Snapshot> {
  const now = options.now ?? new Date();
  const home = store.household();
  const roomActions =
    device.surface === "ipad" && device.roomId
      ? store.actions().filter((action) => action.roomId === device.roomId)
      : [];
  const weather = await weatherInfo(
    store,
    home,
    now,
    options.fetchImpl ?? fetch,
    options.weatherBase,
  );
  const actions = await describeActions(
    roomActions,
    Boolean(home.haBaseURL && home.haToken),
    home.haBaseURL,
    home.haToken,
    options.fetchImpl ?? fetch,
  );
  return assembleSnapshot(
    store,
    device,
    now,
    scheduledVisit(store, now),
    weather,
    actions,
  );
}

function scheduledVisit(store: Store, now: Date): StoredVisit | null {
  const home = store.household();
  const visits = store.visits();
  const active = selectActiveVisit(
    localDate(now, home.timeZone),
    visits,
    home.activeVisitOverride,
  );
  return visits.find((visit) => visit.id === active?.id) ?? null;
}

// Read-only orchestration: previews never fetch external services or update their caches.
export async function buildPreviewSnapshot(
  store: Store,
  device: Device,
  now: Date,
  visit?: StoredVisit,
): Promise<Snapshot> {
  const home = store.household();
  const cached =
    home.latitude != null && home.longitude != null
      ? store.weatherCache()
      : null;
  const weather: Weather | null = cached
    ? {
        ...(JSON.parse(cached.payload) as Omit<Weather, "stale" | "fetchedAt">),
        stale:
          now.getTime() - new Date(cached.fetchedAt).getTime() >=
          30 * 60 * 1000,
        fetchedAt: cached.fetchedAt,
      }
    : null;
  const actions: Snapshot["actions"] =
    device.surface === "ipad"
      ? store
          .actions()
          .filter(
            (action) =>
              Boolean(device.roomId) && action.roomId === device.roomId,
          )
          .map((action) => ({
            id: action.id,
            label: action.label,
            kind: action.kind,
            availability: "unavailable",
            power: "",
            brightness: null,
            message: "Controls are disabled in preview.",
          }))
      : [];
  return assembleSnapshot(
    store,
    { ...device, canPostNotes: false },
    now,
    visit ?? scheduledVisit(store, now),
    weather,
    actions,
  );
}

async function assembleSnapshot(
  store: Store,
  device: Device,
  now: Date,
  visit: StoredVisit | null,
  weather: Weather | null,
  actions: Snapshot["actions"],
): Promise<Snapshot> {
  const home = store.household();
  const theme =
    (visit && (builtinTheme(visit.themeId) ?? store.theme(visit.themeId))) ||
    defaultTheme();
  const people = new Map(store.people().map((person) => [person.id, person]));
  const guests = (visit?.guestIds ?? []).flatMap((id) => {
    const person = people.get(id);
    if (!person) return [];
    return [
      {
        id: person.id,
        displayName: person.displayName,
        initials: initials(person.displayName),
        avatarURL: person.avatarPath
          ? versioned(
              store,
              `/api/v1/media/avatars/${person.id}`,
              person.avatarPath,
            )
          : "",
      },
    ];
  });
  const wifi = await wifiInfo(home);
  const events = (visit?.events ?? [])
    .map(({ visitId: _visitId, ...event }) => event)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const cutoff = new Date(
    now.getTime() - home.noteExpiryDays * 24 * 60 * 60 * 1000,
  );
  return {
    apiVersion: 1,
    syncedAt: now.toISOString(),
    timeZone: home.timeZone,
    household: { id: home.id, name: home.name },
    device: {
      id: device.id,
      name: device.name,
      surface: device.surface,
      roomId: device.roomId,
      roomName: device.roomName,
      canPostNotes: device.surface === "ipad" && device.canPostNotes,
    },
    visit: visit
      ? {
          id: visit.id,
          title: visit.title,
          message: visit.message,
          startsOn: visit.startsOn,
          endsOn: visit.endsOn,
          guests,
          coverURL: visit.coverPath
            ? versioned(
                store,
                `/api/v1/media/visits/${visit.id}`,
                visit.coverPath,
              )
            : "",
        }
      : null,
    theme,
    wifi,
    location:
      home.showAddress && (home.addressLine || home.postalCode)
        ? { addressLine: home.addressLine, postalCode: home.postalCode }
        : null,
    weather,
    actions,
    events,
    map: {
      imageURL: store.mapImagePath()
        ? versioned(store, "/api/v1/media/map", store.mapImagePath())
        : "",
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
    },
    guide: store.guide(false).map((entry) => ({
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
    })),
    notes: store
      .notesSince(cutoff)
      .map(({ removed: _removed, ...note }) => note),
    showNotesOnTV: home.showNotesOnTV,
  };
}

function sortKey(event: {
  allDay: boolean;
  eventDate: string;
  startsAt: string | null;
}) {
  return event.allDay ? `${event.eventDate}T00:00:00` : (event.startsAt ?? "");
}

async function wifiInfo(
  home: ReturnType<Store["household"]>,
): Promise<Snapshot["wifi"]> {
  if (!home.wifiSSID.trim()) return null;
  const qrPayload = wifiPayload(
    home.wifiSecurity,
    home.wifiSSID,
    home.wifiPassword,
    false,
  );
  const qrDataURL = await QRCode.toDataURL(qrPayload, {
    margin: 4,
    width: 480,
    errorCorrectionLevel: "M",
  });
  return {
    ssid: home.wifiSSID,
    password:
      home.wifiHidePassword || home.wifiSecurity === "nopass"
        ? null
        : home.wifiPassword,
    passwordHidden: home.wifiHidePassword,
    qrPayload,
    qrDataURL,
  };
}

async function weatherInfo(
  store: Store,
  home: ReturnType<Store["household"]>,
  now: Date,
  fetchImpl: typeof fetch,
  weatherBase?: string,
): Promise<Weather | null> {
  if (home.latitude == null || home.longitude == null) return null;
  const cached = store.weatherCache();
  const fresh =
    cached &&
    now.getTime() - new Date(cached.fetchedAt).getTime() < 30 * 60 * 1000;
  if (cached && fresh) {
    const forecast = JSON.parse(cached.payload) as Omit<
      Weather,
      "stale" | "fetchedAt"
    >;
    return { ...forecast, stale: false, fetchedAt: cached.fetchedAt };
  }
  try {
    const forecast = await fetchForecast(
      home.latitude,
      home.longitude,
      home.temperatureUnit,
      home.timeZone,
      fetchImpl,
      weatherBase,
    );
    store.setWeatherCache(JSON.stringify(forecast), now);
    return { ...forecast, stale: false, fetchedAt: now.toISOString() };
  } catch {
    if (!cached) return null;
    const forecast = JSON.parse(cached.payload) as Omit<
      Weather,
      "stale" | "fetchedAt"
    >;
    return { ...forecast, stale: true, fetchedAt: cached.fetchedAt };
  }
}

export function versioned(store: Store, route: string, rel: string): string {
  const full = safeMediaPath(store, rel);
  const version =
    full && fs.existsSync(/*turbopackIgnore: true*/ full)
      ? Math.floor(fs.statSync(/*turbopackIgnore: true*/ full).mtimeMs)
      : 0;
  return `${route}?v=${version}`;
}

export function safeMediaPath(store: Store, rel: string): string | null {
  if (!rel || rel.includes("..")) return null;
  const root = path.resolve(store.mediaDir);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}
