import { Temporal } from "@js-temporal/polyfill";
export function eventInstant(value: string, timeZone: string): string {
  try {
    return Temporal.PlainDateTime.from(value)
      .toZonedDateTime(timeZone, { disambiguation: "reject" })
      .toInstant()
      .toString();
  } catch {
    throw new Error(
      "Choose a valid, unambiguous time in the household time zone. This time may fall within a daylight-saving change.",
    );
  }
}
export function eventInput(instant: string | null, timeZone: string): string {
  return instant
    ? Temporal.Instant.from(instant)
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: "minute" })
    : "";
}
