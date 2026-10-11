"use client";
import { useEffect, useState } from "react";
import type { Snapshot, Surface } from "@/lib/types";
import { GuestWelcome } from "@/components/display/GuestWelcome";
import { adminApi } from "../client";
import { useHost, type VisitDraft } from "../shell/context";
export function VisitPreview({
  id,
  draft,
  dirty,
}: {
  id: string;
  draft: VisitDraft;
  dirty: boolean;
}) {
  const { overview: o } = useHost();
  const [surface, setSurface] = useState<Surface>("ipad");
  const [room, setRoom] = useState("");
  const [result, setResult] = useState<{
    snapshot: Snapshot;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = JSON.stringify({
    visitId: id === "new" ? undefined : id,
    surface,
    roomId: room || undefined,
    visit: draft,
  });
  const revision = JSON.stringify(o.visits.find((v) => v.id === id));
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void adminApi<{ snapshot: Snapshot; warnings: string[] }>(
        "/api/v1/admin/preview",
        { method: "POST", body: request, signal: controller.signal },
      )
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : "Preview unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, revision]);
  return (
    <aside className="host-editor-side">
      <section className="host-panel">
        <div className="host-heading">
          <h2>Guest preview</h2>
          <span className={`host-badge ${dirty ? "unsaved" : ""}`}>
            {dirty ? "Unsaved preview" : "Saved visit"}
          </span>
        </div>
        <div className="host-form-grid">
          <label>
            Surface
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value as Surface)}
            >
              <option value="ipad">iPad</option>
              <option value="tv">Apple TV</option>
            </select>
          </label>
          <label>
            Room
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Unassigned</option>
              {o.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="host-muted" role="status">
          {loading
            ? "Updating preview…"
            : "Preview only · Controls are inactive."}
        </p>
        {error ? (
          <p className="host-alert" role="alert">
            {error}
          </p>
        ) : null}
        {result && !error && (
          <div className="host-preview" aria-busy={loading}>
            <GuestWelcome
              snapshot={result.snapshot}
              surface={surface}
              now={new Date(result.snapshot.syncedAt)}
            />
            <div className="host-preview-caption">
              Browser composition preview. Check final layout in the native app.
              {result.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
