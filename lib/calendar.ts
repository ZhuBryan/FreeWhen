// lib/calendar.ts — build .ics files and Google Calendar links for a chosen
// window. Times are written as floating local time (no TZ suffix): "7 PM" in
// the app means 7 PM on everyone's clock, which is what a friend group wants.

function stamp(dateISO: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${dateISO.replaceAll("-", "")}T${pad(h)}${pad(m)}00`;
}

// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export type CalendarEvent = {
  title: string;
  dateISO: string; // YYYY-MM-DD
  start: number; // minutes from midnight
  end: number;
  description?: string;
};

export function buildIcs(ev: CalendarEvent): string {
  const uid = `${ev.dateISO}-${ev.start}-${Math.random()
    .toString(36)
    .slice(2, 10)}@freewhen`;
  const now = new Date();
  const dtstamp =
    now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FreeWhen//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${stamp(ev.dateISO, ev.start)}`,
    `DTEND:${stamp(ev.dateISO, ev.end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${icsEscape(ev.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// Trigger a client-side download of the event as an .ics file.
export function downloadIcs(ev: CalendarEvent): void {
  const blob = new Blob([buildIcs(ev)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title.replace(/[^\w-]+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${stamp(ev.dateISO, ev.start)}/${stamp(ev.dateISO, ev.end)}`,
    ...(ev.description ? { details: ev.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
