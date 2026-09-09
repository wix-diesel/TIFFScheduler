import { useState } from 'react';
import type { FormEvent } from 'react';
import { DEFAULT_CONSTRAINTS, optimizeSchedule } from './scheduler/index.ts';
import type { ScheduleInput, ScheduleResult, UserConstraints } from './scheduler/types.ts';
import { festival, festivalInfo } from './ui/data.ts';
import { FilmPicker } from './ui/FilmPicker.tsx';
import { buildTimeline, dateLabel, timeLabel } from './ui/timeline.ts';

function DateList({label,dates,onChange}:{label:string;dates:string[];onChange:(change:(dates:string[])=>string[])=>void}) {
  const [date,setDate]=useState('');
  return <div className="date-list"><label>{label}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button type="button" disabled={!date} onClick={()=>{if(date)onChange(previous=>[...new Set([...previous,date])].sort());setDate('');}}>追加</button><ul>{dates.map(d=><li key={d}>{d}<button type="button" aria-label={`${label} ${d}を削除`} onClick={()=>onChange(previous=>previous.filter(x=>x!==d))}>削除</button></li>)}</ul></div>;
}
export default function App() {
  const [selected,setSelected]=useState<string[]>([]);
  const [constraints,setConstraints]=useState<UserConstraints>({...DEFAULT_CONSTRAINTS});
  const [result,setResult]=useState<{result:ScheduleResult;input:ScheduleInput}|null>(null);
  const [error,setError]=useState('');
  const clear=()=>{setResult(null);setError('');};
  const update=(patch:Partial<UserConstraints> | ((previous:UserConstraints)=>Partial<UserConstraints>))=>{
    setConstraints(previous=>({...previous,...(typeof patch==='function'?patch(previous):patch)}));
    clear();
  };
  const generate=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();clear();
    if(!selected.length){setError('鑑賞したい作品を1つ以上選んでください。');return;}
    if(constraints.lunchWindowStart>=constraints.lunchWindowEnd || constraints.lunchDurationMinutes> (Number(constraints.lunchWindowEnd.slice(0,2))*60+Number(constraints.lunchWindowEnd.slice(3)))-(Number(constraints.lunchWindowStart.slice(0,2))*60+Number(constraints.lunchWindowStart.slice(3)))) {setError('昼食時間帯の中に、指定した昼食時間を確保できるように設定してください。');return;}
    try {const input={...festival,selectedFilmIds:selected,constraints};setResult({result:optimizeSchedule(input),input});}
    catch {setError('条件または上映データが不正です。時間帯や日付、分数を確認してください。');}
  };
  return <><header><span className="brand">TIFF <span>Scheduler</span></span><span className="tag">TIFF 2025</span></header><main><div className="intro"><p className="eyebrow">映画祭の鑑賞プラン</p><h1>観たい映画から、<br className="mobile-break"/>一日の予定へ。</h1><p className="notice">2025年10月27日〜11月5日の公式データを使用しています。2026年の予定ではありません。終了はイベント等を含む確保時間、移動は余裕を持った推定です。11月3日（文化の日）は休日として計算します。</p><details className="data-details"><summary>データの出典と収録範囲</summary><p><a href={festivalInfo.sourceUrl} target="_blank" rel="noreferrer">第38回東京国際映画祭 公式サイト</a> · 確認日 {festivalInfo.retrievedAt.slice(0,10)}</p><p>{festival.films.length}作品・{festival.screenings.length}上映を収録。本編時間不明の企画・受賞作品未確定枠など{festivalInfo.excludedCount}件は対象外です。終了時刻の不整合{festivalInfo.correctionCount}件は本編時間以上を確保するよう補正しています。</p><p>移動はJR有楽町駅経由を想定し、建物内移動と信号待ちを含めた目安です。入退場の余裕はさらに加算します。チケットの取得可否や当日の変更・延長は反映しません。</p></details></div>
    <form onSubmit={generate}><div className="workspace"><FilmPicker selected={selected} onChange={ids=>{setSelected(ids);clear();}}/>
    <aside><details open><summary>02 鑑賞条件</summary><fieldset><legend>通常の勤務曜日</legend><div className="weekdays">{['日','月','火','水','木','金','土'].map((d,i)=><label key={d}><input type="checkbox" checked={constraints.workingWeekdays.includes(i)} onChange={e=>{const checked=e.target.checked;update(previous=>({workingWeekdays:checked?[...new Set([...previous.workingWeekdays,i])]:previous.workingWeekdays.filter(x=>x!==i)}));}}/>{d}</label>)}</div><p className="hint">勤務時間は9:00〜18:00。必要な休暇は1日単位で数えます。</p></fieldset><DateList label="追加休日" dates={constraints.additionalDaysOff} onChange={change=>update(previous=>({additionalDaysOff:change(previous.additionalDaysOff)}))}/><DateList label="休暇取得不可日" dates={constraints.unavailableDates} onChange={change=>update(previous=>({unavailableDates:change(previous.unavailableDates)}))}/><p className="hint">休暇取得不可日でも、勤務時間外や元々の休日は鑑賞できます。</p><fieldset><legend>昼食</legend><div className="fields"><label>開始<input type="time" required value={constraints.lunchWindowStart} onChange={e=>update({lunchWindowStart:e.target.value})}/></label><label>終了<input type="time" required value={constraints.lunchWindowEnd} onChange={e=>update({lunchWindowEnd:e.target.value})}/></label></div><label>確保する時間<select value={constraints.lunchDurationMinutes} onChange={e=>update({lunchDurationMinutes:Number(e.target.value)})}>{[30,45,60].map(m=><option key={m} value={m}>{m}分</option>)}</select></label><p className="hint">昼食時間帯に上映・入退場が重なる日は、連続した昼食時間を確保します。</p></fieldset><fieldset><legend>入退場の余裕</legend><div className="fields"><label>退場（分）<input type="number" min="0" max="120" step="1" required value={Number.isNaN(constraints.exitBufferMinutes)?'':constraints.exitBufferMinutes} onChange={e=>update({exitBufferMinutes:e.target.valueAsNumber})}/></label><label>入場（分）<input type="number" min="0" max="120" step="1" required value={Number.isNaN(constraints.arrivalBufferMinutes)?'':constraints.arrivalBufferMinutes} onChange={e=>update({arrivalBufferMinutes:e.target.valueAsNumber})}/></label></div></fieldset></details></aside></div>
    <div className="generate-bar"><span><strong>{selected.length}作品</strong>を選択中 <small>鑑賞数 → 休暇日数 → 移動 → 待ち時間の順に優先</small></span><button className="primary" disabled={!selected.length} type="submit">スケジュールを生成</button></div></form>
    {error&&<p role="alert" className="error">{error}</p>}
    <section className="results" aria-labelledby="results-heading" aria-live="polite"><h2 id="results-heading">03 <span>鑑賞プラン</span></h2>{!result?<p className="empty">作品と条件を選んで、スケジュールを生成してください。</p>:<><p>上位{result.result.plans.length}案 · 最大{selected.length-(result.result.plans[0]?.score.missedFilmCount??selected.length)}作品を鑑賞できます。時刻はすべて日本時間です。</p>{result.result.plans.map((plan,i)=><article className="plan" key={i}><div className="section-heading"><h3>プラン {i+1}</h3>{i===0&&<span className="recommended">おすすめ</span>}</div><dl className="scores"><div><dt>必要休暇</dt><dd>{plan.score.vacationDays}<small>日</small></dd></div><div><dt>鑑賞作品</dt><dd>{plan.screenings.length}<small>作品</small></dd></div><div><dt>移動時間</dt><dd>{plan.score.travelMinutes}<small>分</small></dd></div><div><dt>待ち時間</dt><dd>{plan.score.waitingMinutes}<small>分</small></dd></div></dl>{plan.missedFilmIds.length>0&&<p className="notice">この案で鑑賞できない作品：{plan.missedFilmIds.map(id=>festival.films.find(f=>f.id===id)!.title).join('、')}。作品選択や休暇・昼食条件を見直すと、別の組み合わせを探せます。</p>}{!plan.screenings.length?<p>現在の条件で鑑賞できる上映はありません。</p>:[...buildTimeline(plan,result.input)].map(([date,entries])=><section className="day" key={date}><h4>{dateLabel(date)} <span>{plan.vacationDates.includes(date)?'休暇が必要':'休暇不要'}</span></h4><ol className="timeline">{entries.map((entry,j)=><li className={entry.kind} key={j}><time>{timeLabel(entry.start)}–{timeLabel(entry.end)}</time><div><strong>{entry.label}</strong><p>{entry.detail}</p></div></li>)}</ol></section>)}</article>)}</>}</section>
    <footer>TIFF Scheduler · 非公式 / 2025年アーカイブ / 選択内容は再読み込みするとリセットされます</footer></main></>;
}
