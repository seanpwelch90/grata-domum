"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  formatEventWhen,
  formatShortTime,
  groupEvents,
  mergeNotes,
  searchGuide,
} from "@/lib/domain";
import type { MapPin, Snapshot, Surface } from "@/lib/types";
import { GuestWelcome } from "./GuestWelcome";
import { welcomeBookPalette } from "@/lib/design-tokens";
import type { ActionStates, RunAction } from "./RoomControls";
import { useHouse } from "@/components/display/useHouse";

type Tab = "home" | "itinerary" | "map" | "guide";

export function DisplayApp({ surface }: { surface: Surface }) {
  const house = useHouse(surface);
  const [selectedTab, setTab] = useState<Tab | null>(null);
  const storedTab = useSyncExternalStore(
    subscribeStorage,
    readTab,
    () => "home" as Tab,
  );
  const tab = selectedTab ?? storedTab;
  const [pinId, setPinId] = useState("");
  const { snapshot, phase, offline } = house;

  if (phase === "loading" && !snapshot) {
    return (
      <main className="display loading-screen">
        <p>Opening the house…</p>
      </main>
    );
  }
  if (phase === "unpaired" || !snapshot) {
    return (
      <Pairing surface={surface} error={house.pairError} onPair={house.pair} />
    );
  }

  const theme = snapshot.theme;
  const palette = welcomeBookPalette(theme);
  const style = {
    "--gd-bg": palette.canvas,
    "--gd-bg-2": palette.comfort,
    "--gd-text": palette.ink,
    "--gd-muted": palette.muted,
    "--gd-accent": palette.accent,
    "--gd-accent-text": palette.onAccent,
    "--gd-surface": palette.surface,
    "--gd-ink": palette.cardInk,
    "--gd-soft": palette.cardMuted,
  } as CSSProperties;

  return (
    <div
      className={`display welcome-book ${surface === "tv" ? "tv" : "pad"} ${theme.greetingStyle}`}
      style={style}
    >
      {surface === "ipad" ? (
        <nav className="tabs" aria-label="House">
          {(["home", "itinerary", "map", "guide"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                sessionStorage.setItem("grata.tab", item);
              }}
            >
              {item === "home"
                ? "Home"
                : item === "itinerary"
                  ? "Itinerary"
                  : item === "map"
                    ? "House Map"
                    : "Need Something?"}
            </button>
          ))}
        </nav>
      ) : null}
      <main>
        {house.connection === "incompatible" ? (
          <p className="banner" role="alert">
            This display needs an update to connect to the home server. Cached
            information is read-only.
          </p>
        ) : null}
        {offline ? (
          <p className="banner" role="status">
            Offline. Showing the house as of{" "}
            {formatShortTime(snapshot.syncedAt, snapshot.timeZone)}.
          </p>
        ) : null}
        {surface === "tv" || tab === "home" ? (
          <Home
            snapshot={snapshot}
            surface={surface}
            actions={house.actions}
            onAction={house.runAction}
            readOnly={offline || house.connection === "incompatible"}
            onItinerary={() => setTab("itinerary")}
            onGuide={() => setTab("guide")}
          />
        ) : null}
        {surface === "ipad" && tab === "itinerary" ? (
          <Itinerary snapshot={snapshot} />
        ) : null}
        {surface === "ipad" && tab === "map" ? (
          <HouseMap snapshot={snapshot} pinId={pinId} onSelect={setPinId} />
        ) : null}
        {surface === "ipad" && tab === "guide" ? (
          <NeedSomething
            snapshot={snapshot}
            outbox={house.outbox}
            onPost={house.postNote}
            onRetry={house.retryNote}
            onDiscard={house.discardNote}
            onShowPin={(id) => {
              setPinId(id);
              setTab("map");
              sessionStorage.setItem("grata.tab", "map");
            }}
          />
        ) : null}
        <p className="synced">
          Last updated {formatShortTime(snapshot.syncedAt, snapshot.timeZone)}
        </p>
      </main>
    </div>
  );
}

function Pairing({
  surface,
  error,
  onPair,
}: {
  surface: Surface;
  error: string;
  onPair: (code: string, name?: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(surface === "tv" ? "Apple TV" : "iPad");
  const [pending, setPending] = useState(false);
  return (
    <main className="display pairing">
      <p className="eyebrow">Grata Domum</p>
      <h1>{surface === "tv" ? "Pair this Apple TV" : "Pair this iPad"}</h1>
      <p>
        Enter the code from the home server. This display will then show the
        current visit.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          await onPair(code, name);
          setPending(false);
        }}
      >
        <label>
          Display name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Pairing code
          <input
            className="code-input"
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "Pairing…" : "Pair this display"}
        </button>
      </form>
    </main>
  );
}

function Home({
  snapshot,
  surface,
  actions,
  onAction,
  onItinerary,
  onGuide,
  readOnly,
}: {
  snapshot: Snapshot;
  surface: Surface;
  actions: ActionStates;
  onAction: RunAction;
  onItinerary: () => void;
  onGuide: () => void;
  readOnly: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <GuestWelcome
      snapshot={snapshot}
      surface={surface}
      now={now}
      actions={actions}
      onAction={onAction}
      onItinerary={onItinerary}
      onGuide={onGuide}
      readOnly={readOnly}
    />
  );
}

function Itinerary({ snapshot }: { snapshot: Snapshot }) {
  const groups = groupEvents(snapshot.events, snapshot.timeZone, new Date());
  const sections = [
    ["Today", groups.today],
    ["Coming up", groups.upcoming],
    ["Earlier", groups.earlier],
  ] as const;
  return (
    <section>
      <h1>Itinerary</h1>
      {snapshot.events.length === 0 ? (
        <p className="empty">Nothing planned. Make yourself at home.</p>
      ) : null}
      {sections.map(([label, events]) =>
        events.length ? (
          <div key={label}>
            <h2>{label}</h2>
            <ul className="events">
              {events.map((event) => (
                <li key={event.id} className="card">
                  <h3>{event.title}</h3>
                  <p>
                    {event.allDay
                      ? event.eventDate
                      : event.startsAt
                        ? formatShortTime(event.startsAt, snapshot.timeZone)
                        : ""}{" "}
                    · {formatEventWhen(event, snapshot.timeZone)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  {event.notes ? <p>{event.notes}</p> : null}
                  {event.link && /^https?:\/\//.test(event.link) ? (
                    <a href={event.link} target="_blank" rel="noreferrer">
                      More about {event.title}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

function HouseMap({
  snapshot,
  pinId,
  onSelect,
}: {
  snapshot: Snapshot;
  pinId: string;
  onSelect: (id: string) => void;
}) {
  const [scale, setScale] = useState(1);
  const selected = snapshot.map.pins.find((pin) => pin.id === pinId);
  return (
    <section>
      <h1>House map</h1>
      {!snapshot.map.imageURL && snapshot.map.pins.length === 0 ? (
        <p className="empty">
          Ask your host if you need a hand finding something.
        </p>
      ) : null}
      {snapshot.map.imageURL ? (
        <div className="map-tools">
          <button
            type="button"
            onClick={() => setScale((value) => Math.min(3, value + 0.25))}
          >
            Zoom in
          </button>
          <button
            type="button"
            onClick={() => setScale((value) => Math.max(1, value - 0.25))}
          >
            Zoom out
          </button>
          <button type="button" onClick={() => setScale(1)}>
            Reset
          </button>
        </div>
      ) : (
        <p>Find helpful places in the list below.</p>
      )}
      <div className="map-layout">
        {snapshot.map.imageURL ? (
          <div className="map-frame">
            <div className="map-stage" style={{ width: `${scale * 100}%` }}>
              <img src={snapshot.map.imageURL} alt="House floor" />
              {snapshot.map.pins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className="map-pin"
                  style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                  aria-pressed={pin.id === pinId}
                  onClick={() => onSelect(pin.id)}
                >
                  {pin.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ul className="pin-list">
          {snapshot.map.pins.map((pin) => (
            <li key={pin.id}>
              <button
                type="button"
                aria-pressed={pin.id === pinId}
                onClick={() => onSelect(pin.id)}
              >
                {pin.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected ? <PinDetail pin={selected} /> : null}
    </section>
  );
}

function PinDetail({ pin }: { pin: MapPin }) {
  return (
    <article className="card">
      <h2>{pin.title}</h2>
      {pin.category ? <p>{pin.category}</p> : null}
      <p>{pin.description || "No extra directions yet."}</p>
      {pin.roomName ? <p>{pin.roomName}</p> : null}
      {pin.photoURL ? <img src={pin.photoURL} alt="" /> : null}
    </article>
  );
}

function NeedSomething({
  snapshot,
  outbox,
  onPost,
  onRetry,
  onDiscard,
  onShowPin,
}: {
  snapshot: Snapshot;
  outbox: {
    clientRequestId: string;
    authorName: string;
    body: string;
    createdAt: string;
    status: "pending" | "failed";
    error: string;
  }[];
  onPost: (author: string, body: string) => Promise<string>;
  onRetry: (id: string) => Promise<void>;
  onDiscard: (id: string) => void;
  onShowPin: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("find");
  const [posting, setPosting] = useState(false);
  const [authorDraft, setAuthor] = useState<string | null>(null);
  const savedAuthor = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem("grata.author") || "",
    () => "",
  );
  const author = authorDraft ?? savedAuthor;
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const results = searchGuide(snapshot.guide, query);
  const notes = mergeNotes(snapshot.notes, outbox);
  return (
    <div className="need">
      <nav className="tabs" aria-label="Helpful information">
        <button aria-pressed={mode === "find"} onClick={() => setMode("find")}>
          Find something
        </button>
        <button
          aria-pressed={mode === "notes"}
          onClick={() => setMode("notes")}
        >
          House notes
        </button>
      </nav>
      <section hidden={mode !== "find"}>
        <h1>Need something?</h1>
        <label>
          Where is it?
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Towels, coffee, trash…"
          />
        </label>
        {query && results.length === 0 ? (
          <p className="empty">
            Couldn’t find that. Try another word, or ask your host.
          </p>
        ) : null}
        <ul className="results">
          {results.map((entry) => (
            <li key={entry.id} className="card">
              <h2>
                {entry.title} — {entry.location}
              </h2>
              {entry.details ? <p>{entry.details}</p> : null}
              {entry.photoURL ? (
                <img
                  className="guide-photo"
                  src={entry.photoURL}
                  alt={entry.title}
                />
              ) : null}
              {entry.pinId &&
              snapshot.map.pins.some((p) => p.id === entry.pinId) ? (
                <button type="button" onClick={() => onShowPin(entry.pinId)}>
                  Show on the map
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section hidden={mode !== "notes"}>
        <h2>Notes for the house</h2>
        <p>Everyone using the house displays can see these notes.</p>
        {snapshot.device.canPostNotes ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (posting) return;
              setPosting(true);
              const error = await onPost(author, body);
              setPosting(false);
              setMessage(error || "Left on the board.");
              if (!error) setBody("");
            }}
          >
            <label>
              Your name
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
              />
            </label>
            <label>
              Note
              <textarea
                maxLength={280}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <small>{body.length} / 280</small>
            <button type="submit" disabled={posting}>
              {posting ? "Saving…" : "Post to house"}
            </button>
            {message ? <p role="status">{message}</p> : null}
          </form>
        ) : (
          <p>This display can read notes, but it cannot post them.</p>
        )}
        {notes.length === 0 ? (
          <p className="empty">No notes on the board yet.</p>
        ) : null}
        <ul className="notes">
          {notes.map((note) => (
            <li key={note.clientRequestId} className="card">
              <p>{note.body}</p>
              <p className="fine">
                {note.authorName} ·{" "}
                {formatShortTime(note.createdAt, snapshot.timeZone)}
                {note.delivery === "pending" ? " · Sending" : ""}
                {note.delivery === "failed" ? ` · ${note.error}` : ""}
              </p>
              {note.delivery === "failed" ? (
                <div className="row">
                  <button
                    type="button"
                    onClick={() => onRetry(note.clientRequestId)}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => onDiscard(note.clientRequestId)}
                  >
                    Discard
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function subscribeStorage(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
function readTab(): Tab {
  const value = sessionStorage.getItem("grata.tab");
  return value === "itinerary" || value === "map" || value === "guide"
    ? value
    : "home";
}
