import {useState} from 'react';
import type {Detail,Tr} from './types';

export function PendingRevision({detail,busy,error,t,onCancel,onConfirm}:{
 detail:Detail;busy:boolean;error:string;t:Tr;onCancel:()=>void;
 onConfirm:(values:{quantities:Record<string,number>;reason:string;exception_reason:string})=>void;
}){
 const lines=detail.request.lines;
 const [quantities,setQuantities]=useState(()=>lines.map(row=>String(row.proposed_qty??row.requested_qty)));
 const [reason,setReason]=useState(''),[exception,setException]=useState(''),[review,setReview]=useState(false),[validation,setValidation]=useState('');
 const valid=()=>lines.length>0&&lines.every((row,i)=>row.name&&quantities[i].trim()!==''&&Number.isSafeInteger(Number(quantities[i]))&&Number(quantities[i])>0);
 function prepare(){
  if(!valid()){setValidation(t('أدخل عددًا صحيحًا موجبًا لكل موقع.','Enter a positive whole quantity for every location.'));return}
  if(lines.every((row,i)=>Number(quantities[i])===(row.proposed_qty??row.requested_qty))){setValidation(t('غيّر عددًا واحدًا على الأقل قبل المراجعة.','Change at least one quantity before reviewing.'));return}
  if(reason.trim().length<3){setValidation(t('اكتب سبب المراجعة في ثلاثة أحرف على الأقل.','Enter a revision reason of at least three characters.'));return}
  setValidation('');setReview(true);
 }
 return <section className="card narrow pending-revision">
  <div className="card-head"><h2>{review?t('مراجعة التغيير قبل التأكيد','Review quantity changes'):t('تعديل الأعداد أثناء الاعتماد','Revise pending quantities')}</h2></div>
  <form onSubmit={e=>{e.preventDefault();if(!review){prepare();return}if(!valid())return;onConfirm({quantities:Object.fromEntries(lines.map((row,i)=>[row.name!,Number(quantities[i])])),reason,exception_reason:exception})}}>
   <div className="form-body">
    <p>{detail.request.title} · {t('الإصدار الذي تراجعه','Reviewed revision')} {detail.request.revision}</p>
    <p className="review-note">{t('ستبدأ جميع الاعتمادات من جديد مع بقاء القرارات السابقة في السجل. يتغير الحجز بفرق العدد فقط؛ لا تُحجز الأعداد السابقة مرتين.','All approvals will restart while previous decisions remain in history. Only the quantity difference changes the reservation; existing seats are not reserved twice.')}</p>
    {(validation||error)&&<div className="alert error" role="alert">{validation||error}</div>}
    {review?<div className="table-wrap"><table><caption>{t('الأعداد التي ستُرسل للاعتماد من جديد','Quantities to submit for renewed approval')}</caption><thead><tr><th>{t('الموقع','Location')}</th><th>{t('الحجز الحالي','Reserved now')}</th><th>{t('العدد الجديد','New quantity')}</th><th>{t('فرق الحجز','Reservation change')}</th></tr></thead><tbody>{lines.map((row,i)=><tr key={row.name}><td>{row.branch||row.capacity}</td><td>{row.reserved_qty??0}</td><td>{quantities[i]}</td><td>{Number(quantities[i])-(row.reserved_qty??0)}</td></tr>)}</tbody></table></div>:lines.map((row,i)=><label className="field" key={row.name}>
     {t('العدد الجديد — ','New quantity — ')+(row.branch||row.capacity)}
     <input type="number" min="1" step="1" required disabled={busy} aria-label={t('العدد الجديد — ','New quantity — ')+(row.branch||row.capacity)} value={quantities[i]} onChange={e=>setQuantities(quantities.map((value,j)=>j===i?e.target.value:value))}/>
     <small>{t('الحجز الحالي: ','Reserved now: ')}{row.reserved_qty??0}</small>
    </label>)}
    {review?<><p className="preserve">{t('سبب المراجعة: ','Revision reason: ')}{reason}</p>{exception&&<p className="preserve">{t('مبرر الاستثناء: ','Exception justification: ')}{exception}</p>}</>:<>
     <label className="field">{t('سبب المراجعة','Revision reason')}<textarea aria-label={t('سبب المراجعة','Revision reason')} required minLength={3} maxLength={2000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <label className="field">{t('مبرر تجاوز العدد (عند الحاجة)','Headcount exception justification (if needed)')}<textarea aria-label={t('مبرر تجاوز العدد (عند الحاجة)','Headcount exception justification (if needed)')} maxLength={2000} disabled={busy} value={exception} onChange={e=>setException(e.target.value)}/></label>
    </>}
   </div>
   <div className="form-footer"><button type="button" className="btn" disabled={busy} onClick={()=>review?setReview(false):onCancel()}>{review?t('تعديل البيانات','Edit quantities'):t('رجوع','Back')}</button><button className="btn primary" disabled={busy}>{review?t('تأكيد الأعداد وإعادة الاعتمادات','Confirm quantities and restart approvals'):t('مراجعة التغيير','Review changes')}</button></div>
  </form>
 </section>
}
