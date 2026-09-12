import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ICAL from 'ical.js';
import { DEFAULT_CONSTRAINTS, optimizeSchedule } from '../src/scheduler/index.ts';
import type { ScheduleInput } from '../src/scheduler/types.ts';
import { escapeIcsText, foldIcsLine, generateIcs } from '../src/calendar/ics.ts';
import { generatePlanIcs, generateScreeningIcs, planEvents } from '../src/calendar/plan.ts';
import { calendarFile, canShareCalendar, saveCalendar, shareCalendar } from '../src/calendar/share.ts';

const read=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
const input:ScheduleInput={films:read('films'),screenings:read('screenings'),venues:read('venues'),travelTimes:read('travel-times'),holidays:[],constraints:{...DEFAULT_CONSTRAINTS},selectedFilmIds:['f1','f2','f3']};
const snapshot={input,result:optimizeSchedule(input)};
const fixed={festivalId:'tiff-test',now:'2026-09-10T01:02:03Z'} as const;

test('RFC 5545 output parses independently and preserves JST instants, Japanese, and special text',()=>{
  const special=structuredClone(snapshot);
  special.input.films[0]!.title='長い日本語作品名'.repeat(12)+',;\\\n次の行';
  const ics=generatePlanIcs(special,0,fixed);
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!ics.replace(/\r\n/g,'').includes('\n'));
  for(const line of ics.split('\r\n').slice(0,-1)) assert.ok(Buffer.byteLength(line)<=75,`${Buffer.byteLength(line)}: ${line}`);
  const root=new ICAL.Component(ICAL.parse(ics));
  const parsed=root.getAllSubcomponents('vevent').map(component=>new ICAL.Event(component));
  assert.equal(parsed.length,special.result.plans[0]!.screenings.length+special.result.plans[0]!.lunches.length);
  const source=special.result.plans[0]!.screenings[0]!;
  const event=parsed.find(candidate=>candidate.uid.includes(encodeURIComponent(source.id)))!;
  assert.equal(event.startDate.toJSDate().toISOString(),new Date(source.startAt).toISOString());
  assert.equal(event.summary,special.input.films.find(film=>film.id===source.filmId)!.title);
  assert.match(event.description,/入場余裕/);
});

test('escaping, UTC conversion, and UTF-8 folding cover RFC boundaries',()=>{
  assert.equal(escapeIcsText('a\\b,c;d\r\ne'),'a\\\\b\\,c\\;d\\ne');
  const folded=foldIcsLine(`DESCRIPTION:${'映'.repeat(40)}`);
  assert.ok(folded.includes('\r\n '));
  for(const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line)<=75);
  const ics=generateIcs([{uid:'one@example',summary:'test',start:'2026-10-30T10:00:00+09:00',end:'2026-10-30T11:00:00+09:00'}],{now:'2026-01-01T00:00:00Z'});
  assert.match(ics,/DTSTART:20261030T010000Z\r\nDTEND:20261030T020000Z/);
});

test('UIDs are stable, plans stay separate, and auxiliary events are opt-in',()=>{
  const one=planEvents(snapshot,0,fixed), again=planEvents(snapshot,0,fixed);
  assert.deepEqual(one.map(event=>event.uid),again.map(event=>event.uid));
  assert.equal(one.length,snapshot.result.plans[0]!.screenings.length+snapshot.result.plans[0]!.lunches.length);
  const auxiliary=planEvents(snapshot,0,{...fixed,includeAuxiliary:true});
  assert.ok(auxiliary.length>one.length);
  const screening=snapshot.result.plans[0]!.screenings[0]!;
  const single=generateScreeningIcs(snapshot.input,screening,fixed);
  assert.equal(new ICAL.Component(ICAL.parse(single)).getAllSubcomponents('vevent').length,1);
  assert.ok(!generatePlanIcs(snapshot,0,fixed).includes(snapshot.result.plans[1]?.screenings.find(s=>!snapshot.result.plans[0]!.screenings.some(first=>first.id===s.id))?.id ?? 'impossible-id'));
});
test('plan calendars export dinner as a distinct meal event', () => {
  const dinnerSnapshot = structuredClone(snapshot);
  dinnerSnapshot.result.plans[0]!.meals.push({ kind: 'dinner', date: '2026-10-30', startAt: '2026-10-30T18:00:00+09:00', endAt: '2026-10-30T18:45:00+09:00' });
  const dinner = planEvents(dinnerSnapshot, 0, fixed).find(event => event.summary === '夕食');
  assert.ok(dinner);
  assert.equal(dinner!.start, '2026-10-30T18:00:00+09:00');
});

test('Web Share detects support, distinguishes cancellation and failure',async()=>{
  const file=calendarFile('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n','plan.ics');
  assert.equal(file.type,'text/calendar');
  assert.equal(canShareCalendar(file,{} as Navigator),false);
  assert.equal(await shareCalendar(file,{canShare:()=>true,share:async()=>{}} as unknown as Navigator),'shared');
  assert.equal(await shareCalendar(file,{canShare:()=>true,share:async()=>{throw new DOMException('cancel','AbortError');}} as unknown as Navigator),'cancelled');
  assert.equal(await shareCalendar(file,{canShare:()=>true,share:async()=>{throw {name:'AbortError'};}} as unknown as Navigator),'cancelled');
  assert.equal(await shareCalendar(file,{canShare:()=>true,share:async()=>{throw new Error('no');}} as unknown as Navigator),'failed');
  assert.equal(await shareCalendar(file,{canShare:()=>false,share:async()=>{}} as unknown as Navigator),'unsupported');
});

test('download clicks a named file and always revokes its object URL',()=>{
  const calls:string[]=[];
  const anchor={href:'',download:'',hidden:false,click(){calls.push('click')},remove(){calls.push('remove')}};
  const environment={URL:{createObjectURL(){calls.push('create');return 'blob:test'},revokeObjectURL(value:string){calls.push(`revoke:${value}`)}},document:{createElement(){return anchor},body:{append(){calls.push('append')}}}};
  saveCalendar(calendarFile('ics','plan.ics'),environment as unknown as Pick<typeof globalThis,'URL'|'document'>);
  assert.equal(anchor.href,'blob:test');assert.equal(anchor.download,'plan.ics');
  assert.deepEqual(calls,['create','append','click','remove','revoke:blob:test']);
});
