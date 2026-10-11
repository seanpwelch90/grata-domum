import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  builtinThemes,
  clampBrightness,
  groupEvents,
  initials,
  joinNames,
  mergeNotes,
  searchGuide,
  selectActiveVisit,
  timeOfDayHello,
  validateAction,
  validateTheme,
  wifiPayload,
} from "@/lib/domain";
import type { GuideEntry } from "@/lib/types";

describe("visits and greetings", () => {
  const visits = [
    {
      id: "past",
      startsOn: "2026-01-01",
      endsOn: "2026-01-03",
      archived: false,
    },
    {
      id: "now",
      startsOn: "2026-09-20",
      endsOn: "2026-09-28",
      archived: false,
    },
    {
      id: "also",
      startsOn: "2026-09-26",
      endsOn: "2026-09-30",
      archived: false,
    },
    {
      id: "later",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
      archived: false,
    },
    {
      id: "archived",
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
      archived: true,
    },
  ];

  it("picks the visit that started most recently and lets a pin win", () => {
    expect(selectActiveVisit("2026-09-26", visits, "")?.id).toBe("also");
    expect(selectActiveVisit("2026-09-26", visits, "later")?.id).toBe("later");
    expect(selectActiveVisit("2026-09-26", visits, "missing")?.id).toBe("also");
    expect(selectActiveVisit("2026-09-26", visits, "archived")?.id).toBe(
      "also",
    );
  });

  it("joins guest names and falls back to initials", () => {
    expect(joinNames(["Maya"])).toBe("Maya");
    expect(joinNames(["Maya", "Jonah"])).toBe("Maya and Jonah");
    expect(joinNames(["Maya", "Jonah", "Sam"])).toBe("Maya, Jonah, and Sam");
    expect(joinNames(["A", "B", "C", "D", "E", "F"])).toBe(
      "A, B, C, and 3 more",
    );
    expect(initials("Mary Jane")).toBe("MJ");
    expect(initials("Maya")).toBe("M");
    expect(initials("   ")).toBe("?");
    expect(
      timeOfDayHello(new Date("2026-09-26T18:00:00Z"), "America/New_York"),
    ).toBe("Good afternoon");
  });
});

describe("wifi and themes", () => {
  it("matches the shared Wi-Fi QR vectors", () => {
    const vectors = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "contracts/wifi.json"), "utf8"),
    ) as {
      security: string;
      ssid: string;
      password: string;
      hidden: boolean;
      payload: string;
    }[];
    for (const vector of vectors) {
      expect(
        wifiPayload(
          vector.security,
          vector.ssid,
          vector.password,
          vector.hidden,
        ),
      ).toBe(vector.payload);
    }
  });

  it("keeps built-in themes readable and rejects pale text", () => {
    for (const theme of builtinThemes())
      expect(validateTheme(theme)).toBeNull();
    const pale = {
      ...builtinThemes()[0],
      id: "pale",
      name: "Pale",
      text: "#F4EFE6",
      textSecondary: "#F4EFE6",
    };
    expect(validateTheme(pale)).toMatch(/contrast/);
  });
});

describe("house controls and guide", () => {
  it("allows lights and rejects locks", () => {
    expect(validateAction("toggle", "light.guest_room")).toBeNull();
    expect(validateAction("brightness", "light.guest_room", 10, 80)).toBeNull();
    expect(validateAction("toggle", "lock.front")).toMatch(/Locks/);
    expect(validateAction("toggle", "alarm_control_panel.home")).toMatch(
      /alarms/,
    );
    expect(clampBrightness(0, 10, 80)).toBe(10);
  });

  it("searches titles before synonyms and locations", () => {
    const entries: GuideEntry[] = [
      {
        id: "1",
        title: "Extra towels",
        synonyms: ["bath towels"],
        category: "Supplies",
        location: "Hall closet, upper shelf",
        details: "",
        pinId: "",
        photoURL: "",
      },
      {
        id: "2",
        title: "Coffee",
        synonyms: [],
        category: "Kitchen",
        location: "Counter",
        details: "Filters are in the drawer.",
        pinId: "",
        photoURL: "",
      },
    ];
    expect(searchGuide(entries, "towel")[0].title).toBe("Extra towels");
    expect(searchGuide(entries, "filters")[0].title).toBe("Coffee");
    expect(searchGuide(entries, "")).toHaveLength(2);
  });

  it("groups today separately and keeps a failed note from posting twice", () => {
    const events = groupEvents(
      [
        {
          id: "a",
          title: "Dinner",
          allDay: false,
          eventDate: "",
          startsAt: "2026-09-26T22:00:00.000Z",
          endsAt: null,
          location: "",
          notes: "",
          link: "",
        },
        {
          id: "b",
          title: "Morning",
          allDay: true,
          eventDate: "2026-09-27",
          startsAt: null,
          endsAt: null,
          location: "",
          notes: "",
          link: "",
        },
      ],
      "America/New_York",
      new Date("2026-09-26T18:00:00Z"),
    );
    expect(events.today.map((event) => event.id)).toEqual(["a"]);
    expect(events.upcoming.map((event) => event.id)).toEqual(["b"]);
    const merged = mergeNotes(
      [
        {
          id: "n1",
          clientRequestId: "req-1",
          authorName: "Avery",
          body: "Hello",
          createdAt: "2026-09-26T18:00:00.000Z",
          seq: 1,
        },
      ],
      [
        {
          clientRequestId: "req-1",
          authorName: "Avery",
          body: "Hello",
          createdAt: "2026-09-26T18:00:00.000Z",
          status: "pending",
          error: "",
        },
        {
          clientRequestId: "req-2",
          authorName: "Avery",
          body: "Later",
          createdAt: "2026-09-26T19:00:00.000Z",
          status: "failed",
          error: "Offline",
        },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(
      merged.find((note) => note.clientRequestId === "req-2")?.delivery,
    ).toBe("failed");
  });
});
