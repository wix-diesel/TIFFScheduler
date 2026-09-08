import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTimeline, timeLabel } from '../src/ui/timeline.ts';
import { optimizeSchedule, DEFAULT_CONSTRAINTS } from '../src/scheduler/index.ts';
import type { ScheduleInput } from '../src/scheduler/types.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
const input:ScheduleInput={films:read('films'),screenings:read('screenings'),venues:read('venues'),travelTimes:read('travel-times'),holidays:[],constraints:{...DEFAULT_CONSTRAINTS},selectedFilmIds:['f1','f2','f3','f4','f5','f6']};
test('sample data produces plans with correct ordered, non-overlapping timeline',()=>{
 const result=optimizeSchedule(input);
 assert.equal(result.plans.length,3);
 assert.equal(result.plans[0]!.missedFilmIds.length,0);
 for(const plan of result.plans){
  const days=buildTimeline(plan,input);
  const entries=[...days.values()].flat();
  assert.equal(entries.filter(e=>e.kind==='film').length,plan.screenings.length);
  assert.equal(entries.filter(e=>e.kind==='lunch').length,plan.lunches.length);
  assert.equal(entries.filter(e=>e.kind==='travel').reduce((sum,e)=>sum+e.end-e.start,0),plan.score.travelMinutes);
  for(const day of days.values())for(let i=1;i<day.length;i++)assert.ok(day[i-1]!.end<=day[i]!.start);
 }
});
test('sample vacation restriction produces alternatives and respects the selected day',()=>{
 const constrained={...input,constraints:{...input.constraints,unavailableDates:['2026-10-30']}};
 const plans=optimizeSchedule(constrained).plans;
 assert.ok(plans[0]!.missedFilmIds.length>0);
 assert.ok(plans.every(p=>!p.vacationDates.includes('2026-10-30')));
});
test('timeline formatting uses Japan time independent of machine timezone',()=>{
 assert.equal(timeLabel('2026-10-30T01:00:00Z'),'10:00');
 assert.equal(buildTimeline({screenings:[],lunches:[],missedFilmIds:[],vacationDates:[],score:{vacationDays:0,missedFilmCount:0,travelMinutes:0,waitingMinutes:0}},input).size,0);
});
