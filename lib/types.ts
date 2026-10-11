export const API_VERSION = 1;
export const API_HEADER = "Grata-API-Version";

export type Surface = "ipad" | "tv";
export type WiFiSecurity = "WPA" | "WEP" | "nopass";
export type TemperatureUnit = "fahrenheit" | "celsius";
export type ActionKind = "toggle" | "brightness" | "script";

export type ThemeTokens = {
  id: string;
  name: string;
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  surface: string;
  surfaceText: string;
  surfaceMuted: string;
  motion: "none" | "gentle";
  greetingStyle: "plain" | "festive";
};

export type Guest = {
  id: string;
  displayName: string;
  initials: string;
  avatarURL: string;
};

export type Visit = {
  id: string;
  title: string;
  message: string;
  startsOn: string;
  endsOn: string;
  guests: Guest[];
  coverURL: string;
};

export type WiFiInfo = {
  ssid: string;
  password: string | null;
  passwordHidden: boolean;
  qrPayload: string;
  qrDataURL: string;
};

export type LocationInfo = {
  addressLine: string;
  postalCode: string;
};

export type Weather = {
  stale: boolean;
  fetchedAt: string;
  unit: TemperatureUnit;
  current: { temperature: number; code: number; label: string };
  daily: {
    date: string;
    code: number;
    label: string;
    high: number;
    low: number;
  }[];
};

export type RoomAction = {
  id: string;
  label: string;
  kind: ActionKind;
  availability: "ok" | "unavailable" | "not_configured";
  power: string;
  brightness: number | null;
  message: string;
};

export type VisitEvent = {
  id: string;
  title: string;
  allDay: boolean;
  eventDate: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  notes: string;
  link: string;
};

export type MapPin = {
  id: string;
  title: string;
  description: string;
  category: string;
  roomId: string;
  roomName: string;
  x: number;
  y: number;
  photoURL: string;
};

export type GuideEntry = {
  id: string;
  title: string;
  synonyms: string[];
  category: string;
  location: string;
  details: string;
  pinId: string;
  photoURL: string;
};

export type HouseholdNote = {
  id: string;
  clientRequestId: string;
  authorName: string;
  body: string;
  createdAt: string;
  seq: number;
};

export type Snapshot = {
  apiVersion: number;
  syncedAt: string;
  timeZone: string;
  household: { id: string; name: string };
  device: {
    id: string;
    name: string;
    surface: Surface;
    roomId: string;
    roomName: string;
    canPostNotes: boolean;
  };
  visit: Visit | null;
  theme: ThemeTokens;
  wifi: WiFiInfo | null;
  location: LocationInfo | null;
  weather: Weather | null;
  actions: RoomAction[];
  events: VisitEvent[];
  map: { imageURL: string; pins: MapPin[] };
  guide: GuideEntry[];
  notes: HouseholdNote[];
  showNotesOnTV: boolean;
};

export type HouseholdSettings = {
  name: string;
  timeZone: string;
  showAddress: boolean;
  addressLine: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  temperatureUnit: TemperatureUnit;
  wifiSSID: string;
  wifiPassword: string;
  wifiHidePassword: boolean;
  wifiSecurity: WiFiSecurity;
  showNotesOnTV: boolean;
  noteExpiryDays: number;
  haBaseURL: string;
  haConfigured: boolean;
};

export type PersonRecord = {
  id: string;
  displayName: string;
  avatarURL: string;
  createdAt: string;
};

export type VisitRecord = {
  id: string;
  title: string;
  message: string;
  startsOn: string;
  endsOn: string;
  themeId: string;
  coverURL: string;
  archived: boolean;
  guestIds: string[];
  events: (VisitEvent & { visitId: string })[];
};

export type DeviceRecord = {
  id: string;
  name: string;
  surface: Surface;
  roomId: string;
  roomName: string;
  canPostNotes: boolean;
  revoked: boolean;
  pairedAt: string;
};

export type ActionRecord = {
  id: string;
  roomId: string;
  label: string;
  kind: ActionKind;
  entityId: string;
  brightnessMin: number;
  brightnessMax: number;
};

export type Overview = {
  household: HouseholdSettings;
  suggestedBaseURL: string;
  activeVisitId: string;
  pinnedVisitId: string;
  rooms: { id: string; name: string }[];
  people: PersonRecord[];
  visits: VisitRecord[];
  devices: DeviceRecord[];
  actions: ActionRecord[];
  pins: MapPin[];
  mapImageURL: string;
  guide: (GuideEntry & { archived: boolean })[];
  notes: HouseholdNote[];
  themes: ThemeTokens[];
};

export type PendingNote = {
  clientRequestId: string;
  authorName: string;
  body: string;
  createdAt: string;
  status: "pending" | "failed";
  error: string;
};

export type PreviewRequest = {
  visitId?: string;
  surface: Surface;
  roomId?: string;
  at?: string;
  visit?: {
    title: string;
    startsOn: string;
    endsOn: string;
    message: string;
    themeId: string;
    guestIds: string[];
  };
};

export type PreviewResponse = {
  preview: true;
  snapshot: Snapshot;
  warnings: string[];
};
