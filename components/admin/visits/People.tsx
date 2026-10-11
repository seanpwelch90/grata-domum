"use client";

import { useState } from "react";
import type { PersonRecord } from "@/lib/types";
import { useHost } from "../shell/context";
import { confirmSelection, useUnsaved } from "../house/useUnsaved";
import { Upload } from "../ui/Upload";

export function People() {
  const { overview } = useHost();
  const [selected, setSelected] = useState(overview.people[0]?.id ?? "new");
  const [query, setQuery] = useState("");
  const person = overview.people.find((item) => item.id === selected);
  function select(id: string) {
    if (confirmSelection()) setSelected(id);
  }
  return (
    <>
      <header className="host-heading">
        <div>
          <p className="host-eyebrow">Guest profiles</p>
          <h1>Familiar faces</h1>
          <p className="host-muted">
            Keep a name and photo ready for their next visit.
          </p>
        </div>
        <button onClick={() => select("new")}>Add a person</button>
      </header>
      <div className="host-library">
        <section className="host-panel" aria-label="People">
          <label>
            Find a person
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names…"
            />
          </label>
          {overview.people
            .filter((item) =>
              item.displayName.toLowerCase().includes(query.toLowerCase()),
            )
            .map((item) => (
              <button
                className="host-place-button"
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => select(item.id)}
              >
                {item.displayName}
                <small>
                  {
                    overview.visits.filter((visit) =>
                      visit.guestIds.includes(item.id),
                    ).length
                  }{" "}
                  visits
                </small>
              </button>
            ))}
          {!overview.people.length && (
            <p>
              Add your first guest profile. You can include them in any visit.
            </p>
          )}
          {!!overview.people.length &&
            !overview.people.some((item) =>
              item.displayName.toLowerCase().includes(query.toLowerCase()),
            ) && <p>No names match your search.</p>}
        </section>
        <section className="host-panel">
          {person ? (
            <PersonEditor
              key={person.id}
              person={person}
              onDeleted={() => setSelected("new")}
            />
          ) : (
            <NewPerson key="new" />
          )}
        </section>
      </div>
    </>
  );
}

function NewPerson() {
  const { run, pending } = useHost();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useUnsaved(name.trim().length > 0);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        if (await run("/api/v1/admin/people", { name: name.trim() })) {
          setName("");
          setMessage("Person added. Select their name to add a photo.");
        }
      }}
    >
      <h2>A new guest</h2>
      <p className="host-muted">
        Use the name they would like to see on their welcome.
      </p>
      <label>
        Display name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="submit" disabled={pending || !name.trim()}>
        {pending ? "Saving…" : "Add person"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}

function PersonEditor({
  person,
  onDeleted,
}: {
  person: PersonRecord;
  onDeleted: () => void;
}) {
  const { overview, run, reload, pending } = useHost();
  const [name, setName] = useState(person.displayName);
  const [message, setMessage] = useState("");
  useUnsaved(name !== person.displayName);
  const visits = overview.visits.filter((visit) =>
    visit.guestIds.includes(person.id),
  );
  return (
    <>
      <div className="host-heading">
        <div>
          {person.avatarURL ? (
            <img
              className="avatar-img"
              src={person.avatarURL}
              alt={person.displayName}
            />
          ) : (
            <span className="avatar-fallback" aria-hidden="true">
              {person.displayName.slice(0, 1)}
            </span>
          )}
          <h2>{person.displayName}</h2>
        </div>
        <span className="host-badge">{visits.length} visits</span>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          if (
            await run(
              `/api/v1/admin/people/${person.id}`,
              { name: name.trim() },
              "PATCH",
            )
          )
            setMessage("Guest name saved.");
        }}
      >
        <label>
          Display name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={pending || !name.trim() || name === person.displayName}
        >
          {pending ? "Saving…" : "Save name"}
        </button>
      </form>
      <hr />
      <h3>Welcome photo</h3>
      <p className="host-muted">
        Optional. Without a photo, their initials will appear. Photo changes
        save separately.
      </p>
      <Upload
        label="Choose a guest photo"
        path={`/api/v1/admin/people/${person.id}/avatar`}
        onSaved={reload}
      />
      {person.avatarURL && (
        <button
          className="quiet"
          disabled={pending}
          onClick={async () => {
            if (
              window.confirm(
                `Remove ${person.displayName}’s photo? Their initials will appear instead.`,
              )
            )
              await run(
                `/api/v1/admin/people/${person.id}/avatar`,
                undefined,
                "DELETE",
              );
          }}
        >
          Remove photo
        </button>
      )}
      <p role="status">{message}</p>
      <details>
        <summary>Remove this profile</summary>
        <p>
          This removes {person.displayName} from {visits.length} saved{" "}
          {visits.length === 1 ? "visit" : "visits"}. It cannot be undone.
        </p>
        <button
          className="quiet"
          disabled={pending}
          onClick={async () => {
            if (
              window.confirm(
                `Delete ${person.displayName} and remove them from ${visits.length} visits? This cannot be undone.`,
              ) &&
              (await run(
                `/api/v1/admin/people/${person.id}`,
                undefined,
                "DELETE",
              ))
            )
              onDeleted();
          }}
        >
          Delete person
        </button>
      </details>
    </>
  );
}
