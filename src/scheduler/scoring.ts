import type { ScheduleScore, ScheduleInput, Screening, SchedulePlan, MealBreak, LunchBreak, OptimizationObjective } from './types.ts';
import { occupied, travelMinutes, vacationDaysForItinerary } from './constraints.ts';
import { dateInJapan, minute } from './time.ts';
type PrimaryScore = Pick<ScheduleScore, 'missedFilmCount' | 'vacationUnits'>;
/** One missed film and one half-day of leave each add one penalty point. */
export function balancedPenalty(score: PrimaryScore): number {
  return score.missedFilmCount + score.vacationUnits;
}
/** Compare primary criteria, also used with optimistic bounds during search. */
export function comparePriorities(a: PrimaryScore, b: PrimaryScore, objective: OptimizationObjective = 'maxFilms'): number {
  const films = a.missedFilmCount - b.missedFilmCount;
  const vacation = a.vacationUnits - b.vacationUnits;
  // Nonnegative weights keep the optimizer's lower bounds safe for pruning.
  // Prefer more films when the combined penalty ties.
  if (objective === 'balanced') return balancedPenalty(a) - balancedPenalty(b) || films || vacation;
  return objective === 'minVacation' ? vacation || films : films || vacation;
}
export function compareScores(a: ScheduleScore, b: ScheduleScore, objective: OptimizationObjective = 'maxFilms'): number {
  const aUnits = a.vacationUnits ?? a.vacationDays * 2;
  const bUnits = b.vacationUnits ?? b.vacationDays * 2;
  return comparePriorities({ ...a, vacationUnits: aUnits }, { ...b, vacationUnits: bUnits }, objective) || a.screeningDays - b.screeningDays || a.travelMinutes - b.travelMinutes || a.waitingMinutes - b.waitingMinutes;
}
export function scorePlan(screenings: Screening[], mealInput: readonly (MealBreak | LunchBreak)[], input: ScheduleInput): SchedulePlan {
  const meals: MealBreak[] = mealInput.map(meal => 'kind' in meal ? meal : { ...meal, kind: 'lunch' });
  const vacationDetails = vacationDaysForItinerary(screenings, meals, input);
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
    const meal = meals.reduce((sum, m) => sum + Math.max(0, Math.min(start, minute(m.endAt)) - Math.max(end, minute(m.startAt))), 0);
    waiting += start - end - movement - meal;
  }
  return { screenings: [...screenings], missedFilmIds, vacationDates, vacationDetails, meals, lunches: meals.filter(meal => meal.kind === 'lunch').map(({ date, startAt, endAt }) => ({ date, startAt, endAt })), score: { missedFilmCount: missedFilmIds.length, vacationUnits, vacationDays: vacationUnits / 2, screeningDays, travelMinutes: travel, waitingMinutes: waiting } };
}
