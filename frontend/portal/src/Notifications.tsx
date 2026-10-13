import {useEffect,useState} from 'react';
import {api} from './api';
import type {Tr} from './types';
type Notice={name:string;creation:string;read:boolean;subject:string;body:string;reference_doctype:string|null;reference_name:string|null;request:string|null};
type Page={rows:Notice[];total:number;unread:number;start:number;page_length:number;next_start:number;has_more:boolean};
export function Notifications({t,onOpen,onUnread}:{t:Tr;onOpen:(name:string)=>Promise<void>;onUnread:(n:number)=>void}){
 const [search,setSearch]=useState(''),[state,setState]=useState('all'),[query,setQuery]=useState({search:'',state:'all',start:0,refresh:0});
 const [data,setData]=useState<Page|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let stopped=false;setBusy(true);setData(null);setError('');api<Page>('kandil_hr.portal.notifications.listing',query).then(value=>{if(!stopped){setData(value);onUnread(value.unread)}}).catch(()=>{if(!stopped){onUnread(0);setError(t('تعذر تحميل الإشعارات. راجع الاتصال والصلاحيات.','Could not load notifications. Check connection and permissions.'))}}).finally(()=>{if(!stopped)setBusy(false)});return()=>{stopped=true}},[query]);
 async function mark(row:Notice){setBusy(true);setError('');setNotice('');try{await api('kandil_hr.portal.notifications.mark_read',{name:row.name},'POST');setNotice(t('تم تحديد الإشعار كمقروء.','Notification marked as read.'));setQuery(q=>({...q,refresh:q.refresh+1}))}catch{setData(null);onUnread(0);setError(t('تعذر تأكيد القراءة. حدّث القائمة؛ إعادة المحاولة آمنة.','Could not confirm read status. Refresh the list; retrying is safe.'))}finally{setBusy(false)}}
 return <section className="notification-inbox" aria-busy={busy}>
  <div className="page-head"><div><h1>{t('الإشعارات','Notifications')}</h1><p>{t('تحديثاتك وسجل المتابعة. تظهر الرسائل التي ما زلت مخولًا بالاطلاع على سجلاتها.','Your updates and follow-up history. Messages appear only while you can access their linked records.')}</p></div></div>
  <section className="card"><form className="toolbar inbox-toolbar" onSubmit={e=>{e.preventDefault();setQuery(q=>({search,state,start:0,refresh:q.refresh+1}))}}>
   <label className="field">{t('بحث في الإشعارات','Search notifications')}<input aria-label={t('بحث في الإشعارات','Search notifications')} maxLength={140} value={search} onChange={e=>setSearch(e.target.value)} /></label>
   <label className="field">{t('حالة القراءة','Read status')}<select aria-label={t('حالة القراءة','Read status')} value={state} onChange={e=>setState(e.target.value)}><option value="all">{t('الكل','All')}</option><option value="unread">{t('غير مقروءة','Unread')}</option><option value="read">{t('مقروءة','Read')}</option></select></label>
   <button className="btn primary" disabled={busy}>{t('تطبيق','Apply')}</button><button type="button" className="btn" disabled={busy} onClick={()=>setQuery(q=>({...q,refresh:q.refresh+1}))}>{t('تحديث','Refresh')}</button>
  </form>
  {error&&<p className="form-body alert error" role="alert">{error}</p>}{notice&&<p className="form-body" role="status">{notice}</p>}{busy&&<p className="form-body" role="status">{t('جارٍ تحميل الإشعارات…','Loading notifications…')}</p>}
  {data&&<><div className="form-body inbox-counts" role="status"><span>{t('نتائج البحث: ','Matching notifications: ')}<strong data-count="total">{data.total}</strong></span><span>{t('كل غير المقروء: ','All unread: ')}<strong data-count="unread">{data.unread}</strong></span></div>
   <div className="notification-list">{data.rows.map(row=><article className={'notification-item '+(row.read?'is-read':'is-unread')} key={row.name} data-notification={row.name}>
    <div className="notification-heading"><h2>{row.subject}</h2><span className="badge">{row.read?t('مقروء','Read'):t('غير مقروء','Unread')}</span></div>
    {row.body&&<p className="preserve">{row.body}</p>}<time className="muted small" dateTime={row.creation.replace(' ','T')}><bdi>{row.creation.split('.')[0]}</bdi></time>
    <div className="actions">{row.request?<button className="btn small" disabled={busy} onClick={()=>void onOpen(row.request!)}>{t('فتح الطلب','Open request')}</button>:row.reference_doctype&&row.reference_name?<a className="btn small" href={'/desk/'+encodeURIComponent(row.reference_doctype.toLowerCase().replaceAll(' ','-'))+'/'+encodeURIComponent(row.reference_name)} target="_blank" rel="noreferrer">{t('فتح السجل','Open record')}</a>:null}
     {!row.read&&<button className="btn small" disabled={busy} onClick={()=>void mark(row)}>{t('تحديد كمقروء','Mark as read')}</button>}</div>
   </article>)}</div>
   {!data.rows.length&&<p className="form-body">{t('لا توجد إشعارات مطابقة ضمن صلاحياتك الحالية.','No matching notifications within your current access.')}</p>}
   <div className="form-footer"><span>{data.rows.length?`${data.start+1}–${data.start+data.rows.length}`:'0'} / {data.total}</span><div className="actions"><button className="btn small" disabled={busy||!data.start} onClick={()=>setQuery(q=>({...q,start:Math.max(0,q.start-data.page_length)}))}>{t('الصفحة السابقة','Previous page')}</button><button className="btn small" disabled={busy||!data.has_more} onClick={()=>setQuery(q=>({...q,start:data.next_start}))}>{t('الصفحة التالية','Next page')}</button></div></div>
  </>}
  </section>
 </section>
}
