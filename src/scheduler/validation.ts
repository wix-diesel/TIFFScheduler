import type { ScheduleInput } from './types.ts';
import { minute, dateInJapan } from './time.ts';
import { occupied } from './constraints.ts';
export function validateInput(input: ScheduleInput): void {
  const fail = (message: string): never => { throw new Error(`Invalid schedule input: ${message}`); };
  const unique = (values: readonly string[], label: string) => {
    if (values.some(v => !v) || new Set(values).size !== values.length) fail(`${label}: empty or duplicate ID`);
  };
  const nonnegative = (v: number, label: string) => { if (!Number.isSafeInteger(v) || v < 0) fail(label); };
  const date = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail(`date ${v}`);
  };
  const clock = (v: string) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(`clock ${v}`); };
  unique(input.films.map(f => f.id), 'films'); unique(input.venues.map(v => v.id), 'venues');
  unique(input.screenings.map(s => s.id), 'screenings'); unique(input.selectedFilmIds, 'selected films');
  for (const id of input.selectedFilmIds) if (!input.films.some(f => f.id === id)) fail(`unknown film ${id}`);
  for (const f of input.films) { nonnegative(f.durationMinutes, `film ${f.id}: durationMinutes`); if (!f.durationMinutes) fail(`film ${f.id}: durationMinutes must be positive`); }
  const c = input.constraints;
  if (c.maxScreeningsPerDay !== undefined && (!Number.isSafeInteger(c.maxScreeningsPerDay) || c.maxScreeningsPerDay < 1)) fail('maxScreeningsPerDay must be a positive integer');
  for (const d of [...c.additionalDaysOff, ...c.unavailableDates, ...input.holidays]) date(d);
  for (const d of c.afternoonLeaveDates) date(d);
  if (new Set(c.additionalDaysOff).size !== c.additionalDaysOff.length) fail('duplicate additional day off');
  if (new Set(c.unavailableDates).size !== c.unavailableDates.length) fail('duplicate unavailable date');
  if (new Set(c.afternoonLeaveDates).size !== c.afternoonLeaveDates.length) fail('duplicate afternoon leave date');
  const afternoonConflicts = [...c.additionalDaysOff, ...c.unavailableDates].some(date => c.afternoonLeaveDates.includes(date));
  if (afternoonConflicts) fail('conflicting afternoon leave date setting');
  if (c.workingWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('weekday');
  for (const v of [c.workStart ?? '09:00', c.workEnd ?? '18:00', c.afternoonLeaveStart, c.lunchWindowStart, c.lunchWindowEnd]) clock(v);
  if (c.earliestScreeningStart !== undefined) clock(c.earliestScreeningStart);
  if (c.latestScreeningEnd !== undefined) clock(c.latestScreeningEnd);
  if (c.earliestScreeningStart !== undefined && c.latestScreeningEnd !== undefined && c.earliestScreeningStart >= c.latestScreeningEnd) fail('screening time window');
  if ((c.workStart ?? '09:00') >= (c.workEnd ?? '18:00')) fail('work window');
  if ((c.workStart ?? '09:00') >= c.afternoonLeaveStart || c.afternoonLeaveStart >= (c.workEnd ?? '18:00')) fail('afternoon leave start must be inside work window');
  if (c.lunchWindowStart >= c.lunchWindowEnd) fail('lunch window');
  for (const field of ['lunchDurationMinutes', 'exitBufferMinutes', 'arrivalBufferMinutes'] as const) nonnegative(c[field], field);
  const clockMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  if (!c.lunchDurationMinutes || c.lunchDurationMinutes > clockMinutes(c.lunchWindowEnd) - clockMinutes(c.lunchWindowStart)) fail('lunchDurationMinutes must be positive and fit within the lunch window');
  const routes = new Set<string>();
  for (const t of input.travelTimes) {
    nonnegative(t.minutes, 'travel time');
    if (![t.fromVenueId, t.toVenueId].every(id => input.venues.some(v => v.id === id))) fail('unknown travel venue');
    const key = JSON.stringify([t.fromVenueId, t.toVenueId]);
    if (routes.has(key)) fail('duplicate travel route'); routes.add(key);
  }
  for (const s of input.screenings) {
    if (!input.films.some(f => f.id === s.filmId) || !input.venues.some(v => v.id === s.venueId)) fail(`unknown screening reference ${s.id}`);
    for (const value of [s.startAt, s.endAt]) {
      if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(minute(value))) fail(`timestamp ${value}`);
      date(value.slice(0, 10));
    }
    nonnegative(s.eventBeforeMinutes ?? 0, 'event before'); nonnegative(s.eventAfterMinutes ?? 0, 'event after');
    if (minute(s.startAt) >= minute(s.endAt)) fail(`screening interval ${s.id}`);
    const [start, end] = occupied(s, input);
    if (dateInJapan(start) !== dateInJapan(end)) fail(`overnight occupancy unsupported: ${s.id}`);
  }
}
