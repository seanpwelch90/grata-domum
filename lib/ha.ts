import { clampBrightness } from "@/lib/domain";
import type { ActionKind, RoomAction } from "@/lib/types";

type ActionInput = {
  id: string;
  label: string;
  kind: ActionKind;
  entityId: string;
  brightnessMin: number;
  brightnessMax: number;
};

export class ActionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readAction(
  baseURL: string,
  token: string,
  entityId: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
) {
  const response = await fetchImpl(
    `${baseURL.replace(/\/$/, "")}/api/states/${encodeURIComponent(entityId)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal,
    },
  );
  if (!response.ok) throw new Error("state failed");
  const raw = (await response.json()) as {
    state?: string;
    attributes?: { brightness?: number };
  };
  const brightness =
    typeof raw.attributes?.brightness === "number"
      ? Math.min(100, Math.round((raw.attributes.brightness * 100) / 255))
      : null;
  return { power: raw.state ?? "", brightness };
}

export async function describeActions(
  actions: ActionInput[],
  configured: boolean,
  baseURL: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RoomAction[]> {
  return Promise.all(
    actions.map(async (action) => {
      const base: RoomAction = {
        id: action.id,
        label: action.label,
        kind: action.kind,
        availability: "not_configured",
        power: "",
        brightness: null,
        message: "Home Assistant is not configured.",
      };
      if (!configured) return base;
      try {
        const state = await readAction(
          baseURL,
          token,
          action.entityId,
          fetchImpl,
          AbortSignal.timeout(2000),
        );
        if (
          !state.power ||
          state.power === "unavailable" ||
          state.power === "unknown"
        ) {
          return {
            ...base,
            availability: "unavailable",
            message: "That control is unavailable right now.",
          };
        }
        return {
          ...base,
          availability: "ok",
          power: state.power,
          brightness: action.kind === "brightness" ? state.brightness : null,
          message: "",
        };
      } catch {
        return {
          ...base,
          availability: "unavailable",
          message: "Home Assistant cannot be reached.",
        };
      }
    }),
  );
}

export async function performAction(input: {
  baseURL: string;
  token: string;
  entityId: string;
  kind: ActionKind;
  command: string;
  level?: number;
  brightnessMin: number;
  brightnessMax: number;
  fetchImpl?: typeof fetch;
}): Promise<RoomAction> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.baseURL.replace(/\/$/, "");
  if (!base || !input.token) {
    throw new ActionError(
      503,
      "Home Assistant is not set up yet. Nothing was changed.",
    );
  }
  const domain = input.entityId.split(".")[0];
  let commandSent = false;
  try {
    if (input.kind === "script" || input.command === "run") {
      commandSent = true;
      await callService(fetchImpl, base, input.token, "script", "turn_on", {
        entity_id: input.entityId,
      });
      return blank(input, "ok", "ran", null, "");
    }
    const current = await readAction(
      base,
      input.token,
      input.entityId,
      fetchImpl,
      AbortSignal.timeout(8000),
    );
    if (
      !current.power ||
      current.power === "unavailable" ||
      current.power === "unknown"
    ) {
      throw new ActionError(
        503,
        "That control is unavailable in Home Assistant. Nothing was changed.",
      );
    }
    if (input.kind === "brightness" || input.command === "brightness") {
      const level = clampBrightness(
        input.level ?? input.brightnessMin,
        input.brightnessMin,
        input.brightnessMax,
      );
      commandSent = true;
      await callService(fetchImpl, base, input.token, "light", "turn_on", {
        entity_id: input.entityId,
        brightness_pct: level,
      });
      const next = await readAction(
        base,
        input.token,
        input.entityId,
        fetchImpl,
        AbortSignal.timeout(8000),
      );
      if (next.brightness == null || Math.abs(next.brightness - level) > 8) {
        throw new ActionError(
          502,
          "Home Assistant did not confirm the change. Check the light before trying again.",
        );
      }
      return blank(input, "ok", next.power || "on", next.brightness, "");
    }
    const turnOff = current.power === "on";
    commandSent = true;
    await callService(
      fetchImpl,
      base,
      input.token,
      domain,
      turnOff ? "turn_off" : "turn_on",
      { entity_id: input.entityId },
    );
    const next = await readAction(
      base,
      input.token,
      input.entityId,
      fetchImpl,
      AbortSignal.timeout(8000),
    );
    const expected = turnOff ? "off" : "on";
    if (next.power !== expected) {
      throw new ActionError(
        502,
        "Home Assistant did not confirm the change. Check the light before trying again.",
      );
    }
    return blank(input, "ok", next.power, null, "");
  } catch (error) {
    if (error instanceof ActionError) throw error;
    throw new ActionError(
      503,
      commandSent
        ? "Could not confirm the change. Check the device before trying again."
        : "Home Assistant did not respond. No command was sent.",
    );
  }
}

function blank(
  input: { kind: ActionKind },
  availability: RoomAction["availability"],
  power: string,
  brightness: number | null,
  message: string,
): RoomAction {
  return {
    id: "",
    label: "",
    kind: input.kind,
    availability,
    power,
    brightness,
    message,
  };
}

async function callService(
  fetchImpl: typeof fetch,
  base: string,
  token: string,
  domain: string,
  service: string,
  data: Record<string, unknown>,
) {
  const response = await fetchImpl(
    `${base}/api/services/${domain}/${service}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error("service failed");
}
