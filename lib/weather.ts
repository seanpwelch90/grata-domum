import { weatherLabel } from "@/lib/domain";
import type { TemperatureUnit, Weather } from "@/lib/types";

type ForecastBody = Omit<Weather, "stale" | "fetchedAt">;

export async function fetchForecast(
  latitude: number,
  longitude: number,
  unit: TemperatureUnit,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
  base = "https://api.open-meteo.com",
): Promise<ForecastBody> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    temperature_unit: unit,
    timezone: timeZone,
    forecast_days: "4",
  });
  const response = await fetchImpl(`${base}/v1/forecast?${query}`, {
    headers: { "user-agent": "GrataDomum/1" },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error("weather failed");
  const raw = (await response.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  const days = raw.daily?.time ?? [];
  if (!days.length) throw new Error("weather was empty");
  return {
    unit,
    current: {
      temperature: Number(raw.current?.temperature_2m ?? 0),
      code: Number(raw.current?.weather_code ?? 0),
      label: weatherLabel(Number(raw.current?.weather_code ?? 0)),
    },
    daily: days.map((date, index) => {
      const code = Number(raw.daily?.weather_code?.[index] ?? 0);
      return {
        date,
        code,
        label: weatherLabel(code),
        high: Number(raw.daily?.temperature_2m_max?.[index] ?? 0),
        low: Number(raw.daily?.temperature_2m_min?.[index] ?? 0),
      };
    }),
  };
}

export async function lookupZip(
  postalCode: string,
  fetchImpl: typeof fetch = fetch,
  base = "https://api.zippopotam.us",
): Promise<{ latitude: number; longitude: number; label: string }> {
  const response = await fetchImpl(`${base}/us/${postalCode}`, {
    headers: { "user-agent": "GrataDomum/1" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("missing");
  const raw = (await response.json()) as {
    places?: {
      "place name"?: string;
      state?: string;
      latitude?: string;
      longitude?: string;
    }[];
  };
  const place = raw.places?.[0];
  if (!place?.latitude || !place.longitude) throw new Error("missing");
  return {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    label: `${place["place name"] ?? ""}, ${place.state ?? ""}`.replace(
      /^, /,
      "",
    ),
  };
}
