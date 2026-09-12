import type { Screening, ScheduleInput, LunchBreak, MealBreak, MealKind, VacationDay } from './types.ts';
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
export function itineraryIntervals(screenings: readonly Screening[], meals: readonly (MealBreak | LunchBreak)[], input: ScheduleInput): Array<[number, number]> {
  const ordered = [...screenings].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || a.id.localeCompare(b.id));
  const intervals: Array<[number, number]> = ordered.map(screening => occupied(screening, input));
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!, current = ordered[i]!;
    const previousEnd = occupied(previous, input)[1], currentStart = occupied(current, input)[0];
    const travel = travelMinutes(previous, current, input);
    if (dateInJapan(previousEnd) === dateInJapan(currentStart) && Number.isFinite(travel) && travel > 0) intervals.push([previousEnd, previousEnd + travel]);
  }
  intervals.push(...meals.map(meal => [minute(meal.startAt), minute(meal.endAt)] as [number, number]));
  return intervals;
}
/** Return date-level leave details, or undefined when movement/meal placement violates the policy. */
export function vacationDaysForItinerary(screenings: readonly Screening[], meals: readonly (MealBreak | LunchBreak)[], input: ScheduleInput): VacationDay[] | undefined {
  const details = new Map<string, VacationDay>();
  for (const [start, end] of itineraryIntervals(screenings, meals, input)) {
    const requirement = vacationRequirementForInterval(start, end, input);
    if (requirement === null) return undefined;
    if (requirement) {
      if (input.constraints.unavailableDates.includes(requirement.date)) return undefined;
      addRequirement(details, requirement);
    }
  }
  return [...details.values()].sort((a, b) => a.date.localeCompare(b.date));
}

type MealRequest = { kind: MealKind; date: string; start: number; end: number; duration: number };

/** Occupied screenings and direction-sensitive venue movement leave the only usable meal gaps. */
function blockers(day: readonly Screening[], input: ScheduleInput): Array<[number, number]> {
  const result = day.map(s => occupied(s, input));
  for (let i = 1; i < day.length; i++) {
    const end = occupied(day[i - 1]!, input)[1], travel = travelMinutes(day[i - 1]!, day[i]!, input);
    if (Number.isFinite(travel) && travel > 0) result.push([end, end + travel]);
  }
  return result.sort((a, b) => a[0] - b[0]);
}
function candidates(request: MealRequest, blocked: readonly [number, number][], placed: readonly MealBreak[]): number[] {
  const all: number[] = [];
  for (let start = request.start; start + request.duration <= request.end; start++) {
    const end = start + request.duration;
    if (![...blocked, ...placed.map(meal => [minute(meal.startAt), minute(meal.endAt)] as [number, number])].some(([a, b]) => overlaps(start, end, a, b))) all.push(start);
  }
  return all;
}
/**
 * Jointly reserve lunch and (optionally) dinner.  Every minute in each free
 * interval is a candidate, so moving lunch later can make both meals fit.
 */
export function mealBreaks(screenings: readonly Screening[], input: ScheduleInput): MealBreak[] | undefined {
  const ordered = [...screenings].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || a.id.localeCompare(b.id));
  const requests: MealRequest[] = [];
  for (const date of [...new Set(ordered.map(s => dateInJapan(occupied(s, input)[0])))]) {
    const day = ordered.filter(s => dateInJapan(occupied(s, input)[0]) === date);
    const first = occupied(day[0]!, input)[0], last = occupied(day.at(-1)!, input)[1];
    const lunchStart = at(date, input.constraints.lunchWindowStart), lunchEnd = at(date, input.constraints.lunchWindowEnd);
    if (day.some(s => overlaps(...occupied(s, input), lunchStart, lunchEnd))) requests.push({ kind: 'lunch', date, start: lunchStart, end: lunchEnd, duration: input.constraints.lunchDurationMinutes });
    const dinnerStart = at(date, input.constraints.dinnerWindowStart), dinnerEnd = at(date, input.constraints.dinnerWindowEnd);
    if (input.constraints.dinnerEnabled && overlaps(first, last, dinnerStart, dinnerEnd)) requests.push({ kind: 'dinner', date, start: dinnerStart, end: dinnerEnd, duration: input.constraints.dinnerDurationMinutes });
  }
  const byDate = new Map<string, MealRequest[]>();
  for (const request of requests) byDate.set(request.date, [...(byDate.get(request.date) ?? []), request]);
  const result: MealBreak[] = [];
  for (const [date, dayRequests] of byDate) {
    const day = ordered.filter(s => dateInJapan(occupied(s, input)[0]) === date), blocked = blockers(day, input);
    const place = (index: number, placed: MealBreak[]): MealBreak[] | undefined => {
      if (index === dayRequests.length) return vacationDaysForItinerary(ordered, [...result, ...placed], input) ? placed : undefined;
      const request = dayRequests[index]!;
      for (const start of candidates(request, blocked, placed)) {
        const meal: MealBreak = { kind: request.kind, date, startAt: isoInJapan(start), endAt: isoInJapan(start + request.duration) };
        const found = place(index + 1, [...placed, meal]);
        if (found) return found;
      }
      return undefined;
    };
    const placed = place(0, []);
    if (!placed) return undefined;
    result.push(...placed);
  }
  return result.sort((a, b) => minute(a.startAt) - minute(b.startAt) || a.kind.localeCompare(b.kind));
}
/** Compatibility API for callers saved before meals became typed. */
export function lunchBreaks(screenings: readonly Screening[], input: ScheduleInput): LunchBreak[] | undefined {
  const meals = mealBreaks(screenings, input);
  return meals?.filter(meal => meal.kind === 'lunch').map(({ date, startAt, endAt }) => ({ date, startAt, endAt }));
}
