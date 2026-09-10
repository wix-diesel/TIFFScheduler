import type { ScheduleScore, ScheduleInput, Screening, SchedulePlan, LunchBreak } from './types.ts';
import { occupied, travelMinutes, vacationDate } from './constraints.ts';
import { dateInJapan, minute } from './time.ts';
export function compareScores(a: ScheduleScore, b: ScheduleScore): number {
  return a.missedFilmCount - b.missedFilmCount || a.vacationDays - b.vacationDays || a.screeningDays - b.screeningDays || a.travelMinutes - b.travelMinutes || a.waitingMinutes - b.waitingMinutes;
}
export function scorePlan(screenings: Screening[], lunches: LunchBreak[], input: ScheduleInput): SchedulePlan {
  const vacationDates = [...new Set(screenings.map(s => vacationDate(s, input)).filter((d): d is string => d !== undefined))].sort();
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
  return { screenings: [...screenings], missedFilmIds, vacationDates, lunches, score: { missedFilmCount: missedFilmIds.length, vacationDays: vacationDates.length, screeningDays, travelMinutes: travel, waitingMinutes: waiting } };
}
