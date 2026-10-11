"use client";
import { useEffect, useState } from "react";
import type { DeviceRecord, Surface } from "@/lib/types";
import { adminApi } from "../client";
import { useHost } from "../shell/context";
import { confirmSelection, useUnsaved } from "../house/useUnsaved";

type PairingCode = {
  code: string;
  expiresAt: string;
  url: string;
  qrDataURL: string;
  surface: Surface;
};
export function Displays() {
  const { overview, reload } = useHost();
  const [pairing, setPairing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const device = overview.devices.find((item) => item.id === selected);
  return (
    <>
      <header className="host-heading">
        <div>
          <p className="host-eyebrow">Welcome, on every screen</p>
          <h1>Displays</h1>
          <p className="host-muted">
            Pair an iPad or Apple TV, then choose its room.
          </p>
        </div>
        <button className="primary" onClick={() => setPairing(true)}>
          Add display
        </button>
      </header>
      {pairing && (
        <Pairing
          onClose={() => setPairing(false)}
          onPaired={async (id) => {
            await reload();
            setSelected(id);
            setPairing(false);
          }}
        />
      )}
      <div className="host-library">
        <section className="host-panel">
          <h2>Your displays</h2>
          {overview.devices
            .filter((item) => showRevoked || !item.revoked)
            .map((item) => (
              <button
                key={item.id}
                className="host-place-button"
                aria-pressed={selected === item.id}
                onClick={() => {
                  if (confirmSelection()) setSelected(item.id);
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.surface === "tv" ? "Apple TV" : "iPad"} ·{" "}
                  {item.roomName || "Assign a room"}
                </small>
                <span className="host-badge">
                  {item.revoked ? "Revoked" : "Paired"}
                </span>
              </button>
            ))}
          {!overview.devices.some((item) => !item.revoked) && (
            <p>
              No paired displays yet. Add a display to bring your welcome to the
              room.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(event) => setShowRevoked(event.target.checked)}
            />{" "}
            Show revoked displays
          </label>
          <p className="host-muted">
            Paired means authorized to connect. Connection status is not
            currently tracked.
          </p>
        </section>
        <section className="host-panel">
          {device ? (
            <DisplayEditor key={device.id} device={device} />
          ) : (
            <>
              <h2>A screen that feels at home</h2>
              <p>
                Select a display to set its name, room, and note permission.
              </p>
              <p className="host-muted">
                An unassigned iPad can show the house content but has no room
                controls.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function Pairing({
  onClose,
  onPaired,
}: {
  onClose: () => void;
  onPaired: (id: string) => Promise<void>;
}) {
  const { overview, reload } = useHost();
  const [surface, setSurface] = useState<Surface>("ipad");
  const [code, setCode] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [knownIds] = useState(() => overview.devices.map((item) => item.id));
  const added = overview.devices.find(
    (item) => !item.revoked && !knownIds.includes(item.id),
  );
  const expires = code
    ? Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = expires === 0;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!code || added || expired) return;
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void reload()
        .catch(() =>
          setError(
            "Could not check pairing status. Use Check for display to try again.",
          ),
        )
        .finally(() => {
          running = false;
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [code, added, reload, expired]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      setCode(
        await adminApi<PairingCode>("/api/v1/admin/pairing-codes", {
          method: "POST",
          body: JSON.stringify({ surface }),
        }),
      );
      setNow(Date.now());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create a pairing code.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="host-panel" aria-label="Add a display">
      <div className="host-heading">
        <div>
          <h2>
            {added
              ? "Your display is paired"
              : "Bring your welcome to a screen"}
          </h2>
          <p className="host-muted">
            Use the same home network for the server and your display.
          </p>
        </div>
        <button onClick={onClose}>Close pairing</button>
      </div>
      {added ? (
        <>
          <p>{added.name} is ready for its room assignment.</p>
          <button className="primary" onClick={() => void onPaired(added.id)}>
            Assign its room
          </button>
        </>
      ) : (
        <>
          <label>
            Display type
            <select
              value={surface}
              disabled={busy}
              onChange={(event) => {
                setSurface(event.target.value === "tv" ? "tv" : "ipad");
                setCode(null);
              }}
            >
              <option value="ipad">iPad</option>
              <option value="tv">Apple TV</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => void generate()}>
            {busy
              ? "Creating code…"
              : code
                ? "Generate another code"
                : "Create pairing code"}
          </button>
          {code && (
            <div className="host-columns">
              <div>
                <ol>
                  <li>Open the Grata Domum app on the same home network.</li>
                  <li>
                    Choose Find nearby servers and select your home server.
                  </li>
                  <li>Check the connection, then enter the code below.</li>
                  <li>After pairing, choose Assign its room here.</li>
                </ol>
                <p>If discovery is unavailable, enter this address manually:</p>
                <p className="host-pre">{overview.suggestedBaseURL}</p>
                {expires > 0 ? (
                  <>
                    <p
                      className="pairing-code"
                      aria-label={`Pairing code ${code.code}`}
                    >
                      {code.code}
                    </p>
                    <p>
                      Expires in {Math.floor(expires / 60)}:
                      {String(expires % 60).padStart(2, "0")}.
                    </p>
                    <p>Enter the code in the app. It can be used once.</p>
                  </>
                ) : (
                  <p role="status" className="host-warning">
                    This code has expired. Generate another code to continue.
                  </p>
                )}
                <button
                  onClick={() => {
                    void reload()
                      .then(() => setError(""))
                      .catch(() =>
                        setError("Could not check pairing status. Try again."),
                      );
                  }}
                >
                  Check for display
                </button>
              </div>
              {expires > 0 && (
                <div>
                  <img
                    width={200}
                    height={200}
                    src={code.qrDataURL}
                    alt="QR code to pair the browser fallback"
                  />
                  <p className="host-muted">
                    This QR opens the browser fallback. Use the code above for
                    the native app.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="host-alert">
          {error}
        </p>
      )}
    </section>
  );
}
function DisplayEditor({ device }: { device: DeviceRecord }) {
  const { overview, run, pending } = useHost();
  const initial = {
    name: device.name,
    surface: device.surface,
    roomId: device.roomId,
    canPostNotes: device.canPostNotes,
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsaved(dirty);
  return (
    <>
      <h2>{device.name}</h2>
      {device.revoked ? (
        <>
          <p className="host-warning">This display’s access is revoked.</p>
          <p>
            Pair it again to reconnect. It can only learn that access was
            revoked after reaching the server.
          </p>
        </>
      ) : (
        <>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage("");
              const payload = {
                ...form,
                canPostNotes: form.surface === "ipad" && form.canPostNotes,
              };
              if (
                await run(
                  `/api/v1/admin/devices/${device.id}`,
                  payload,
                  "PATCH",
                )
              ) {
                setForm(payload);
                setSaved(payload);
                setMessage("Display settings saved.");
              }
            }}
          >
            <label>
              Display name
              <input
                required
                maxLength={40}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Display type
              <select
                value={form.surface}
                onChange={(event) =>
                  setForm({
                    ...form,
                    surface: event.target.value === "tv" ? "tv" : "ipad",
                  })
                }
              >
                <option value="ipad">iPad</option>
                <option value="tv">Apple TV</option>
              </select>
            </label>
            <label>
              Room assignment
              <select
                value={form.roomId}
                onChange={(event) =>
                  setForm({ ...form, roomId: event.target.value })
                }
              >
                <option value="">Unassigned — no room controls</option>
                {overview.rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            {form.surface === "ipad" ? (
              <label>
                <input
                  type="checkbox"
                  checked={form.canPostNotes}
                  onChange={(event) =>
                    setForm({ ...form, canPostNotes: event.target.checked })
                  }
                />{" "}
                Allow posting household notes
              </label>
            ) : (
              <p className="host-muted">
                TV is read-only. It cannot post notes or operate controls.
              </p>
            )}
            <div className="host-savebar">
              <span>{dirty ? "Unsaved changes" : ""}</span>
              <button type="submit" disabled={pending}>
                Save display
              </button>
            </div>
          </form>
          {message && (
            <p className="host-notice" role="status">
              {message}
            </p>
          )}
          <button
            className="host-danger"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Revoke access for “${device.name}”? It must pair again to reconnect. An offline display keeps cached content until it reconnects.`,
                )
              )
                void run(
                  `/api/v1/admin/devices/${device.id}`,
                  undefined,
                  "DELETE",
                );
            }}
          >
            Revoke display access
          </button>
        </>
      )}
    </>
  );
}
