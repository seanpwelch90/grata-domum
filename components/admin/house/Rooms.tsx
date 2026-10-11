"use client";
import { useState } from "react";
import Link from "next/link";
import type { ActionKind, ActionRecord, Overview } from "@/lib/types";
import { useHost } from "../shell/context";
import { confirmSelection, useUnsaved } from "./useUnsaved";

export function Rooms() {
  const { overview, run, pending } = useHost();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const room = overview.rooms.find((item) => item.id === selected);
  return (
    <>
      <header className="host-heading">
        <div>
          <h2>Comforts, room by room</h2>
          <p className="host-muted">
            Only assigned iPads can use a room’s controls. TVs stay read-only.
          </p>
        </div>
      </header>
      <div className="host-library">
        <section className="host-panel">
          <h3>Rooms</h3>
          {overview.rooms.map((item) => (
            <button
              className="host-place-button"
              aria-pressed={selected === item.id}
              key={item.id}
              onClick={() => {
                if (confirmSelection()) setSelected(item.id);
              }}
            >
              {item.name}
              <small>
                {
                  overview.devices.filter(
                    (device) => !device.revoked && device.roomId === item.id,
                  ).length
                }{" "}
                assigned displays
              </small>
            </button>
          ))}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run("/api/v1/admin/rooms", { name })) setName("");
            }}
          >
            <label>
              New room name
              <input
                required
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" disabled={pending}>
              Add room
            </button>
          </form>
        </section>
        <section className="host-panel">
          {room ? (
            <RoomEditor key={room.id} room={room} />
          ) : (
            <>
              <h2>Choose a room</h2>
              <p>
                Add room names first, then assign displays and any optional
                controls.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function RoomEditor({ room }: { room: Overview["rooms"][number] }) {
  const { overview, run, pending } = useHost();
  const [name, setName] = useState(room.name);
  useUnsaved(name !== room.name);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const actions = overview.actions.filter(
    (action) => action.roomId === room.id,
  );
  return (
    <>
      <h2>{room.name}</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(`/api/v1/admin/rooms/${room.id}`, { name }, "PATCH"))
            setMessage("Room name saved.");
        }}
      >
        <label>
          Room name
          <input
            required
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={pending}>
          Save room name
        </button>
      </form>
      <h3>Assigned displays</h3>
      {overview.devices
        .filter((device) => !device.revoked && device.roomId === room.id)
        .map((device) => (
          <p key={device.id}>
            {device.name} ·{" "}
            {device.surface === "tv" ? "TV · read-only" : "iPad"}
          </p>
        ))}
      <Link href="/admin/displays">Manage display assignments</Link>
      <h3>Guest controls</h3>
      <p className="host-muted">
        {overview.household.haConfigured
          ? "Home Assistant is configured. This page does not test or run physical controls."
          : "Home Assistant is not configured. Controls will be unavailable until it is set up in Settings."}
      </p>
      {actions.map((action) => (
        <div className="host-list-row" key={action.id}>
          <div className="host-grow">
            <strong>{action.label}</strong>
            <small> · {action.kind}</small>
          </div>
          <button
            onClick={() => {
              if (confirmSelection()) setEditing(action.id);
            }}
          >
            Edit control
          </button>
        </div>
      ))}
      <div className="host-actions">
        <button
          onClick={() => {
            if (confirmSelection()) setEditing("new");
          }}
        >
          Add control
        </button>
      </div>
      {editing !== null && (
        <ActionEditor
          key={editing}
          roomId={room.id}
          action={actions.find((action) => action.id === editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {message && (
        <p role="status" className="host-notice">
          {message}
        </p>
      )}
      <div className="host-savebar">
        <button
          className="host-danger"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                `Delete “${room.name}”? Remove its controls and display assignments first if the server reports they are still in use.`,
              )
            )
              void run(`/api/v1/admin/rooms/${room.id}`, undefined, "DELETE");
          }}
        >
          Delete room
        </button>
      </div>
    </>
  );
}
function ActionEditor({
  roomId,
  action,
  onClose,
}: {
  roomId: string;
  action?: ActionRecord;
  onClose: () => void;
}) {
  const { run, pending } = useHost();
  const initial = {
    roomId,
    label: action?.label ?? "",
    kind: action?.kind ?? ("toggle" as ActionKind),
    entityId: action?.entityId ?? "light.",
    brightnessMin: action?.brightnessMin ?? 1,
    brightnessMax: action?.brightnessMax ?? 100,
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  useUnsaved(JSON.stringify(form) !== JSON.stringify(saved));
  return (
    <section className="host-panel">
      <h3>{action ? "Edit control" : "New room control"}</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await run(
              `/api/v1/admin/actions${action ? `/${action.id}` : ""}`,
              form,
              action ? "PATCH" : "POST",
            )
          ) {
            setSaved(form);
            onClose();
          }
        }}
      >
        <label>
          Guest-facing name
          <input
            required
            maxLength={40}
            value={form.label}
            onChange={(event) =>
              setForm({ ...form, label: event.target.value })
            }
            placeholder="Bedside lamp"
          />
        </label>
        <label>
          Control type
          <select
            value={form.kind}
            onChange={(event) =>
              setForm({ ...form, kind: event.target.value as ActionKind })
            }
          >
            <option value="toggle">On / off</option>
            <option value="brightness">Brightness</option>
            <option value="script">Script</option>
          </select>
        </label>
        <details open={!action}>
          <summary>Home Assistant configuration</summary>
          <label>
            Entity ID
            <input
              required
              maxLength={120}
              value={form.entityId}
              onChange={(event) =>
                setForm({ ...form, entityId: event.target.value })
              }
            />
          </label>
          <p className="host-muted">
            Only approved lights, switches, and scripts are supported. Entity
            IDs never appear on guest displays.
          </p>
          {form.kind === "brightness" && (
            <div className="host-form-grid">
              <label>
                Minimum brightness
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.brightnessMin}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      brightnessMin: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Maximum brightness
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.brightnessMax}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      brightnessMax: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          )}
        </details>
        <div className="host-actions">
          <button type="submit" disabled={pending}>
            Save control
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                JSON.stringify(form) === JSON.stringify(saved) ||
                window.confirm("Discard unsaved control changes?")
              )
                onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </form>
      {action && (
        <button
          className="host-danger"
          disabled={pending}
          onClick={async () => {
            if (
              window.confirm(`Remove “${action.label}” from guest controls?`) &&
              (await run(
                `/api/v1/admin/actions/${action.id}`,
                undefined,
                "DELETE",
              ))
            )
              onClose();
          }}
        >
          Remove control
        </button>
      )}
    </section>
  );
}
