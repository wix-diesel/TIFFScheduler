import type { Screening, ScheduleInput, LunchBreak } from './types.ts';
import { minute, dateInJapan, at, weekday, overlaps, isoInJapan } from './time.ts';
export function occupied(s: Screening, input: ScheduleInput): [number, number] {
  return [minute(s.startAt) - (s.eventBeforeMinutes ?? 0) - input.constraints.arrivalBufferMinutes,
    minute(s.endAt) + (s.eventAfterMinutes ?? 0) + input.constraints.exitBufferMinutes];
}
export function travelMinutes(a: Screening, b: Screening, input: ScheduleInput): number {
  const entry = input.travelTimes.find(t => t.fromVenueId === a.venueId && t.toVenueId === b.venueId);
  return entry?.minutes ?? (a.venueId === b.venueId ? 0 : Infinity);
}
export function canFollow(a: Screening, b: Screening, input: ScheduleInput): boolean {
  const end = occupied(a, input)[1], start = occupied(b, input)[0];
  if (end > start) return false;
  return dateInJapan(end) !== dateInJapan(start) || end + travelMinutes(a, b, input) <= start;
}
export function vacationDate(s: Screening, input: ScheduleInput): string | undefined {
  const c = input.constraints, [start, end] = occupied(s, input), date = dateInJapan(start);
  if (!c.workingWeekdays.includes(weekday(date)) || c.additionalDaysOff.includes(date) || input.holidays.includes(date)) return undefined;
  return overlaps(start, end, at(date, c.workStart ?? '09:00'), at(date, c.workEnd ?? '18:00')) ? date : undefined;
}
/** Lunch is required when an occupied screening overlaps the lunch window.
 * Travel happens immediately after exit; lunch cannot overlap travel or buffers. */
export function lunchBreaks(screenings: readonly Screening[], input: ScheduleInput): LunchBreak[] | undefined {
  const result: LunchBreak[] = [], c = input.constraints;
  for (const date of new Set(screenings.map(s => dateInJapan(occupied(s, input)[0])))) {
    const day = screenings.filter(s => dateInJapan(occupied(s, input)[0]) === date);
    const windowStart = at(date, c.lunchWindowStart), windowEnd = at(date, c.lunchWindowEnd);
    if (!day.some(s => overlaps(...occupied(s, input), windowStart, windowEnd))) continue;
    let cursor = windowStart;
    let found = false;
    const reserve = (end: number) => {
      if (Math.min(end, windowEnd) - cursor < c.lunchDurationMinutes) return false;
      result.push({ date, startAt: isoInJapan(cursor), endAt: isoInJapan(cursor + c.lunchDurationMinutes) });
      return true;
    };
    for (let i = 0; i < day.length; i++) {
      const s = day[i]!;
      const [start, end] = occupied(s, input);
      if (reserve(start)) { found = true; break; }
      const next = day[i + 1];
      cursor = Math.max(cursor, end + (next ? travelMinutes(s, next, input) : 0));
    }
    if (!found && !reserve(windowEnd)) return undefined;
  }
  return result;
}
