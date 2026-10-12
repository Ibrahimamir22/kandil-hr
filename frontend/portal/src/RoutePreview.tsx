import {useEffect,useState} from 'react';
import {api,ApiError} from './api';
import type {Tr} from './types';

type Preview={ready:boolean;advisory:boolean;evaluated_at:string;as_of:string;needs_exception:boolean;
 policy:null|{headcount_mode:string;ceo_for_critical:boolean;board_after_ceo:boolean};
 rows:{capacity:string;branch:string;structural:number;occupied:number;reserved:number;open_slots:number;available:number;requested:number;incremental_demand:number;shortage:number;unresolved:boolean}[];
 steps:{order:number;principal:string;label:string;authority:string;position:string|null}[];
 skipped:{position:string|null;authority:string;reason:string}[];issues:{code:string;message:string}[]};
const authorities:Record<string,[string,string]>={'Department Approval':['اعتماد الإدارة','Department approval'],'Sector Approval':['اعتماد القطاع','Sector approval'],'HR Approval':['اعتماد الموارد البشرية','HR approval'],'CEO Approval':['اعتماد الرئيس التنفيذي','CEO approval'],'Board Approval':['اعتماد مجلس الإدارة','Board approval'],'Headcount Exception':['اعتماد استثناء العدد','Headcount exception']};

export function RoutePreview({payload,name,version,t}:{payload:Record<string,unknown>;name?:string;version?:string;t:Tr}){
 const signature=JSON.stringify({payload,name,expected_version:version});
 const [retry,setRetry]=useState(0),[state,setState]=useState<{key:string;data?:Preview;error?:string}>({key:''});
 useEffect(()=>{let stopped=false;setState({key:signature});
  api<Preview>('kandil_hr.portal.route_preview.evaluate',JSON.parse(signature),'POST').then(data=>{if(!stopped)setState({key:signature,data})}).catch(e=>{if(!stopped)setState({key:signature,error:e instanceof ApiError&&!e.message.startsWith('REQUEST_')?e.message:'PREVIEW_UNAVAILABLE'})});
  return()=>{stopped=true};
 },[signature,retry]);
 const current=state.key===signature?state:undefined,data=current?.data;
 const label=(authority:string)=>authorities[authority]?t(...authorities[authority]):authority;
 const issue=(code:string,fallback:string)=>({HEADCOUNT_BLOCKED:t('سياسة منع التجاوز مفعلة. عدّل العدد أو اطلب من الموارد البشرية مراجعة السعة.','Capacity blocking is enabled. Adjust the quantity or ask HR to review capacity.'),HEADCOUNT_REASON_REQUIRED:t('يلزم مبرر استثناء من 10 أحرف على الأقل قبل الإرسال.','Add an exception justification of at least 10 characters before submitting.'),OCCUPANCY_UNRESOLVED:t('يجب أن تراجع الموارد البشرية فرق العدد المشغول المستورد قبل إضافة احتياج.','HR must reconcile the imported occupancy difference before adding demand.')} as Record<string,string>)[code]||fallback;
 return <section className="route-preview" aria-label={t('معاينة الاعتماد والسعة','Approval and capacity preview')} aria-busy={!data&&!current?.error}>
  <div className="section-heading"><h3>{t('مسار الاعتماد المتوقع','Expected approval route')}</h3><button type="button" className="btn small" onClick={()=>setRetry(v=>v+1)}>{t('تحديث المعاينة','Refresh preview')}</button></div>
  <p className="muted small">{t('معاينة إرشادية لا تحفظ الطلب ولا تحجز أعدادًا. الإرسال يعيد فحص الصلاحيات والهيكل والسعة ويثبّت المسار الفعلي. وقد تتطلب قرارات الموارد البشرية لاحقًا اعتمادًا إضافيًا.','This advisory preview does not save the request or reserve seats. Submission rechecks permissions, structure and capacity and freezes the actual route. Later HR decisions may require additional approval.')}</p>
  {!data&&!current?.error&&<p role="status">{t('جارٍ فحص المسار والسعة…','Checking route and capacity…')}</p>}
  {current?.error&&<div className="alert error" role="alert">{t('تعذرت المعاينة. أعد تحميل الطلب أو اطلب من مسؤول الموارد البشرية مراجعة الصلاحيات والإعدادات.','Preview unavailable. Reload the request or ask the HR administrator to review access and configuration.')} {current.error!=='PREVIEW_UNAVAILABLE'&&<span>{current.error}</span>}</div>}
  {data&&<>
   <p className={'preview-readiness '+(data.ready?'ready':'blocked')} role="status">{data.ready?t('لا توجد عوائق في هذه المعاينة؛ ليست موافقة نهائية.','No blockers found in this preview; this is not final approval.'):t('توجد نقاط تحتاج معالجة قبل الاعتماد.','There are issues to resolve before approval.')}</p>
   {data.issues.length>0&&<ul className="preview-issues">{data.issues.map((v,i)=><li key={i}>{issue(v.code,v.message)}</li>)}</ul>}
   {data.steps.length>0?<ol className="preview-route">{data.steps.map(step=><li key={step.order}><strong>{label(step.authority)}</strong><span>{step.label}</span></li>)}</ol>:<p>{t('لا يوجد مسار صالح حاليًا. راجع مسؤول الموارد البشرية لتحديد الجهات المطلوبة.','No valid route is available. Ask the HR administrator to configure the required authorities.')}</p>}
   {data.skipped.length>0&&<div className="preview-skipped"><h4>{t('مستويات تم تجاوزها','Skipped approval levels')}</h4><ul>{data.skipped.map((s,i)=><li key={i}>{label(s.authority)} — {s.reason==='PERSONAL_INTEREST'?t('تعارض مصلحة؛ يلزم اعتماد مستقل.','Personal interest; independent approval required.'):t('المنصب شاغر أو لا يرتبط بمستخدم نشط.','Position is vacant or has no active linked account.')} {s.position&&<span dir="auto">({s.position})</span>}</li>)}</ul></div>}
   <h3>{t('السعة وقت المعاينة','Capacity at preview time')}</h3>
   {data.policy&&<p>{t('سياسة العدد: ','Headcount policy: ')}{data.policy.headcount_mode==='Block'?t('منع التجاوز','Block excess demand'):t('استثناء بمبرر واعتماد مستقل','Justified exception with independent approval')}</p>}
   <div className="preview-capacities">{data.rows.map(row=><article key={row.capacity}><h4>{row.branch}</h4><dl>{[[t('الهيكلي','Structural'),row.structural],[t('المشغول','Occupied'),row.occupied],[t('المحجوز','Reserved'),row.reserved],[t('الشواغر المفتوحة','Open vacancies'),row.open_slots],[t('المتاح','Available'),row.available],[t('المطلوب','Requested'),row.requested],[t('الاحتياج الإضافي','Additional demand'),row.incremental_demand],[t('العجز','Shortage'),row.shortage]].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{row.unresolved&&<p>{t('يوجد فرق في رصيد الإشغال يحتاج مراجعة.','Occupancy baseline needs reconciliation.')}</p>}</article>)}</div>
   <p className="muted small">{t('وقت التقييم بتوقيت القاهرة: ','Evaluated in Cairo time: ')}<time dateTime={data.evaluated_at}>{new Intl.DateTimeFormat(t('ar-EG','en-GB'),{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(data.evaluated_at))}</time></p>
  </>}
 </section>
}
