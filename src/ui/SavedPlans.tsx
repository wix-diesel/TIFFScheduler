import { useEffect, useId, useRef, useState } from 'react';
import type { SavedPlan } from '../storage/codec.ts';
import { PlanView } from './PlanView.tsx';
export function SavedPlans({plans,fingerprint,onChange,onLoad}:{plans:SavedPlan[];fingerprint:string;onChange:(plans:SavedPlan[])=>void;onLoad:(plan:SavedPlan)=>void}) {
  const [confirm,setConfirm]=useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (!confirm) return;
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      else document.getElementById('saved-heading')?.focus();
    };
  }, [confirm]);
  return <section className="results" aria-labelledby="saved-heading"><h2 id="saved-heading" tabIndex={-1}>04 <span>保存したプラン</span></h2><p>{plans.length}/20件 · 生成時の上映・条件を保存しています。自動生成では上書きしません。</p>
    {plans.map(plan=><details key={plan.id}><summary>{plan.name}</summary>
      <label>プラン名<input maxLength={100} value={plan.name} onChange={e=>{const name=e.target.value; if(name.trim())onChange(plans.map(p=>p.id===plan.id?{...p,name}:p));}}/></label>
      <p>保存日時：{new Date(plan.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
      {plan.dataFingerprint!==fingerprint&&<p className="notice">上映情報が更新されています。このプランは保存時の情報です。</p>}
      <PlanView snapshot={plan.snapshot} planId={plan.id}/>
      <button type="button" onClick={()=>onLoad(plan)}>この条件で再計算</button>
      <button type="button" onClick={()=>onChange(plans.filter(p=>p.id!==plan.id))}>この保存プランを削除</button>
    </details>)}
    {!!plans.length&&<button type="button" onClick={()=>setConfirm(true)}>保存プランを全削除</button>}
    {confirm&&<dialog ref={dialog} role="alertdialog" aria-modal="true" aria-describedby={descriptionId} aria-label="保存プラン全削除の確認" onCancel={()=>setConfirm(false)}><p id={descriptionId}>保存プランをすべて削除しますか？設定・作品選択は残ります。</p><button type="button" onClick={()=>{onChange([]);setConfirm(false);}}>すべて削除する</button><button ref={cancel} type="button" onClick={()=>setConfirm(false)}>キャンセル</button></dialog>}
  </section>;
}
