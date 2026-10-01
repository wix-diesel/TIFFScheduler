import type { ScheduleInput, SchedulePlan, ScheduleResult, Screening } from './types.ts';
import { canFollow, occupied, screeningVacationRequirement, vacationDaysForItinerary, mealBreaks, meetsEarliestScreeningStart, meetsLatestScreeningEnd, withinDailyScreeningLimit } from './constraints.ts';
import { comparePriorities, compareScores, scorePlan } from './scoring.ts';
import { validateInput } from './validation.ts';
const planKey = (plan: SchedulePlan) => JSON.stringify(plan.screenings.map(s => s.id));
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Exact top-k DFS. Missing a film is an explicit branch, so infeasible full
 * selections still produce alternatives ranked by the selected objective. No hidden timeout. */
export function optimizeSchedule(input: ScheduleInput, maxPlans = 3): ScheduleResult {
  validateInput(input);
  if (!Number.isInteger(maxPlans) || maxPlans < 1 || maxPlans > 3) throw new Error('maxPlans must be 1..3');
  if (!input.selectedFilmIds.length) return { plans: [], visitedNodes: 0 };
  const objective = input.constraints.optimizationObjective ?? 'maxFilms';
  const groups = input.selectedFilmIds.map(id => ({ id, candidates: input.screenings.filter(s => {
    const vacation = screeningVacationRequirement(s, input);
    return s.filmId === id && meetsEarliestScreeningStart(s, input) && meetsLatestScreeningEnd(s, input) && vacation !== null && !(vacation && input.constraints.unavailableDates.includes(vacation.date));
  }).sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || lexical(a.id, b.id)) }))
    .sort((a, b) => a.candidates.length - b.candidates.length || lexical(a.id, b.id));
  const plans: SchedulePlan[] = [];
  let visitedNodes = 0;
  function visit(index: number, selected: Screening[]): void {
    visitedNodes++;
    const worst = plans.length === maxPlans ? plans[plans.length - 1] : undefined;
    if (worst) {
      const minimumMissed = index - selected.length;
      const lowerBoundByDate = new Map<string, number>();
      for (const screening of selected) {
        const requirement = screeningVacationRequirement(screening, input);
        if (requirement) lowerBoundByDate.set(requirement.date, Math.max(lowerBoundByDate.get(requirement.date) ?? 0, requirement.units));
      }
      const vacationUnits = [...lowerBoundByDate.values()].reduce((sum, units) => sum + units, 0);
      // Both values are optimistic bounds; use the same priority order as ranking.
      if (comparePriorities({ missedFilmCount: minimumMissed, vacationUnits }, worst.score, objective) > 0) return;
    }
    if (index === groups.length) {
      if (!selected.every((b, i) => i === 0 || canFollow(selected[i - 1]!, b, input))) return;
      const meals = mealBreaks(selected, input);
      if (!meals) return;
      if (!vacationDaysForItinerary(selected, meals, input)) return;
      plans.push(scorePlan(selected, meals, input));
      plans.sort((a, b) => compareScores(a.score, b.score, objective) || lexical(planKey(a), planKey(b)));
      if (plans.length > maxPlans) plans.pop();
      return;
    }
    for (const s of groups[index]!.candidates) {
      const next = [...selected, s].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || lexical(a.id, b.id));
      // The daily count can only increase, so exceeding it is safe to prune now.
      if (!withinDailyScreeningLimit(next, input)) continue;
      // An intermediate screening can change the route (including missing edges).
      // Only occupancy overlap is monotone for arbitrary directed matrices.
      if (next.every((b, i) => i === 0 || occupied(next[i - 1]!, input)[1] <= occupied(b, input)[0])) visit(index + 1, next);
    }
    visit(index + 1, selected);
  }
  visit(0, []);
  return { plans, visitedNodes };
}
