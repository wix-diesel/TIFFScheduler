import type { Snapshot } from '../storage/codec.ts';
import { balancedPenalty } from '../scheduler/scoring.ts';
import { OBJECTIVES } from './objectives.ts';
import { CalendarActions } from './CalendarActions.tsx';
import { buildTimeline, dateLabel, timeLabel } from './timeline.ts';

export function PlanView({snapshot,index=0,planId}:{snapshot:Snapshot;index?:number;planId?:string}) {
  const plan=snapshot.result.plans[index];
  if(!plan)return null;
  const objective=snapshot.input.constraints.optimizationObjective ?? 'maxFilms';
  return <article className="plan">
    <div className="section-heading"><h3>プラン {index+1}</h3>{index===0&&<span className="recommended">おすすめ</span>}</div>
    <p className="hint">評価基準：{OBJECTIVES[objective].label}</p>
    <dl className="scores"><div><dt>必要休暇</dt><dd>{plan.score.vacationUnits / 2}<small>日</small></dd></div><div><dt>鑑賞日数</dt><dd>{plan.score.screeningDays}<small>日</small></dd></div><div><dt>鑑賞作品</dt><dd>{plan.screenings.length}<small>作品</small></dd></div><div><dt>移動時間</dt><dd>{plan.score.travelMinutes}<small>分</small></dd></div><div><dt>待ち時間</dt><dd>{plan.score.waitingMinutes}<small>分</small></dd></div></dl>
    {objective==='balanced'&&<p className="hint">バランス評価値：{balancedPenalty(plan.score)}点（見送り{plan.score.missedFilmCount}作品＋休暇{plan.score.vacationUnits}単位）。少ない案を優先し、同点なら鑑賞本数を増やします。</p>}
    {plan.missedFilmIds.length>0&&<p className="notice">この案で見送る作品：{plan.missedFilmIds.map(id=>snapshot.input.films.find(f=>f.id===id)?.title ?? id).join('、')}。作品選択や休暇・昼食条件を見直すと、別の組み合わせを探せます。</p>}
    {!plan.screenings.length?<p>{objective==='balanced'?'この案では鑑賞本数と休暇の負担を比較し、鑑賞を見送ります。鑑賞本数を優先したい場合は、評価基準を「鑑賞本数を最大化」に変更してください。':objective==='minVacation'?'この案では休暇を取らず、鑑賞を見送ります。鑑賞本数を優先したい場合は、評価基準を「鑑賞本数を最大化」に変更してください。':'現在の条件で鑑賞できる上映はありません。'}</p>:<>
      <CalendarActions snapshot={snapshot} index={index} {...(planId?{planId}:{})}/>
      {[...buildTimeline(plan,snapshot.input)].map(([date,entries])=>{const leave=plan.vacationDetails.find(detail=>detail.date===date);return <section className="day" key={date}><h4>{dateLabel(date)} <span>{leave?.kind==='full'?'終日休暇':leave?.kind==='afternoon'?'午後休':'休暇不要'}</span></h4><ol className="timeline">{entries.map((entry,j)=><li className={entry.kind} key={j}><time>{timeLabel(entry.start)}–{timeLabel(entry.end)}</time><div><strong>{entry.label}</strong><p>{entry.detail}</p>{entry.screeningId&&<CalendarActions snapshot={snapshot} screening={plan.screenings.find(screening=>screening.id===entry.screeningId)!}/>}</div></li>)}</ol></section>})}
    </>}
  </article>;
}
