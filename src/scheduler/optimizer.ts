import type { ScheduleInput, SchedulePlan, ScheduleResult, Screening } from './types.ts';
import { canFollow, occupied, vacationDate, lunchBreaks } from './constraints.ts';
import { compareScores, scorePlan } from './scoring.ts';
import { validateInput } from './validation.ts';
const planKey = (plan: SchedulePlan) => JSON.stringify(plan.screenings.map(s => s.id));
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Exact top-k DFS. Missing a film is an explicit branch, so infeasible full
 * selections still produce maximum-cardinality alternatives. No hidden timeout. */
export function optimizeSchedule(input: ScheduleInput, maxPlans = 3): ScheduleResult {
  validateInput(input);
  if (!Number.isInteger(maxPlans) || maxPlans < 1 || maxPlans > 3) throw new Error('maxPlans must be 1..3');
  if (!input.selectedFilmIds.length) return { plans: [], visitedNodes: 0 };
  const groups = input.selectedFilmIds.map(id => ({ id, candidates: input.screenings.filter(s => {
    const vacation = vacationDate(s, input);
    return s.filmId === id && !(vacation && input.constraints.unavailableDates.includes(vacation));
  }).sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || lexical(a.id, b.id)) }))
    .sort((a, b) => a.candidates.length - b.candidates.length || lexical(a.id, b.id));
  const plans: SchedulePlan[] = [];
  let visitedNodes = 0;
  function visit(index: number, selected: Screening[]): void {
    visitedNodes++;
    const worst = plans.length === maxPlans ? plans[plans.length - 1] : undefined;
    if (worst) {
      const minimumMissed = index - selected.length;
      if (minimumMissed > worst.score.missedFilmCount) return;
      const vacationCount = new Set(selected.map(s => vacationDate(s, input)).filter(Boolean)).size;
      if (minimumMissed === worst.score.missedFilmCount && vacationCount > worst.score.vacationDays) return;
    }
    if (index === groups.length) {
      if (!selected.every((b, i) => i === 0 || canFollow(selected[i - 1]!, b, input))) return;
      const lunches = lunchBreaks(selected, input);
      if (!lunches) return;
      plans.push(scorePlan(selected, lunches, input));
      plans.sort((a, b) => compareScores(a.score, b.score) || lexical(planKey(a), planKey(b)));
      if (plans.length > maxPlans) plans.pop();
      return;
    }
    for (const s of groups[index]!.candidates) {
      const next = [...selected, s].sort((a, b) => occupied(a, input)[0] - occupied(b, input)[0] || lexical(a.id, b.id));
      // An intermediate screening can change the route (including missing edges).
      // Only occupancy overlap is monotone for arbitrary directed matrices.
      if (next.every((b, i) => i === 0 || occupied(next[i - 1]!, input)[1] <= occupied(b, input)[0])) visit(index + 1, next);
    }
    visit(index + 1, selected);
  }
  visit(0, []);
  return { plans, visitedNodes };
}
