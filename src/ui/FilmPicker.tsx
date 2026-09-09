import { useRef, useState } from 'react';
import { festival } from './data.ts';
import { dateLabel, timeLabel } from './timeline.ts';

const PAGE_SIZE = 12;
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const dates = [...new Set(festival.screenings.map(s => s.startAt.slice(0, 10)))].sort();

export function FilmPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matching = festival.films.filter(f =>
    (!onlySelected || selected.includes(f.id)) &&
    words.every(word => normalize(`${f.title} ${f.originalTitle ?? ''}`).includes(word)) &&
    (!date || festival.screenings.some(s => s.filmId === f.id && s.startAt.startsWith(date))));
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = matching.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetFilters = () => { setQuery(''); setDate(''); setOnlySelected(false); setPage(1); };
  const changePage = (next: number) => {
    setPage(next);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  };
  return <section aria-labelledby="films-heading">
    <div className="section-heading"><h2 id="films-heading" ref={heading} tabIndex={-1}>01 <span>作品を選ぶ</span></h2><span>全{festival.films.length}作品</span></div>
    <div className="film-filters">
      <label>作品名で検索<input type="search" placeholder="タイトルの一部を入力" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label>
      <label>上映日で絞り込み<select value={date} onChange={e => { setDate(e.target.value); setPage(1); }}><option value="">すべての日程</option>{dates.map(d => <option key={d} value={d}>{dateLabel(d)}</option>)}</select></label>
    </div>
    <div className="film-selection-tools">
      <label className="selected-filter"><input type="checkbox" checked={onlySelected} onChange={e => { setOnlySelected(e.target.checked); setPage(1); }}/>選択中のみ</label>
      <button type="button" onClick={() => { setQuery(''); setDate(''); setOnlySelected(true); setPage(1); }}>選んだ{selected.length}作品を確認</button>
      {(query || date || onlySelected) && <button type="button" onClick={resetFilters}>絞り込みを解除</button>}
    </div>
    {date && <p className="hint">上映日は作品を探すための絞り込みです。スケジュールは全日程から生成します。</p>}
    <p className="film-count" role="status">{matching.length ? `${matching.length}作品中 ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, matching.length)}作品を表示` : onlySelected && !selected.length ? 'まだ作品を選択していません。' : '該当する作品はありません。検索語や上映日を変更してください。'}</p>
    <div className="films">{visible.map(f => {
      const shows = festival.screenings.filter(s => s.filmId === f.id);
      const checked = selected.includes(f.id);
      return <article className={`film-card ${checked ? 'selected' : ''}`} key={f.id}>
        <label className="film-title"><input type="checkbox" checked={checked} onChange={() => {
          onChange(checked ? selected.filter(id => id !== f.id) : [...selected, f.id]);
          setPage(currentPage);
        }}/><strong>{f.title}</strong></label>
        <p className="metadata">本編{f.durationMinutes}分 · {shows.length}回上映{checked && <span className="selection-badge">選択済み</span>}</p>
        <details className="film-details"><summary>上映日時・会場を見る</summary><ul className="screenings">{shows.map(s => <li key={s.id}><span>{dateLabel(s.startAt.slice(0, 10))} {timeLabel(s.startAt)}–{timeLabel(s.endAt)}</span><span>{festival.venues.find(v => v.id === s.venueId)!.name}{s.eventLabel ? ` / ${s.eventLabel}` : ''}{s.timingNote?.includes('補正') ? ' / 終了補正あり' : ''}</span></li>)}</ul><a className="source-link" href={f.url} target="_blank" rel="noreferrer">公式の作品情報</a></details>
      </article>;
    })}</div>
    {pageCount > 1 && <nav className="film-pagination" aria-label="作品一覧のページ"><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>前へ</button><label>ページ<select aria-label="作品一覧のページ番号" value={currentPage} onChange={e => changePage(Number(e.target.value))}>{Array.from({ length: pageCount }, (_, i) => <option key={i} value={i + 1}>{i + 1} / {pageCount}</option>)}</select></label><button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>次へ</button></nav>}
  </section>;
}
