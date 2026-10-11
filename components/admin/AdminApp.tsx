"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Overview } from "@/lib/types";
import { adminApi, AdminError } from "./client";
import { DoorwayMark, HostIcon } from "./ui/HostIcon";
import { Login, Setup } from "./shell/Auth";
import { HostContext, type VisitDraft } from "./shell/context";
import { Today } from "./shell/Today";
import { VisitList } from "./visits/VisitList";
import { VisitEditor } from "./visits/VisitEditor";
import { HouseWorkspace } from "./house/HouseWorkspace";
import { Displays } from "./displays/Displays";
import { People } from "./visits/People";
import { Settings } from "./settings/Settings";
import { confirmSelection } from "./house/useUnsaved";

export function AdminApp() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  const section = parts[1] || "today";
  const [phase, setPhase] = useState<
    "loading" | "setup" | "login" | "ready" | "error"
  >("loading");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [drafts, setDrafts] = useState<Record<string, VisitDraft>>({});
  const setDraft = useCallback(
    (id: string, draft: VisitDraft | null) =>
      setDrafts((current) => {
        const next = { ...current };
        if (draft) next[id] = draft;
        else delete next[id];
        return next;
      }),
    [],
  );
  const reload = useCallback(async () => {
    const data = await adminApi<Overview>("/api/v1/admin/overview");
    setOverview(data);
    setPhase("ready");
    return data;
  }, []);
  const boot = useCallback(
    () =>
      fetch("/api/v1/health")
        .then((response) => {
          if (!response.ok) throw new Error("The server did not respond.");
          return response.json();
        })
        .then(async (health) => {
          if (health.setupRequired) {
            setPhase("setup");
            return;
          }
          await reload();
        })
        .catch((e) => {
          if (e instanceof AdminError && e.status === 401) setPhase("login");
          else {
            setError(
              e instanceof Error ? e.message : "Could not open the house.",
            );
            setPhase("error");
          }
        }),
    [reload],
  );
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (Object.keys(drafts).length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [drafts]);
  async function run(route: string, body?: unknown, method = "POST") {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    setError("");
    setNotice("");
    let saved = false;
    try {
      await adminApi(route, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      saved = true;
      await reload();
      setNotice("Saved to the home server.");
      return true;
    } catch (e) {
      setError(
        saved
          ? "Saved, but the latest data could not be loaded. Refresh before editing again."
          : e instanceof Error
            ? e.message
            : "Could not save. Your inputs are preserved.",
      );
      if (e instanceof AdminError && e.status === 401) setPhase("login");
      return saved;
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  if (phase === "loading")
    return (
      <main className="door">
        <h1>Opening your house…</h1>
      </main>
    );
  if (phase === "error")
    return (
      <main className="door">
        <h1>Let’s reconnect.</h1>
        <p role="alert">{error}</p>
        <button onClick={() => void boot()}>Try again</button>
      </main>
    );
  if (phase === "setup") return <Setup onDone={reload} />;
  if (phase === "login") return <Login onDone={reload} />;
  if (!overview) return null;
  const nav = [
    ["today", "Today"],
    ["visits", "Visits"],
    ["house", "House"],
    ["displays", "Displays"],
    ["settings", "Settings"],
  ];
  return (
    <HostContext value={{ overview, reload, run, pending, drafts, setDraft }}>
      <div className="host">
        <aside className="host-rail">
          <Link className="host-brand" href="/admin">
            <DoorwayMark />
            {overview.household.name}
            <small>Grata Domum · Host workspace</small>
          </Link>
          <nav aria-label="Host">
            {nav.map(([key, label]) => (
              <Link
                key={key}
                href={key === "today" ? "/admin" : `/admin/${key}`}
                aria-current={section === key ? "page" : undefined}
              >
                <HostIcon name={key} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="host-account">
            <span>Make them feel at home.</span>
            <button
              onClick={async () => {
                if (!confirmSelection()) return;
                if (
                  Object.keys(drafts).length &&
                  !window.confirm("Sign out and discard unsaved visit changes?")
                )
                  return;
                try {
                  await adminApi("/api/v1/admin/logout", { method: "POST" });
                  setDrafts({});
                  setOverview(null);
                  setPhase("login");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not sign out.",
                  );
                }
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="host-main">
          <div className="host-top">
            <span>
              {new Intl.DateTimeFormat("en-US", {
                timeZone: overview.household.timeZone,
                dateStyle: "full",
              }).format(new Date())}
            </span>
            <span>Private household workspace</span>
          </div>
          {error && (
            <div className="host-alert" role="alert">
              {error}
              <button
                onClick={() =>
                  void reload()
                    .then(() => setError(""))
                    .catch(() =>
                      setError("Still unable to load. Please retry."),
                    )
                }
              >
                Refresh
              </button>
            </div>
          )}
          {notice && (
            <p className="host-notice" role="status">
              {notice}
            </p>
          )}
          {!!Object.keys(drafts).length && section !== "visits" && (
            <p className="host-notice">
              Your unsaved visit changes are kept here until you reload or sign
              out.{" "}
              <Link href={`/admin/visits/${Object.keys(drafts)[0]}`}>
                Continue editing
              </Link>
            </p>
          )}
          {section === "today" ? (
            <Today />
          ) : section === "visits" ? (
            parts[2] === "people" ? (
              <People />
            ) : parts[2] ? (
              <VisitEditor key={parts[2]} id={parts[2]} />
            ) : (
              <>
                <div className="host-subnav">
                  <Link href="/admin/visits/people">
                    Manage guest profiles →
                  </Link>
                </div>
                <VisitList />
              </>
            )
          ) : section === "house" ? (
            <HouseWorkspace tab={parts[2] || "guide"} />
          ) : section === "displays" ? (
            <Displays />
          ) : section === "settings" ? (
            <Settings />
          ) : (
            <section>
              <h1>Page not found</h1>
              <Link href="/admin">Return to Today</Link>
            </section>
          )}
        </main>
      </div>
    </HostContext>
  );
}
