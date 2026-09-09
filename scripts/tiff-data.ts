import departmentSource from '../data-sources/departments-2025.json' with { type: 'json' };
import type { Film, Screening, Venue, TravelTime } from '../src/scheduler/types.ts';
import { DEFAULT_CONSTRAINTS } from '../src/scheduler/types.ts';
import { validateInput } from '../src/scheduler/validation.ts';

export const SOURCE_URL = 'https://api-2025.tiff-jp.net/api/venues/acts';
export const START = '2025-10-27';
export const END = '2025-11-05';
export interface SourceAct {
  id: number; filmId: string; title: string; duration: string | null;
  date: string; start: string; end: string; venueId: number; venueName: string;
  cinemaId: number; departmentId: number; events: string[];
}
export interface Source { year: number; retrievedAt: string; sourceUrl: string; acts: SourceAct[] }
interface Issue { actId: number; title: string; reason: string }
const clean = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
/** Whitelist factual fields only; descriptions, images and guest biographies never enter the repository. */
export function projectOfficialData(raw: unknown, retrievedAt: string): Source {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Expected official venues/acts array');
  const acts: SourceAct[] = [];
  for (const area of raw) {
    if (!Array.isArray(area.children)) throw new Error('Missing cinemas');
    for (const cinema of area.children) {
      if (!Array.isArray(cinema.acts)) throw new Error('Missing acts');
      for (const act of cinema.acts) {
        if (act.deleted_at || act.film?.deleted_at) continue;
        const f = act.film;
        if (!f || f.year !== 2025 || !f.film_identifier || !act.venue || act.venue.id !== act.venue_id) throw new Error(`Malformed act ${act.id}`);
        acts.push({ id: act.id, filmId: f.film_identifier, title: clean(f.title_ja), duration: f.film_time_length,
          date: act.act_date.slice(0, 10), start: act.play_at, end: act.end_at,
          venueId: act.venue_id, venueName: clean(act.venue.name_ja).replace(/ \(車椅子スペースあり\)/g, ''),
          cinemaId: cinema.id, departmentId: f.department_id,
          events: [['is_event_sa', '舞台挨拶'], ['is_event_qa', 'Q&A'], ['is_event_ts', 'トーク'], ['is_event_award', '授賞式'], ['is_event_event', 'イベント']].filter(([key]) => act[key!]).map(([, label]) => label!),
        });
      }
    }
  }
  if (!acts.length) throw new Error('Empty official dataset');
  return { year: 2025, retrievedAt, sourceUrl: SOURCE_URL, acts: acts.sort((a,b) => a.id-b.id) };
}
export interface Location { cinemaIds: number[]; address: string; stationWalkMinutes: number; buildingMinutes: number }
export interface TravelConfig { sourceUrl: string; method: string; hub: string; locations: Location[] }
export function buildDataset(source: Source, travel: TravelConfig) {
  if (source.year !== 2025 || source.sourceUrl !== SOURCE_URL || !source.acts.length) throw new Error('Wrong or empty source');
  const films = new Map<string, Film>();
  const venues = new Map<string, Venue>();
  const screenings: Screening[] = [];
  const excluded: Issue[] = [], corrections: Issue[] = [];
  const ids = new Set<number>();
  for (const a of source.acts) {
    if (!Number.isSafeInteger(a.id) || ids.has(a.id)) throw new Error(`Duplicate/invalid act ID ${a.id}`);
    ids.add(a.id);
    const skip = (reason: string) => excluded.push({actId: a.id, title: a.title, reason});
    if (a.date < START || a.date > END) { skip('開催期間外'); continue; }
    if (a.departmentId === 26) { skip('映画上映ではない業界向けイベント'); continue; }
    if (!/^\d+$/.test(a.duration ?? '') || Number(a.duration) <= 0) { skip('本編時間が未記載・複数作品枠・受賞作品未確定'); continue; }
    const duration = Number(a.duration);
    const timestamp = (clock: string) => `${a.date}T${clock}+09:00`;
    if (![a.start,a.end].every(t=>/^([01]\d|2[0-3]):[0-5]\d:00$/.test(t))) throw new Error(`Invalid clock ${a.id}`);
    const startAt = timestamp(a.start), officialEnd = timestamp(a.end);
    if (a.end <= a.start) { skip('終了時刻が未確定または日跨ぎ'); continue; }
    const runtimeEnd = Date.parse(startAt) + duration * 60_000;
    const endMs = Math.max(Date.parse(officialEnd), runtimeEnd);
    const endAt = new Date(endMs + 9 * 3600_000).toISOString().slice(0,19) + '+09:00';
    if (endAt.slice(0,10) !== a.date) { skip('日跨ぎ上映はコア未対応'); continue; }
    const url = `https://2025.tiff-jp.net/ja/lineup/film/${a.filmId}`;
    const department = departmentSource.departments.find(d => d.id === a.departmentId)?.name;
    if (!department) throw new Error(`Unknown department ${a.departmentId}`);
    const existing = films.get(a.filmId);
    if (existing && (existing.title !== a.title || existing.durationMinutes !== duration || existing.department !== department)) throw new Error(`Conflicting film ${a.filmId}`);
    films.set(a.filmId, {id:a.filmId, title:a.title, durationMinutes:duration, department, url});
    const venueId = `tiff-2025-venue-${a.venueId}`;
    const location = travel.locations.find(l=>l.cinemaIds.includes(a.cinemaId));
    if (!location) throw new Error(`Missing travel location for cinema ${a.cinemaId}`);
    const venue = {id:venueId, name:a.venueName, address:location.address};
    if (venues.has(venueId) && JSON.stringify(venues.get(venueId)) !== JSON.stringify(venue)) throw new Error(`Conflicting venue ${venueId}`);
    venues.set(venueId, venue);
    const corrected = endMs > Date.parse(officialEnd);
    if (corrected) corrections.push({actId:a.id, title:a.title, reason:`公式終了 ${a.end} が本編${duration}分より短いため ${endAt.slice(11,16)} まで確保`});
    screenings.push({id:`tiff-2025-act-${a.id}`,filmId:a.filmId,venueId,startAt,endAt,
      sourceUrl:url, timingNote:corrected ? '公式終了時刻の不整合を本編時間で補正' : '公式の上映枠終了（イベント等を含む）',
      eventLabel:a.events.join('・')});
  }
  const venueList = [...venues.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const locationOf = (id: string) => {
    const a = source.acts.find(a=>`tiff-2025-venue-${a.venueId}`===id)!;
    return travel.locations.find(l=>l.cinemaIds.includes(a.cinemaId))!;
  };
  // A conservative, reproducible route via JR Yurakucho station; same-building screen changes use 5 min.
  const travelTimes: TravelTime[] = venueList.flatMap(from=>venueList.map(to=>{
    const a=locationOf(from.id), b=locationOf(to.id);
    return {fromVenueId:from.id,toVenueId:to.id,minutes:from.id===to.id?0:a===b?5:
      Math.ceil((a.stationWalkMinutes+b.stationWalkMinutes+a.buildingMinutes+b.buildingMinutes+2)/5)*5};
  }));
  const dataset = {films:[...films.values()].sort((a,b)=>a.id.localeCompare(b.id)),screenings:screenings.sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id)),venues:venueList,travelTimes,holidays:['2025-11-03']};
  validateDataset(dataset);
  return {...dataset, report:{sourceCount:source.acts.length,filmCount:films.size,screeningCount:screenings.length,venueCount:venues.size,excluded,corrections}};
}
export interface Dataset { films: Film[]; screenings: Screening[]; venues: Venue[]; travelTimes: TravelTime[]; holidays: string[] }
export function validateDataset(data: Dataset): void {
  if (!data.films.length || !data.screenings.length || !data.venues.length) throw new Error('Empty dataset');
  validateInput({...data,selectedFilmIds:[],constraints:structuredClone(DEFAULT_CONSTRAINTS)});
  const routes=new Map(data.travelTimes.map(t=>[`${t.fromVenueId}/${t.toVenueId}`,t.minutes]));
  for(const a of data.venues) for(const b of data.venues) {
    const minutes=routes.get(`${a.id}/${b.id}`);
    if(minutes===undefined || (a.id!==b.id&&minutes<=0) || (a.id===b.id&&minutes!==0)) throw new Error(`Missing/invalid route ${a.id}/${b.id}`);
  }
  const slots = new Set<string>();
  for(const s of data.screenings) {
    if(!s.startAt.endsWith('+09:00') || !s.endAt.endsWith('+09:00') || s.startAt.slice(0,10)<START || s.startAt.slice(0,10)>END) throw new Error(`Outside 2025 festival ${s.id}`);
    const film=data.films.find(f=>f.id===s.filmId)!;
    if(Date.parse(s.endAt)-Date.parse(s.startAt)<film.durationMinutes*60_000) throw new Error(`Short screening ${s.id}`);
    const slot=`${s.venueId}/${s.startAt}`;
    if(slots.has(slot)) throw new Error(`Duplicate venue/start ${s.id}`);slots.add(slot);
    if(!s.sourceUrl?.startsWith('https://2025.tiff-jp.net/')) throw new Error(`Missing source ${s.id}`);
  }
  for(const f of data.films) if(!f.title.trim() || !data.screenings.some(s=>s.filmId===f.id)) throw new Error(`Unscheduled film ${f.id}`);
  if(JSON.stringify(data.holidays)!==JSON.stringify(['2025-11-03'])) throw new Error('Incorrect festival holiday calendar');
}
