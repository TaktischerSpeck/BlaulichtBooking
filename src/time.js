import { Temporal } from "@js-temporal/polyfill";
import { fail } from "./security.js";

export const ZONE = "Europe/Berlin";
export function dayBounds(value) {
  try {
    const date = Temporal.PlainDate.from(value);
    return {
      start: Number(date.toZonedDateTime({ timeZone: ZONE, plainTime: '00:00' }).epochMilliseconds),
      end: Number(date.add({ days: 1 }).toZonedDateTime({ timeZone: ZONE, plainTime: '00:00' }).epochMilliseconds),
    };
  } catch { fail('Ungültiges Datum.'); }
}
export function interval(input) {
  try {
    const startDate = Temporal.PlainDate.from(input.startDate);
    const endDate = Temporal.PlainDate.from(input.endDate);
    const allDay = input.allDay === true;
    const start = Temporal.PlainDateTime.from(
      `${startDate}T${allDay ? "06:00" : input.startTime}`,
    ).toZonedDateTime(ZONE, { disambiguation: "reject" });
    const end = allDay
      ? endDate
          .add({ days: 1 })
          .toZonedDateTime({ timeZone: ZONE, plainTime: "00:00" })
      : Temporal.PlainDateTime.from(
          `${endDate}T${input.endTime}`,
        ).toZonedDateTime(ZONE, { disambiguation: "reject" });
    if (end.epochMilliseconds <= start.epochMilliseconds)
      fail("Das Ende muss nach dem Beginn liegen.");
    if (end.epochMilliseconds - start.epochMilliseconds > 366 * 86400000)
      fail("Eine Buchung darf höchstens 366 Tage umfassen.");
    return {
      start: Number(start.epochMilliseconds),
      end: Number(end.epochMilliseconds),
      allDay: Number(allDay),
    };
  } catch (error) {
    if (error.status) throw error;
    fail(
      "Ungültiger Zeitraum. Bei der Zeitumstellung sind übersprungene oder doppelte Ortszeiten nicht eindeutig. Bitte eine andere Uhrzeit wählen.",
    );
  }
}
export function formatPeriod(booking) {
  const format = (ms) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  return `${format(booking.start)} – ${format(booking.end - (booking.allDay ? 60000 : 0))} Uhr`;
}
