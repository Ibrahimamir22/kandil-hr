import React,{useEffect,useState} from 'react';
import {api} from './api';
import type {Tr} from './types';
type Stage='reminder'|'escalation'|'warning'|'expiry';
type Projection={state:'active'|'inactive'|'unavailable';as_of:string;timezone:string;automatic_rejection:false;waiting_from?:string;working_days?:number;working_today?:boolean;current_stage?:Stage|null;milestones?:{stage:Stage;date:string;working_day:number}[]};
const labels:Record<Stage,[string,string]>={reminder:['تذكير بالاعتماد','Approval reminder'],escalation:['تصعيد المتابعة','Follow-up escalation'],warning:['تنبيه اقتراب الموعد','Deadline warning'],expiry:['بلوغ الموعد — تنبيه فقط','Deadline reached — advisory']};
export function ApprovalDeadlines({name,version,t}:{name:string;version:string;t:Tr}){
 const [value,setValue]=useState<Projection|null>(null),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let cancelled=false;setBusy(true);setValue(null);setFailed(false);
  api<Projection>('kandil_hr.portal.approval_deadlines.get',{name}).then(data=>{if(!cancelled)setValue(data)}).catch(()=>{if(!cancelled)setFailed(true)}).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true};
 },[name,version,refresh]);
 return <section className="card section-gap approval-deadlines" aria-busy={busy}>
  <div className="card-head"><h2>{t('مواعيد متابعة الاعتماد','Approval follow-up dates')}</h2><button className="btn small" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>{t('تحديث المواعيد','Refresh dates')}</button></div>
  <div className="form-body" aria-live="polite">
   {busy&&<p>{t('جارٍ تحميل المواعيد…','Loading dates…')}</p>}
   {failed&&<p role="alert" className="alert error">{t('تعذر تحميل المواعيد. تحقق من الصلاحيات وأعد المحاولة.','Could not load dates. Check access and retry.')}</p>}
   {value?.state==='inactive'&&<p>{t('لا توجد خطوة اعتماد قيد الانتظار لهذا الطلب.','This request has no pending approval step.')}</p>}
   {value?.state==='unavailable'&&<p className="alert">{t('المواعيد غير متاحة. اطلب من مسؤول النظام مراجعة تقويم الشركة وبيانات خطوة الاعتماد.','Dates are unavailable. Ask the administrator to review the company calendar and approval-step setup.')}</p>}
   {value?.state==='active'&&<>
    <p>{t('بدء انتظار الخطوة الحالية: ','Current step waiting since: ')}<bdi>{value.waiting_from}</bdi> · {t('أيام العمل المنقضية: ','Working days elapsed: ')}<strong>{value.working_days}</strong></p>
    <ol className="deadline-milestones">{value.milestones?.map(m=><li key={m.stage} data-stage={m.stage} aria-current={value.current_stage===m.stage?'step':undefined}><span>{t(...labels[m.stage])}</span><strong><bdi>{m.date}</bdi></strong><small>{t('يوم العمل ','Working day ')}{m.working_day}{value.current_stage===m.stage?' · '+t('المرحلة الحالية','Current stage'):''}</small></li>)}</ol>
    {!value.working_today&&<p>{t('اليوم عطلة وفق تقويم الشركة؛ تُؤجّل التنبيهات إلى يوم العمل المناسب.','Today is a non-working day in the company calendar; notices wait until the applicable working day.')}</p>}
    <p className="deadline-advisory">{t('هذه مواعيد متابعة مبدئية بانتظار اعتماد سياسة الموارد البشرية. بلوغ الموعد لا يرفض الطلب تلقائيًا ولا يحرر العدد المحجوز.','These follow-up dates await HR policy confirmation. Reaching the deadline does not automatically reject the request or release reserved headcount.')}</p>
    <small className="muted">{t('حسب تقويم الشركة، باستثناء يوم بدء الانتظار والعطلات. تاريخ الحساب بتوقيت القاهرة: ','Company calendar excludes the starting day and holidays. Calculated for Cairo date: ')}<bdi>{value.as_of}</bdi></small>
   </>}
  </div>
 </section>;
}
