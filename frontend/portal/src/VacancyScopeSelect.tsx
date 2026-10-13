import {useEffect,useState} from 'react';
import {api} from './api';
import type {Tr} from './types';

type Choice={id:string;label:string};
type Page={rows:Choice[];has_more:boolean;next_start:number;page_length:number};
type Kind='company'|'department'|'branch';
const labels:Record<Kind,[string,string]>={company:['الشركة','Company'],department:['الإدارة','Department'],branch:['الموقع','Location']};
const load=(args:Record<string,unknown>)=>api<Page>('kandil_hr.portal.vacancies.filter_options',args);

export function VacancyScopeSelect({kind,company='',department='',value,onChange,t}:{kind:Kind;company?:string;department?:string;value:string;onChange:(value:string)=>void;t:Tr}){
 const label=t(...labels[kind]);
 const [term,setTerm]=useState(''),[query,setQuery]=useState({search:'',start:0,retry:0});
 const [result,setResult]=useState<{key:string;page:Page}|null>(null),[error,setError]=useState('');
 const [selected,setSelected]=useState<{id:string;row:Choice|null}|null>(null);
 const key=JSON.stringify([kind,company,department,query]);
 const page=result?.key===key?result.page:null;
 const busy=!page&&!error;
 useEffect(()=>{let stopped=false;setError('');setResult(null);
  load({kind,company,department,search:query.search,start:query.start,page_length:20}).then(page=>{if(!stopped)setResult({key,page})}).catch(()=>{if(!stopped)setError(t('تعذر تحميل الاختيارات. أعد البحث للمحاولة.','Could not load choices. Search again to retry.'))});
  return()=>{stopped=true};
 },[key]);
 useEffect(()=>{let stopped=false;setSelected(null);if(!value)return;
  load({kind,company,department,name:value,page_length:1}).then(p=>{if(!stopped)setSelected({id:value,row:p.rows.find(r=>r.id===value)||null})}).catch(()=>{if(!stopped)setSelected({id:value,row:null})});
  return()=>{stopped=true};
 },[kind,company,department,value,query.retry]);
 const current=selected?.id===value?selected.row:null;
 const options=page?.rows||[];
 const rows=current&&!options.some(r=>r.id===current.id)?[current,...options]:options;
 function search(){setQuery(q=>({search:term.trim(),start:0,retry:q.retry+1}))}
 return <div className="vacancy-scope-select reference-select" data-kind={kind} aria-busy={busy}>
  <label className="field">{label}<select aria-label={label} value={value} disabled={busy} onChange={e=>onChange(e.target.value)}>
   <option value="">{t('الكل ضمن صلاحياتي','All within my scope')}</option>
   {value&&!rows.some(r=>r.id===value)&&<option value={value} disabled>{t('الاختيار غير متاح أو جارٍ التحقق منه','Selection unavailable or being checked')}</option>}
   {rows.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
  </select></label>
  <div className="reference-search"><input aria-label={t('بحث: ','Search: ')+label} maxLength={140} placeholder={t('ابحث بالاسم','Search by name')} value={term} onChange={e=>setTerm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search()}}}/><button type="button" className="btn small" aria-label={t('بحث اختيارات: ','Search choices: ')+label} onClick={search}>{t('بحث','Search')}</button></div>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {page&&!page.rows.length&&<p className="muted small">{t('لا توجد اختيارات مطابقة ضمن صلاحياتك.','No matching choices within your permissions.')}</p>}
  <div className="actions reference-pages"><button type="button" className="text-button" disabled={busy||!query.start} aria-label={t('اختيارات سابقة: ','Previous choices: ')+label} onClick={()=>setQuery(q=>({...q,start:Math.max(0,q.start-20)}))}>{t('السابق','Previous')}</button><button type="button" className="text-button" disabled={busy||!page?.has_more} aria-label={t('اختيارات تالية: ','Next choices: ')+label} onClick={()=>setQuery(q=>({...q,start:page!.next_start}))}>{t('التالي','Next')}</button></div>
 </div>
}
