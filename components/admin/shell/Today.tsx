"use client";
import Link from "next/link";
import { useHost } from "./context";
import { localDate } from "@/lib/domain";
export function Today() {
  const { overview: o } = useHost();
  const active = o.visits.find((v) => v.id === o.activeVisitId);
  const today = localDate(new Date(), o.household.timeZone);
  const next = o.visits
    .filter((v) => !v.archived && v.startsOn > today && v.id !== active?.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  const checklist = [
    {
      ready: !!o.household.wifiSSID,
      text: "Guest Wi-Fi",
      href: "/admin/settings",
    },
    {
      ready: o.guide.some((g) => !g.archived),
      text: "House guide",
      href: "/admin/house",
    },
    {
      ready: o.devices.some((d) => !d.revoked),
      text: "Paired display",
      href: "/admin/displays",
    },
  ];
  return (
    <>
      <header className="host-heading">
        <div>
          <h1 className="host-today-title">Ready for a warm welcome.</h1>
          <p className="host-muted">
            Your guests, their welcome, and the details that make a stay.
          </p>
        </div>
        <Link className="host-button primary" href="/admin/visits/new">
          Prepare a visit
        </Link>
      </header>
      <section className="host-panel host-live">
        <div>
          <p className="host-eyebrow">On the displays</p>
          <h2>{active?.title || "The everyday welcome"}</h2>
          <p className="host-muted">
            {active
              ? `${active.startsOn} – ${active.endsOn}`
              : "No visit is showing right now. House essentials remain available."}
          </p>
          <span className="host-badge">
            {o.pinnedVisitId ? "Showing manually" : "Using the schedule"}
          </span>
          {active && o.pinnedVisitId && active.endsOn < today ? (
            <p className="host-warning">
              This pinned visit has ended. Choose Use schedule to return to
              scheduled visits.
            </p>
          ) : null}
          <div className="host-actions">
            {active ? (
              <Link className="host-button" href={`/admin/visits/${active.id}`}>
                Edit & preview welcome
              </Link>
            ) : (
              <Link className="host-button" href="/admin/displays">
                View displays
              </Link>
            )}
          </div>
        </div>
        <div
          className={`host-welcome-tile ${active?.themeId === "christmas" ? "christmas" : ""}`}
        >
          <span>Welcome at {o.household.name}</span>
          <strong>
            {active?.guestIds.length
              ? `Welcome, ${
                  active.guestIds.length > 3
                    ? "everyone"
                    : active.guestIds
                        .map(
                          (id) =>
                            o.people.find((p) => p.id === id)?.displayName,
                        )
                        .filter(Boolean)
                        .join(" & ")
                }.`
              : "Make yourself at home."}
          </strong>
          <p>{active?.message || ""}</p>
        </div>
      </section>
      <div className="host-columns">
        <section className="host-panel">
          <p className="host-eyebrow">Coming up next</p>
          <h2>{next?.title || "Who’s coming to stay?"}</h2>
          <p className="host-muted">
            {next
              ? `${next.startsOn} – ${next.endsOn} · ${next.guestIds.length} guests`
              : "Create a visit with a personal welcome, plans and a seasonal theme."}
          </p>
          {next && (
            <div className="host-avatars">
              {next.guestIds.slice(0, 5).map((id) => {
                const person = o.people.find((p) => p.id === id);
                return (
                  <span key={id} className="host-avatar">
                    {person?.displayName.slice(0, 2)}
                  </span>
                );
              })}
            </div>
          )}
          <Link
            className="host-button primary"
            href={next ? `/admin/visits/${next.id}` : "/admin/visits/new"}
          >
            {next
              ? "Continue preparing"
              : o.visits.length
                ? "Prepare another visit"
                : "Prepare your first visit"}
          </Link>
        </section>
        <section className="host-panel">
          <h2>Before they arrive</h2>
          {checklist.map((item) => (
            <div className="host-list-row" key={item.text}>
              <span>
                {item.ready ? "✓" : "○"} {item.text}
              </span>
              <Link href={item.href}>{item.ready ? "Review" : "Set up"} →</Link>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
