import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "node:crypto";
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementResultingChanges,
} from "node:sqlite";
import {
  checkPassword,
  hashPassword,
  hashToken,
  newId,
  newToken,
  pairingCode,
} from "@/lib/auth";
import { localDate } from "@/lib/domain";
import type {
  ActionKind,
  Surface,
  TemperatureUnit,
  ThemeTokens,
  WiFiSecurity,
} from "@/lib/types";

export class StoreError extends Error {
  constructor(
    public code: "not_found" | "conflict" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

export type HouseholdRow = {
  id: string;
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
  activeVisitOverride: string;
  haBaseURL: string;
  haToken: string;
};

type SqlRow = Record<string, SQLInputValue>;

export class Store {
  readonly db: DatabaseSync;
  readonly mediaDir: string;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.mediaDir =
      filename === ":memory:"
        ? fs.mkdtempSync(path.join(os.tmpdir(), "grata-"))
        : path.join(path.dirname(filename), "media");
    fs.mkdirSync(this.mediaDir, { recursive: true });
    if (filename !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS household (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        show_address INTEGER NOT NULL DEFAULT 0,
        address_line TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        temperature_unit TEXT NOT NULL DEFAULT 'fahrenheit',
        wifi_ssid TEXT NOT NULL DEFAULT '',
        wifi_password TEXT NOT NULL DEFAULT '',
        wifi_hide_password INTEGER NOT NULL DEFAULT 0,
        wifi_security TEXT NOT NULL DEFAULT 'WPA',
        show_notes_on_tv INTEGER NOT NULL DEFAULT 1,
        note_expiry_days INTEGER NOT NULL DEFAULT 14,
        active_visit_override TEXT NOT NULL DEFAULT '',
        ha_base_url TEXT NOT NULL DEFAULT '',
        ha_token TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        avatar_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        theme_id TEXT NOT NULL DEFAULT 'default',
        cover_path TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS visit_guests (
        visit_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (visit_id, person_id),
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL,
        title TEXT NOT NULL,
        all_day INTEGER NOT NULL DEFAULT 0,
        event_date TEXT NOT NULL DEFAULT '',
        starts_at TEXT NOT NULL DEFAULT '',
        ends_at TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        surface TEXT NOT NULL,
        room_id TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        can_post_notes INTEGER NOT NULL DEFAULT 1,
        revoked INTEGER NOT NULL DEFAULT 0,
        paired_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        tokens_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS map (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        image_path TEXT NOT NULL DEFAULT ''
      );
      INSERT OR IGNORE INTO map (id, image_path) VALUES (1, '');
      CREATE TABLE IF NOT EXISTS pins (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        room_id TEXT,
        x REAL NOT NULL,
        y REAL NOT NULL,
        photo_path TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS guide_entries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        synonyms_json TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        photo_path TEXT NOT NULL DEFAULT '',
        pin_id TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS notes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        client_request_id TEXT NOT NULL UNIQUE,
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        removed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        brightness_min INTEGER NOT NULL DEFAULT 1,
        brightness_max INTEGER NOT NULL DEFAULT 100,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS weather_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
    `);
    // One immutable public installation ID, including before household setup.
    // INSERT OR IGNORE keeps concurrent initializers from replacing the winner.
    this.run(
      "INSERT OR IGNORE INTO server_metadata (key, value) VALUES ('server_id', ?)",
      randomUUID(),
    );
  }

  serverId(): string {
    return String(
      this.get("SELECT value FROM server_metadata WHERE key = 'server_id'")
        ?.value,
    );
  }

  private run(
    sql: string,
    ...params: SQLInputValue[]
  ): StatementResultingChanges {
    return this.db.prepare(sql).run(...params);
  }

  private get(sql: string, ...params: SQLInputValue[]): SqlRow | undefined {
    return this.db.prepare(sql).get(...params) as SqlRow | undefined;
  }

  private all(sql: string, ...params: SQLInputValue[]): SqlRow[] {
    return this.db.prepare(sql).all(...params) as SqlRow[];
  }

  private tx(fn: () => void) {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  isSetup(): boolean {
    const row = this.get("SELECT COUNT(*) AS n FROM admins");
    return Number(row?.n ?? 0) > 0;
  }

  setup(name: string, password: string, timeZone: string) {
    if (this.isSetup())
      throw new StoreError("conflict", "This home server is already set up.");
    this.tx(() => {
      this.run(
        "INSERT INTO admins (id, password_hash) VALUES (?, ?)",
        newId(),
        hashPassword(password),
      );
      this.run(
        `INSERT INTO household (id, name, time_zone) VALUES (?, ?, ?)`,
        newId(),
        name,
        timeZone,
      );
    });
  }

  checkPassword(password: string): boolean {
    const row = this.get("SELECT password_hash FROM admins LIMIT 1");
    if (!row?.password_hash || typeof row.password_hash !== "string")
      return false;
    return checkPassword(row.password_hash, password);
  }

  createSession(now: Date): string {
    const token = newToken();
    const expires = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    this.run(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)",
      token.hash,
      expires,
    );
    return token.raw;
  }

  validSession(raw: string, now: Date): boolean {
    const row = this.get(
      "SELECT expires_at FROM sessions WHERE token_hash = ?",
      hashToken(raw),
    );
    if (!row?.expires_at || typeof row.expires_at !== "string") return false;
    return new Date(row.expires_at).getTime() > now.getTime();
  }

  deleteSession(raw: string) {
    this.run("DELETE FROM sessions WHERE token_hash = ?", hashToken(raw));
  }

  household(): HouseholdRow {
    const row = this.get(`SELECT * FROM household LIMIT 1`);
    if (!row)
      throw new StoreError("not_found", "The home server is not set up yet.");
    return {
      id: String(row.id),
      name: String(row.name),
      timeZone: String(row.time_zone),
      showAddress: Number(row.show_address) === 1,
      addressLine: String(row.address_line),
      postalCode: String(row.postal_code),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      temperatureUnit:
        row.temperature_unit === "celsius" ? "celsius" : "fahrenheit",
      wifiSSID: String(row.wifi_ssid),
      wifiPassword: String(row.wifi_password),
      wifiHidePassword: Number(row.wifi_hide_password) === 1,
      wifiSecurity: (row.wifi_security === "WEP" ||
      row.wifi_security === "nopass"
        ? row.wifi_security
        : "WPA") as WiFiSecurity,
      showNotesOnTV: Number(row.show_notes_on_tv) === 1,
      noteExpiryDays: Number(row.note_expiry_days),
      activeVisitOverride: String(row.active_visit_override),
      haBaseURL: String(row.ha_base_url),
      haToken: String(row.ha_token),
    };
  }

  updateSettings(settings: Omit<HouseholdRow, "id" | "activeVisitOverride">) {
    this.run(
      `UPDATE household SET name = ?, time_zone = ?, show_address = ?, address_line = ?, postal_code = ?,
        latitude = ?, longitude = ?, temperature_unit = ?, wifi_ssid = ?, wifi_password = ?,
        wifi_hide_password = ?, wifi_security = ?, show_notes_on_tv = ?, note_expiry_days = ?,
        ha_base_url = ?, ha_token = ?`,
      settings.name,
      settings.timeZone,
      settings.showAddress ? 1 : 0,
      settings.addressLine,
      settings.postalCode,
      settings.latitude,
      settings.longitude,
      settings.temperatureUnit,
      settings.wifiSSID,
      settings.wifiPassword,
      settings.wifiHidePassword ? 1 : 0,
      settings.wifiSecurity,
      settings.showNotesOnTV ? 1 : 0,
      settings.noteExpiryDays,
      settings.haBaseURL,
      settings.haToken,
    );
  }

  setActiveVisit(id: string) {
    if (id) {
      const row = this.get("SELECT archived FROM visits WHERE id = ?", id);
      if (!row)
        throw new StoreError("not_found", "That visit is no longer there.");
      if (Number(row.archived) === 1)
        throw new StoreError("invalid", "Archived visits cannot be shown.");
    }
    this.run("UPDATE household SET active_visit_override = ?", id);
  }

  rooms() {
    return this.all("SELECT id, name FROM rooms ORDER BY sort_order, name").map(
      (row) => ({
        id: String(row.id),
        name: String(row.name),
      }),
    );
  }

  createRoom(name: string) {
    const id = newId();
    const sort = Number(
      this.get("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM rooms")?.n ??
        1,
    );
    this.run(
      "INSERT INTO rooms (id, name, sort_order) VALUES (?, ?, ?)",
      id,
      name,
      sort,
    );
    return { id, name };
  }

  updateRoom(id: string, name: string) {
    this.ensure("SELECT COUNT(*) AS n FROM rooms WHERE id = ?", id);
    this.run("UPDATE rooms SET name = ? WHERE id = ?", name, id);
  }

  deleteRoom(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM rooms WHERE id = ?", id);
    this.run("DELETE FROM rooms WHERE id = ?", id);
  }

  people() {
    return this.all(
      "SELECT id, display_name, avatar_path, created_at FROM people ORDER BY display_name",
    ).map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      avatarPath: String(row.avatar_path),
      createdAt: String(row.created_at),
    }));
  }

  createPerson(name: string, now: Date) {
    const id = newId();
    const createdAt = now.toISOString();
    this.run(
      "INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)",
      id,
      name,
      createdAt,
    );
    return { id, displayName: name, avatarPath: "", createdAt };
  }

  updatePerson(id: string, name: string) {
    this.ensure("SELECT COUNT(*) AS n FROM people WHERE id = ?", id);
    this.run("UPDATE people SET display_name = ? WHERE id = ?", name, id);
  }

  setAvatar(id: string, relPath: string) {
    this.ensure("SELECT COUNT(*) AS n FROM people WHERE id = ?", id);
    this.run("UPDATE people SET avatar_path = ? WHERE id = ?", relPath, id);
  }

  deletePerson(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM people WHERE id = ?", id);
    this.run("DELETE FROM people WHERE id = ?", id);
  }

  visits() {
    const visits = this.all(
      "SELECT id, title, message, starts_on, ends_on, theme_id, cover_path, archived, created_at FROM visits ORDER BY starts_on, title",
    ).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      message: String(row.message),
      startsOn: String(row.starts_on),
      endsOn: String(row.ends_on),
      themeId: String(row.theme_id),
      coverPath: String(row.cover_path),
      archived: Number(row.archived) === 1,
      createdAt: String(row.created_at),
      guestIds: [] as string[],
      events: [] as ReturnType<Store["mapEvent"]>[],
    }));
    const index = new Map(visits.map((visit, i) => [visit.id, i]));
    for (const row of this.all(
      "SELECT visit_id, person_id FROM visit_guests ORDER BY sort_order",
    )) {
      const visit = visits[index.get(String(row.visit_id)) ?? -1];
      if (visit) visit.guestIds.push(String(row.person_id));
    }
    for (const row of this.all(
      "SELECT id, visit_id, title, all_day, event_date, starts_at, ends_at, location, notes, link FROM events",
    )) {
      const event = this.mapEvent(row);
      const visit = visits[index.get(event.visitId) ?? -1];
      if (visit) visit.events.push(event);
    }
    return visits;
  }

  private mapEvent(row: SqlRow) {
    return {
      id: String(row.id),
      visitId: String(row.visit_id),
      title: String(row.title),
      allDay: Number(row.all_day) === 1,
      eventDate: String(row.event_date ?? ""),
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      location: String(row.location ?? ""),
      notes: String(row.notes ?? ""),
      link: String(row.link ?? ""),
    };
  }

  createVisit(
    input: {
      title: string;
      message: string;
      startsOn: string;
      endsOn: string;
      themeId: string;
      guestIds?: string[];
    },
    now: Date,
  ) {
    const id = newId();
    const save = () => {
      this.run(
        "INSERT INTO visits (id, title, message, starts_on, ends_on, theme_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        input.title,
        input.message,
        input.startsOn,
        input.endsOn,
        input.themeId,
        now.toISOString(),
      );
      if (input.guestIds !== undefined) this.replaceGuests(id, input.guestIds);
    };
    if (input.guestIds !== undefined) {
      this.validateGuestIds(input.guestIds);
      this.tx(save);
    } else save();
    return id;
  }

  updateVisit(
    id: string,
    input: {
      title: string;
      message: string;
      startsOn: string;
      endsOn: string;
      themeId: string;
      guestIds?: string[];
    },
  ) {
    this.ensure("SELECT COUNT(*) AS n FROM visits WHERE id = ?", id);
    const save = () => {
      this.run(
        "UPDATE visits SET title = ?, message = ?, starts_on = ?, ends_on = ?, theme_id = ? WHERE id = ?",
        input.title,
        input.message,
        input.startsOn,
        input.endsOn,
        input.themeId,
        id,
      );
      if (input.guestIds !== undefined) this.replaceGuests(id, input.guestIds);
    };
    if (input.guestIds !== undefined) {
      this.validateGuestIds(input.guestIds);
      this.tx(save);
    } else save();
  }

  archiveVisit(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM visits WHERE id = ?", id);
    this.tx(() => {
      this.run("UPDATE visits SET archived = 1 WHERE id = ?", id);
      this.run(
        "UPDATE household SET active_visit_override = '' WHERE active_visit_override = ?",
        id,
      );
    });
  }

  setCover(id: string, relPath: string) {
    this.ensure("SELECT COUNT(*) AS n FROM visits WHERE id = ?", id);
    this.run("UPDATE visits SET cover_path = ? WHERE id = ?", relPath, id);
  }

  setGuests(visitId: string, personIds: string[]) {
    this.ensure("SELECT COUNT(*) AS n FROM visits WHERE id = ?", visitId);
    this.validateGuestIds(personIds);
    this.tx(() => this.replaceGuests(visitId, personIds));
  }

  validateGuestIds(personIds: string[]) {
    if (new Set(personIds).size !== personIds.length)
      throw new StoreError("invalid", "Choose each guest only once.");
    const people = new Set(this.people().map((person) => person.id));
    for (const personId of personIds) {
      if (!people.has(personId))
        throw new StoreError(
          "invalid",
          "One of those guests is no longer saved.",
        );
    }
  }

  private replaceGuests(visitId: string, personIds: string[]) {
    this.run("DELETE FROM visit_guests WHERE visit_id = ?", visitId);
    personIds.forEach((personId, index) => {
      const person = this.get(
        "SELECT COUNT(*) AS n FROM people WHERE id = ?",
        personId,
      );
      if (Number(person?.n ?? 0) === 0)
        throw new StoreError(
          "invalid",
          "One of those guests is no longer saved.",
        );
      this.run(
        "INSERT INTO visit_guests (visit_id, person_id, sort_order) VALUES (?, ?, ?)",
        visitId,
        personId,
        index,
      );
    });
  }

  createEvent(event: ReturnType<Store["mapEvent"]>) {
    this.ensure("SELECT COUNT(*) AS n FROM visits WHERE id = ?", event.visitId);
    const id = newId();
    this.run(
      `INSERT INTO events (id, visit_id, title, all_day, event_date, starts_at, ends_at, location, notes, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      event.visitId,
      event.title,
      event.allDay ? 1 : 0,
      event.eventDate,
      event.startsAt ?? "",
      event.endsAt ?? "",
      event.location,
      event.notes,
      event.link,
    );
    return id;
  }

  updateEvent(event: ReturnType<Store["mapEvent"]>) {
    this.ensure("SELECT COUNT(*) AS n FROM events WHERE id = ?", event.id);
    this.run(
      `UPDATE events SET title = ?, all_day = ?, event_date = ?, starts_at = ?, ends_at = ?, location = ?, notes = ?, link = ? WHERE id = ?`,
      event.title,
      event.allDay ? 1 : 0,
      event.eventDate,
      event.startsAt ?? "",
      event.endsAt ?? "",
      event.location,
      event.notes,
      event.link,
      event.id,
    );
  }

  deleteEvent(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM events WHERE id = ?", id);
    this.run("DELETE FROM events WHERE id = ?", id);
  }

  createPairingCode(now: Date): { code: string; expiresAt: string } {
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = pairingCode();
      try {
        this.run(
          "INSERT INTO pairing_codes (code, expires_at, used) VALUES (?, ?, 0)",
          code,
          expiresAt,
        );
        return { code, expiresAt };
      } catch {
        // try another code
      }
    }
    throw new StoreError(
      "conflict",
      "Could not create a pairing code. Try again.",
    );
  }

  redeemPairing(code: string, name: string, surface: Surface, now: Date) {
    let deviceId = "";
    let rawToken = "";
    this.tx(() => {
      const row = this.get(
        "SELECT used, expires_at FROM pairing_codes WHERE code = ?",
        code.trim().toUpperCase(),
      );
      if (
        !row ||
        Number(row.used) === 1 ||
        new Date(String(row.expires_at)).getTime() <= now.getTime()
      ) {
        throw new StoreError(
          "not_found",
          "That pairing code is not valid anymore. Create a new one on the home server.",
        );
      }
      const updated = this.run(
        "UPDATE pairing_codes SET used = 1 WHERE code = ? AND used = 0",
        code.trim().toUpperCase(),
      );
      if (Number(updated.changes) !== 1) {
        throw new StoreError(
          "not_found",
          "That pairing code is not valid anymore. Create a new one on the home server.",
        );
      }
      const token = newToken();
      deviceId = newId();
      rawToken = token.raw;
      this.run(
        `INSERT INTO devices (id, name, surface, token_hash, can_post_notes, revoked, paired_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        deviceId,
        name,
        surface,
        token.hash,
        surface === "ipad" ? 1 : 0,
        now.toISOString(),
      );
    });
    return { deviceId, token: rawToken };
  }

  devices() {
    return this.all(
      `SELECT d.id, d.name, d.surface, COALESCE(d.room_id, '') AS room_id, COALESCE(r.name, '') AS room_name,
        d.can_post_notes, d.revoked, d.paired_at
       FROM devices d LEFT JOIN rooms r ON r.id = d.room_id ORDER BY d.paired_at`,
    ).map((row) => this.mapDevice(row));
  }

  deviceByToken(raw: string) {
    const row = this.get(
      `SELECT d.id, d.name, d.surface, COALESCE(d.room_id, '') AS room_id, COALESCE(r.name, '') AS room_name,
        d.can_post_notes, d.revoked, d.paired_at
       FROM devices d LEFT JOIN rooms r ON r.id = d.room_id
       WHERE d.token_hash = ? AND d.revoked = 0`,
      hashToken(raw),
    );
    return row ? this.mapDevice(row) : null;
  }

  private mapDevice(row: SqlRow) {
    return {
      id: String(row.id),
      name: String(row.name),
      surface: (row.surface === "tv" ? "tv" : "ipad") as Surface,
      roomId: String(row.room_id ?? ""),
      roomName: String(row.room_name ?? ""),
      canPostNotes: Number(row.can_post_notes) === 1,
      revoked: Number(row.revoked) === 1,
      pairedAt: String(row.paired_at),
    };
  }

  updateDevice(
    id: string,
    input: {
      name: string;
      surface: Surface;
      roomId: string;
      canPostNotes: boolean;
    },
  ) {
    this.ensure(
      "SELECT COUNT(*) AS n FROM devices WHERE id = ? AND revoked = 0",
      id,
    );
    if (input.roomId)
      this.ensure(
        "SELECT COUNT(*) AS n FROM rooms WHERE id = ?",
        input.roomId,
        "Choose a room that exists.",
      );
    this.run(
      "UPDATE devices SET name = ?, surface = ?, room_id = ?, can_post_notes = ? WHERE id = ?",
      input.name,
      input.surface,
      input.roomId || null,
      input.canPostNotes ? 1 : 0,
      id,
    );
  }

  revokeDevice(id: string) {
    const result = this.run(
      "UPDATE devices SET revoked = 1 WHERE id = ? AND revoked = 0",
      id,
    );
    if (Number(result.changes) === 0)
      throw new StoreError("not_found", "That display is no longer paired.");
  }

  themes(): ThemeTokens[] {
    const custom = this.all("SELECT tokens_json FROM themes ORDER BY id").map(
      (row) => JSON.parse(String(row.tokens_json)) as ThemeTokens,
    );
    return custom;
  }

  theme(id: string): ThemeTokens | null {
    const row = this.get("SELECT tokens_json FROM themes WHERE id = ?", id);
    return row ? (JSON.parse(String(row.tokens_json)) as ThemeTokens) : null;
  }

  saveTheme(theme: ThemeTokens) {
    this.run(
      "INSERT INTO themes (id, tokens_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET tokens_json = excluded.tokens_json",
      theme.id,
      JSON.stringify(theme),
    );
  }

  deleteTheme(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM themes WHERE id = ?", id);
    this.tx(() => {
      this.run("DELETE FROM themes WHERE id = ?", id);
      this.run("UPDATE visits SET theme_id = 'default' WHERE theme_id = ?", id);
    });
  }

  mapImagePath(): string {
    return String(
      this.get("SELECT image_path FROM map WHERE id = 1")?.image_path ?? "",
    );
  }

  setMapImage(relPath: string) {
    this.run("UPDATE map SET image_path = ? WHERE id = 1", relPath);
  }

  pins() {
    return this.all(
      `SELECT p.id, p.title, p.description, p.category, COALESCE(p.room_id, '') AS room_id,
        COALESCE(r.name, '') AS room_name, p.x, p.y, p.photo_path
       FROM pins p LEFT JOIN rooms r ON r.id = p.room_id ORDER BY p.title`,
    ).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      description: String(row.description),
      category: String(row.category),
      roomId: String(row.room_id),
      roomName: String(row.room_name),
      x: Number(row.x),
      y: Number(row.y),
      photoPath: String(row.photo_path),
    }));
  }

  createPin(pin: {
    title: string;
    description: string;
    category: string;
    roomId: string;
    x: number;
    y: number;
  }) {
    if (pin.roomId)
      this.ensure(
        "SELECT COUNT(*) AS n FROM rooms WHERE id = ?",
        pin.roomId,
        "Choose a room that exists.",
      );
    const id = newId();
    this.run(
      "INSERT INTO pins (id, title, description, category, room_id, x, y) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      pin.title,
      pin.description,
      pin.category,
      pin.roomId || null,
      pin.x,
      pin.y,
    );
    return id;
  }

  updatePin(pin: {
    id: string;
    title: string;
    description: string;
    category: string;
    roomId: string;
    x: number;
    y: number;
  }) {
    this.ensure("SELECT COUNT(*) AS n FROM pins WHERE id = ?", pin.id);
    if (pin.roomId)
      this.ensure(
        "SELECT COUNT(*) AS n FROM rooms WHERE id = ?",
        pin.roomId,
        "Choose a room that exists.",
      );
    this.run(
      "UPDATE pins SET title = ?, description = ?, category = ?, room_id = ?, x = ?, y = ? WHERE id = ?",
      pin.title,
      pin.description,
      pin.category,
      pin.roomId || null,
      pin.x,
      pin.y,
      pin.id,
    );
  }

  setPinPhoto(id: string, relPath: string) {
    this.ensure("SELECT COUNT(*) AS n FROM pins WHERE id = ?", id);
    this.run("UPDATE pins SET photo_path = ? WHERE id = ?", relPath, id);
  }

  deletePin(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM pins WHERE id = ?", id);
    this.tx(() => {
      this.run("UPDATE guide_entries SET pin_id = '' WHERE pin_id = ?", id);
      this.run("DELETE FROM pins WHERE id = ?", id);
    });
  }

  guide(includeArchived: boolean) {
    const sql = includeArchived
      ? "SELECT * FROM guide_entries ORDER BY title"
      : "SELECT * FROM guide_entries WHERE archived = 0 ORDER BY title";
    return this.all(sql).map((row) => this.mapGuide(row));
  }

  private mapGuide(row: SqlRow) {
    let synonyms: string[] = [];
    try {
      const parsed = JSON.parse(String(row.synonyms_json || "[]")) as unknown;
      if (Array.isArray(parsed)) synonyms = parsed.map(String);
    } catch {
      synonyms = [];
    }
    return {
      id: String(row.id),
      title: String(row.title),
      synonyms,
      category: String(row.category),
      location: String(row.location),
      details: String(row.details),
      photoPath: String(row.photo_path),
      pinId: String(row.pin_id),
      archived: Number(row.archived) === 1,
    };
  }

  createGuide(entry: {
    title: string;
    synonyms: string[];
    category: string;
    location: string;
    details: string;
    pinId: string;
  }) {
    if (entry.pinId)
      this.ensure(
        "SELECT COUNT(*) AS n FROM pins WHERE id = ?",
        entry.pinId,
        "Choose a map pin that exists.",
      );
    const id = newId();
    this.run(
      `INSERT INTO guide_entries (id, title, synonyms_json, category, location, details, pin_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      entry.title,
      JSON.stringify(entry.synonyms),
      entry.category,
      entry.location,
      entry.details,
      entry.pinId,
    );
    return id;
  }

  updateGuide(entry: {
    id: string;
    title: string;
    synonyms: string[];
    category: string;
    location: string;
    details: string;
    pinId: string;
  }) {
    if (entry.pinId)
      this.ensure(
        "SELECT COUNT(*) AS n FROM pins WHERE id = ?",
        entry.pinId,
        "Choose a map pin that exists.",
      );
    this.ensure(
      "SELECT COUNT(*) AS n FROM guide_entries WHERE id = ?",
      entry.id,
    );
    this.run(
      `UPDATE guide_entries SET title = ?, synonyms_json = ?, category = ?, location = ?, details = ?, pin_id = ? WHERE id = ?`,
      entry.title,
      JSON.stringify(entry.synonyms),
      entry.category,
      entry.location,
      entry.details,
      entry.pinId,
      entry.id,
    );
  }

  setGuidePhoto(id: string, relPath: string) {
    this.ensure("SELECT COUNT(*) AS n FROM guide_entries WHERE id = ?", id);
    this.run(
      "UPDATE guide_entries SET photo_path = ? WHERE id = ?",
      relPath,
      id,
    );
  }

  archiveGuide(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM guide_entries WHERE id = ?", id);
    this.run("UPDATE guide_entries SET archived = 1 WHERE id = ?", id);
  }

  createNote(
    input: { clientRequestId: string; authorName: string; body: string },
    now: Date,
  ) {
    const existing = this.get(
      "SELECT seq, id, client_request_id, author_name, body, created_at, removed FROM notes WHERE client_request_id = ?",
      input.clientRequestId,
    );
    if (existing) return { note: this.mapNote(existing), created: false };
    const id = newId();
    this.run(
      "INSERT INTO notes (id, client_request_id, author_name, body, created_at, removed) VALUES (?, ?, ?, ?, ?, 0)",
      id,
      input.clientRequestId,
      input.authorName,
      input.body,
      now.toISOString(),
    );
    const created = this.get(
      "SELECT seq, id, client_request_id, author_name, body, created_at, removed FROM notes WHERE client_request_id = ?",
      input.clientRequestId,
    );
    if (!created)
      throw new StoreError("conflict", "The note could not be saved.");
    return { note: this.mapNote(created), created: true };
  }

  notesSince(cutoff: Date) {
    return this.all(
      `SELECT seq, id, client_request_id, author_name, body, created_at, removed
       FROM notes WHERE removed = 0 AND created_at >= ? ORDER BY seq ASC`,
      cutoff.toISOString(),
    ).map((row) => this.mapNote(row));
  }

  private mapNote(row: SqlRow) {
    return {
      seq: Number(row.seq),
      id: String(row.id),
      clientRequestId: String(row.client_request_id),
      authorName: String(row.author_name),
      body: String(row.body),
      createdAt: String(row.created_at),
      removed: Number(row.removed) === 1,
    };
  }

  removeNote(id: string) {
    const result = this.run(
      "UPDATE notes SET removed = 1 WHERE id = ? AND removed = 0",
      id,
    );
    if (Number(result.changes) === 0)
      throw new StoreError("not_found", "That note is no longer there.");
  }

  actions() {
    return this.all(
      "SELECT id, room_id, label, kind, entity_id, brightness_min, brightness_max FROM actions ORDER BY sort_order, label",
    ).map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      label: String(row.label),
      kind: String(row.kind) as ActionKind,
      entityId: String(row.entity_id),
      brightnessMin: Number(row.brightness_min),
      brightnessMax: Number(row.brightness_max),
    }));
  }

  action(id: string) {
    return this.actions().find((item) => item.id === id) ?? null;
  }

  createAction(action: {
    roomId: string;
    label: string;
    kind: ActionKind;
    entityId: string;
    brightnessMin: number;
    brightnessMax: number;
  }) {
    this.ensure(
      "SELECT COUNT(*) AS n FROM rooms WHERE id = ?",
      action.roomId,
      "Choose a room that exists.",
    );
    const id = newId();
    const sort = Number(
      this.get(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM actions WHERE room_id = ?",
        action.roomId,
      )?.n ?? 1,
    );
    this.run(
      `INSERT INTO actions (id, room_id, label, kind, entity_id, brightness_min, brightness_max, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      action.roomId,
      action.label,
      action.kind,
      action.entityId,
      action.brightnessMin,
      action.brightnessMax,
      sort,
    );
    return id;
  }

  updateAction(action: {
    id: string;
    roomId: string;
    label: string;
    kind: ActionKind;
    entityId: string;
    brightnessMin: number;
    brightnessMax: number;
  }) {
    this.ensure("SELECT COUNT(*) AS n FROM actions WHERE id = ?", action.id);
    this.ensure(
      "SELECT COUNT(*) AS n FROM rooms WHERE id = ?",
      action.roomId,
      "Choose a room that exists.",
    );
    this.run(
      "UPDATE actions SET room_id = ?, label = ?, kind = ?, entity_id = ?, brightness_min = ?, brightness_max = ? WHERE id = ?",
      action.roomId,
      action.label,
      action.kind,
      action.entityId,
      action.brightnessMin,
      action.brightnessMax,
      action.id,
    );
  }

  deleteAction(id: string) {
    this.ensure("SELECT COUNT(*) AS n FROM actions WHERE id = ?", id);
    this.run("DELETE FROM actions WHERE id = ?", id);
  }

  weatherCache(): { payload: string; fetchedAt: string } | null {
    const row = this.get(
      "SELECT payload_json, fetched_at FROM weather_cache WHERE id = 1",
    );
    if (!row) return null;
    return {
      payload: String(row.payload_json),
      fetchedAt: String(row.fetched_at),
    };
  }

  setWeatherCache(payload: string, fetchedAt: Date) {
    this.run(
      `INSERT INTO weather_cache (id, payload_json, fetched_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`,
      payload,
      fetchedAt.toISOString(),
    );
  }

  seedSample(now: Date) {
    if (this.visits().length > 0)
      throw new StoreError(
        "conflict",
        "A visit already exists, so the sample was left unused.",
      );
    const home = this.household();
    const today = localDate(now, home.timeZone);
    const end = localDate(
      new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
      home.timeZone,
    );
    this.tx(() => {
      const guestRoom = this.createRoom("Guest room").id;
      this.createRoom("Kitchen");
      this.createRoom("Living room");
      const avery = this.createPerson("Avery Cole", now).id;
      const reese = this.createPerson("Reese Morgan", now).id;
      const visitId = this.createVisit(
        {
          title: "Holiday visit",
          message: "We are glad you are here.",
          startsOn: today,
          endsOn: end,
          themeId: "christmas",
        },
        now,
      );
      this.replaceGuests(visitId, [avery, reese]);
      const dinnerStart = zonedTime(now, home.timeZone, 18, 0);
      const dinnerEnd = new Date(dinnerStart.getTime() + 2 * 60 * 60 * 1000);
      this.createEvent({
        id: "",
        visitId,
        title: "Welcome dinner",
        allDay: false,
        eventDate: "",
        startsAt: dinnerStart.toISOString(),
        endsAt: dinnerEnd.toISOString(),
        location: "Kitchen",
        notes: "Come hungry.",
        link: "",
      });
      this.createEvent({
        id: "",
        visitId,
        title: "Slow morning",
        allDay: true,
        eventDate: localDate(
          new Date(now.getTime() + 24 * 60 * 60 * 1000),
          home.timeZone,
        ),
        startsAt: null,
        endsAt: null,
        location: "Guest room",
        notes: "",
        link: "",
      });
      const pinId = this.createPin({
        title: "Extra towels",
        description: "Upper shelf",
        category: "Supplies",
        roomId: "",
        x: 0.62,
        y: 0.38,
      });
      this.createGuide({
        title: "Extra towels",
        synonyms: ["towels", "bath towels"],
        category: "Supplies",
        location: "Hall closet, upper shelf",
        details: "The blue towels are for guests.",
        pinId,
      });
      this.createGuide({
        title: "Trash and recycling",
        synonyms: ["garbage", "bins"],
        category: "House",
        location: "Garage bin",
        details: "Recycling is the blue bin. Trash goes out Thursday night.",
        pinId: "",
      });
      this.createAction({
        roomId: guestRoom,
        label: "Room lights",
        kind: "toggle",
        entityId: "light.guest_room",
        brightnessMin: 1,
        brightnessMax: 100,
      });
      this.run("UPDATE household SET active_visit_override = ?", visitId);
    });
  }

  private ensure(
    sql: string,
    id: string,
    message = "That item is no longer there.",
  ) {
    const row = this.get(sql, id);
    if (Number(row?.n ?? 0) === 0) throw new StoreError("not_found", message);
  }
}

function zonedTime(
  now: Date,
  timeZone: string,
  hour: number,
  minute: number,
): Date {
  const date = localDate(now, timeZone);
  const guess = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(guess);
  const gotHour = Number(
    shown.find((part) => part.type === "hour")?.value ?? 0,
  );
  const gotMinute = Number(
    shown.find((part) => part.type === "minute")?.value ?? 0,
  );
  const delta = (hour * 60 + minute - (gotHour * 60 + gotMinute)) * 60 * 1000;
  return new Date(guess.getTime() + delta);
}

const globalForStore = globalThis as unknown as { __grata?: Store };

export function getStore(): Store {
  if (!globalForStore.__grata) {
    const dir = process.env.GRATA_DATA || path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    globalForStore.__grata = new Store(path.join(dir, "grata.db"));
  }
  return globalForStore.__grata;
}

export function resetStoreForTests() {
  globalForStore.__grata?.close();
  delete globalForStore.__grata;
}
