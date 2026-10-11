"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { VisitEvent } from "@/lib/types";
import { useHost, type VisitDraft } from "../shell/context";
import { adminApi } from "../client";
import { Upload } from "../ui/Upload";
import { VisitPreview } from "./VisitPreview";
import { EventEditor } from "./EventEditor";
import { confirmSelection } from "../house/useUnsaved";
import { localDate } from "@/lib/domain";

export function VisitEditor({ id }: { id: string }) {
  const { overview: o, reload, run, pending, drafts, setDraft } = useHost();
  const router = useRouter();
  const visit = o.visits.find((v) => v.id === id);
  const isNew = id === "new";
  const blank: VisitDraft = {
    title: "",
    startsOn: localDate(new Date(), o.household.timeZone),
    endsOn: localDate(new Date(), o.household.timeZone),
    message: "",
    themeId: "default",
    guestIds: [],
  };
  const saved: VisitDraft = visit
    ? {
        title: visit.title,
        startsOn: visit.startsOn,
        endsOn: visit.endsOn,
        message: visit.message,
        themeId: visit.themeId,
        guestIds: visit.guestIds,
      }
    : blank;
  const form = drafts[id] || saved;
  const dirty = !!drafts[id] && JSON.stringify(form) !== JSON.stringify(saved);
  const [tab, setTab] = useState(isNew ? "details" : "welcome");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const saveGuard = useRef(false);
  const [newPerson, setNewPerson] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);
  const [event, setEvent] = useState<VisitEvent | null | undefined>();
  const errorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const arrivalRef = useRef<HTMLInputElement>(null);
  const departureRef = useRef<HTMLInputElement>(null);
  const [validated, setValidated] = useState(false);
  const fieldErrors = {
    title: validated && !form.title.trim() ? "Give this visit a name." : "",
    startsOn: validated && !form.startsOn ? "Choose an arrival date." : "",
    endsOn:
      validated && (!form.endsOn || form.endsOn < form.startsOn)
        ? "Choose a departure on or after arrival."
        : "",
  };
  function set<K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) {
    setDraft(id, { ...form, [key]: value });
    setNotice("");
  }
  async function save() {
    if (saveGuard.current) return;
    setError("");
    setNotice("");
    setValidated(true);
    if (
      !form.title.trim() ||
      !form.startsOn ||
      !form.endsOn ||
      form.endsOn < form.startsOn
    ) {
      setError(
        "Add a title and valid arrival/departure dates. Departure must be on or after arrival.",
      );
      setTab("details");
      setTimeout(() => {
        const target = !form.title.trim()
          ? titleRef
          : !form.startsOn
            ? arrivalRef
            : departureRef;
        target.current?.focus();
      }, 0);
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    let persisted = false;
    try {
      const result = await adminApi<{ id?: string }>(
        isNew ? "/api/v1/admin/visits" : `/api/v1/admin/visits/${id}`,
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(form) },
      );
      persisted = true;
      if (isNew && result.id) {
        setDraft(result.id, form);
        setDraft(id, null);
        router.replace(`/admin/visits/${result.id}`);
      }
      await reload();
      setDraft(isNew && result.id ? result.id : id, null);
      setNotice(
        o.activeVisitId === id
          ? "Visit saved to the server. Connected displays will receive the update."
          : "Visit saved. It will appear according to the household schedule.",
      );
    } catch (e) {
      if (persisted) setRefreshFailed(true);
      setTimeout(() => errorRef.current?.focus(), 0);
      setError(
        persisted
          ? "Saved to the server, but refreshed data could not be loaded. Reload before making more changes."
          : e instanceof Error
            ? e.message
            : "Could not save. Your changes are preserved.",
      );
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  }
  if (!isNew && !visit && drafts[id])
    return (
      <section>
        <h1>Your visit was saved.</h1>
        <p>Reload the latest data before continuing.</p>
        <button
          onClick={() =>
            void reload().catch(() =>
              setError("Still unable to load. Please retry."),
            )
          }
        >
          Reload visit
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!isNew && !visit)
    return (
      <section>
        <h1>Visit not found</h1>
        <Link href="/admin/visits">Return to visits</Link>
      </section>
    );
  return (
    <>
      <header className="host-heading">
        <div>
          <p className="host-eyebrow">
            <Link href="/admin/visits">Visits</Link> /{" "}
            {isNew ? "Prepare" : "Edit"}
          </p>
          <h1>{form.title || "A new welcome"}</h1>
          <div className="host-statuses">
            <span className={`host-badge ${dirty || isNew ? "unsaved" : ""}`}>
              {dirty || isNew ? "Unsaved changes" : "Saved visit"}
            </span>
            {!isNew && (
              <span className="host-badge">
                {visit?.archived
                  ? "Archived"
                  : o.activeVisitId === id
                    ? `Showing on displays · ${o.pinnedVisitId === id ? "Manual" : "Schedule"}`
                    : "Not showing on displays"}
              </span>
            )}
          </div>
        </div>
        <Link href="/admin/visits">← All visits</Link>
      </header>
      <nav className="host-tabs" aria-label="Visit sections">
        {["details", "guests", "welcome", "plans", "review"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              if (confirmSelection()) setTab(t);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="host-editor">
        <section className="host-panel">
          <fieldset
            className="host-editor-fields"
            disabled={saving || refreshFailed}
          >
            {tab === "details" && (
              <div className="stack-form">
                <h2>The visit details</h2>
                <label>
                  Visit name
                  <input
                    ref={titleRef}
                    aria-invalid={!!fieldErrors.title}
                    aria-describedby={
                      fieldErrors.title ? "visit-title-error" : undefined
                    }
                    required
                    maxLength={80}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                  {fieldErrors.title && (
                    <span id="visit-title-error" className="host-field-error">
                      {fieldErrors.title}
                    </span>
                  )}
                </label>
                <div className="host-form-grid">
                  <label>
                    Arrival
                    <input
                      ref={arrivalRef}
                      aria-invalid={!!fieldErrors.startsOn}
                      aria-describedby={
                        fieldErrors.startsOn ? "visit-arrival-error" : undefined
                      }
                      type="date"
                      value={form.startsOn}
                      onChange={(e) => set("startsOn", e.target.value)}
                    />
                    {fieldErrors.startsOn && (
                      <span
                        id="visit-arrival-error"
                        className="host-field-error"
                      >
                        {fieldErrors.startsOn}
                      </span>
                    )}
                  </label>
                  <label>
                    Departure
                    <input
                      ref={departureRef}
                      aria-invalid={!!fieldErrors.endsOn}
                      aria-describedby={
                        fieldErrors.endsOn ? "visit-departure-error" : undefined
                      }
                      type="date"
                      value={form.endsOn}
                      onChange={(e) => set("endsOn", e.target.value)}
                    />
                    {fieldErrors.endsOn && (
                      <span
                        id="visit-departure-error"
                        className="host-field-error"
                      >
                        {fieldErrors.endsOn}
                      </span>
                    )}
                  </label>
                </div>
                <p className="host-muted">
                  Inclusive dates in {o.household.timeZone}.
                </p>
                {o.visits.some(
                  (v) =>
                    v.id !== id &&
                    !v.archived &&
                    v.startsOn <= form.endsOn &&
                    v.endsOn >= form.startsOn,
                ) && (
                  <p className="host-warning">
                    Another visit overlaps these dates. The most recently
                    started visit wins unless one is selected manually.
                  </p>
                )}
              </div>
            )}
            {tab === "guests" && (
              <div>
                <h2>Who’s coming?</h2>
                <p className="host-muted">
                  Choose reusable guest profiles for this welcome.
                </p>
                {o.people.map((p) => (
                  <label key={p.id} className="host-list-row">
                    <input
                      type="checkbox"
                      checked={form.guestIds.includes(p.id)}
                      onChange={(e) =>
                        set(
                          "guestIds",
                          e.target.checked
                            ? [...form.guestIds, p.id]
                            : form.guestIds.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span className="host-avatar">
                      {p.avatarURL ? (
                        <img src={p.avatarURL} alt="" />
                      ) : (
                        p.displayName.slice(0, 2)
                      )}
                    </span>
                    {p.displayName}
                  </label>
                ))}
                <form
                  className="host-actions"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    if (addingPerson) return;
                    setAddingPerson(true);
                    try {
                      const p = await adminApi<{ id: string }>(
                        "/api/v1/admin/people",
                        {
                          method: "POST",
                          body: JSON.stringify({ name: newPerson }),
                        },
                      );
                      await reload();
                      set("guestIds", [...form.guestIds, p.id]);
                      setNewPerson("");
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not add person.",
                      );
                    } finally {
                      setAddingPerson(false);
                    }
                  }}
                >
                  <label>
                    Add a guest
                    <input
                      required
                      maxLength={60}
                      value={newPerson}
                      onChange={(e) => setNewPerson(e.target.value)}
                      placeholder="Display name"
                    />
                  </label>
                  <button type="submit" disabled={addingPerson}>
                    {addingPerson ? "Adding…" : "Add person"}
                  </button>
                </form>
                <p className="host-muted">
                  The new profile is saved immediately; this visit’s selection
                  is saved with Save visit.
                </p>
                <Link href="/admin/visits/people">
                  Manage names and photos →
                </Link>
              </div>
            )}
            {tab === "welcome" && (
              <div className="stack-form">
                <h2>Make it feel personal.</h2>
                <p className="host-muted">
                  A few words from you go a long way.
                </p>
                <label>
                  Welcome message
                  <textarea
                    maxLength={280}
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                  />
                </label>
                <small>{form.message.length} / 280</small>
                <h3>Display theme</h3>
                <div className="host-theme-grid">
                  {o.themes.map((t) => (
                    <button
                      key={t.id}
                      aria-pressed={form.themeId === t.id}
                      onClick={() => set("themeId", t.id)}
                    >
                      <span
                        className="host-theme-swatch"
                        style={{
                          background: t.background,
                          borderBottom: `8px solid ${t.accent}`,
                        }}
                      />
                      {t.name}
                    </button>
                  ))}
                </div>
                <h3>Welcome cover</h3>
                {visit?.coverURL && (
                  <img
                    className="host-cover"
                    src={visit.coverURL}
                    alt="Current welcome cover"
                  />
                )}
                {isNew ? (
                  <p className="host-muted">
                    Save the visit first to add a cover photo. Until then, your
                    theme supplies an illustrated welcome.
                  </p>
                ) : (
                  <>
                    <Upload
                      label="Choose a cover image"
                      path={`/api/v1/admin/visits/${id}/cover`}
                      onSaved={reload}
                    />
                    {visit?.coverURL && (
                      <button
                        className="quiet"
                        onClick={() =>
                          void run(
                            `/api/v1/admin/visits/${id}/cover`,
                            undefined,
                            "DELETE",
                          )
                        }
                      >
                        Remove cover
                      </button>
                    )}
                    <p className="host-muted">
                      Image changes save separately and affect this visit
                      immediately. Cancel changes only restores unsaved visit
                      fields.
                    </p>
                  </>
                )}
              </div>
            )}
            {tab === "plans" && (
              <>
                <h2>Time together</h2>
                {isNew ? (
                  <p>Save the visit first to add plans.</p>
                ) : (
                  <>
                    {event !== undefined ? (
                      <EventEditor
                        key={event?.id || "new"}
                        visitId={id}
                        event={event || undefined}
                        onDone={() => setEvent(undefined)}
                      />
                    ) : (
                      <>
                        <button onClick={() => setEvent(null)}>
                          Add a plan
                        </button>
                        {!visit?.events.length && (
                          <p className="host-muted">
                            Nothing planned yet. A quiet day is a good plan too.
                          </p>
                        )}
                        {visit?.events.map((e) => (
                          <div className="host-list-row" key={e.id}>
                            <div className="host-grow">
                              <h3>{e.title}</h3>
                              <small>
                                {e.allDay
                                  ? `${e.eventDate} · All day`
                                  : new Intl.DateTimeFormat("en-US", {
                                      timeZone: o.household.timeZone,
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(e.startsAt!))}
                                {e.location ? ` · ${e.location}` : ""}
                              </small>
                            </div>
                            <button onClick={() => setEvent(e)}>Edit</button>
                            <button
                              className="quiet host-danger"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm("Remove this plan?"))
                                  void run(
                                    `/api/v1/admin/events/${e.id}`,
                                    undefined,
                                    "DELETE",
                                  );
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "review" && (
              <>
                <h2>Ready to welcome them.</h2>
                <p>
                  {form.guestIds.length} guests · {form.startsOn} –{" "}
                  {form.endsOn}
                </p>
                <p className="host-muted">
                  Previewing never changes the live displays. Saving core fields
                  follows the current schedule. Photos and plans save
                  separately.
                </p>
                {!isNew && !visit?.archived && (
                  <>
                    <button
                      disabled={pending || dirty}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Show this visit on all paired displays? It will stay selected until you use the schedule or archive it.",
                          )
                        )
                          void run("/api/v1/admin/active-visit", { id });
                      }}
                    >
                      Show this visit now
                    </button>
                    {dirty && (
                      <p className="host-muted">Save core changes first.</p>
                    )}
                    {o.pinnedVisitId && (
                      <button
                        className="quiet"
                        disabled={pending}
                        onClick={() =>
                          void run("/api/v1/admin/active-visit", { id: "" })
                        }
                      >
                        Use schedule
                      </button>
                    )}
                    <div className="host-actions">
                      <button
                        className="quiet host-danger"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Archive this visit? It will no longer appear on displays.",
                            )
                          )
                            void run(`/api/v1/admin/visits/${id}/archive`).then(
                              (ok) => {
                                if (ok) router.push("/admin/visits");
                              },
                            );
                        }}
                      >
                        Archive visit
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="host-savebar">
              <button
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft(id, null);
                  setValidated(false);
                  setNotice(
                    "Unsaved visit fields restored. Separately saved photos and plans remain.",
                  );
                  setError("");
                }}
              >
                Cancel changes
              </button>
              <button
                className="primary"
                disabled={saving || (!isNew && !dirty)}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save visit"}
              </button>
            </div>
          </fieldset>
          <div className="host-save-feedback">
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="host-alert"
                role="alert"
              >
                {error}
                {refreshFailed && (
                  <button
                    onClick={() =>
                      void reload()
                        .then(() => {
                          setRefreshFailed(false);
                          setDraft(id, null);
                          setError("");
                          setNotice(
                            "Saved visit loaded. You can continue editing.",
                          );
                        })
                        .catch(() =>
                          setError(
                            "Saved. Preview could not refresh. Please try loading the saved visit again.",
                          ),
                        )
                    }
                  >
                    Load saved visit
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="host-notice" role="status">
                {notice}
              </p>
            )}
          </div>
        </section>
        <VisitPreview id={id} draft={form} dirty={dirty || isNew} />
      </div>
    </>
  );
}
