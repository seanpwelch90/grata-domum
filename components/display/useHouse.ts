"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingNote, RoomAction, Snapshot, Surface } from "@/lib/types";

const inflightPairs = new Map<string, Promise<Response>>();

export function useHouse(surface: Surface) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "unpaired" | "ready">(
    "loading",
  );
  const [offline, setOffline] = useState(false);
  const [outbox, setOutbox] = useState<PendingNote[]>([]);
  const [pairError, setPairError] = useState("");
  const [actions, setActions] = useState<
    Record<string, { pending: boolean; message: string }>
  >({});
  const [connection, setConnection] = useState<
    "connected" | "disconnected" | "reconnecting" | "revoked" | "incompatible"
  >("disconnected");
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const refreshing = useRef(false);
  const flushing = useRef(false);
  const incompatible = useRef(false);
  const pendingActions = useRef(new Set<string>());
  const snapshotRef = useRef<Snapshot | null>(null);
  const outboxRef = useRef<PendingNote[]>([]);
  const remember = useCallback(
    (next: Snapshot | null, pending = outboxRef.current) => {
      snapshotRef.current = next;
      outboxRef.current = pending;
      setSnapshot(next);
      setOutbox(pending);
      if (next) localStorage.setItem("grata.snapshot", JSON.stringify(next));
      else localStorage.removeItem("grata.snapshot");
      localStorage.setItem("grata.outbox", JSON.stringify(pending));
    },
    [],
  );
  const purge = useCallback(() => {
    generation.current += 1;
    for (const key of ["grata.snapshot", "grata.outbox", "grata.author"])
      localStorage.removeItem(key);
    remember(null, []);
    setActions({});
    setPhase("unpaired");
  }, [remember]);

  const authorization = useCallback(
    (status: number) => {
      if (status === 401) {
        purge();
        setConnection("revoked");
        return true;
      }
      if (status === 426) {
        incompatible.current = true;
        setConnection("incompatible");
        setPairError("Update this app to connect to the home server.");
        return true;
      }
      return false;
    },
    [purge],
  );

  const flush = useCallback(async () => {
    if (
      flushing.current ||
      incompatible.current ||
      !snapshotRef.current?.device.canPostNotes
    )
      return;
    flushing.current = true;
    const attempt = generation.current;
    try {
      for (const note of [...outboxRef.current].filter(
        (item) => item.status === "pending",
      )) {
        let updated: PendingNote | null = note;
        try {
          const response = await fetch("/api/v1/notes", {
            method: "POST",
            credentials: "include",
            signal: AbortSignal.timeout(20_000),
            headers: {
              "content-type": "application/json",
              "Grata-API-Version": "1",
            },
            body: JSON.stringify({
              clientRequestId: note.clientRequestId,
              authorName: note.authorName,
              body: note.body,
            }),
          });
          if (attempt !== generation.current) return;
          if (authorization(response.status)) return;
          if (response.ok) updated = null;
          else {
            const data = await response.json().catch(() => ({}));
            updated = {
              ...note,
              status:
                response.status >= 500 || response.status === 429
                  ? "pending"
                  : "failed",
              error: data.error?.message || "The note was not saved.",
            };
          }
        } catch {
          updated = {
            ...note,
            status: "pending",
            error: "Not sent yet. It will retry when the house is back.",
          };
        }
        if (attempt !== generation.current) return;
        remember(
          snapshotRef.current,
          outboxRef.current.flatMap((item) =>
            item.clientRequestId === note.clientRequestId
              ? updated
                ? [updated]
                : []
              : [item],
          ),
        );
      }
    } finally {
      flushing.current = false;
    }
  }, [authorization, remember]);

  const refresh = useCallback(async () => {
    if (refreshing.current || incompatible.current) return false;
    refreshing.current = true;
    const attempt = generation.current;
    try {
      const response = await fetch("/api/v1/snapshot", {
        signal: AbortSignal.timeout(20_000),
        credentials: "include",
        headers: { "Grata-API-Version": "1" },
      });
      if (attempt !== generation.current) return false;
      if (authorization(response.status)) return false;
      if (!response.ok) throw new Error("snapshot failed");
      const data = (await response.json()) as Snapshot;
      if (attempt !== generation.current) return false;
      if (
        snapshotRef.current &&
        snapshotRef.current.household.id !== data.household.id
      )
        purge();
      const pending = data.device.canPostNotes
        ? outboxRef.current
        : outboxRef.current.map((note): PendingNote => ({
            ...note,
            status: "failed",
            error: "Notes are no longer available on this display.",
          }));
      remember(data, pending);
      setPhase("ready");
      setOffline(false);
      setConnection("connected");
      void flush();
      return true;
    } catch {
      if (attempt !== generation.current) return false;
      setOffline(true);
      setConnection("disconnected");
      setPhase(snapshotRef.current ? "ready" : "loading");
      return false;
    } finally {
      refreshing.current = false;
    }
  }, [authorization, flush, purge, remember]);

  const pair = useCallback(
    async (code: string, name = "") => {
      const cleaned = code.trim().toUpperCase();
      if (!cleaned) {
        setPairError("Enter the pairing code from the home server.");
        return;
      }
      setPairError("");
      const key = `${surface}:${cleaned}`;
      let request = inflightPairs.get(key);
      if (!request) {
        request = fetch("/api/v1/pair", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "Grata-API-Version": "1",
          },
          body: JSON.stringify({ code: cleaned, surface, name }),
        });
        inflightPairs.set(key, request);
      }
      let response: Response;
      try {
        response = (await request).clone();
      } catch {
        inflightPairs.delete(key);
        setPairError(
          "The home server did not respond. Try again when it is available.",
        );
        return;
      }
      inflightPairs.delete(key);
      if (!response.ok) {
        inflightPairs.delete(key);
        const data = await response.json().catch(() => ({}));
        setPairError(data.error?.message || "That code did not work.");
        setPhase("unpaired");
        return;
      }
      purge();
      incompatible.current = false;
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      await refresh();
    },
    [purge, refresh, surface],
  );

  useEffect(() => {
    const cached = localStorage.getItem("grata.snapshot");
    const stored = localStorage.getItem("grata.outbox");
    if (cached) {
      try {
        remember(
          JSON.parse(cached) as Snapshot,
          stored ? JSON.parse(stored) : [],
        );
      } catch {
        remember(null, []);
      }
    } else if (stored) {
      try {
        remember(null, JSON.parse(stored));
      } catch {
        remember(null, []);
      }
    }
    const code = new URLSearchParams(window.location.search).get("code");
    void (async () => {
      const ok = await refresh();
      if (!ok && code) await pair(code);
    })();
  }, [pair, refresh, remember]);

  useEffect(() => {
    if (phase !== "ready") return;
    const source = new EventSource("/api/v1/live");
    source.onerror = () => {
      setOffline(true);
      setConnection("reconnecting");
    };
    source.onopen = () => {
      void refresh();
    };
    source.onmessage = () => {
      void refresh();
    };
    return () => source.close();
  }, [phase, refresh]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setConnection("disconnected");
    };
    const onOnline = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        void refresh();
      }
    }, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  async function postNote(authorName: string, body: string) {
    if (incompatible.current || !snapshotRef.current?.device.canPostNotes)
      return "Notes are not available on this display.";
    const note: PendingNote = {
      clientRequestId: crypto.randomUUID(),
      authorName: authorName.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      status: "pending",
      error: "",
    };
    if (!note.authorName || !note.body) return "Add your name and a note.";
    const attempt = generation.current;
    localStorage.setItem("grata.author", note.authorName);
    remember(snapshotRef.current, [...outboxRef.current, note]);
    await flush();
    if (attempt !== generation.current)
      return "This display needs pairing again. The note was not confirmed.";
    if (
      outboxRef.current.some(
        (item) => item.clientRequestId === note.clientRequestId,
      )
    ) {
      return (
        outboxRef.current.find(
          (item) => item.clientRequestId === note.clientRequestId,
        )?.error || "Not sent yet."
      );
    }
    await refresh();
    return "";
  }

  async function retryNote(clientRequestId: string) {
    remember(
      snapshotRef.current,
      outboxRef.current.map((note) =>
        note.clientRequestId === clientRequestId
          ? { ...note, status: "pending", error: "" }
          : note,
      ),
    );
    await flush();
    await refresh();
  }

  function discardNote(clientRequestId: string) {
    remember(
      snapshotRef.current,
      outboxRef.current.filter(
        (note) => note.clientRequestId !== clientRequestId,
      ),
    );
  }

  async function runAction(
    action: RoomAction,
    command: "toggle" | "brightness" | "run",
    level?: number,
  ) {
    if (pendingActions.current.has(action.id)) return;
    if (
      offline ||
      connection !== "connected" ||
      incompatible.current ||
      surface === "tv" ||
      action.availability !== "ok" ||
      navigator.onLine === false
    ) {
      setActions((current) => ({
        ...current,
        [action.id]: {
          pending: false,
          message: "This needs a connection. Nothing was changed.",
        },
      }));
      return;
    }
    pendingActions.current.add(action.id);
    const attempt = generation.current;
    setActions((current) => ({
      ...current,
      [action.id]: { pending: true, message: "" },
    }));
    try {
      const response = await fetch(`/api/v1/actions/${action.id}`, {
        signal: AbortSignal.timeout(20_000),
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "Grata-API-Version": "1",
        },
        body: JSON.stringify({ command, level }),
      });
      if (attempt !== generation.current || authorization(response.status))
        return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActions((current) => ({
          ...current,
          [action.id]: {
            pending: false,
            message:
              data.error?.message ||
              "Couldn’t confirm the change. Check the device before trying again.",
          },
        }));
        return;
      }
      setActions((current) => ({
        ...current,
        [action.id]: { pending: false, message: "" },
      }));
      await refresh();
    } catch {
      if (attempt !== generation.current) return;
      setOffline(true);
      setActions((current) => ({
        ...current,
        [action.id]: {
          pending: false,
          message:
            "Couldn’t confirm the change. Check the device before trying again.",
        },
      }));
    } finally {
      pendingActions.current.delete(action.id);
    }
  }

  return {
    snapshot,
    phase,
    offline,
    connection,
    now,
    outbox,
    pairError,
    actions,
    pair,
    postNote,
    retryNote,
    discardNote,
    runAction,
  };
}
