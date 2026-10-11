import { describe, expect, it } from "vitest";
import { eventInput, eventInstant } from "@/components/admin/visits/eventTime";
describe("household event times", () => {
  it("converts household wall time without using the browser zone", () => {
    expect(eventInstant("2026-12-22T18:00", "America/New_York")).toBe(
      "2026-12-22T23:00:00Z",
    );
    expect(eventInput("2026-12-22T23:00:00Z", "America/New_York")).toBe(
      "2026-12-22T18:00",
    );
  });
  it("rejects ambiguous and nonexistent daylight saving times", () => {
    expect(() =>
      eventInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      eventInstant("2026-11-01T01:30", "America/New_York"),
    ).toThrow();
  });
});
