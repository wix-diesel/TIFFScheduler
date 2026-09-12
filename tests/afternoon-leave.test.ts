import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONSTRAINTS, optimizeSchedule, screeningVacationRequirement, vacationDaysForItinerary, lunchBreaks, validateInput } from '../src/scheduler/index.ts';
import type { ScheduleInput, Screening } from '../src/scheduler/types.ts';

const time = (clock: string, date = '2026-10-30') => `${date}T${clock}:00+09:00`;
const screening = (id: string, filmId: string, start: string, end: string, venueId = 'a', date = '2026-10-30'): Screening => ({ id, filmId, venueId, startAt: time(start, date), endAt: time(end, date) });
function input(screenings: Screening[]): ScheduleInput {
  const ids = [...new Set(screenings.map(s => s.filmId))];
  return { films: ids.map(id => ({ id, title: id, durationMinutes: 60 })), screenings,
    venues: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    travelTimes: [{ fromVenueId: 'a', toVenueId: 'b', minutes: 10 }, { fromVenueId: 'b', toVenueId: 'a', minutes: 10 }],
    selectedFilmIds: ids, constraints: structuredClone(DEFAULT_CONSTRAINTS), holidays: [] };
}

test('afternoon leave starts after the arrival buffer and contributes half a day', () => {
  const data = input([
    screening('at-start', 'film', '13:00', '14:00'),
    screening('allowed', 'film', '13:10', '14:10'),
  ]);
  data.constraints.afternoonLeaveDates = ['2026-10-30'];
  data.constraints.lunchWindowStart = '15:00';
  data.constraints.lunchWindowEnd = '16:00';
  assert.equal(screeningVacationRequirement(data.screenings[0]!, data), null);
  assert.deepEqual(screeningVacationRequirement(data.screenings[1]!, data), { date: '2026-10-30', kind: 'afternoon', units: 1 });
  const result = optimizeSchedule(data);
  assert.deepEqual(result.plans[0]!.screenings.map(s => s.id), ['allowed']);
  assert.equal(result.plans[0]!.score.vacationUnits, 1);
  assert.equal(result.plans[0]!.score.vacationDays, 0.5);
  assert.deepEqual(result.plans[0]!.vacationDetails, [{ date: '2026-10-30', kind: 'afternoon', units: 1 }]);
});

test('full leave, afternoon leave, evenings, and non-working days are scored distinctly', () => {
  const data = input([
    screening('full', 'full', '10:00', '11:00', 'a', '2026-10-30'),
    screening('afternoon', 'afternoon', '13:10', '14:00', 'a', '2026-11-02'),
    screening('evening', 'evening', '18:10', '19:00', 'a', '2026-10-30'),
    screening('weekend', 'weekend', '10:00', '11:00', 'a', '2026-11-01'),
  ]);
  data.constraints.afternoonLeaveDates = ['2026-11-02'];
  data.constraints.lunchWindowStart = '15:00';
  data.constraints.lunchWindowEnd = '16:00';
  assert.deepEqual(screeningVacationRequirement(data.screenings[0]!, data), { date: '2026-10-30', kind: 'full', units: 2 });
  assert.deepEqual(screeningVacationRequirement(data.screenings[1]!, data), { date: '2026-11-02', kind: 'afternoon', units: 1 });
  assert.equal(screeningVacationRequirement(data.screenings[2]!, data), undefined);
  assert.equal(screeningVacationRequirement(data.screenings[3]!, data), undefined);
});

test('lunch placement searches for an afternoon slot on an afternoon-only date', () => {
  const data = input([screening('film', 'film', '13:10', '14:00')]);
  data.constraints.afternoonLeaveDates = ['2026-10-30'];
  data.constraints.lunchWindowStart = '12:00';
  data.constraints.lunchWindowEnd = '16:00';
  data.constraints.lunchDurationMinutes = 30;
  const lunches = lunchBreaks(data.screenings, data);
  assert.deepEqual(lunches, [{ date: '2026-10-30', startAt: time('14:05'), endAt: time('14:35') }]);
  assert.deepEqual(vacationDaysForItinerary(data.screenings, lunches!, data), [{ date: '2026-10-30', kind: 'afternoon', units: 1 }]);
});

test('half-day ranking prefers one afternoon leave to one full day and equates two halves to one full day', () => {
  const data = input([
    screening('afternoon', 'film', '13:10', '14:00', 'a', '2026-10-30'),
    screening('full', 'film', '10:00', '11:00', 'a', '2026-11-02'),
  ]);
  data.constraints.afternoonLeaveDates = ['2026-10-30'];
  data.constraints.lunchWindowStart = '15:00';
  data.constraints.lunchWindowEnd = '16:00';
  const best = optimizeSchedule(data).plans[0]!;
  assert.deepEqual(best.screenings.map(s => s.id), ['afternoon']);
  assert.equal(best.score.vacationUnits, 1);
  const twoHalves = input([
    screening('one', 'one', '13:10', '14:00', 'a', '2026-10-30'),
    screening('two', 'two', '13:10', '14:00', 'a', '2026-11-03'),
  ]);
  twoHalves.constraints.afternoonLeaveDates = ['2026-10-30', '2026-11-03'];
  twoHalves.constraints.lunchWindowStart = '15:00';
  twoHalves.constraints.lunchWindowEnd = '16:00';
  assert.equal(optimizeSchedule(twoHalves).plans[0]!.score.vacationUnits, 2);
});

test('afternoon leave date conflicts and invalid start times are rejected', () => {
  const data = input([screening('film', 'film', '13:10', '14:00')]);
  data.constraints.afternoonLeaveDates = ['2026-10-30'];
  data.constraints.additionalDaysOff = ['2026-10-30'];
  assert.throws(() => validateInput(data), /conflicting afternoon leave/);
  data.constraints.additionalDaysOff = [];
  data.constraints.afternoonLeaveStart = '09:00';
  assert.throws(() => validateInput(data), /afternoon leave start/);
  data.constraints.afternoonLeaveStart = '18:00';
  assert.throws(() => validateInput(data), /afternoon leave start/);
});
