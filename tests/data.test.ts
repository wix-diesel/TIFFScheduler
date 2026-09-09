import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset, projectOfficialData, validateDataset } from '../scripts/tiff-data.ts';
import type { Source, TravelConfig } from '../scripts/tiff-data.ts';
import { DEFAULT_CONSTRAINTS, optimizeSchedule } from '../src/scheduler/index.ts';
import { vacationDate, travelMinutes } from '../src/scheduler/constraints.ts';
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const source: Source=read('../data-sources/tiff-2025.json');
const travel: TravelConfig=read('../data-sources/travel-2025.json');
const data=buildDataset(source,travel);
const input={...data,selectedFilmIds:[],constraints:structuredClone(DEFAULT_CONSTRAINTS)};
test('2025 official dataset is complete relative to the saved source and validates',()=>{
  assert.equal(data.films.length,149);assert.equal(data.screenings.length,282);assert.equal(data.venues.length,13);
  assert.equal(data.report.excluded.length+data.screenings.length,source.acts.length);
  assert.equal(data.report.corrections.length,6);
  assert.equal(data.travelTimes.length,13*13);
  validateDataset(data);
});
test('official PDF anchors retain date, room and start time; official extra screenings are included',()=>{
  const shows=(title:string)=>data.screenings.filter(s=>s.filmId===data.films.find(f=>f.title===title)?.id);
  const mishima=shows('MISHIMA');
  assert.ok(mishima.some(s=>s.startAt==='2025-10-30T11:50:00+09:00'&&s.venueId==='tiff-2025-venue-23'));
  const kiss=shows('蜘蛛女のキス');
  assert.deepEqual(kiss.map(s=>s.startAt),['2025-10-27T14:30:00+09:00','2025-10-31T19:50:00+09:00','2025-11-03T20:25:00+09:00']);
  assert.ok(shows('Dear Stranger／ディア・ストレンジャー').some(s=>s.startAt==='2025-11-04T16:55:00+09:00'));
});
test('official slot includes stage events without adding them twice; short source endings are corrected',()=>{
  const love=data.screenings.find(s=>s.id==='tiff-2025-act-3599')!;
  assert.equal(love.startAt,'2025-10-28T14:15:00+09:00');assert.equal(love.endAt,'2025-10-28T16:39:00+09:00');
  assert.equal(love.eventAfterMinutes,undefined);assert.equal(love.eventLabel,'舞台挨拶');
  const kika=data.screenings.find(s=>s.id==='tiff-2025-act-3638')!;
  assert.equal((Date.parse(kika.endAt)-Date.parse(kika.startAt))/60000,110);
  assert.match(kika.timingNote!,/補正/);
});
test('Culture Day is a holiday; weekday screenings require leave; real films can be optimized',()=>{
  const holiday=data.screenings.find(s=>s.startAt.startsWith('2025-11-03T13:'))!;
  assert.equal(vacationDate(holiday,input),undefined);
  const weekday=data.screenings.find(s=>s.startAt.startsWith('2025-10-28T14:'))!;
  assert.equal(vacationDate(weekday,input),'2025-10-28');
  const selectedFilmIds=['母なる大地','パレスチナ36','金髪'].map(title=>data.films.find(f=>f.title===title)!.id);
  const result=optimizeSchedule({...input,selectedFilmIds});
  assert.equal(result.plans[0]!.score.missedFilmCount,0);
});
test('every direction has a route and same-building screens have nonzero transfer',()=>{
  const a=data.screenings.find(s=>s.venueId==='tiff-2025-venue-8')!;
  const b=data.screenings.find(s=>s.venueId==='tiff-2025-venue-9')!;
  assert.equal(travelMinutes(a,b,input),5);
  assert.equal(travelMinutes(a,a,input),0);
  for(const route of data.travelTimes) assert.equal(route.minutes,data.travelTimes.find(r=>r.fromVenueId===route.toVenueId&&r.toVenueId===route.fromVenueId)!.minutes);
});
test('unknown durations remain explicit exclusions; missing routes and duplicate records fail',()=>{
  const edited=structuredClone(source);edited.acts[0]!.duration=null;
  const result=buildDataset(edited,travel);
  assert.ok(result.report.excluded.some(e=>e.actId===edited.acts[0]!.id));
  const duplicate=structuredClone(source);duplicate.acts.push(duplicate.acts[0]!);
  assert.throws(()=>buildDataset(duplicate,travel),/Duplicate/);
  const missing=structuredClone(data);missing.travelTimes.pop();
  assert.throws(()=>validateDataset(missing),/route/);
  const broken=structuredClone(data);broken.screenings[0]!.filmId='missing';
  assert.throws(()=>validateDataset(broken),/reference/);
  assert.throws(()=>projectOfficialData([],source.retrievedAt),/Expected/);
});

test('every included film retains its official department and conflicting departments fail', () => {
  const departments = read('../data-sources/departments-2025.json').departments as {id:number;name:string}[];
  for (const film of data.films) {
    const act = source.acts.find(a => a.filmId === film.id)!;
    assert.equal(film.department, departments.find(d => d.id === act.departmentId)!.name);
  }
  assert.equal(data.films.filter(f => f.department === 'コンペティション').length, 15);
  const unknown = structuredClone(source);
  unknown.acts[0]!.departmentId = 9999;
  assert.throws(() => buildDataset(unknown, travel), /Unknown department/);
  // Use a film known to have multiple screenings (filmId '38005WFC16' has 3 acts)
  const conflicting = structuredClone(source);
  const multiFilmId = '38005WFC16';
  const acts = conflicting.acts.filter(a => a.filmId === multiFilmId);
  acts[1]!.departmentId = 4;
  assert.throws(() => buildDataset(conflicting, travel), /Conflicting film/);
});
