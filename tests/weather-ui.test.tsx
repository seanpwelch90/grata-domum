import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestWeather } from "@/components/display/GuestWeather";
import type { Weather } from "@/lib/types";

const weather: Weather = {
  stale: true,
  fetchedAt: "2026-10-04T16:00:00Z",
  unit: "fahrenheit",
  current: { temperature: 72, code: 95, label: "Thunderstorms" },
  daily: [
    { date: "2026-10-06", code: 71, label: "Snow", high: 34, low: 22 },
    { date: "2026-10-04", code: 95, label: "Thunderstorms", high: 76, low: 59 },
    { date: "2026-10-03", code: 0, label: "Old sunshine", high: 99, low: 80 },
    { date: "2026-10-05", code: 45, label: "Fog", high: 64, low: 52 },
  ],
};
describe("Guest weather forecast", () => {
  it("uses the household date, excludes past/today from coming days, and orders forecast dates", () => {
    const html = renderToStaticMarkup(
      <GuestWeather
        weather={weather}
        timeZone="America/New_York"
        now={new Date("2026-10-05T01:00:00Z")}
      />,
    );
    expect(html).toContain("↑ 76°");
    expect(html).not.toContain("Old sunshine");
    expect(html.indexOf("2026-10-05: Fog")).toBeLessThan(
      html.indexOf("2026-10-06: Snow"),
    );
    expect(html).toContain("May be out of date");
    expect(html).toContain("Thunderstorms");
  });
  it("does not invent a forecast when daily data is missing", () => {
    const html = renderToStaticMarkup(
      <GuestWeather
        weather={{ ...weather, daily: [], unit: "celsius" }}
        timeZone="UTC"
        now={new Date("2026-10-04T16:00:00Z")}
      />,
    );
    expect(html).not.toContain("Coming days");
    expect(html).toContain("72°C");
  });
});
