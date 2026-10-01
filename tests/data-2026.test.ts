import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset, validateDataset, projectOfficialData, SOURCE_URL } from '../scripts/tiff-data.ts';
import type { Source, TravelConfig } from '../scripts/tiff-data.ts';
import { DEFAULT_CONSTRAINTS, optimizeSchedule } from '../src/scheduler/index.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const source: Source = read('../data-sources/tiff-2026.json');
const travel: TravelConfig = read('../data-sources/travel-2026.json');
const data = buildDataset(source, travel);

test('2026 source is fully accounted for and generated app data uses the latest edition', () => {
  assert.equal(source.year, 2026);
  assert.equal(data.films.length, 134);
  assert.equal(data.screenings.length, 247);
  assert.equal(data.venues.length, 12);
  assert.equal(data.report.excluded.length + data.screenings.length, 261);
  assert.equal(data.report.corrections.length, 9);
  assert.deepEqual(data.holidays, ['2026-11-03']);
  validateDataset(data);
  assert.deepEqual(read('../src/data/films.json'), data.films);
  assert.deepEqual(read('../src/data/screenings.json'), data.screenings);
  const info = read('../src/data/festival.json');
  assert.equal(info.startDate, '2026-10-26');
  assert.equal(info.endDate, '2026-11-04');
  for (const screening of data.screenings) assert.ok(screening.id.startsWith('tiff-2026-'));
});

test('2026 PDF anchors retain dates, start times and rooms, including both Godzilla screenings', () => {
  const shows = (title: string) => data.screenings.filter(s => s.filmId === data.films.find(f => f.title === title)?.id);
  const anchors = [
    ['我々は宇宙人', '2026-10-27T11:20:00+09:00', '44'],
    ['聴覚', '2026-10-26T12:50:00+09:00', '56'],
    ['夜明け前の赤', '2026-10-27T14:30:00+09:00', '48'],
    ['コロニー／群体', '2026-11-04T19:30:00+09:00', '50'],
  ];
  for (const [title, start, room] of anchors) {
    assert.ok(shows(title!).some(s => s.startAt === start && s.venueId === `tiff-2026-venue-${room}`));
  }
  assert.deepEqual(shows('ゴジラ-0.0').map(s => [s.startAt, s.venueId]), [
    ['2026-11-01T12:40:00+09:00', 'tiff-2026-venue-50'],
    ['2026-11-01T13:45:00+09:00', 'tiff-2026-venue-48'],
  ]);
  assert.equal(shows('ワイルドウッド').length, 2);
  assert.equal(shows('DAU').length, 2);
});

test('2026 departments and venue mappings do not reuse changed 2025 IDs', () => {
  assert.equal(data.films.find(f => f.title === '聴覚')!.department, 'ワールド・フォーカス');
  assert.equal(data.films.find(f => f.title === 'ワイルドウッド')!.department, '特別上映');
  assert.equal(data.films.filter(f => f.department === 'コンペティション').length, 15);
  assert.ok(data.films.some(f => f.department === 'CROSSCUT ASIA+'));
  assert.equal(data.travelTimes.length, 12 * 12);
  assert.equal(data.travelTimes.find(r => r.fromVenueId === 'tiff-2026-venue-3' && r.toVenueId === 'tiff-2026-venue-41')!.minutes, 5);
  const wrongYear = structuredClone(data);
  wrongYear.screenings[0]!.startAt = wrongYear.screenings[0]!.startAt.replace('2026-', '2025-');
  wrongYear.screenings[0]!.endAt = wrongYear.screenings[0]!.endAt.replace('2026-', '2025-');
  assert.throws(() => validateDataset(wrongYear), /Outside 2026/);
});

test('latest event slots and corrected runtimes remain usable by the scheduler', () => {
  const closing = data.screenings.find(s => s.filmId === '39000OCC03')!;
  assert.equal(closing.endAt, '2026-11-04T22:03:00+09:00');
  assert.equal(closing.eventLabel, '舞台挨拶');
  assert.equal(closing.eventAfterMinutes, undefined);
  const corrected = data.screenings.find(s => s.id === 'tiff-2026-act-4141')!;
  assert.equal(corrected.endAt, '2026-10-29T23:07:00+09:00');
  assert.match(corrected.timingNote!, /補正/);
  const selectedFilmIds = ['ゴジラ-0.0', '聴覚', '我々は宇宙人'].map(title => data.films.find(f => f.title === title)!.id);
  const result = optimizeSchedule({ ...data, selectedFilmIds, constraints: { ...structuredClone(DEFAULT_CONSTRAINTS), lunchWindowEnd: '15:00' } });
  assert.equal(result.plans[0]!.score.missedFilmCount, 0);
});

test('official response projection rejects old years and excludes nonfactual fields', () => {
  const act = source.acts[0]!;
  const rawAct = { id: act.id, film: { year: 2026, film_identifier: act.filmId, title_ja: act.title,
    film_time_length: act.duration, department_id: act.departmentId, description: 'not saved' },
    venue: { id: act.venueId, name_ja: act.venueName }, venue_id: act.venueId,
    act_date: act.date, play_at: act.start, end_at: act.end, guest_ja: 'not saved' };
  const raw = [{ children: [{ id: act.cinemaId, acts: [rawAct] }] }];
  const projected = projectOfficialData(raw, source.retrievedAt);
  assert.equal(projected.year, 2026);
  assert.equal(projected.sourceUrl, SOURCE_URL);
  assert.ok(!JSON.stringify(projected).includes('not saved'));
  rawAct.film.year = 2025;
  assert.throws(() => projectOfficialData(raw, source.retrievedAt), /Malformed/);
});
