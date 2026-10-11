"use client";
import { useState } from "react";
import type { RoomAction, Snapshot } from "@/lib/types";
import { GuestIcon } from "./GuestArt";

export type ActionStates = Record<
  string,
  { pending: boolean; message: string }
>;
export type RunAction = (
  action: RoomAction,
  command: "toggle" | "brightness" | "run",
  level?: number,
) => Promise<void>;

export function RoomControls({
  snapshot,
  states = {},
  onAction,
  readOnly = false,
}: {
  snapshot: Snapshot;
  states?: ActionStates;
  onAction?: RunAction;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="guest-card guest-comfort"
      aria-labelledby="room-controls-heading"
    >
      <div className="guest-card-heading">
        <h2 id="room-controls-heading">Make it comfortable.</h2>
        <span>{snapshot.device.roomName}</span>
      </div>
      <div className="guest-control-grid">
        {snapshot.actions.map((action, index) => (
          <div key={action.id} hidden={!expanded && index >= 4}>
            <RoomControl
              action={action}
              state={states[action.id]}
              onAction={onAction}
              readOnly={readOnly}
            />
          </div>
        ))}
      </div>
      {!onAction && (
        <p className="guest-support">Preview · room controls are disabled.</p>
      )}
      {snapshot.actions.length > 4 && (
        <button
          className="guest-text-action"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Fewer room controls"
            : `All room controls (${snapshot.actions.length})`}
        </button>
      )}
    </section>
  );
}
function RoomControl({
  action,
  state,
  onAction,
  readOnly,
}: {
  action: RoomAction;
  state?: ActionStates[string];
  onAction?: RunAction;
  readOnly: boolean;
}) {
  const [level, setLevel] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const draft = level ?? action.brightness ?? 50;
  const disabled =
    readOnly || !onAction || state?.pending || action.availability !== "ok";
  const actual =
    action.availability !== "ok"
      ? "Unavailable"
      : action.kind === "script"
        ? "Ready"
        : action.power === "on"
          ? `On${action.brightness !== null ? ` · ${action.brightness}%` : ""}`
          : action.power === "off"
            ? "Off"
            : "State unknown";
  return (
    <article className="guest-control" aria-busy={state?.pending || false}>
      <div className="guest-control-label">
        <GuestIcon
          name={
            action.kind === "script"
              ? "spark"
              : action.kind === "brightness"
                ? "light"
                : "power"
          }
        />
        <h3>{action.label}</h3>
      </div>
      <p className="guest-support">{actual}</p>
      {action.kind === "brightness" ? (
        <>
          <button
            className="guest-control-button"
            type="button"
            aria-expanded={detail}
            onClick={() => setDetail(!detail)}
          >
            Brightness {detail ? "−" : "+"}
          </button>
          <div hidden={!detail} className="guest-brightness">
            <label>
              Brightness · {draft}%
              <input
                type="range"
                min={1}
                max={100}
                value={draft}
                disabled={disabled}
                onChange={(event) => setLevel(Number(event.target.value))}
              />
            </label>
            <button
              className="guest-control-button"
              type="button"
              disabled={disabled}
              onClick={() => onAction?.(action, "brightness", draft)}
            >
              {state?.pending ? "Working…" : "Apply"}
            </button>
          </div>
          {state?.pending && !detail && <p role="status">Working…</p>}
        </>
      ) : (
        <button
          className="guest-control-button"
          type="button"
          disabled={disabled}
          onClick={() =>
            onAction?.(action, action.kind === "script" ? "run" : "toggle")
          }
        >
          {state?.pending
            ? "Working…"
            : action.kind === "script"
              ? "Run"
              : action.power === "on"
                ? "Turn off"
                : action.power === "off"
                  ? "Turn on"
                  : "Toggle"}
        </button>
      )}
      {action.availability !== "ok" && (
        <p className="guest-support">Unavailable. Please ask your host.</p>
      )}
      {state?.message && (
        <p className="guest-command-message" role="status">
          {state.message}
        </p>
      )}
    </article>
  );
}
