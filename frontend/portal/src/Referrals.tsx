import React, {useEffect, useRef, useState} from 'react';
import {api} from './api';
import type {Tr} from './types';

const P='kandil_hr.sourcing.referrals.';
export type ReferralSelection={employee:string;employee_version:string;employee_name:string;relationship:string;policy_version:string};
type Employee={name:string;label:string;job:string;version:string};
type Options={has_master:boolean;policy:{version:string;prior_days:number;relationship_required:boolean};rows:Employee[];has_more:boolean;next_after:string};

export function ReferrerPicker({company,t,disabled,onChange}:{company:string;t:Tr;disabled:boolean;onChange:(value:ReferralSelection|null)=>void}){
 const [data,setData]=useState<Options|null>(null),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Employee|null>(null),[fallback,setFallback]=useState(''),[relationship,setRelationship]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(false);
 const callback=useRef(onChange);callback.current=onChange;
 const sequence=useRef(0),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;sequence.current++}},[]);
 async function search(after=''){
  const seq=++sequence.current;setBusy(true);setError(false);callback.current(null);
  try{const result=await api<Options>(P+'employees',{company,query,after});if(live.current&&seq===sequence.current){setData(old=>after&&old?{...result,rows:[...old.rows,...result.rows]}:result);setChosen(null)}}
  catch{if(live.current&&seq===sequence.current){setData(null);setError(true)}}
  finally{if(live.current&&seq===sequence.current)setBusy(false)}
 }
 useEffect(()=>{void search()},[company]);
 useEffect(()=>{
  if(busy||!data||(data.has_master&&!chosen)||(!data.has_master&&fallback.trim().length<3)||(data.policy.relationship_required&&!relationship.trim())){callback.current(null);return}
  callback.current({employee:chosen?.name||'',employee_version:chosen?.version||'',employee_name:chosen?.label||fallback,relationship,policy_version:data.policy.version});
 },[busy,data,chosen,fallback,relationship]);
 return <div className="referral-picker form-body" aria-busy={busy}>
  <h3>{t('الموظف المُرشِّح','Referring employee')}</h3>
  {error&&<p role="alert">{t('تعذر تحميل سجل الموظفين. أعد البحث.','Could not load the employee register. Retry the search.')}</p>}
  <div className="candidate-actions"><label className="field">{t('بحث عن موظف بالاسم أو الكود','Find employee by name or code')}<input aria-label={t('بحث عن موظف بالاسم أو الكود','Find employee by name or code')} value={query} maxLength={140} disabled={disabled||busy} onChange={e=>setQuery(e.target.value)}/></label><button className="btn" type="button" disabled={disabled||busy||query.trim().length<2} onClick={()=>void search()}>{t('بحث الموظفين','Search employees')}</button></div>
  {data?.has_master&&<><p>{t('اختر موظفًا على رأس العمل. لا تظهر بيانات الاتصال أو الراتب.','Choose an active employee. Contacts and salary are not shown.')}</p><div className="candidate-list">{data.rows.map(row=><button className="candidate-row" key={row.name} type="button" aria-pressed={chosen?.name===row.name} disabled={disabled||busy} onClick={()=>setChosen(row)}><span><strong>{row.label}</strong><small><bdi>{row.name}</bdi> · {row.job}</small></span><span>{chosen?.name===row.name?t('محدد','Selected'):t('اختيار','Select')}</span></button>)}</div>{!busy&&query.trim().length>=2&&!data.rows.length&&<p>{t('لا توجد نتائج متاحة.','No available matches.')}</p>}{data.has_more&&<button className="btn" type="button" disabled={disabled||busy} onClick={()=>void search(data.next_after)}>{t('المزيد من الموظفين','More employees')}</button>}</>}
  {data&&!data.has_master&&<label className="field">{t('اسم الموظف المُرشِّح (السجل فارغ)','Referrer name (register is empty)')}<input aria-label={t('اسم الموظف المُرشِّح (السجل فارغ)','Referrer name (register is empty)')} required minLength={3} maxLength={140} value={fallback} disabled={disabled||busy} onChange={e=>setFallback(e.target.value)}/><small>{t('اسم مُبلّغ عنه فقط؛ لا يثبت هوية موظف.','Reported name only; this does not verify an employee identity.')}</small></label>}
  <label className="field">{t('صلة الموظف بالمرشح','Relationship to candidate')}<input aria-label={t('صلة الموظف بالمرشح','Relationship to candidate')} maxLength={60} required={!!data?.policy.relationship_required} value={relationship} disabled={disabled||busy} onChange={e=>setRelationship(e.target.value)}/></label>
  {data&&<p>{t('طلبات سابقة خلال ','Previous applications within ')}{data.policy.prior_days}{t(' يوم تحتاج مراجعة المكافأة. تسجيل الترشيح لا يوافق على مكافأة أو يصرفها.',' days require bonus review. Recording a referral does not approve or pay a bonus.')}</p>}
 </div>
}

type Submission={employee:string;employee_name:string;employee_job:string;relationship:string;kind:string;bonus_status:string;eligibility_reason:string;identity_basis:string;recorded_at:string};
const statuses:Record<string,[string,string]>={PENDING:['بانتظار قرار الموارد البشرية','Awaiting HR decision'],REVIEW:['يحتاج مراجعة','Needs review'],NOT_ELIGIBLE:['غير مؤهل: موظف داخلي مرتبط','Not eligible: linked internal employee']};
const reasons:Record<string,[string,string]>={influencing_source:['ترشيح مؤثّر؛ مصدر الطلب مختلف','Influencing referral; the application has another source'],recent_application:['يوجد طلب سابق ضمن الفترة؛ تفاصيله تتبع صلاحيات مستقلة','A previous application falls within the lookback period; its details have separate permissions'],internal_candidate:['الشخص مرتبط بموظف حالي','Person is linked to an active employee'],awaiting_hr_decision:['لا يوجد قرار مكافأة مسجل','No bonus decision is recorded']};
export function CandidateReferral({name,t}:{name:string;t:Tr}){
 const [data,setData]=useState<{submission:Submission|null;locked:boolean}|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let active=true;void api<typeof data>(P+'application',{name}).then(v=>{if(active)setData(v)}).catch(()=>{if(active)setError(true)}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[name]);
 const s=data?.submission;
 return <section className="candidate-referral card section-gap" aria-busy={busy}><div className="card-head"><h2>{t('الترشيح من موظف','Employee referral')}</h2></div><div className="form-body">
  {error&&<p role="alert">{t('تعذر تحميل سجل الترشيح. حدّث الطلب.','Could not load referral evidence. Refresh the application.')}</p>}
  {s?<><p><strong>{s.employee_name}</strong> · <bdi>{s.employee}</bdi> · {s.employee_job}</p><p>{t('الصلة: ','Relationship: ')}{s.relationship||'—'}</p><p>{s.kind==='PRIMARY'?t('ترشيح أساسي','Primary referral'):t('ترشيح مؤثّر','Influencing referral')}</p><p>{t(...(statuses[s.bonus_status]||statuses.REVIEW))}</p><p>{t(...(reasons[s.eligibility_reason]||reasons.awaiting_hr_decision))}</p>{s.identity_basis==='empty_register_name_only'&&<p className="alert">{t('اسم مُبلّغ عنه وقت خلو سجل الموظفين؛ يحتاج تحقق الهوية.','Reported name while the employee register was empty; identity needs verification.')}</p>}<p><bdi>{s.recorded_at.split('.')[0]}</bdi></p></>:data&&<p>{t('لا يوجد ترشيح موظف موثق لهذا الطلب.','No employee referral recorded for this application.')}</p>}
  {data?.locked&&<p>{t('نتيجة سابقة تقفل نسبة الترشيح؛ إعادة فتح الطلب لا تمحوها.','A recorded outcome locks attribution; reopening does not erase it.')}</p>}
  <p>{t('هذه نسخة الترشيح الأصلية عند التقديم. راجع الترشيح الحالي وسجل القرارات أدناه؛ لا يحدث صرف.','This is the original intake snapshot. Review the current referral and decision history below; no payment occurs.')}</p>
 </div></section>
}
