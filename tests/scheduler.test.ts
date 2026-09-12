import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSchedule, DEFAULT_CONSTRAINTS, canFollow, vacationDate, mealBreaks, lunchBreaks, vacationDaysForItinerary, compareScores, scorePlan, meetsEarliestScreeningStart, meetsLatestScreeningEnd, withinDailyScreeningLimit } from '../src/scheduler/index.ts';
import type { ScheduleInput, Screening } from '../src/scheduler/types.ts';
const time = (clock: string, date = '2026-10-30') => `${date}T${clock}:00+09:00`;
const screening = (id: string, filmId: string, start: string, end: string, venueId = 'a', date = '2026-10-30'): Screening => ({ id, filmId, venueId, startAt: time(start, date), endAt: time(end, date) });
function input(screenings: Screening[]): ScheduleInput {
  const ids = [...new Set(screenings.map(s => s.filmId))];
  return { films: ids.map(id => ({ id, title: id, durationMinutes: 60 })), screenings,
    venues: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    travelTimes: [{ fromVenueId: 'a', toVenueId: 'b', minutes: 10 }, { fromVenueId: 'b', toVenueId: 'a', minutes: 15 }],
    selectedFilmIds: ids, constraints: structuredClone(DEFAULT_CONSTRAINTS), holidays: [] };
}
test('overlap, same-venue buffers, exact boundary and directional travel', () => {
  const a = screening('a', 'a', '09:00', '10:00');
  const b = screening('b', 'b', '10:15', '11:00'); const data = input([a, b]);
  assert.equal(canFollow(a, b, data), true);
  assert.equal(canFollow(a, { ...b, startAt: time('10:14') }, data), false);
  assert.equal(canFollow(a, { ...b, startAt: time('09:30') }, data), false);
  assert.equal(canFollow(a, { ...b, venueId: 'b', startAt: time('10:25') }, data), true);
  assert.equal(canFollow({ ...a, venueId: 'b' }, { ...b, startAt: time('10:25') }, data), false);
  data.travelTimes = [];
  assert.equal(canFollow(a, { ...b, venueId: 'b', startAt: time('11:00') }, data), false);
});
test('events before and after are mandatory occupancy', () => {
  const a = { ...screening('a', 'a', '09:00', '10:00'), eventAfterMinutes: 20 };
  const b = { ...screening('b', 'b', '10:45', '11:15'), eventBeforeMinutes: 10 };
  const data = input([a, b]); assert.equal(canFollow(a, b, data), true);
  assert.equal(canFollow(a, { ...b, eventBeforeMinutes: 11 }, data), false);
});
test('earliest start uses JST, includes the preceding event and excludes the arrival buffer', () => {
  const boundary = screening('boundary', 'film', '10:00', '11:00');
  const data = input([boundary]);
  data.constraints.earliestScreeningStart = '10:00';
  assert.equal(meetsEarliestScreeningStart(boundary, data), true);
  assert.equal(meetsEarliestScreeningStart({ ...boundary, startAt: time('09:59') }, data), false);
  assert.equal(meetsEarliestScreeningStart({ ...boundary, startAt: time('10:10'), eventBeforeMinutes: 10 }, data), true);
  assert.equal(meetsEarliestScreeningStart({ ...boundary, startAt: time('10:10'), eventBeforeMinutes: 11 }, data), false);
  // Even a large arrival buffer is occupancy only and does not reject the screening.
  data.constraints.arrivalBufferMinutes = 120;
  assert.equal(meetsEarliestScreeningStart(boundary, data), true);
  assert.equal(meetsEarliestScreeningStart({ ...boundary, startAt: '2026-10-30T01:00:00Z', endAt: '2026-10-30T02:00:00Z' }, data), true);

  const candidates = input([
    screening('early', 'film', '09:59', '10:59'),
    screening('allowed', 'film', '10:00', '11:00'),
  ]);
  candidates.constraints.earliestScreeningStart = '10:00';
  assert.equal(optimizeSchedule(candidates).plans[0]!.screenings[0]!.id, 'allowed');
  candidates.constraints.earliestScreeningStart = undefined;
  assert.equal(optimizeSchedule(candidates).plans[0]!.score.missedFilmCount, 0);
});
test('latest end uses the JST start date, includes the following event and excludes the exit buffer', () => {
  const boundary = screening('boundary', 'film', '20:00', '22:00');
  const data = input([boundary]);
  data.constraints.latestScreeningEnd = '22:00';
  assert.equal(meetsLatestScreeningEnd(boundary, data), true);
  assert.equal(meetsLatestScreeningEnd({ ...boundary, endAt: time('22:01') }, data), false);
  assert.equal(meetsLatestScreeningEnd({ ...boundary, endAt: time('21:50'), eventAfterMinutes: 10 }, data), true);
  assert.equal(meetsLatestScreeningEnd({ ...boundary, endAt: time('21:50'), eventAfterMinutes: 11 }, data), false);
  // Even a large exit buffer is occupancy only and does not reject the screening.
  data.constraints.exitBufferMinutes = 120;
  assert.equal(meetsLatestScreeningEnd(boundary, data), true);
  assert.equal(meetsLatestScreeningEnd({ ...boundary, startAt: '2026-10-30T11:00:00Z', endAt: '2026-10-30T13:00:00Z' }, data), true);
  // A 01:00 end is on the following day and must not pass the 22:00 limit of its start date.
  assert.equal(meetsLatestScreeningEnd({ ...boundary, startAt: time('23:00'), endAt: time('01:00', '2026-10-31') }, data), false);

  const candidates = input([
    screening('late', 'film', '20:00', '22:01'),
    screening('allowed', 'film', '20:00', '22:00'),
  ]);
  candidates.constraints.latestScreeningEnd = '22:00';
  assert.equal(optimizeSchedule(candidates).plans[0]!.screenings[0]!.id, 'allowed');
  candidates.constraints.latestScreeningEnd = undefined;
  assert.equal(optimizeSchedule(candidates).plans[0]!.score.missedFilmCount, 0);
});
test('vacation uses JST, configured working weekdays, work interval and additional days off', () => {
  const s = screening('a', 'a', '10:00', '11:00'); const data = input([s]);
  assert.equal(vacationDate(s, data), '2026-10-30');
  assert.equal(vacationDate({ ...s, startAt: '2026-10-30T01:00:00Z', endAt: '2026-10-30T02:00:00Z' }, data), '2026-10-30');
  assert.equal(vacationDate(screening('b', 'a', '18:10', '20:00'), data), undefined);
  assert.equal(vacationDate(screening('b', 'a', '18:09', '20:00'), data), '2026-10-30');
  assert.equal(vacationDate(screening('b', 'a', '10:00', '11:00', 'a', '2026-10-31'), data), undefined);
  // A configured working weekday remains a workday even when the supplied
  // festival calendar contains that date.
  data.holidays = ['2026-10-30']; assert.equal(vacationDate(s, data), '2026-10-30');
  data.holidays = []; data.constraints.additionalDaysOff = ['2026-10-30']; assert.equal(vacationDate(s, data), undefined);
});
test('unavailable means no leave; evening and non-workday screenings remain eligible', () => {
  const data = input([screening('a', 'a', '10:00', '11:00'), screening('b', 'a', '19:00', '20:00')]);
  data.constraints.unavailableDates = ['2026-10-30'];
  assert.equal(optimizeSchedule(data).plans[0]!.screenings[0]!.id, 'b');
  data.constraints.additionalDaysOff = ['2026-10-30'];
  assert.equal(optimizeSchedule(data).plans[0]!.score.missedFilmCount, 0);
});
test('lunch is continuous, inside window, excludes events, buffers and travel', () => {
  const data = input([screening('a', 'a', '10:00', '11:30'), screening('b', 'b', '12:40', '14:30', 'b')]);
  assert.deepEqual(lunchBreaks(data.screenings, data), [{ date: '2026-10-30', startAt: time('11:45'), endAt: time('12:30') }]);
  data.screenings = [data.screenings[0]!, { ...data.screenings[1]!, startAt: time('12:39') }];
  assert.equal(lunchBreaks(data.screenings, data), undefined);
  const evening = input([screening('a', 'a', '19:00', '20:00')]);
  assert.deepEqual(lunchBreaks(evening.screenings, evening), []);
  const full = input([screening('a', 'a', '11:00', '15:00')]);
  assert.equal(optimizeSchedule(full).plans[0]!.score.missedFilmCount, 1);
});
test('dinner is opt-in, spans itinerary gaps, and is jointly reserved with lunch', () => {
  const data = input([
    screening('lunch', 'lunch', '11:00', '11:30'),
    screening('dinner', 'dinner', '18:00', '20:00'),
  ]);
  // Off means no evening reservation even when the itinerary crosses dinner.
  assert.deepEqual(mealBreaks(data.screenings, data)!.map(meal => meal.kind), ['lunch']);
  data.constraints.dinnerEnabled = true;
  const meals = mealBreaks(data.screenings, data)!;
  assert.deepEqual(meals.map(meal => meal.kind), ['lunch', 'dinner']);
  assert.deepEqual(meals[1], { kind: 'dinner', date: '2026-10-30', startAt: time('20:05'), endAt: time('20:50') });
  assert.equal(optimizeSchedule(data).plans[0]!.meals.filter(meal => meal.kind === 'dinner').length, 1);

  // A one-minute-short dinner window makes the selected screening infeasible.
  data.constraints.dinnerWindowEnd = '20:49';
  assert.equal(optimizeSchedule(data).plans[0]!.score.missedFilmCount, 1);
});
test('maximizes films before minimizing vacation and counts each date once', () => {
  const data = input([screening('a1', 'a', '09:00', '10:00'), screening('a2', 'a', '09:00', '10:00', 'a', '2026-10-31'), screening('b', 'b', '10:30', '11:15')]);
  const best = optimizeSchedule(data).plans[0]!;
  assert.equal(best.score.missedFilmCount, 0); assert.equal(best.score.vacationDays, 1);
  assert.equal(optimizeSchedule(input([data.screenings[0]!, data.screenings[2]!])).plans[0]!.score.vacationDays, 1);
  assert.equal(optimizeSchedule(input([data.screenings[0]!, data.screenings[1]!])).plans[0]!.score.vacationDays, 0);
});
test('same vacation count prefers less travel, then less waiting', () => {
  const data = input([screening('a', 'a', '09:00', '10:00'), screening('b1', 'b', '10:30', '11:00', 'b'), screening('b2', 'b', '11:00', '11:15'), screening('b3', 'b', '10:20', '11:00')]);
  assert.equal(optimizeSchedule(data).plans[0]!.screenings[1]!.id, 'b3');
});
test('same vacation count prefers fewer screening days before travel', () => {
  const data = input([
    screening('a', 'a', '09:00', '10:00'),
    screening('b-same-day', 'b', '10:30', '11:00', 'b'),
    screening('b-next-day', 'b', '09:00', '09:30', 'a', '2026-10-31'),
  ]);
  data.constraints.workingWeekdays = [5, 6];
  const best = optimizeSchedule(data).plans[0]!;
  assert.equal(best.score.vacationDays, 1);
  assert.equal(best.score.screeningDays, 1);
  assert.deepEqual(best.screenings.map(s => s.id), ['a', 'b-same-day']);
});
test('maximum-cardinality alternatives, missing candidates, deterministic top three', () => {
  const data = input(['a', 'b', 'c', 'd'].map(id => screening(id, id, '09:00', '10:00')));
  const result = optimizeSchedule(data);
  assert.equal(result.plans.length, 3);
  assert.ok(result.plans.every(p => p.screenings.length === 1 && p.missedFilmIds.length === 3));
  assert.deepEqual(optimizeSchedule({ ...data, screenings: [...data.screenings].reverse(), selectedFilmIds: [...data.selectedFilmIds].reverse() }).plans, result.plans);
  data.screenings = [];
  assert.equal(optimizeSchedule(data).plans[0]!.score.missedFilmCount, 4);
  data.selectedFilmIds = []; assert.deepEqual(optimizeSchedule(data).plans, []);
});
test('limits screenings per JST start date and keeps maximum-cardinality alternatives', () => {
  const sameDay = input([
    screening('a', 'a', '09:00', '10:00'),
    screening('b', 'b', '10:30', '11:30'),
    screening('c', 'c', '15:00', '16:00'),
  ]);
  sameDay.constraints.maxScreeningsPerDay = 2;
  const alternatives = optimizeSchedule(sameDay).plans;
  assert.ok(alternatives.every(plan => plan.screenings.length === 2 && plan.missedFilmIds.length === 1));
  assert.ok(alternatives.every(plan => withinDailyScreeningLimit(plan.screenings, sameDay)));

  sameDay.screenings = [...sameDay.screenings, screening('c-next', 'c', '09:00', '10:00', 'a', '2026-10-31')];
  assert.equal(optimizeSchedule(sameDay).plans[0]!.score.missedFilmCount, 0);

  const boundary = input([
    { ...screening('utc', 'utc', '00:30', '01:30'), startAt: '2026-10-30T15:30:00Z', endAt: '2026-10-30T16:30:00Z' },
    screening('jst', 'jst', '02:00', '03:00', 'a', '2026-10-31'),
  ]);
  boundary.constraints.maxScreeningsPerDay = 1;
  assert.equal(optimizeSchedule(boundary).plans[0]!.screenings.length, 1);
});
test('rejects malformed input instead of silently producing plans', () => {
  const base = input([screening('a', 'a', '09:00', '10:00')]);
  for (const mutate of [
    (d: ScheduleInput) => { d.selectedFilmIds = ['unknown']; },
    (d: ScheduleInput) => { d.selectedFilmIds = ['a', 'a']; },
    (d: ScheduleInput) => { d.screenings = [{ ...d.screenings[0]!, startAt: '2026-10-30T09:00:00' }]; },
    (d: ScheduleInput) => { d.constraints.arrivalBufferMinutes = -1; },
    (d: ScheduleInput) => { d.constraints.maxScreeningsPerDay = 0; },
    (d: ScheduleInput) => { d.constraints.maxScreeningsPerDay = -1; },
    (d: ScheduleInput) => { d.constraints.maxScreeningsPerDay = 1.5; },
    (d: ScheduleInput) => { d.constraints.maxScreeningsPerDay = Infinity; },
    (d: ScheduleInput) => { d.constraints.earliestScreeningStart = ''; },
    (d: ScheduleInput) => { d.constraints.earliestScreeningStart = '24:00'; },
    (d: ScheduleInput) => { d.constraints.latestScreeningEnd = '24:00'; },
    (d: ScheduleInput) => { d.constraints.earliestScreeningStart = '10:00'; d.constraints.latestScreeningEnd = '10:00'; },
    (d: ScheduleInput) => { d.constraints.earliestScreeningStart = '10:01'; d.constraints.latestScreeningEnd = '10:00'; },
    (d: ScheduleInput) => { d.constraints.additionalDaysOff = ['2026-02-30']; },
    (d: ScheduleInput) => { d.screenings = [screening('a', 'a', '23:00', '01:00')]; },
    (d: ScheduleInput) => { d.travelTimes = [...d.travelTimes, d.travelTimes[0]!]; },
  ]) { const d = structuredClone(base); mutate(d); assert.throws(() => optimizeSchedule(d), /Invalid schedule input/); }
  base.constraints.maxScreeningsPerDay = base.selectedFilmIds.length + 1;
  assert.equal(optimizeSchedule(base).plans[0]!.score.missedFilmCount, 0);
  assert.throws(() => optimizeSchedule(base, 4));
});
test('waiting excludes the reserved lunch and movement', () => {
  const data = input([screening('a', 'a', '10:00', '11:30'), screening('b', 'b', '12:40', '14:30', 'b')]);
  assert.equal(optimizeSchedule(data).plans[0]!.score.waitingMinutes, 0);
});
// Exhaustive enumeration deliberately has no optimizer pruning. Seeded fixtures
// exercise candidate permutations and omission branches against exact top-k.
test('branch and bound matches exhaustive top-three enumeration for 40 seeded cases', () => {
  let seed = 42;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 40; trial++) {
    const screenings: Screening[] = [];
    for (let f = 0; f < 4; f++) for (let c = 0; c < 2; c++) {
      const hour = 8 + random(12), date = random(2) ? '2026-10-30' : '2026-10-31';
      screenings.push(screening(`${f}-${c}`, `${f}`, `${hour}`.padStart(2, '0') + ':00', `${hour + 1}`.padStart(2, '0') + ':00', random(2) ? 'a' : 'b', date));
    }
    const data = input(screenings), all: ReturnType<typeof scorePlan>[] = [];
    data.constraints.maxScreeningsPerDay = 1 + random(2);
    // Exercise the units-based branch-and-bound lower bound as well as the
    // legacy whole-day path. The generated dates are 10/30 (Friday) and
    // 10/31 (Saturday), so the first setting produces real half-day cases
    // while the second also verifies that non-working days ignore the flag.
    if (trial % 3 === 0) data.constraints.afternoonLeaveDates = ['2026-10-30'];
    else if (trial % 3 === 1) data.constraints.afternoonLeaveDates = ['2026-10-30', '2026-10-31'];
    function enumerate(i: number, chosen: Screening[]) {
      if (i < data.selectedFilmIds.length) {
        enumerate(i + 1, chosen);
        for (const s of screenings.filter(s => s.filmId === data.selectedFilmIds[i])) enumerate(i + 1, [...chosen, s]);
        return;
      }
      chosen.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
      if (!withinDailyScreeningLimit(chosen, data)) return;
      if (!chosen.every((s, j) => j === 0 || canFollow(chosen[j - 1]!, s, data))) return;
      const lunches = lunchBreaks(chosen, data); if (lunches && vacationDaysForItinerary(chosen, lunches, data)) all.push(scorePlan(chosen, lunches, data));
    }
    enumerate(0, []);
    const key = (p: ReturnType<typeof scorePlan>) => JSON.stringify(p.screenings.map(s => s.id));
    all.sort((a, b) => compareScores(a.score, b.score) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    assert.deepEqual(optimizeSchedule(data).plans, all.slice(0, 3), `seeded trial ${trial}`);
  }
});
test('does not prune a partial route that a later intermediate film can make feasible', () => {
  const data = input([screening('a', 'a', '08:00', '09:00', 'a'), screening('b', 'b', '11:00', '11:15', 'b'), screening('c', 'c', '09:30', '10:00', 'c')]);
  data.venues = [...data.venues, { id: 'c', name: 'C' }];
  data.travelTimes = [{ fromVenueId: 'a', toVenueId: 'c', minutes: 10 }, { fromVenueId: 'c', toVenueId: 'b', minutes: 10 }];
  assert.equal(optimizeSchedule(data).plans[0]!.score.missedFilmCount, 0);
});
