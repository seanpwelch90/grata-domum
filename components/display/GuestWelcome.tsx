"use client";
import { useState, type CSSProperties } from "react";
import type { Snapshot, Surface } from "@/lib/types";
import {
  formatLongDate,
  formatShortTime,
  joinNames,
  localDate,
} from "@/lib/domain";
import { welcomeBookPalette } from "@/lib/design-tokens";
import { GuestWeather } from "./GuestWeather";
import { GuestArt, GuestIcon } from "./GuestArt";
import {
  RoomControls,
  type ActionStates,
  type RunAction,
} from "./RoomControls";
import "./guest.css";

/** Pure guest composition: absent callbacks make previews inert without a session. */
export function GuestWelcome({
  snapshot: s,
  surface,
  now = new Date(),
  actions,
  onAction,
  onItinerary,
  onGuide,
  readOnly = false,
}: {
  snapshot: Snapshot;
  surface: Surface;
  now?: Date;
  actions?: ActionStates;
  onAction?: RunAction;
  onItinerary?: () => void;
  onGuide?: () => void;
  readOnly?: boolean;
}) {
  const t = s.theme;
  const p = welcomeBookPalette(t);
  const [failedCover, setFailedCover] = useState("");
  const [wifiDetail, setWifiDetail] = useState(false);
  const guests = s.visit?.guests || [];
  const names = joinNames(guests.map((g) => g.displayName));
  const group = guests.length > 4 || names.length > 55;
  const style = {
    "--guest-bg": p.canvas,
    "--guest-ink": p.ink,
    "--guest-muted": p.muted,
    "--guest-surface": p.surface,
    "--guest-card-ink": p.cardInk,
    "--guest-card-muted": p.cardMuted,
    "--guest-accent": p.accent,
    "--guest-accent-ink": p.onAccent,
    "--guest-welcome": p.welcome,
    "--guest-comfort": p.comfort,
    "--guest-plan": p.plan,
    "--guest-weather": p.weather,
    "--guest-edge": p.controlEdge,
    "--guest-caution": p.caution,
    "--guest-caution-surface": p.cautionSurface,
  } as CSSProperties;
  const next = s.events.find((event) =>
    event.allDay
      ? event.eventDate >= localDate(now, s.timeZone)
      : !!event.startsAt && new Date(event.endsAt || event.startsAt) >= now,
  );
  const hasControls =
    surface === "ipad" && !!s.device.roomId && s.actions.length > 0;
  return (
    <section
      className={`guest-welcome guest-${surface} ${hasControls ? "guest-has-controls" : ""}`}
      style={style}
      data-motion={t.motion}
    >
      <header className="guest-meta">
        <span>
          {s.household.name}
          {s.device.roomName ? ` · ${s.device.roomName}` : ""}
        </span>
        {surface === "ipad" && (
          <span>
            {formatLongDate(now, s.timeZone)} · {formatClock(now, s.timeZone)}
          </span>
        )}
      </header>
      <div className="guest-layout">
        <section className="guest-card guest-hero">
          <div className="guest-greeting-copy">
            <h1>
              {group ? (
                <>
                  <span className="guest-phrase">Everyone’s here.</span>
                  <span className="guest-names">Welcome home.</span>
                </>
              ) : names ? (
                <>
                  <span className="guest-phrase">Welcome,</span>
                  <span className="guest-names">{names}.</span>
                </>
              ) : (
                <span className="guest-phrase">Welcome home.</span>
              )}
            </h1>
            {guests.length > 0 && (
              <div className="guest-avatars">
                {guests.slice(0, 5).map((guest) => (
                  <GuestAvatar
                    key={guest.id}
                    name={guest.displayName}
                    url={guest.avatarURL}
                    initials={guest.initials}
                  />
                ))}
                {guests.length > 5 && (
                  <span
                    className="guest-avatar"
                    aria-label={`${guests.length - 5} more guests`}
                  >
                    +{guests.length - 5}
                  </span>
                )}
              </div>
            )}
            {group && surface === "ipad" && (
              <details className="guest-guest-list">
                <summary>Our guests ({guests.length})</summary>
                <p>{guests.map((guest) => guest.displayName).join(", ")}</p>
              </details>
            )}
            <p className="guest-message">
              {s.visit?.message || "We’re glad you’re here."}
            </p>
          </div>
          <div className="guest-art-region">
            {s.visit?.coverURL && s.visit.coverURL !== failedCover ? (
              <img
                className="guest-cover"
                src={s.visit.coverURL}
                alt="A welcome from your host"
                onError={() => setFailedCover(s.visit?.coverURL || "")}
              />
            ) : (
              <GuestArt
                christmas={t.id === "christmas"}
                neutral={t.id !== "default" && t.id !== "christmas"}
              />
            )}
          </div>
        </section>
        {hasControls && (
          <RoomControls
            snapshot={s}
            states={actions}
            onAction={onAction}
            readOnly={readOnly}
          />
        )}
        {s.wifi && (
          <section className="guest-card guest-wifi">
            <h2>
              <GuestIcon name="wifi" />
              Join the Wi-Fi
            </h2>
            <p className="guest-network">{s.wifi.ssid}</p>
            <img
              className="guest-qr"
              src={s.wifi.qrDataURL}
              alt={`Scan with your phone to join ${s.wifi.ssid}`}
            />
            <p className="guest-support">Scan to join.</p>
            {!s.wifi.passwordHidden && s.wifi.password && (
              <p className="guest-password">Password: {s.wifi.password}</p>
            )}
            {surface === "ipad" && (
              <button
                className="guest-text-action"
                type="button"
                aria-expanded={wifiDetail}
                onClick={() => setWifiDetail(!wifiDetail)}
              >
                {wifiDetail ? "Smaller code" : "Enlarge code"}
              </button>
            )}
            {wifiDetail && surface === "ipad" && (
              <img
                className="guest-qr guest-qr-large"
                src={s.wifi.qrDataURL}
                alt={`Larger code to join ${s.wifi.ssid}`}
              />
            )}
          </section>
        )}
        {surface === "ipad" && (
          <>
            <section className="guest-card guest-plan">
              <h2>
                <GuestIcon name="calendar" />
                Up next
              </h2>
              {next ? (
                <>
                  <p className="guest-support">
                    {next.allDay
                      ? next.eventDate
                      : formatShortTime(next.startsAt!, s.timeZone)}
                  </p>
                  <h3>{next.title}</h3>
                  {next.location && <p>{next.location}</p>}
                  <button
                    className="guest-text-action"
                    disabled={!onItinerary}
                    onClick={onItinerary}
                  >
                    See the plan <GuestIcon name="arrow" />
                  </button>
                </>
              ) : (
                <p>Nothing planned. Make yourself at home.</p>
              )}
            </section>
            <section className="guest-card guest-guide">
              <div>
                <h2>
                  <GuestIcon name="guide" />A little help settling in.
                </h2>
                <p className="guest-support">Find your way around the house.</p>
              </div>
              <button
                className="guest-text-action"
                disabled={!onGuide}
                onClick={onGuide}
              >
                Need something? <GuestIcon name="arrow" />
              </button>
            </section>
          </>
        )}
        {(surface === "tv" || s.weather) && (
          <section className="guest-card guest-weather">
            {surface === "tv" && (
              <div className="guest-clock">
                <p className="guest-time">{formatClock(now, s.timeZone)}</p>
                <p className="guest-support">
                  {formatLongDate(now, s.timeZone)}
                </p>
              </div>
            )}
            {s.weather && (
              <GuestWeather
                weather={s.weather}
                timeZone={s.timeZone}
                now={now}
              />
            )}
          </section>
        )}
      </div>
      {surface === "tv" && s.showNotesOnTV && s.notes[0] && (
        <p className="guest-note">
          <strong>{s.notes[0].authorName}:</strong> {s.notes[0].body}
        </p>
      )}
    </section>
  );
}
function GuestAvatar({
  name,
  url,
  initials,
}: {
  name: string;
  url: string;
  initials: string;
}) {
  const [failed, setFailed] = useState("");
  return (
    <span className="guest-avatar" aria-label={name}>
      {url && url !== failed ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        initials
      )}
    </span>
  );
}

function formatClock(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}
