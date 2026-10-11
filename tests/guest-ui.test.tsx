import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuestWelcome } from "@/components/display/GuestWelcome";
import fixture from "@/contracts/fixtures/default.json";
import longFixture from "@/contracts/fixtures/long-names-many-guests.json";
import type { Snapshot } from "@/lib/types";

const snapshot = fixture as Snapshot;
const now = new Date(snapshot.syncedAt);

describe("Welcome Book guest composition", () => {
  it("keeps preview room commands disabled without session callbacks", () => {
    const html = renderToStaticMarkup(
      <GuestWelcome snapshot={snapshot} surface="ipad" now={now} />,
    );
    expect(html).toContain("Preview · room controls are disabled.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Turn on<\/button>/);
    expect(html).not.toContain("/api/v1/actions");
  });
  it("keeps unavailable room controls free of server setup jargon", () => {
    const unavailable: Snapshot = {
      ...snapshot,
      actions: snapshot.actions.map((action) => ({
        ...action,
        availability: "not_configured",
        message: "Home Assistant is not configured.",
      })),
    };
    const html = renderToStaticMarkup(
      <GuestWelcome snapshot={unavailable} surface="ipad" now={now} />,
    );
    expect(html).toContain("Unavailable. Please ask your host.");
    expect(html).not.toContain("Home Assistant");
    expect(html).not.toContain("not configured");
  });
  it("never renders room commands on TV, even when supplied actions and a callback", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(
      <GuestWelcome
        snapshot={snapshot}
        surface="tv"
        now={now}
        onAction={onAction}
      />,
    );
    expect(html).not.toContain("Make it comfortable.");
    expect(html).not.toContain("Bedside lamp");
    expect(html).toContain("10:00 AM");
    expect(html).not.toContain("Dec 24, 10:00 AM");
    expect(onAction).not.toHaveBeenCalled();
  });
  it("keeps confirmed power separate from pending feedback and disables offline actions", () => {
    const html = renderToStaticMarkup(
      <GuestWelcome
        snapshot={snapshot}
        surface="ipad"
        now={now}
        onAction={vi.fn()}
        readOnly
        actions={{
          [snapshot.actions[0].id]: {
            pending: true,
            message: "We could not confirm the change.",
          },
        }}
      />,
    );
    expect(html).toContain("Off");
    expect(html).toContain("Working…");
    expect(html).toContain("We could not confirm the change.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Working…<\/button>/);
  });
  it("uses supplied custom surface colors and refreshes legacy built-in presentation", () => {
    const custom = {
      ...snapshot,
      theme: {
        ...snapshot.theme,
        id: "custom",
        surface: "#112233",
        surfaceText: "#FFFFFF",
        surfaceMuted: "#EEEEEE",
      },
    };
    const html = renderToStaticMarkup(
      <GuestWelcome snapshot={custom} surface="ipad" now={now} />,
    );
    expect(html).toContain("--guest-welcome:#112233");
    expect(html).toContain("--guest-card-ink:#FFFFFF");
    const legacy = {
      ...snapshot,
      theme: {
        ...snapshot.theme,
        background: "#010101",
        surfaceText: "#FFFFFF",
      },
    };
    const legacyHTML = renderToStaticMarkup(
      <GuestWelcome snapshot={legacy} surface="ipad" now={now} />,
    );
    expect(legacyHTML).toContain("--guest-bg:#F7F3EA");
    expect(legacyHTML).toContain("--guest-card-ink:#233D35");
  });
  it("uses a complete group greeting while retaining the full host message", () => {
    const long = longFixture as Snapshot;
    const html = renderToStaticMarkup(
      <GuestWelcome snapshot={long} surface="tv" now={now} />,
    );
    expect(html).toContain("Everyone’s here.");
    expect(html).toContain("Welcome home.");
    expect(html).toContain(long.visit!.message);
  });
});
