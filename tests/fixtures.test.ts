import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { localDate, validateTheme } from "@/lib/domain";
import type { Snapshot } from "@/lib/types";

const root = path.join(process.cwd(), "contracts/fixtures");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
) as {
  clock: string;
  fictional: boolean;
  cases: {
    file: string;
    theme: string;
    visit: string | null;
    guestCount: number;
  }[];
};
// Exercise the same serialized snapshots decoded by GrataDomumKit. These are
// checked-in fictional contracts, not copies of a household database.
function fixture(file: string): Snapshot {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Snapshot;
}

describe("shared native/web snapshot fixtures", () => {
  it("keeps its fixed clock and manifest expectations in sync", () => {
    expect(manifest.fictional).toBe(true);
    expect(Number.isNaN(Date.parse(manifest.clock))).toBe(false);
    for (const entry of manifest.cases) {
      const snapshot = fixture(entry.file);
      expect(snapshot.apiVersion, entry.file).toBe(1);
      expect(snapshot.syncedAt, entry.file).toBe(manifest.clock);
      expect(snapshot.theme.id, entry.file).toBe(entry.theme);
      expect(snapshot.visit?.id ?? null, entry.file).toBe(entry.visit);
      expect(snapshot.visit?.guests.length ?? 0, entry.file).toBe(
        entry.guestCount,
      );
      expect(localDate(new Date(manifest.clock), snapshot.timeZone)).toBe(
        "2026-12-24",
      );
      expect(validateTheme(snapshot.theme), entry.file).toBeNull();
    }
  });

  it("contains renderable references and no server-only action credentials", () => {
    for (const entry of manifest.cases) {
      const snapshot = fixture(entry.file);
      expect(["ipad", "tv"]).toContain(snapshot.device.surface);
      expect(typeof snapshot.device.canPostNotes).toBe("boolean");
      expect(snapshot.household.id).toMatch(/^fixture-/);
      const pins = new Set(snapshot.map.pins.map((pin) => pin.id));
      for (const pin of snapshot.map.pins) {
        expect(pin.x).toBeGreaterThanOrEqual(0);
        expect(pin.x).toBeLessThanOrEqual(1);
        expect(pin.y).toBeGreaterThanOrEqual(0);
        expect(pin.y).toBeLessThanOrEqual(1);
      }
      for (const item of snapshot.guide) {
        if (item.pinId) expect(pins.has(item.pinId)).toBe(true);
        expect(Array.isArray(item.synonyms)).toBe(true);
      }
      for (const action of snapshot.actions) {
        expect(["ok", "unavailable", "not_configured"]).toContain(
          action.availability,
        );
        expect(action).not.toHaveProperty("entityId");
        expect(action).not.toHaveProperty("token");
      }
      for (const event of snapshot.events) {
        if (event.allDay)
          expect(event.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        else expect(Number.isNaN(Date.parse(event.startsAt ?? ""))).toBe(false);
      }
      expect(snapshot).not.toHaveProperty("haToken");
      expect(snapshot.device).not.toHaveProperty("deviceToken");
      for (const guest of snapshot.visit?.guests ?? []) {
        expect(guest.displayName.length).toBeGreaterThan(0);
        expect(guest.initials.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves the exceptional states that drive guest fallbacks", () => {
    const missing = fixture("missing-optional.json");
    expect(missing.wifi).toBeNull();
    expect(missing.weather).toBeNull();
    expect(missing.location).toBeNull();
    expect(fixture("no-visit.json").visit).toBeNull();
    expect(fixture("stale-weather.json").weather?.stale).toBe(true);
    expect(
      fixture("unavailable-actions.json").actions.every(
        (action) => action.availability !== "ok",
      ),
    ).toBe(true);
    const crowded = fixture("long-names-many-guests.json");
    expect(crowded.visit?.guests).toHaveLength(8);
    expect(crowded.visit?.message).toHaveLength(280);
  });
});
