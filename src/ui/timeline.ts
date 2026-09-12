import type { ScheduleInput, SchedulePlan } from '../scheduler/types.ts';
import { occupied, travelMinutes } from '../scheduler/constraints.ts';
import { dateInJapan, minute } from '../scheduler/time.ts';
export interface TimelineEntry { start: number; end: number; label: string; detail: string; kind: 'film' | 'lunch' | 'dinner' | 'travel' | 'buffer'; screeningId?: string }
export function buildTimeline(plan: SchedulePlan, input: ScheduleInput): Map<string, TimelineEntry[]> {
  const days = new Map<string, TimelineEntry[]>();
  const venueNames = new Map(input.venues.map(venue => [venue.id, venue.name]));
  const filmTitles = new Map(input.films.map(film => [film.id, film.title]));
  const add = (entry: TimelineEntry) => {
    if (entry.end <= entry.start) return;
    const date = dateInJapan(entry.start);
    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(entry);
  };
  const screenings = plan.screenings.map(screening => ({
    screening, occupancy: occupied(screening, input),
    filmStart: minute(screening.startAt), filmEnd: minute(screening.endAt),
  })).sort((a,b) => a.filmStart-b.filmStart);
  screenings.forEach(({screening: s, occupancy: [start,end], filmStart, filmEnd},i) => {
    const venue = venueNames.get(s.venueId)!;
    add({start,end:filmStart,label:s.eventBeforeMinutes?'入場・上映前イベント':'入場',detail:venue,kind:'buffer'});
    add({start:filmStart,end:filmEnd,label:filmTitles.get(s.filmId)!,detail:[venue,s.eventLabel,s.timingNote].filter(Boolean).join(' / '),kind:'film',screeningId:s.id});
    add({start:filmEnd,end,label:s.eventAfterMinutes?'上映後イベント・退場':'退場',detail:venue,kind:'buffer'});
    const next=screenings[i+1];
    if(next && dateInJapan(end)===dateInJapan(next.occupancy[0])) add({start:end,end:end+travelMinutes(s,next.screening,input),label:'会場移動',detail:`${venue} → ${venueNames.get(next.screening.venueId)!}`,kind:'travel'});
  });
  const meals = plan.meals ?? (plan.lunches ?? []).map(lunch => ({ ...lunch, kind: 'lunch' as const }));
  meals.forEach(meal=>add({start:minute(meal.startAt),end:minute(meal.endAt),label:meal.kind === 'dinner' ? '夕食' : '昼食',detail:'移動・入退場と重ならない休憩時間',kind:meal.kind}));
  return new Map([...days].sort(([a],[b])=>a.localeCompare(b)).map(([d,entries])=>[d,entries.sort((a,b)=>a.start-b.start)]));
}
export const timeLabel=(value:number|string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(typeof value==='number'?value*60000:value));
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(date+'T00:00:00+09:00'));
