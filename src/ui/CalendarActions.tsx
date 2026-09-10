import { useId, useState } from 'react';
import type { Snapshot } from '../storage/codec.ts';
import type { Screening } from '../scheduler/types.ts';
import { generatePlanIcs, generateScreeningIcs } from '../calendar/plan.ts';
import { calendarFile, saveCalendar, shareCalendar } from '../calendar/share.ts';
import { festivalInfo } from './data.ts';

const FESTIVAL_ID = `tiff-${festivalInfo.year}`;
const safeFilename = (value: string) => `${value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'tiff-schedule'}.ics`;
type Props = { snapshot: Snapshot; index: number; planId?: string } | { snapshot: Snapshot; screening: Screening };

export function CalendarActions(props: Props) {
  const [includeAuxiliary, setIncludeAuxiliary] = useState(false);
  const [message, setMessage] = useState('');
  const statusId = useId();
  const single = 'screening' in props;
  const create = () => {
    if (single) {
      const film = props.snapshot.input.films.find(candidate => candidate.id === props.screening.filmId);
      return {contents: generateScreeningIcs(props.snapshot.input, props.screening, {festivalId:FESTIVAL_ID}), filename:safeFilename(film?.title ?? 'tiff-screening')};
    }
    return {contents: generatePlanIcs(props.snapshot, props.index, {festivalId:FESTIVAL_ID, includeAuxiliary, ...(props.planId?{planId:props.planId}:{})}), filename:safeFilename(props.planId ? 'tiff-saved-plan' : `tiff-plan-${props.index+1}`)};
  };
  const download = () => {
    try { const value=create(); saveCalendar(calendarFile(value.contents,value.filename)); setMessage('ICSを保存しました。ファイルを開き、カレンダー側で取り込みを確定してください。'); }
    catch { setMessage('ICSを保存できませんでした。ブラウザのダウンロード設定を確認してください。'); }
  };
  const share = async () => {
    try {
      const value=create(), file=calendarFile(value.contents,value.filename);
      const result=await shareCalendar(file);
      if(result==='shared') setMessage('共有先へ渡しました。カレンダー側で取り込みを確定してください（登録完了ではありません）。');
      else if(result==='cancelled') setMessage('共有をキャンセルしました。');
      else { saveCalendar(file); setMessage('この環境ではカレンダーへ直接渡せなかったため、ICSを保存しました。ファイルを開いて取り込んでください。'); }
    } catch { setMessage('共有とICS保存に失敗しました。ブラウザの共有・ダウンロード設定を確認してください。'); }
  };
  return <div className={`calendar-actions ${single?'calendar-actions-single':''}`} aria-describedby={message?statusId:undefined}>
    {!single&&<label><input type="checkbox" checked={includeAuxiliary} onChange={event=>setIncludeAuxiliary(event.target.checked)}/>移動・入退場も追加</label>}
    <button type="button" onClick={share}>{single?'この上映をカレンダーに追加':'カレンダーに追加'}</button>
    <button type="button" onClick={download}>{single?'この上映のICSを保存':'ICSを保存'}</button>
    {message&&<p id={statusId} className="calendar-status" role="status">{message}</p>}
  </div>;
}
