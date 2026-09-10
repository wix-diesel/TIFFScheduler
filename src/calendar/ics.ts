export interface IcsEvent {
  uid: string;
  summary: string;
  start: string | Date;
  end: string | Date;
  description?: string;
  location?: string;
  url?: string;
}

export interface IcsOptions {
  calendarName?: string;
  now?: string | Date;
  productId?: string;
}

const encoder = new TextEncoder();

/** Escape an RFC 5545 TEXT value. Property parameters and URIs are not TEXT. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Fold a content line at 75 UTF-8 octets without splitting a Unicode scalar. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let limit = 75;
  for (const character of line) {
    if (encoder.encode(current + character).length > limit) {
      parts.push(current);
      current = character;
      limit = 74; // Continuation whitespace consumes one octet.
    } else current += character;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function formatIcsUtc(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid calendar date');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const property = (name: string, value: string) => foldIcsLine(`${name}:${value}`);

/** Generate a deterministic RFC 5545 calendar body (apart from an optional DTSTAMP). */
export function generateIcs(events: readonly IcsEvent[], options: IcsOptions = {}): string {
  const stamp = formatIcsUtc(options.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    property('PRODID', options.productId ?? '-//TIFF Scheduler//Calendar Export//JA'),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (options.calendarName) lines.push(property('X-WR-CALNAME', escapeIcsText(options.calendarName)));
  for (const event of events) {
    if (new Date(event.end).getTime() <= new Date(event.start).getTime()) throw new Error('Calendar event end must follow start');
    lines.push('BEGIN:VEVENT', property('UID', event.uid), `DTSTAMP:${stamp}`, `DTSTART:${formatIcsUtc(event.start)}`, `DTEND:${formatIcsUtc(event.end)}`, property('SUMMARY', escapeIcsText(event.summary)));
    if (event.description) lines.push(property('DESCRIPTION', escapeIcsText(event.description)));
    if (event.location) lines.push(property('LOCATION', escapeIcsText(event.location)));
    if (event.url) lines.push(property('URL', event.url));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
