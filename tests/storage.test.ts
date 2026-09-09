import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optimizeSchedule, DEFAULT_CONSTRAINTS } from '../src/scheduler/index.ts';
import { decode, encode, fingerprint, FutureSchemaError } from '../src/storage/codec.ts';
import type { PersistedState } from '../src/storage/codec.ts';
import { createRepository, storageKey } from '../src/storage/repository.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
const input={films:read('films'),screenings:read('screenings'),venues:read('venues'),travelTimes:read('travel-times'),holidays:[],constraints:structuredClone(DEFAULT_CONSTRAINTS),selectedFilmIds:['f1','f2']};
const snapshot={input,result:optimizeSchedule(input)};
const state=():PersistedState=>({schemaVersion:1,festivalId:'tiff-2025',dataFingerprint:fingerprint(input),updatedAt:new Date().toISOString(),selectedFilmIds:['f1','f2'],constraints:structuredClone(DEFAULT_CONSTRAINTS),lastResult:structuredClone(snapshot),savedPlans:[{id:'one',name:'週末',createdAt:new Date().toISOString(),dataFingerprint:fingerprint(input),snapshot:structuredClone(snapshot)}]});
function memory() { const data=new Map<string,string>(); return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}}; }
test('round trip preserves all settings and independent snapshots',()=>{
 const original=state(); original.constraints.maxScreeningsPerDay=2; const restored=decode(encode(original),'tiff-2025');assert.deepEqual(restored,original);
 assert.equal(restored.constraints.maxScreeningsPerDay,2);
 restored.constraints.exitBufferMinutes=50;restored.lastResult=null;
 assert.equal(restored.savedPlans[0]!.snapshot.input.constraints.exitBufferMinutes,5);
});
test('malformed nested results and future versions are rejected',()=>{
 for(const raw of ['{','{}',JSON.stringify({...state(),lastResult:{}}),JSON.stringify({...state(),constraints:{workingWeekdays:null}})])assert.throws(()=>decode(raw,'tiff-2025'));
 assert.throws(()=>decode(JSON.stringify({...state(),schemaVersion:2}),'tiff-2025'),FutureSchemaError);
 const bad=state();bad.savedPlans[0]!.snapshot.result.plans[0]!.screenings[0]!.filmId='missing';assert.throws(()=>decode(JSON.stringify(bad),'tiff-2025'));
});
test('missing settings migrate to defaults',()=>{
 const v=state();delete v.constraints.workStart;delete v.constraints.maxScreeningsPerDay;
 const restored=decode(JSON.stringify(v),'tiff-2025');
 assert.equal(restored.constraints.workStart,'09:00');assert.equal(restored.constraints.maxScreeningsPerDay,undefined);
});
test('year isolation and data fingerprint cover timetable and titles',()=>{
 const storage=memory();const a=createRepository('tiff-2025',()=>storage);a.load();a.save(state());
 assert.equal(createRepository('tiff-2026',()=>storage).load().state,null);
 assert.throws(()=>decode(encode(state()),'tiff-2026'));
 assert.notEqual(fingerprint(input),fingerprint({...input,films:[{...input.films[0],title:'new'}]}));
});
test('corrupt and future data are never overwritten',()=>{
 for(const raw of ['{',JSON.stringify({...state(),schemaVersion:2})]) {
 const storage=memory();storage.setItem(storageKey('tiff-2025'),raw);const repo=createRepository('tiff-2025',()=>storage);
 assert.ok(repo.load().message);assert.throws(()=>repo.save(state()));assert.equal(storage.getItem(storageKey('tiff-2025')),raw);
 }
});
test('storage getter, read, quota and write failures are reported',()=>{
 const denied=createRepository('tiff-2025',()=>{throw new Error('SecurityError');});assert.ok(denied.load().message);assert.throws(()=>denied.save(state()));
 const readDenied=createRepository('tiff-2025',()=>({getItem(){throw Error('denied');},setItem(){}}));assert.ok(readDenied.load().message);
 const quota=createRepository('tiff-2025',()=>({getItem:()=>null,setItem(){throw Error('QuotaExceededError');}}));quota.load();assert.throws(()=>quota.save(state()),/Quota/);
});
test('another tab cannot be silently overwritten even before storage event',()=>{
 const storage=memory();const a=createRepository('tiff-2025',()=>storage),b=createRepository('tiff-2025',()=>storage);a.load();b.load();a.save(state());
 assert.throws(()=>b.save(state()),/別タブ/);const c=createRepository('tiff-2025',()=>storage);c.load();storage.data.clear();assert.throws(()=>c.save(state()),/別タブ/);
});
test('20 plan limit, deletion and invalid numeric drafts',()=>{
 const v=state();v.savedPlans=Array.from({length:20},(_,i)=>({...structuredClone(v.savedPlans[0]!),id:String(i)}));assert.equal(decode(encode(v),'tiff-2025').savedPlans.length,20);
 v.savedPlans.push({...v.savedPlans[0]!,id:'21'});assert.throws(()=>encode(v));v.savedPlans=[];assert.equal(decode(encode(v),'tiff-2025').savedPlans.length,0);
 v.constraints.exitBufferMinutes=NaN;assert.throws(()=>encode(v));
 for(const value of [0,-1,1.5,Infinity]){const invalid=state();invalid.constraints.maxScreeningsPerDay=value;assert.throws(()=>decode(JSON.stringify(invalid),'tiff-2025'));}
});

test('screening lookup rejects unknown IDs and modified fields under the same ID',()=>{
 for(const field of ['id','endAt'] as const){
  const v=state();const plan=v.lastResult!.result.plans[0]!;
  const screening={...plan.screenings[0]!};plan.screenings[0]=screening;
  screening[field]=field==='id'?'unknown-screening':'2099-01-01T10:00:00+09:00';
  assert.throws(()=>decode(JSON.stringify(v),'tiff-2025'));
 }
});
test('encoding rejects nonfinite numbers throughout snapshots without modifying state',()=>{
 for(const value of [NaN,Infinity,-Infinity]){
  const v=state();v.savedPlans[0]!.snapshot.result.plans[0]!.score.waitingMinutes=value;
  assert.throws(()=>encode(v));
  assert.ok(Object.is(v.savedPlans[0]!.snapshot.result.plans[0]!.score.waitingMinutes,value));
 }
 const v=state();const original=structuredClone(v);encode(v);assert.deepEqual(v,original);
});
