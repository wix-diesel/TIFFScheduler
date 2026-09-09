import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDataset, projectOfficialData } from './tiff-data.ts';
import type { Source, TravelConfig } from './tiff-data.ts';
const root = new URL('../', import.meta.url);
const args=process.argv.slice(2);
const check=args.includes('--check');
const input=args.find(a=>!a.startsWith('--'));
if(args.some(a=>a.startsWith('--')&&a!=='--check') || (check&&input)) throw new Error('Usage: npm run data:import -- [official-response.json | --check]');
const source: Source = input ? projectOfficialData(JSON.parse(await readFile(input,'utf8')),new Date().toISOString()) : JSON.parse(await readFile(new URL('data-sources/tiff-2025.json',root),'utf8'));
const travel: TravelConfig = JSON.parse(await readFile(new URL('data-sources/travel-2025.json',root),'utf8'));
const result=buildDataset(source,travel);
const outputs: Record<string,unknown>={
  'data-sources/tiff-2025.json':source,
  'src/data/films.json':result.films,'src/data/screenings.json':result.screenings,
  'src/data/venues.json':result.venues,'src/data/travel-times.json':result.travelTimes,'src/data/holidays.json':result.holidays,
  'src/data/festival.json':{year:2025,startDate:'2025-10-27',endDate:'2025-11-05',retrievedAt:source.retrievedAt,sourceUrl:'https://2025.tiff-jp.net/ja/',excludedCount:result.report.excluded.length,correctionCount:result.report.corrections.length},
  'data-sources/import-report-2025.json':result.report,
};
// Generate and validate everything before touching output files.
for(const [path,value] of Object.entries(outputs)) {
  const contents=JSON.stringify(value,null,2)+'\n',url=new URL(path,root);
  if(check) {if(await readFile(url,'utf8')!==contents) throw new Error(`Stale generated data: ${path}`);}
  else {await mkdir(fileURLToPath(new URL('.',url)),{recursive:true});await writeFile(url,contents);}
}
console.log(`${check?'Verified':'Generated'}: ${result.films.length} films, ${result.screenings.length} screenings, ${result.venues.length} venues; ${result.report.excluded.length} excluded, ${result.report.corrections.length} corrected.`);
