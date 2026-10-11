"use client";
import { useState } from "react";
import type { VisitEvent } from "@/lib/types";
import { useHost } from "../shell/context";
import { useUnsaved, confirmSelection } from "../house/useUnsaved";
import { eventInput, eventInstant } from "./eventTime";
export function EventEditor({
  visitId,
  event,
  onDone,
}: {
  visitId: string;
  event?: VisitEvent;
  onDone: () => void;
}) {
  const { overview: o, run, pending } = useHost();
  const zone = o.household.timeZone;
  const [form, setForm] = useState({
    title: event?.title || "",
    allDay: event?.allDay || false,
    eventDate: event?.eventDate || "",
    startsAt: eventInput(event?.startsAt || null, zone),
    endsAt: eventInput(event?.endsAt || null, zone),
    location: event?.location || "",
    notes: event?.notes || "",
    link: event?.link || "",
  });
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const payload = {
            ...form,
            startsAt: form.allDay ? null : eventInstant(form.startsAt, zone),
            endsAt:
              form.allDay || !form.endsAt
                ? null
                : eventInstant(form.endsAt, zone),
          };
          if (
            await run(
              event
                ? `/api/v1/admin/events/${event.id}`
                : `/api/v1/admin/visits/${visitId}/events`,
              payload,
              event ? "PATCH" : "POST",
            )
          )
            onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save event.");
        }
      }}
    >
      <fieldset className="host-editor-fields" disabled={pending}>
        <h3>{event ? "Edit plan" : "Add a plan"}</h3>
        <p className="host-muted">
          Times are in {zone}. Plans are saved separately and update a currently
          shown visit.
        </p>
        {error && (
          <p role="alert" className="host-alert">
            {error}
          </p>
        )}
        <label>
          Event title
          <input
            required
            maxLength={80}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set("allDay", e.target.checked)}
          />
          All day
        </label>
        {form.allDay ? (
          <label>
            Date
            <input
              required
              type="date"
              value={form.eventDate}
              onChange={(e) => set("eventDate", e.target.value)}
            />
          </label>
        ) : (
          <div className="host-form-grid">
            <label>
              Starts
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </label>
            <label>
              Ends (optional)
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </label>
          </div>
        )}
        <label>
          Location
          <input
            value={form.location}
            maxLength={120}
            onChange={(e) => set("location", e.target.value)}
          />
        </label>
        <label>
          Details
          <textarea
            value={form.notes}
            maxLength={400}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        <label>
          Link (optional)
          <input
            type="url"
            value={form.link}
            onChange={(e) => set("link", e.target.value)}
          />
        </label>
        <div className="host-actions">
          <button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save plan"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmSelection()) onDone();
            }}
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
