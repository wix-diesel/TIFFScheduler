import type { Screening, ScheduleInput, LunchBreak, VacationDay } from './types.ts';
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
/** Apply the JST lower bound to the screening and its preceding event only. */
export function meetsEarliestScreeningStart(screening: Screening, input: ScheduleInput): boolean {
  const earliest = input.constraints.earliestScreeningStart;
  if (earliest === undefined) return true;
  const advertisedStart = minute(screening.startAt);
  return advertisedStart - (screening.eventBeforeMinutes ?? 0) >= at(dateInJapan(advertisedStart), earliest);
}
/** Apply the JST upper bound to the screening and its following event only. */
export function meetsLatestScreeningEnd(screening: Screening, input: ScheduleInput): boolean {
  const latest = input.constraints.latestScreeningEnd;
  if (latest === undefined) return true;
  const advertisedStart = minute(screening.startAt);
  return minute(screening.endAt) + (screening.eventAfterMinutes ?? 0) <= at(dateInJapan(advertisedStart), latest);
}
/** Count each screening by its advertised start date in Japan. */
export function withinDailyScreeningLimit(screenings: readonly Screening[], input: ScheduleInput): boolean {
  const limit = input.constraints.maxScreeningsPerDay;
  if (limit === undefined) return true;
  const counts = new Map<string, number>();
  for (const screening of screenings) {
    const date = dateInJapan(minute(screening.startAt));
    const count = (counts.get(date) ?? 0) + 1;
    if (count > limit) return false;
    counts.set(date, count);
  }
  return true;
}

export type LeaveStatus = 'off' | 'full' | 'afternoon';
/** Return the applicable leave policy for a JST date. Supplied holidays are intentionally ignored. */
export function leaveStatus(date: string, input: ScheduleInput): LeaveStatus {
  const c = input.constraints;
  if (!c.workingWeekdays.includes(weekday(date)) || c.additionalDaysOff.includes(date)) return 'off';
  return c.afternoonLeaveDates.includes(date) ? 'afternoon' : 'full';
}
const workRange = (date: string, input: ScheduleInput): [number, number] => [at(date, input.constraints.workStart ?? '09:00'), at(date, input.constraints.workEnd ?? '18:00')];
const morningRange = (date: string, input: ScheduleInput): [number, number] => [at(date, input.constraints.workStart ?? '09:00'), at(date, input.constraints.afternoonLeaveStart)];
const afternoonRange = (date: string, input: ScheduleInput): [number, number] => [at(date, input.constraints.afternoonLeaveStart), at(date, input.constraints.workEnd ?? '18:00')];

/** Assess one occupied interval. `undefined` means no leave; `null` means infeasible. */
export function vacationRequirementForInterval(start: number, end: number, input: ScheduleInput): VacationDay | undefined | null {
  if (end <= start) return undefined;
  const date = dateInJapan(start), status = leaveStatus(date, input);
  if (status === 'off') return undefined;
  if (status === 'full') {
    const [workStart, workEnd] = workRange(date, input);
    return overlaps(start, end, workStart, workEnd) ? { date, kind: 'full', units: 2 } : undefined;
  }
  const [morningStart, morningEnd] = morningRange(date, input);
  if (overlaps(start, end, morningStart, morningEnd)) return null;
  const [afternoonStart, afternoonEnd] = afternoonRange(date, input);
  return overlaps(start, end, afternoonStart, afternoonEnd) ? { date, kind: 'afternoon', units: 1 } : undefined;
}
export function screeningVacationRequirement(screening: Screening, input: ScheduleInput): VacationDay | undefined | null {
  const [start, end] = occupied(screening, input);
  return vacationRequirementForInterval(start, end, input);
}
/** Compatibility helper: returns the date when a screening needs any leave. */
export function vacationDate(s: Screening, input: ScheduleInput): string | undefined {
  return screeningVacationRequirement(s, input)?.date;
}
function addRequirement(map: Map<string, VacationDay>, requirement: VacationDay): void {
  const current = map.get(requirement.date);
  if (!current || requirement.units > current.units) map.set(requirement.date, requirement);
}
/** Build intervals for screenings, venue movement and secured meals. Home trips are not modeled. */
export function itineraryIntervals(screenings: readonly Screening[], lunches: readonly LunchBreak[], input: ScheduleInput): Array<[number, number]> {
  const ordered = [...screenings].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || a.id.localeCompare(b.id));
  const intervals: Array<[number, number]> = ordered.map(screening => occupied(screening, input));
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!, current = ordered[i]!;
    const previousEnd = occupied(previous, input)[1], currentStart = occupied(current, input)[0];
    const travel = travelMinutes(previous, current, input);
    if (dateInJapan(previousEnd) === dateInJapan(currentStart) && Number.isFinite(travel) && travel > 0) intervals.push([previousEnd, previousEnd + travel]);
  }
  intervals.push(...lunches.map(lunch => [minute(lunch.startAt), minute(lunch.endAt)] as [number, number]));
  return intervals;
}
/** Return date-level leave details, or undefined when movement/meal placement violates the policy. */
export function vacationDaysForItinerary(screenings: readonly Screening[], lunches: readonly LunchBreak[], input: ScheduleInput): VacationDay[] | undefined {
  const details = new Map<string, VacationDay>();
  for (const [start, end] of itineraryIntervals(screenings, lunches, input)) {
    const requirement = vacationRequirementForInterval(start, end, input);
    if (requirement === null) return undefined;
    if (requirement) {
      if (input.constraints.unavailableDates.includes(requirement.date)) return undefined;
      addRequirement(details, requirement);
    }
  }
  return [...details.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function lunchCandidates(date: string, day: readonly Screening[], input: ScheduleInput): number[] {
  const c = input.constraints, windowStart = at(date, c.lunchWindowStart), windowEnd = at(date, c.lunchWindowEnd), candidates: number[] = [];
  let cursor = windowStart;
  for (let i = 0; i < day.length; i++) {
    const screening = day[i]!, [start, end] = occupied(screening, input), gapStart = cursor, gapEnd = Math.min(start, windowEnd);
    if (gapStart + c.lunchDurationMinutes <= gapEnd) {
      candidates.push(gapStart, gapEnd - c.lunchDurationMinutes);
      const afternoon = at(date, c.afternoonLeaveStart);
      if (afternoon >= gapStart && afternoon + c.lunchDurationMinutes <= gapEnd) candidates.push(afternoon);
    }
    const next = day[i + 1];
    cursor = Math.max(cursor, end + (next ? travelMinutes(screening, next, input) : 0));
  }
  if (cursor + c.lunchDurationMinutes <= windowEnd) {
    candidates.push(cursor, windowEnd - c.lunchDurationMinutes);
    const afternoon = at(date, c.afternoonLeaveStart);
    if (afternoon >= cursor && afternoon + c.lunchDurationMinutes <= windowEnd) candidates.push(afternoon);
  }
  return [...new Set(candidates)].filter(start => start >= windowStart && start + c.lunchDurationMinutes <= windowEnd).sort((a, b) => a - b);
}
/** Lunch is required when a screening overlaps the window. Later slots are tried so afternoon leave can avoid morning work. */
export function lunchBreaks(screenings: readonly Screening[], input: ScheduleInput): LunchBreak[] | undefined {
  const result: LunchBreak[] = [], ordered = [...screenings].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || a.id.localeCompare(b.id));
  for (const date of [...new Set(ordered.map(s => dateInJapan(occupied(s, input)[0])))]) {
    const day = ordered.filter(s => dateInJapan(occupied(s, input)[0]) === date);
    const windowStart = at(date, input.constraints.lunchWindowStart), windowEnd = at(date, input.constraints.lunchWindowEnd);
    if (!day.some(s => overlaps(...occupied(s, input), windowStart, windowEnd))) continue;
    const candidate = lunchCandidates(date, day, input).find(start => {
      const lunch = { date, startAt: isoInJapan(start), endAt: isoInJapan(start + input.constraints.lunchDurationMinutes) };
      return vacationDaysForItinerary(ordered, [...result, lunch], input) !== undefined;
    });
    if (candidate === undefined) return undefined;
    result.push({ date, startAt: isoInJapan(candidate), endAt: isoInJapan(candidate + input.constraints.lunchDurationMinutes) });
  }
  return result;
}
