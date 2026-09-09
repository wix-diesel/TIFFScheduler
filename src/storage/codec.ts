import type { ScheduleInput, ScheduleResult, UserConstraints } from '../scheduler/types.ts';
import { validateInput } from '../scheduler/validation.ts';
import { migrateConstraints } from './migration.ts';

export type Snapshot = { input: ScheduleInput; result: ScheduleResult };
export type SavedPlan = { id: string; name: string; createdAt: string; dataFingerprint: string; snapshot: Snapshot };
export interface PersistedState {
  schemaVersion: 1; festivalId: string; dataFingerprint: string; updatedAt: string;
  selectedFilmIds: string[]; constraints: UserConstraints; lastResult: Snapshot | null; savedPlans: SavedPlan[];
}
export const MAX_PLANS = 20;
export class FutureSchemaError extends Error {}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const natural = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function assert(ok: unknown): asserts ok { if (!ok) throw new Error('Invalid stored data'); }
function constraints(value: unknown): UserConstraints {
  assert(object(value));
  const c = migrateConstraints(value);
  assert(Array.isArray(c.workingWeekdays) && c.workingWeekdays.every(x => natural(x) && x <= 6));
  assert(strings(c.additionalDaysOff) && c.additionalDaysOff.every(date));
  assert(strings(c.unavailableDates) && c.unavailableDates.every(date));
  // Drafts can have temporarily inconsistent windows, but never invalid types.
  for (const x of [c.workStart,c.workEnd,c.lunchWindowStart,c.lunchWindowEnd]) assert(typeof x === 'string' && (x === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(x)));
  for (const x of [c.lunchDurationMinutes,c.exitBufferMinutes,c.arrivalBufferMinutes]) assert(typeof x === 'number' && Number.isFinite(x));
  return c;
}
function snapshot(value: unknown): Snapshot {
  assert(object(value) && object(value.input) && object(value.result));
  const s = value as unknown as Snapshot;
  s.input.constraints = constraints(s.input.constraints);
  validateInput(s.input);
  assert(s.input.films.every(f => typeof f.title === 'string') && s.input.venues.every(v => typeof v.name === 'string'));
  assert(Array.isArray(s.result.plans) && s.result.plans.length <= 3 && natural(s.result.visitedNodes));
  const screeningsById = new Map(s.input.screenings.map(screening => [screening.id, JSON.stringify(screening)]));
  for (const p of s.result.plans) {
    assert(object(p) && Array.isArray(p.screenings) && strings(p.missedFilmIds) && strings(p.vacationDates));
    assert(p.missedFilmIds.every(id => s.input.films.some(f => f.id === id)) && p.vacationDates.every(date));
    assert(p.screenings.every(screening => object(screening) && screeningsById.get(screening.id) === JSON.stringify(screening)));
    assert(Array.isArray(p.lunches) && p.lunches.every(l => object(l) && date(l.date) && timestamp(l.startAt) && timestamp(l.endAt) && l.startAt < l.endAt));
    assert(object(p.score) && [p.score.missedFilmCount,p.score.vacationDays,p.score.travelMinutes,p.score.waitingMinutes].every(natural));
  }
  return s;
}
export function decode(raw: string, festivalId: string): PersistedState {
  const v: unknown = JSON.parse(raw);
  assert(object(v));
  if (typeof v.schemaVersion === 'number' && v.schemaVersion > 1) throw new FutureSchemaError();
  assert(v.schemaVersion === 1 && v.festivalId === festivalId && typeof v.dataFingerprint === 'string' && timestamp(v.updatedAt));
  assert(strings(v.selectedFilmIds) && new Set(v.selectedFilmIds).size === v.selectedFilmIds.length);
  v.constraints = constraints(v.constraints);
  if (v.lastResult !== null) v.lastResult = snapshot(v.lastResult);
  assert(Array.isArray(v.savedPlans) && v.savedPlans.length <= MAX_PLANS);
  const ids = new Set<string>();
  for (const p of v.savedPlans) {
    assert(object(p) && typeof p.id === 'string' && !!p.id && !ids.has(p.id)); ids.add(p.id);
    assert(typeof p.name === 'string' && !!p.name.trim() && p.name.length <= 100 && timestamp(p.createdAt) && typeof p.dataFingerprint === 'string');
    p.snapshot = snapshot(p.snapshot);
  }
  return v as unknown as PersistedState;
}
export function encode(state: PersistedState): string {
  // State is created by the app. Full validation belongs at the untrusted read boundary.
  assert(state.savedPlans.length <= MAX_PLANS);
  return JSON.stringify(state, (_key, value: unknown) => {
    // JSON would silently convert NaN/Infinity to null, including nested snapshots.
    assert(typeof value !== 'number' || Number.isFinite(value));
    return value;
  });
}
export function fingerprint(data: unknown): string {
  const raw = JSON.stringify(data);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < raw.length; i++) { a = Math.imul(a ^ raw.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ raw.charCodeAt(i); }
  return `${raw.length}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
