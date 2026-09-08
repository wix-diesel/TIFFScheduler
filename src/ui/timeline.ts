import type { ScheduleInput, SchedulePlan } from '../scheduler/types.ts';
import { occupied, travelMinutes } from '../scheduler/constraints.ts';
import { dateInJapan, minute } from '../scheduler/time.ts';
export interface TimelineEntry { start: number; end: number; label: string; detail: string; kind: 'film' | 'lunch' | 'travel' | 'buffer' }
export function buildTimeline(plan: SchedulePlan, input: ScheduleInput): Map<string, TimelineEntry[]> {
  const days = new Map<string, TimelineEntry[]>();
  const add = (entry: TimelineEntry) => {
    if (entry.end <= entry.start) return;
    const date = dateInJapan(entry.start);
    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(entry);
  };
  const screenings = [...plan.screenings].sort((a,b) => minute(a.startAt)-minute(b.startAt));
  screenings.forEach((s,i) => {
    const [start,end] = occupied(s,input);
    const venue = input.venues.find(v=>v.id===s.venueId)!.name;
    add({start,end:minute(s.startAt),label:'入場・上映前イベント',detail:venue,kind:'buffer'});
    add({start:minute(s.startAt),end:minute(s.endAt),label:input.films.find(f=>f.id===s.filmId)!.title,detail:venue,kind:'film'});
    add({start:minute(s.endAt),end,label:'上映後イベント・退場',detail:venue,kind:'buffer'});
    const next=screenings[i+1];
    if(next && dateInJapan(end)===dateInJapan(occupied(next,input)[0])) add({start:end,end:end+travelMinutes(s,next,input),label:'会場移動',detail:`${venue} → ${input.venues.find(v=>v.id===next.venueId)!.name}`,kind:'travel'});
  });
  plan.lunches.forEach(l=>add({start:minute(l.startAt),end:minute(l.endAt),label:'昼食',detail:'移動・入退場と重ならない休憩時間',kind:'lunch'}));
  return new Map([...days].sort(([a],[b])=>a.localeCompare(b)).map(([d,entries])=>[d,entries.sort((a,b)=>a.start-b.start)]));
}
export const timeLabel=(value:number|string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(typeof value==='number'?value*60000:value));
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(date+'T00:00:00+09:00'));
