import React, {useState} from 'react';
import {DataComponent, ReportSection, RichNarrative, useDataApp} from '../../data-app-public.jsx';
import {sections} from './research-sections.js';
import './report.css';
export function ReportContent(){
 const {snapshot,visible,appTitle,canEdit,mode,setAppTitle}=useDataApp();
 const rows=snapshot.queries.vendors.rows;
 const [group,setGroup]=useState('All'); const [search,setSearch]=useState('');
 const filtered=rows.filter(r=>(group==='All'||r.group===group)&&Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase()));
 const previews=Object.fromEntries(rows.map(r=>[r.source,{title:r.vendor,summary:r.modules+'. '+r.egyptPayroll,source:'Official vendor material',date:'2026-09-27',approvedForReport:true}]));
 const renderSection=(s)=>(visible(s.id)&&<ReportSection key={s.id} id={s.id} title={s.title} queryId="vendors" sourceRows={s.id==='shortlist'?rows.filter(r=>r.kandilFit==='Priority demo'):rows} showHeading={false} className="research-section"><RichNarrative id={s.id+':body'} value={s.text} sourcePreviews={previews}/></ReportSection>);
 return <article className="report-content hr-research">
  <header className="report-hero"><h1 data-data-app-title contentEditable={canEdit&&mode==='edit'} suppressContentEditableWarning onBlur={canEdit&&mode==='edit'?e=>setAppTitle(e.currentTarget.textContent.trim()||appTitle):undefined}>{appTitle}</h1></header>
  {sections.slice(0,3).map(renderSection)}
  {visible('vendor-directory')&&<DataComponent id="vendor-directory" title="Explore the 44-product comparison" kind="table" queryId="vendors" sourceRows={filtered} displayRows={filtered}>
   <RichNarrative id="directory:guide" value="## Explore the 44-product comparison\n\nSearch by product, capability or market. Expand a product for pricing, integration access and unresolved questions. Features are vendor claims; shortlist status is a provisional judgement."/>
   <div className="directory-controls"><label>Market <select aria-label="Market" value={group} onChange={e=>setGroup(e.target.value)}>{['All',...new Set(rows.map(r=>r.group))].map(g=><option key={g}>{g}</option>)}</select></label><label>Search <input aria-label="Search vendors" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Egypt payroll, API, shifts…"/></label><button onClick={()=>{setGroup('All');setSearch('')}}>Reset</button><span aria-live="polite">{filtered.length} of {rows.length} products</span></div>
   <div data-reviewed-rows>{filtered.length===0?<p>No products match these filters.</p>:filtered.map(r=><details key={r.vendor} className="vendor-profile"><summary><strong>{r.vendor}</strong><span>{r.group}</span><span className={r.kandilFit==='Priority demo'?'fit priority':'fit'}>{r.kandilFit}</span></summary><dl><dt>Market / category</dt><dd>{r.market} · {r.category}</dd><dt>Advertised capabilities</dt><dd>{r.modules}</dd><dt>Egyptian payroll evidence</dt><dd>{r.egyptPayroll}</dd><dt>Pricing evidence</dt><dd>{r.pricing}</dd><dt>Integration / build relevance</dt><dd>{r.integration}</dd><dt>Questions before selection</dt><dd>{r.diligence}</dd><dt>Source</dt><dd><a href={r.source} target="_blank" rel="noreferrer">Official product evidence ↗</a> · reviewed {r.reviewed}</dd></dl></details>)}</div>
  </DataComponent>}
  {sections.slice(3).map(renderSection)}
 </article>;
}
