"use client";
import { localDate } from "@/lib/domain";
import Link from "next/link";
import { useState } from "react";
import { useHost } from "../shell/context";
export function VisitList() {
  const { overview: o } = useHost();
  const [search, setSearch] = useState("");
  return (
    <>
      <header className="host-heading">
        <div>
          <h1>Your visits</h1>
          <p className="host-muted">
            A personal welcome, ready before they arrive.
          </p>
        </div>
        <Link className="host-button primary" href="/admin/visits/new">
          Prepare a visit
        </Link>
      </header>
      <label className="host-search">
        Find a visit
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search visits…"
        />
      </label>
      {[false, true].map((archived) => {
        const visits = o.visits.filter(
          (v) =>
            v.archived === archived &&
            v.title.toLowerCase().includes(search.toLowerCase()),
        );
        return visits.length ? (
          <section className="host-panel" key={String(archived)}>
            <p className="host-eyebrow">{archived ? "Archived" : "Visits"}</p>
            {visits.map((v) => (
              <div className="host-list-row" key={v.id}>
                <div className="host-grow">
                  <h2>{v.title}</h2>
                  <p className="host-muted">
                    {v.startsOn} – {v.endsOn} · {v.guestIds.length} guests ·{" "}
                    {o.themes.find((t) => t.id === v.themeId)?.name}
                  </p>
                </div>
                <span className="host-badge">
                  {archived
                    ? "Archived"
                    : o.pinnedVisitId === v.id
                      ? "Showing manually"
                      : o.activeVisitId === v.id
                        ? "Showing now"
                        : v.endsOn < localDate(new Date(), o.household.timeZone)
                          ? "Past visit"
                          : "Scheduled"}
                </span>
                <Link className="host-button" href={`/admin/visits/${v.id}`}>
                  Edit & preview
                </Link>
              </div>
            ))}
          </section>
        ) : null;
      })}
      {o.visits.length > 0 &&
        !o.visits.some((v) =>
          v.title.toLowerCase().includes(search.toLowerCase()),
        ) && (
          <section className="host-panel host-empty">
            <h2>No visits found.</h2>
            <p>Try another name, or clear the search to see every visit.</p>
            <button onClick={() => setSearch("")}>Clear search</button>
          </section>
        )}
      {!o.visits.length && (
        <section className="host-panel">
          <h2>Make their first welcome special.</h2>
          <p>
            Add dates, choose your guests, and write a few words to greet them.
          </p>
        </section>
      )}
    </>
  );
}
