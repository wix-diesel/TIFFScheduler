import type { Snapshot } from '../storage/codec.ts';
import type { ScheduleInput, SchedulePlan, Screening } from '../scheduler/types.ts';
import { occupied, travelMinutes } from '../scheduler/constraints.ts';
import { dateInJapan, minute } from '../scheduler/time.ts';
import { generateIcs } from './ics.ts';
import type { IcsEvent, IcsOptions } from './ics.ts';

export interface PlanCalendarOptions extends IcsOptions {
  festivalId: string;
  planId?: string;
  includeAuxiliary?: boolean;
}

interface CalendarMeal { kind: 'lunch' | 'dinner'; date: string; startAt: string; endAt: string }

const uidPart = (value: string) => encodeURIComponent(value).replace(/%/g, '.');
const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const planIdentity = (plan: SchedulePlan) => plan.screenings.map(screening => screening.id).sort().join('+') || 'empty';
const location = (input: ScheduleInput, screening: Screening) => {
  const venue = input.venues.find(candidate => candidate.id === screening.venueId);
  return venue ? [venue.name, venue.address].filter(Boolean).join('、') : screening.venueId;
};
const screeningDescription = (input: ScheduleInput, screening: Screening) => {
  const film = input.films.find(candidate => candidate.id === screening.filmId);
  return [
    screening.eventLabel && `イベント: ${screening.eventLabel}`,
    screening.timingNote,
    `入場余裕: ${input.constraints.arrivalBufferMinutes}分 / 退場余裕: ${input.constraints.exitBufferMinutes}分（予定の開始・終了には含みません）`,
    film?.url && `作品公式URL: ${film.url}`,
  ].filter(Boolean).join('\n');
};

export function screeningEvent(input: ScheduleInput, screening: Screening, festivalId: string): IcsEvent {
  const film = input.films.find(candidate => candidate.id === screening.filmId);
  const url = film?.url ?? screening.sourceUrl;
  return {
    uid: `screening-${uidPart(festivalId)}-${uidPart(screening.id)}@tiff-scheduler`,
    summary: film?.title ?? screening.filmId,
    start: addMinutes(screening.startAt, -(screening.eventBeforeMinutes ?? 0)),
    end: addMinutes(screening.endAt, screening.eventAfterMinutes ?? 0),
    description: screeningDescription(input, screening),
    location: location(input, screening),
    ...(url ? { url } : {}),
  };
}

export function planEvents(snapshot: Snapshot, index: number, options: PlanCalendarOptions): IcsEvent[] {
  const plan = snapshot.result.plans[index];
  if (!plan) throw new Error('Schedule plan not found');
  const { input } = snapshot;
  const identity = uidPart(options.planId ?? planIdentity(plan));
  const events = plan.screenings.map(screening => screeningEvent(input, screening, options.festivalId));
  // `meals` is introduced by the dinner feature; retain the current `lunches`
  // fallback so old and saved snapshots remain exportable during migration.
  const migratedMeals = (plan as SchedulePlan & {meals?: readonly CalendarMeal[]}).meals;
  const meals: readonly CalendarMeal[] = migratedMeals ?? plan.lunches.map(lunch => ({...lunch,kind:'lunch' as const}));
  for (const meal of meals) events.push({
    uid: `meal-${uidPart(options.festivalId)}-${identity}-${meal.date}-${meal.kind}-${uidPart(meal.startAt)}@tiff-scheduler`,
    summary: meal.kind === 'dinner' ? '夕食' : '昼食', start: meal.startAt, end: meal.endAt,
    description: `TIFF Schedulerで確保した${meal.kind === 'dinner' ? '夕食' : '昼食'}時間`,
  });
  if (options.includeAuxiliary) {
    const screenings = [...plan.screenings].sort((a, b) => minute(a.startAt) - minute(b.startAt));
    screenings.forEach((screening, index) => {
      const [occupiedStart, occupiedEnd] = occupied(screening, input);
      const eventStart = minute(screening.startAt) - (screening.eventBeforeMinutes ?? 0);
      const eventEnd = minute(screening.endAt) + (screening.eventAfterMinutes ?? 0);
      if (occupiedStart < eventStart) events.push({uid:`arrival-${uidPart(options.festivalId)}-${uidPart(screening.id)}@tiff-scheduler`,summary:'入場',start:new Date(occupiedStart*60_000),end:new Date(eventStart*60_000),location:location(input,screening)});
      if (eventEnd < occupiedEnd) events.push({uid:`exit-${uidPart(options.festivalId)}-${uidPart(screening.id)}@tiff-scheduler`,summary:'退場',start:new Date(eventEnd*60_000),end:new Date(occupiedEnd*60_000),location:location(input,screening)});
      const next = screenings[index + 1];
      const travel = next && dateInJapan(occupiedEnd) === dateInJapan(occupied(next, input)[0]) ? travelMinutes(screening, next, input) : 0;
      if (next && Number.isFinite(travel) && travel > 0) events.push({
        uid:`travel-${uidPart(options.festivalId)}-${uidPart(screening.id)}-${uidPart(next.id)}@tiff-scheduler`, summary:'会場移動',
        start:new Date(occupiedEnd*60_000), end:new Date((occupiedEnd+travel)*60_000),
        description:`${location(input,screening)} → ${location(input,next)}`,
      });
    });
  }
  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || a.uid.localeCompare(b.uid));
}

export function generatePlanIcs(snapshot: Snapshot, index: number, options: PlanCalendarOptions): string {
  return generateIcs(planEvents(snapshot, index, options), {...options, calendarName: options.calendarName ?? 'TIFF Scheduler'});
}

export function generateScreeningIcs(input: ScheduleInput, screening: Screening, options: Omit<PlanCalendarOptions, 'includeAuxiliary' | 'planId'>): string {
  return generateIcs([screeningEvent(input, screening, options.festivalId)], {...options, calendarName: options.calendarName ?? 'TIFF Scheduler'});
}
