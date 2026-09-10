import type { Snapshot } from '../storage/codec.ts';
import { CalendarActions } from './CalendarActions.tsx';
import { buildTimeline, dateLabel, timeLabel } from './timeline.ts';

export function PlanView({snapshot,index=0,planId}:{snapshot:Snapshot;index?:number;planId?:string}) {
  const plan=snapshot.result.plans[index];
  if(!plan)return null;
  return <article className="plan">
    <div className="section-heading"><h3>プラン {index+1}</h3>{index===0&&<span className="recommended">おすすめ</span>}</div>
    <dl className="scores"><div><dt>必要休暇</dt><dd>{plan.score.vacationDays}<small>日</small></dd></div><div><dt>鑑賞作品</dt><dd>{plan.screenings.length}<small>作品</small></dd></div><div><dt>移動時間</dt><dd>{plan.score.travelMinutes}<small>分</small></dd></div><div><dt>待ち時間</dt><dd>{plan.score.waitingMinutes}<small>分</small></dd></div></dl>
    {plan.missedFilmIds.length>0&&<p className="notice">この案で鑑賞できない作品：{plan.missedFilmIds.map(id=>snapshot.input.films.find(f=>f.id===id)?.title ?? id).join('、')}。作品選択や休暇・昼食条件を見直すと、別の組み合わせを探せます。</p>}
    {!plan.screenings.length?<p>現在の条件で鑑賞できる上映はありません。</p>:<>
      <CalendarActions snapshot={snapshot} index={index} {...(planId?{planId}:{})}/>
      {[...buildTimeline(plan,snapshot.input)].map(([date,entries])=><section className="day" key={date}><h4>{dateLabel(date)} <span>{plan.vacationDates.includes(date)?'休暇が必要':'休暇不要'}</span></h4><ol className="timeline">{entries.map((entry,j)=><li className={entry.kind} key={j}><time>{timeLabel(entry.start)}–{timeLabel(entry.end)}</time><div><strong>{entry.label}</strong><p>{entry.detail}</p>{entry.screeningId&&<CalendarActions snapshot={snapshot} screening={plan.screenings.find(screening=>screening.id===entry.screeningId)!}/>}</div></li>)}</ol></section>)}
    </>}
  </article>;
}
