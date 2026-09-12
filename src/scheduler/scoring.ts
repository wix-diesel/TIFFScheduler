import type { ScheduleScore, ScheduleInput, Screening, SchedulePlan, LunchBreak } from './types.ts';
import { occupied, travelMinutes, vacationDaysForItinerary } from './constraints.ts';
import { dateInJapan, minute } from './time.ts';
export function compareScores(a: ScheduleScore, b: ScheduleScore): number {
  const aUnits = a.vacationUnits ?? a.vacationDays * 2;
  const bUnits = b.vacationUnits ?? b.vacationDays * 2;
  return a.missedFilmCount - b.missedFilmCount || aUnits - bUnits || a.screeningDays - b.screeningDays || a.travelMinutes - b.travelMinutes || a.waitingMinutes - b.waitingMinutes;
}
export function scorePlan(screenings: Screening[], lunches: LunchBreak[], input: ScheduleInput): SchedulePlan {
  const vacationDetails = vacationDaysForItinerary(screenings, lunches, input);
  if (!vacationDetails) throw new Error('Schedule violates leave constraints');
  const vacationDates = vacationDetails.map(detail => detail.date);
  const vacationUnits = vacationDetails.reduce((sum, detail) => sum + detail.units, 0);
  const screeningDays = new Set(screenings.map(s => dateInJapan(minute(s.startAt)))).size;
  const missedFilmIds = input.selectedFilmIds.filter(id => !screenings.some(s => s.filmId === id)).sort();
  let travel = 0, waiting = 0;
  for (let i = 1; i < screenings.length; i++) {
    const a = screenings[i - 1]!, b = screenings[i]!;
    const end = occupied(a, input)[1], start = occupied(b, input)[0];
    if (dateInJapan(end) !== dateInJapan(start)) continue;
    const movement = travelMinutes(a, b, input);
    travel += movement;
    const lunch = lunches.reduce((sum, l) => sum + Math.max(0, Math.min(start, minute(l.endAt)) - Math.max(end, minute(l.startAt))), 0);
    waiting += start - end - movement - lunch;
  }
  return { screenings: [...screenings], missedFilmIds, vacationDates, vacationDetails, lunches, score: { missedFilmCount: missedFilmIds.length, vacationUnits, vacationDays: vacationUnits / 2, screeningDays, travelMinutes: travel, waitingMinutes: waiting } };
}
