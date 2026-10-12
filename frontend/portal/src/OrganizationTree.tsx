import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import type {Tr} from './types';
import type {Filters,Position} from './Organization';

type TreePage={rows:Position[];available:boolean;has_more:boolean;next_start:number};
const empty=():TreePage=>({rows:[],available:true,has_more:false,next_start:0});
const label=(p:Position,t:Tr)=>t(p.title_ar||p.title,p.title);

function Branch({filters,parent='',focus='',path=[],onOpen,onFocus,t}:{filters:Filters;parent?:string;focus?:string;path?:string[];onOpen:(name:string)=>void;onFocus:(name:string)=>void;t:Tr}){
 const [page,setPage]=useState<TreePage>(empty),[offset,setOffset]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let cancelled=false;setBusy(true);setError(false);
  api<TreePage>('kandil_hr.portal.organization_tree.nodes',{...filters,parent,focus,start:offset,page_length:20}).then(next=>{if(!cancelled)setPage(old=>({...next,rows:offset?[...old.rows,...next.rows.filter(n=>!old.rows.some(o=>o.name===n.name))]:next.rows}))}).catch(()=>{if(!cancelled){setError(true);setPage(empty())}}).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true};
 },[filters,parent,focus,offset,retry]);
 return <div className="org-tree-branch" aria-busy={busy}>
 {error?<div role="alert"><p>{t('تعذر تحميل التبعية. راجع الصلاحيات ثم حاول مجددًا.','Could not load reporting lines. Check access and try again.')}</p><button className="btn small" onClick={()=>{setOffset(0);setRetry(n=>n+1)}}>{t('إعادة المحاولة','Retry')}</button></div>:!page.available?<p>{t('خطوط التبعية غير متاحة لدورك. استخدم عرض القائمة.','Reporting lines are unavailable for your role. Use the list view.')}</p>:<>
 {!!page.rows.length&&<ul className="org-tree-list">{page.rows.map(node=><TreeNode key={node.name} node={node} filters={filters} path={path} onOpen={onOpen} onFocus={onFocus} t={t}/>)}</ul>}
 {!busy&&!page.rows.length&&<p className="muted">{page.has_more?t('لا توجد نتائج في هذه الدفعة. تابع البحث في الدفعة التالية.','No matches in this batch. Continue to the next batch.'):parent?t('لا توجد مناصب تابعة متاحة ضمن هذه الفلاتر والتاريخ.','No accessible direct reports for these filters and date.'):t('لا توجد بدايات متاحة ضمن هذه الفلاتر. يمكن استكشاف أي منصب من عرض القائمة.','No visible starting positions for these filters. Explore any position from the list view.')}</p>}
 {page.has_more&&<button className="btn small" disabled={busy} onClick={()=>setOffset(page.next_start)}>{t('تحميل مناصب أكثر','Load more positions')}</button>}
 </>}
 {busy&&<p role="status">{t('جارٍ تحميل التبعية…','Loading reporting lines…')}</p>}
 </div>
}
function TreeNode({node,filters,path,onOpen,onFocus,t}:{node:Position;filters:Filters;path:string[];onOpen:(name:string)=>void;onFocus:(name:string)=>void;t:Tr}){
 const [expanded,setExpanded]=useState(false),cycle=path.includes(node.name);
 const boundary=node.boundary==='restricted'?t('المنصب الأعلى خارج نطاق صلاحياتك','Parent outside your viewing scope'):node.boundary==='outside_filter'?t('المنصب الأعلى خارج الفلاتر المحددة','Parent outside selected filters'):node.boundary==='ambiguous'?t('تعارض في فترات التبعية — يلزم مراجعة HR','Overlapping reporting episodes — HR review needed'):node.boundary==='no_parent'?t('لا يوجد منصب أعلى مسجل في هذا التاريخ','No parent recorded for this date'):'';
 return <li className="org-tree-node" data-position={node.name}><article className="org-position"><div className="org-position-top"><button className="text-button org-position-title" onClick={()=>onOpen(node.name)}>{label(node,t)}</button><span className="badge">{node.status==='Closed'?t('مغلق','Closed'):t('نشط','Active')}</span></div><small>{node.position_code} · {node.designation}</small><p>{node.department} · {node.branch||'—'}</p>{boundary&&<p className="muted small">{boundary}</p>}
 {cycle?<p role="alert">{t('حلقة في التبعية — توقف العرض لحين مراجعة HR.','Reporting cycle detected — expansion stopped for HR review.')}</p>:<div className="actions"><button className="btn small" aria-expanded={expanded} aria-label={(expanded?t('إخفاء تابعي ','Collapse reports for '):t('عرض تابعي ','Expand reports for '))+label(node,t)} onClick={()=>setExpanded(!expanded)}>{expanded?t('إخفاء التابعين','Collapse reports'):t('عرض التابعين','Expand reports')}</button><button className="text-button" onClick={()=>onFocus(node.name)}>{t('التركيز على هذا المنصب','Focus this position')}</button></div>}
 </article>{expanded&&!cycle&&(path.length>=20?<button className="btn small" onClick={()=>onFocus(node.name)}>{t('تابع من هذا المنصب في عرض جديد','Continue from this position in a new view')}</button>:<Branch filters={filters} parent={node.name} path={[...path,node.name]} onOpen={onOpen} onFocus={onFocus} t={t}/>)}</li>
}
export function OrganizationTree({filters,focus,onOpen,onFocus,t}:{filters:Filters;focus:string;onOpen:(name:string)=>void;onFocus:(name:string)=>void;t:Tr}){
 // Focus removes directory filters deliberately, while retaining native scope/date.
 const effective=useMemo<Filters>(()=>focus?{company:'',department:'',branch:'',status:'',search:'',as_of:filters.as_of}:filters,[focus,filters]);
 return <div className="form-body org-tree"><p className="muted small">{focus?t('عرض منصب محدد وتابعيه ضمن صلاحياتك والتاريخ المحدد. فلاتر الدليل لا تطبق هنا.','Focused position and descendants within your permissions and selected date. Directory filters do not apply here.'):t('البدايات تخص المناصب الظاهرة ضمن الفلاتر والصلاحيات؛ قد يكون المنصب الأعلى خارج العرض. افتح التابعين لاستكشاف الهيكل.','Starting positions belong to the filtered, accessible view; a parent may be outside it. Expand reports to explore the structure.')}</p>{focus&&<button className="btn small" onClick={()=>onFocus('')}>{t('العودة إلى الهيكل حسب الفلاتر','Return to filtered structure')}</button>}<Branch key={JSON.stringify({...effective,focus})} filters={effective} focus={focus} onOpen={onOpen} onFocus={onFocus} t={t}/></div>
}
