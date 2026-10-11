"use client";
import Link from "next/link";
import { useState } from "react";
import { useHost } from "../shell/context";
import { Upload } from "../ui/Upload";
import { Rooms } from "./Rooms";
import { useUnsaved } from "./useUnsaved";
import type { GuideEntry, MapPin } from "@/lib/types";

export function HouseWorkspace({ tab }: { tab: string }) {
  return (
    <>
      <header className="host-heading">
        <div>
          <p className="host-eyebrow">A home worth knowing</p>
          <h1>House</h1>
          <p className="host-muted">
            Helpful answers, familiar places, and a few thoughtful comforts.
          </p>
        </div>
      </header>
      <nav className="host-subnav" aria-label="House sections">
        {[
          ["guide", "Guide"],
          ["map", "Map"],
          ["rooms", "Rooms & controls"],
          ["notes", "Notes"],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={`/admin/house/${id}`}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "map" ? (
        <MapLibrary />
      ) : tab === "rooms" ? (
        <Rooms />
      ) : tab === "notes" ? (
        <Notes />
      ) : (
        <GuideLibrary />
      )}
    </>
  );
}

const emptyGuide = {
  title: "",
  category: "House",
  location: "",
  details: "",
  synonyms: "",
  pinId: "",
};
function guideDraft(entry?: GuideEntry) {
  return entry
    ? {
        title: entry.title,
        category: entry.category,
        location: entry.location,
        details: entry.details,
        synonyms: entry.synonyms.join(", "),
        pinId: entry.pinId,
      }
    : emptyGuide;
}
function GuideLibrary() {
  const { overview, run, reload, pending } = useHost();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyGuide);
  const [baseline, setBaseline] = useState(emptyGuide);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsaved(dirty);
  const entry = overview.guide.find((item) => item.id === selected);
  function select(id: string) {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes to this guide entry?")
    )
      return;
    const draft = guideDraft(overview.guide.find((item) => item.id === id));
    setSelected(id);
    setForm(draft);
    setBaseline(draft);
    setMessage("");
  }
  return (
    <>
      <div className="host-heading">
        <div>
          <h2>Answers before they ask</h2>
          <p className="host-muted">
            Saved changes appear in Need Something? on guest iPads.
          </p>
        </div>
        <button className="primary" onClick={() => select("new")}>
          Add guide entry
        </button>
      </div>
      <div className="host-library">
        <section className="host-panel" aria-label="Guide entries">
          <label>
            Search guide
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Blankets, towels, coffee…"
            />
          </label>
          {overview.guide
            .filter(
              (item) =>
                !item.archived &&
                `${item.title} ${item.location} ${item.synonyms.join(" ")}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )
            .map((item) => (
              <button
                className="host-place-button"
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => select(item.id)}
              >
                <strong>{item.title}</strong>
                <small>
                  {item.category} · {item.location}
                </small>
              </button>
            ))}
          {!overview.guide.some((item) => !item.archived) && (
            <p>
              Add the things guests most often ask about: extra towels, coffee,
              and blankets.
            </p>
          )}
        </section>
        <section className="host-panel">
          {selected === null ? (
            <>
              <h2>Make yourself at home</h2>
              <p>
                Select an entry to update its directions, photo, and map
                location.
              </p>
            </>
          ) : (
            <>
              <h2>{entry?.title ?? "New guide entry"}</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setMessage("");
                  if (
                    await run(
                      `/api/v1/admin/guide${entry ? `/${entry.id}` : ""}`,
                      form,
                      entry ? "PATCH" : "POST",
                    )
                  ) {
                    setBaseline(form);
                    setMessage("Guide entry saved.");
                    if (!entry) {
                      setSelected(null);
                      setForm(emptyGuide);
                      setBaseline(emptyGuide);
                    }
                  }
                }}
              >
                <label>
                  Name
                  <input
                    required
                    maxLength={80}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                  />
                </label>
                <div className="host-form-grid">
                  <label>
                    Category
                    <input
                      maxLength={40}
                      value={form.category}
                      onChange={(event) =>
                        setForm({ ...form, category: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Where it is
                    <input
                      required
                      maxLength={160}
                      value={form.location}
                      onChange={(event) =>
                        setForm({ ...form, location: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Directions
                  <textarea
                    maxLength={600}
                    value={form.details}
                    onChange={(event) =>
                      setForm({ ...form, details: event.target.value })
                    }
                  />
                </label>
                <label>
                  Other names, separated by commas
                  <input
                    value={form.synonyms}
                    onChange={(event) =>
                      setForm({ ...form, synonyms: event.target.value })
                    }
                  />
                </label>
                <label>
                  Map location
                  <select
                    value={form.pinId}
                    onChange={(event) =>
                      setForm({ ...form, pinId: event.target.value })
                    }
                  >
                    <option value="">No map link</option>
                    {overview.pins.map((pin) => (
                      <option key={pin.id} value={pin.id}>
                        {pin.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="host-savebar">
                  <span>{dirty ? "Unsaved changes" : ""}</span>
                  <button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save guide entry"}
                  </button>
                </div>
              </form>
              {entry ? (
                <>
                  <p className="host-muted">
                    Photo changes save separately and appear immediately.
                  </p>
                  {entry.photoURL && (
                    <img
                      className="host-cover"
                      src={entry.photoURL}
                      alt={entry.title}
                    />
                  )}
                  <Upload
                    label="Entry photo"
                    path={`/api/v1/admin/guide/${entry.id}/photo`}
                    onSaved={reload}
                  />
                  <button
                    className="host-danger"
                    disabled={pending}
                    onClick={async () => {
                      if (
                        window.confirm(
                          `Archive “${entry.title}”? It will disappear from guest search.`,
                        ) &&
                        (await run(`/api/v1/admin/guide/${entry.id}/archive`))
                      ) {
                        setSelected(null);
                        setForm(emptyGuide);
                        setBaseline(emptyGuide);
                      }
                    }}
                  >
                    Archive entry
                  </button>
                </>
              ) : (
                <p className="host-muted">
                  Save this entry before adding a photo.
                </p>
              )}
            </>
          )}
          {message && (
            <p role="status" className="host-notice">
              {message}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

const emptyPin = {
  title: "",
  description: "",
  category: "Supplies",
  roomId: "",
  x: 0.5,
  y: 0.5,
};
function pinDraft(pin?: MapPin) {
  return pin
    ? {
        title: pin.title,
        description: pin.description,
        category: pin.category,
        roomId: pin.roomId,
        x: pin.x,
        y: pin.y,
      }
    : emptyPin;
}
function MapLibrary() {
  const { overview, run, reload, pending } = useHost();
  const [selected, setSelected] = useState("new");
  const [form, setForm] = useState(emptyPin);
  const [baseline, setBaseline] = useState(emptyPin);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsaved(dirty);
  const pin = overview.pins.find((item) => item.id === selected);
  function select(id: string) {
    if (dirty && !window.confirm("Discard unsaved changes to this pin?"))
      return;
    const draft = pinDraft(overview.pins.find((item) => item.id === id));
    setSelected(id);
    setForm(draft);
    setBaseline(draft);
    setMessage("");
  }
  return (
    <>
      <div className="host-heading">
        <div>
          <h2>A little orientation</h2>
          <p className="host-muted">
            Choose a place on the image or set its position with the keyboard.
          </p>
        </div>
        <button onClick={() => select("new")}>Add map pin</button>
      </div>
      <div className="host-editor">
        <section className="host-panel">
          {overview.mapImageURL ? (
            <>
              <button
                type="button"
                className="host-map"
                aria-label="Place a pin on the floor plan. Keyboard users can use the position fields below."
                onClick={(event) => {
                  if (event.detail === 0) return;
                  const rect = event.currentTarget
                    .querySelector("img")
                    ?.getBoundingClientRect();
                  if (!rect) return;
                  setForm({
                    ...form,
                    x: Math.max(
                      0,
                      Math.min(1, (event.clientX - rect.left) / rect.width),
                    ),
                    y: Math.max(
                      0,
                      Math.min(1, (event.clientY - rect.top) / rect.height),
                    ),
                  });
                }}
              >
                <img src={overview.mapImageURL} alt="House floor plan" />
                {overview.pins
                  .filter((item) => item.id !== selected)
                  .map((item, index) => (
                    <span
                      className="host-map-pin"
                      key={item.id}
                      style={{
                        left: `${item.x * 100}%`,
                        top: `${item.y * 100}%`,
                      }}
                      title={item.title}
                    >
                      {index + 1}
                    </span>
                  ))}
                <span
                  className="host-map-pin"
                  style={{
                    left: `${form.x * 100}%`,
                    top: `${form.y * 100}%`,
                    background: "#963d30",
                  }}
                  title="Selected position"
                >
                  ●
                </span>
              </button>
              <p>
                <small>
                  The highlighted marker is your selected position. Save the pin
                  to update guest displays.
                </small>
              </p>
            </>
          ) : (
            <p>Add a floor plan to help guests find their way around.</p>
          )}
          <Upload
            label={
              overview.mapImageURL ? "Replace floor plan" : "Add floor plan"
            }
            path="/api/v1/admin/map"
            onSaved={async () => {
              await reload();
              setMessage(
                "Floor plan saved. Review every pin position against the new image.",
              );
            }}
          />
          {overview.mapImageURL && (
            <button
              className="host-danger"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove the floor plan? Saved pins and guide links will remain.",
                  )
                )
                  void run("/api/v1/admin/map", undefined, "DELETE");
              }}
            >
              Remove floor plan
            </button>
          )}
          <h3>Places on your map</h3>
          {overview.pins.map((item) => (
            <button
              key={item.id}
              className="host-place-button"
              aria-pressed={selected === item.id}
              onClick={() => select(item.id)}
            >
              {item.title}
              <small>{item.roomName || item.category}</small>
            </button>
          ))}
          {message && (
            <p role="status" className="host-warning">
              {message}
            </p>
          )}
        </section>
        <section className="host-panel">
          <h2>{pin?.title ?? "New map pin"}</h2>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await run(
                  `/api/v1/admin/pins${pin ? `/${pin.id}` : ""}`,
                  form,
                  pin ? "PATCH" : "POST",
                )
              ) {
                setBaseline(form);
                setMessage("Map pin saved.");
                if (!pin) {
                  setForm(emptyPin);
                  setBaseline(emptyPin);
                }
              }
            }}
          >
            <label>
              Place name
              <input
                required
                maxLength={80}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label>
              Directions
              <textarea
                maxLength={200}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="host-form-grid">
              <label>
                Category
                <input
                  maxLength={40}
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                />
              </label>
              <label>
                Room
                <select
                  value={form.roomId}
                  onChange={(event) =>
                    setForm({ ...form, roomId: event.target.value })
                  }
                >
                  <option value="">No room</option>
                  {overview.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="host-form-grid">
              {(["x", "y"] as const).map((axis) => (
                <label key={axis}>
                  {axis === "x" ? "From left (%)" : "From top (%)"}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    required
                    value={Number((form[axis] * 100).toFixed(1))}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        [axis]: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="host-savebar">
              <span>{dirty ? "Unsaved position or details" : ""}</span>
              <button type="submit" disabled={pending}>
                Save map pin
              </button>
            </div>
          </form>
          {pin ? (
            <>
              {pin.photoURL && (
                <img
                  src={pin.photoURL}
                  alt={pin.title}
                  className="host-cover"
                />
              )}
              <p className="host-muted">Photos save separately.</p>
              <Upload
                label="Place photo"
                path={`/api/v1/admin/pins/${pin.id}/photo`}
                onSaved={reload}
              />
              <button
                className="host-danger"
                disabled={pending}
                onClick={async () => {
                  if (
                    window.confirm(
                      `Remove “${pin.title}”? Guide links to this pin will be cleared.`,
                    ) &&
                    (await run(
                      `/api/v1/admin/pins/${pin.id}`,
                      undefined,
                      "DELETE",
                    ))
                  ) {
                    setSelected("new");
                    setForm(emptyPin);
                    setBaseline(emptyPin);
                  }
                }}
              >
                Remove map pin
              </button>
            </>
          ) : (
            <p className="host-muted">Save this pin before adding a photo.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Notes() {
  const { overview, run, pending } = useHost();
  return (
    <section className="host-panel">
      <h2>The household note board</h2>
      <p className="host-muted">
        Notes are shared across guest iPads
        {overview.household.showNotesOnTV ? " and the TV welcome" : ""}. They
        expire after {overview.household.noteExpiryDays} days.
      </p>
      {overview.notes.length === 0 ? (
        <p>No notes on the board yet.</p>
      ) : (
        overview.notes.map((note) => (
          <article key={note.id} className="host-list-row">
            <div className="host-grow">
              <p>{note.body}</p>
              <small>
                {note.authorName} ·{" "}
                {new Intl.DateTimeFormat(undefined, {
                  timeZone: overview.household.timeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(note.createdAt))}
              </small>
            </div>
            <button
              className="host-danger"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm("Remove this note from every guest display?")
                )
                  void run(
                    `/api/v1/admin/notes/${note.id}`,
                    undefined,
                    "DELETE",
                  );
              }}
            >
              Remove note
            </button>
          </article>
        ))
      )}
    </section>
  );
}
