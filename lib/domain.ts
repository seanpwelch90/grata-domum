import { builtinThemeTokens } from "@/lib/design-tokens";
import type {
  GuideEntry,
  HouseholdNote,
  PendingNote,
  ThemeTokens,
  VisitEvent,
} from "@/lib/types";

export type VisitChoice = {
  id: string;
  startsOn: string;
  endsOn: string;
  archived: boolean;
};

export function selectActiveVisit(
  today: string,
  visits: VisitChoice[],
  overrideId: string,
): VisitChoice | null {
  if (overrideId) {
    const pinned = visits.find(
      (visit) => visit.id === overrideId && !visit.archived,
    );
    if (pinned) return pinned;
  }
  const current = visits
    .filter(
      (visit) =>
        !visit.archived && visit.startsOn <= today && today <= visit.endsOn,
    )
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  return current[0] ?? null;
}

export function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function hourInZone(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

export function timeOfDayHello(now: Date, timeZone: string): string {
  const hour = hourInZone(now, timeZone);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function joinNames(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  if (clean.length > 5) {
    return `${clean.slice(0, 3).join(", ")}, and ${clean.length - 3} more`;
  }
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

export function initials(name: string): string {
  const fields = name.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return "?";
  const letters: string[] = [];
  const limit = fields.length === 1 ? 1 : 2;
  for (const field of fields) {
    const letter = [...field].find((char) => /\p{L}|\p{N}/u.test(char));
    if (letter) letters.push(letter.toLocaleUpperCase());
    if (letters.length === limit) break;
  }
  return letters.length ? letters.join("") : "?";
}

function escapeWifi(value: string): string {
  return value.replace(/[\\;,":]/g, (char) => `\\${char}`);
}

export function wifiPayload(
  security: string,
  ssid: string,
  password: string,
  hidden: boolean,
): string {
  const name = ssid.trim();
  if (!name) throw new Error("Wi-Fi name is required.");
  if (security !== "WPA" && security !== "WEP" && security !== "nopass") {
    throw new Error("Unknown Wi-Fi security.");
  }
  let payload = `WIFI:T:${security};S:${escapeWifi(name)};`;
  if (security !== "nopass") payload += `P:${escapeWifi(password)};`;
  if (hidden) payload += "H:true;";
  return `${payload};`;
}

export function defaultTheme(): ThemeTokens {
  return builtinThemeTokens("default");
}

export function christmasTheme(): ThemeTokens {
  return builtinThemeTokens("christmas");
}

export function builtinThemes(): ThemeTokens[] {
  return [defaultTheme(), christmasTheme()];
}

export function builtinTheme(id: string): ThemeTokens | null {
  if (id === "christmas") return christmasTheme();
  if (id === "default" || id === "") return defaultTheme();
  return null;
}

const themeIdPattern = /^[a-z0-9-]{2,32}$/;
const hexColor = /^#[0-9A-Fa-f]{6}$/;

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  if (!hexColor.test(hex)) throw new Error("Colors must look like #102E26.");
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function validateTheme(theme: ThemeTokens): string | null {
  if (!themeIdPattern.test(theme.id))
    return "Theme id must be a short lowercase name.";
  if (!theme.name.trim()) return "Theme name is required.";
  const colors = [
    theme.background,
    theme.backgroundSecondary,
    theme.text,
    theme.textSecondary,
    theme.accent,
    theme.accentText,
    theme.surface,
    theme.surfaceText,
    theme.surfaceMuted,
  ];
  if (colors.some((color) => !hexColor.test(color)))
    return "Colors must look like #102E26.";
  if (theme.motion !== "none" && theme.motion !== "gentle")
    return "Motion must be none or gentle.";
  if (theme.greetingStyle !== "plain" && theme.greetingStyle !== "festive")
    return "Greeting style must be plain or festive.";
  const pairs: [string, string, string][] = [
    [theme.text, theme.background, "primary text"],
    [theme.textSecondary, theme.background, "secondary text"],
    [theme.surfaceText, theme.surface, "card text"],
    [theme.surfaceMuted, theme.surface, "card details"],
    [theme.accentText, theme.accent, "buttons"],
  ];
  for (const [fg, bg, label] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5)
      return `${label} contrast is too low (${ratio.toFixed(1)}:1). It needs at least 4.5:1.`;
  }
  return null;
}

const entityPattern = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export function validateAction(
  kind: string,
  entityId: string,
  brightnessMin = 1,
  brightnessMax = 100,
): string | null {
  const entity = entityId.trim();
  if (!entityPattern.test(entity))
    return "Enter a Home Assistant entity like light.guest_room.";
  const domain = entity.split(".")[0];
  if (domain === "lock" || domain === "alarm_control_panel") {
    return "Locks and alarms are not available on guest displays.";
  }
  if (kind === "toggle") {
    if (!["light", "switch", "fan", "input_boolean"].includes(domain)) {
      return "On/off actions can use a light, switch, fan, or input boolean.";
    }
    return null;
  }
  if (kind === "brightness") {
    if (domain !== "light") return "Brightness is only for lights.";
    if (
      brightnessMin < 1 ||
      brightnessMax > 100 ||
      brightnessMin >= brightnessMax
    ) {
      return "Brightness must stay between 1 and 100.";
    }
    return null;
  }
  if (kind === "script") {
    return domain === "script"
      ? null
      : "Script actions must use a script entity.";
  }
  return "Unknown action type.";
}

export function clampBrightness(
  level: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, Math.round(level)));
}

export function searchGuide(
  entries: GuideEntry[],
  query: string,
): GuideEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle)
    return [...entries].sort((a, b) => a.title.localeCompare(b.title));
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, needle) }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title),
    );
  return scored.map((item) => item.entry);
}

function scoreEntry(entry: GuideEntry, needle: string): number {
  const title = entry.title.toLocaleLowerCase();
  if (title.includes(needle)) return 100;
  if (title.split(/\s+/).some((word) => word.startsWith(needle))) return 80;
  if (
    entry.synonyms.some((synonym) =>
      synonym.toLocaleLowerCase().includes(needle),
    )
  )
    return 60;
  if (entry.category.toLocaleLowerCase().includes(needle)) return 40;
  if (`${entry.location} ${entry.details}`.toLocaleLowerCase().includes(needle))
    return 20;
  return 0;
}

export function groupEvents(events: VisitEvent[], timeZone: string, now: Date) {
  const today = localDate(now, timeZone);
  const sorted = [...events].sort((a, b) =>
    eventSortKey(a).localeCompare(eventSortKey(b)),
  );
  return {
    today: sorted.filter((event) => eventDay(event, timeZone) === today),
    upcoming: sorted.filter((event) => eventDay(event, timeZone) > today),
    earlier: sorted.filter((event) => eventDay(event, timeZone) < today),
  };
}

function eventDay(event: VisitEvent, timeZone: string): string {
  if (event.allDay) return event.eventDate;
  if (!event.startsAt) return "";
  return localDate(new Date(event.startsAt), timeZone);
}

function eventSortKey(event: VisitEvent): string {
  if (event.allDay) return `${event.eventDate}T00:00:00`;
  return event.startsAt ?? "";
}

export function formatEventWhen(event: VisitEvent, timeZone: string): string {
  if (event.allDay) return "All day";
  if (!event.startsAt) return "";
  const start = formatTime(event.startsAt, timeZone);
  if (!event.endsAt) return start;
  return `${start}–${formatTime(event.endsAt, timeZone)}`;
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatLongDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function formatShortTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export type ShownNote = HouseholdNote & {
  delivery: "synced" | "pending" | "failed";
  error: string;
};

export function mergeNotes(
  server: HouseholdNote[],
  outbox: PendingNote[],
): ShownNote[] {
  const seen = new Set(server.map((note) => note.clientRequestId));
  const synced: ShownNote[] = server.map((note) => ({
    ...note,
    delivery: "synced",
    error: "",
  }));
  const local: ShownNote[] = outbox
    .filter((note) => !seen.has(note.clientRequestId))
    .map((note) => ({
      id: note.clientRequestId,
      clientRequestId: note.clientRequestId,
      authorName: note.authorName,
      body: note.body,
      createdAt: note.createdAt,
      seq: Number.MAX_SAFE_INTEGER,
      delivery: note.status === "failed" ? "failed" : "pending",
      error: note.error,
    }));
  return [...synced, ...local].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 65 || code === 82) return "Heavy rain";
  if ((code >= 61 && code <= 67) || code === 80 || code === 81) return "Rain";
  if (code === 75 || code === 86) return "Heavy snow";
  if ((code >= 71 && code <= 77) || code === 85) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Forecast";
}
