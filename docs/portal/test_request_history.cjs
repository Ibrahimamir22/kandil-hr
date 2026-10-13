/* Ordinary personal sessions, actual EN desktop / AR mobile request-history screens. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence',`request-history-${run}`);
fs.mkdirSync(out,{recursive:true});const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
const files=['kandil_hr/pilot/navigation.py','kandil_hr/recruitment/preview.py','frontend/portal/src/RequestLinks.tsx','kandil_hr/portal/request_links.py','kandil_hr/portal/history_rationale.py','kandil_hr/foundation/approver_capacity_access.py','kandil_hr/recruitment/setup.py','frontend/portal/src/RequestHistory.tsx','frontend/portal/src/HistoryCapture.tsx','frontend/portal/src/RequestRevisions.tsx','kandil_hr/portal/request_revisions.py','kandil_hr/foundation/request_history_indexes.py','kandil_hr/patches.txt','frontend/portal/src/main.tsx','frontend/portal/src/portal.css','kandil_hr/public/portal/portal.js','kandil_hr/portal/request_history.py','kandil_hr/portal/request_history_fixture.py','kandil_hr/recruitment/command_audit.py','kandil_hr/recruitment/privacy.py','kandil_hr/recruitment/history_access.py','kandil_hr/recruitment/history_schema.py','kandil_hr/recruitment/models.py','kandil_hr/recruitment/api.py','kandil_hr/kandil_hr/doctype/kandil_hiring_request/kandil_hiring_request.json','kandil_hr/kandil_hr/doctype/kandil_approval_step/kandil_approval_step.json','docs/portal/test_request_history.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));const source=hashes();
let browser,page,data,cleanup;const checks=[],errors=[],failures=[],external=[];const prefix='kandil_hr.portal.request_history.';
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.request_history_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-requests-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function ready(p){await p.locator('main.content').waitFor();await p.waitForFunction(()=>document.querySelector('main.content')?.getAttribute('aria-busy')==='false')}
async function login(role,lang='en'){const c=await browser.newContext({viewport:lang==='ar'?{width:390,height:844}:{width:1440,height:1000}});const p=await c.newPage();page=p;p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.name));p.on('response',r=>{if(r.status()>=500)failures.push({status:r.status(),path:new URL(r.url()).pathname})});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();if(lang==='en')await p.getByRole('button',{name:'English',exact:true}).click();await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await ready(p);return p}
async function read(p,name){return p.evaluate(async name=>{const r=await fetch('/api/method/kandil_hr.portal.api.detail?'+new URLSearchParams({name}));return {status:r.status,data:(await r.json()).message}},name)}
async function post(p,endpoint,values){return p.evaluate(async({endpoint,values})=>{const boot=(await(await fetch('/api/method/kandil_hr.portal.api.bootstrap')).json()).message;const r=await fetch('/api/method/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':boot.csrf_token},body:JSON.stringify(values)});const data=await r.json();return {status:r.status,data:data.message}},{endpoint,values})}

async function get(p,endpoint,args){return p.evaluate(async({endpoint,args})=>{const r=await fetch('/api/method/'+endpoint+'?'+new URLSearchParams(args));const j=await r.json();return {status:r.status,data:j.message}},{endpoint,args})}
async function settled(p){await p.waitForFunction(()=>document.querySelector('.request-history')?.getAttribute('aria-busy')==='false')}
async function openHistory(p,t,title=data.history.title){page=p;if(await p.locator('.mobile-menu').isVisible())await p.locator('.mobile-menu').click();await p.locator('.sidebar').getByRole('link',{name:t('طلبات التوظيف','Hiring requests'),exact:true}).click();await p.locator('.request-register .request-row').filter({has:p.getByText(title,{exact:true})}).click();await ready(p);const response=p.waitForResponse(r=>r.url().includes(prefix+'events'));await p.getByRole('button',{name:t('عرض سجل المراجعات','View review history'),exact:true}).click();assert.equal((await response).status(),200);await settled(p)}
async function select(p,id){const response=p.waitForResponse(r=>r.url().includes(prefix+'event?'));await p.locator(`[data-event-id="${id}"]`).click();assert.equal((await response).status(),200);await settled(p);await p.locator('.history-comparison').waitFor()}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest,'utf8'));browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const lang of ['en','ar']){
  const t=(ar,en)=>lang==='ar'?ar:en,requester=await login('requester',lang),hr=await login('hr',lang),manager=await login('manager',lang),outsider=await login('outsider',lang);
  await openHistory(requester,t);check(lang+': request opens eight recorded commands including amendment creation',await requester.locator('[data-event-id]').count()===8);
  await select(requester,data.history.return_event);const old=await get(requester,prefix+'event',{name:data.history.name,event_id:data.history.return_event});
  check(lang+': old reviewed revision survives current revised request',old.status===200&&old.data.before.revision===1&&old.data.before.title===data.history.original_title&&old.data.after.status==='Returned'&&old.data.before.lines[0].requested_qty===2);
  check(lang+': original title is rendered on both sides',(await requester.locator('.history-fields tbody tr').filter({hasText:t('عنوان الطلب','Title')}).innerText()).includes(data.history.original_title));
  check(lang+': old decision reason and reviewed step visible',(await requester.locator('.history-comparison').innerText()).includes('Clarify the need')&&await requester.locator('.history-reviewed').count()===2);
  await requester.locator('.request-history').scrollIntoViewIfNeeded();await requester.screenshot({path:path.join(out,`returned-${lang}.png`),fullPage:true});
  await select(requester,data.history.review_event);const review=await get(requester,prefix+'event',{name:data.history.name,event_id:data.history.review_event});
  check(lang+': original requested three versus HR proposal one',review.data.before.lines[0].requested_qty===3&&review.data.before.lines[0].proposed_qty===3&&review.data.after.lines[0].requested_qty===3&&review.data.after.lines[0].proposed_qty===1);
  check(lang+': both recorded quantity tables are visible',await requester.locator('.history-snapshot table').count()===2);
  await requester.locator('.history-snapshot').first().getByText(t('السياسة المحفوظة وقت الإجراء','Policy recorded at the time'),{exact:true}).click();
  check(lang+': frozen policy is displayed',await requester.locator('.history-policy').first().isVisible());
  check(lang+': history fits viewport',await requester.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check(lang+': all history comparison columns fit their containers',await requester.locator('.request-history .table-wrap').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));
  await requester.locator('.history-comparison').scrollIntoViewIfNeeded();await requester.screenshot({path:path.join(out,`review-${lang}.png`),fullPage:true});
  await requester.locator('.history-fields').screenshot({path:path.join(out,`fields-${lang}.png`),style:'.topbar{visibility:hidden!important}'});await requester.locator('.history-snapshot').first().screenshot({path:path.join(out,`snapshot-${lang}.png`),style:'.topbar{visibility:hidden!important}'});
  const revPrefix='kandil_hr.portal.request_revisions.';
  const revisionsResponse=requester.waitForResponse(r=>r.url().includes(revPrefix+'revisions?'));
  await requester.getByRole('button',{name:t('عرض النسخ المحفوظة','Browse saved versions'),exact:true}).click();assert.equal((await revisionsResponse).status(),200);
  await requester.waitForFunction(()=>document.querySelector('.request-revisions')?.getAttribute('aria-busy')==='false');
  const saved=await get(requester,revPrefix+'revisions',{name:data.history.name});
  const original=saved.data.rows.find(r=>r.revision===1&&r.action==='Submitted');assert.ok(original);
  const approved=saved.data.rows.find(r=>r.status==='Approved');assert.ok(approved);
  const approvedCapture=await get(requester,revPrefix+'revision',{name:data.history.name,revision_id:approved.name});
  check(lang+': original approved saved version survives amendment creation',approvedCapture.status===200&&approvedCapture.data.location_source==='exact_command_capture');
  check(lang+': saved snapshots distinguish actions within each revision',saved.data.rows.length>=6&&new Set(saved.data.rows.map(r=>r.name)).size===saved.data.rows.length);
  const selectedResponse=requester.waitForResponse(r=>r.url().includes(revPrefix+'revision?'));
  await requester.locator(`[data-revision-id="${original.name}"]`).click();assert.equal((await selectedResponse).status(),200);await requester.locator('.revision-detail').waitFor();
  const snapshot=await get(requester,revPrefix+'revision',{name:data.history.name,revision_id:original.name});
  check(lang+': original submission uses exact recorded capture',snapshot.data.location_source==='exact_command_capture'&&snapshot.data.snapshot.title===data.history.original_title&&snapshot.data.snapshot.lines[0].requested_qty===2);
  check(lang+': comparison requires a selected decision',await requester.locator('.revision-compare').isDisabled());
  const commands=await get(requester,prefix+'events',{name:data.history.name});
  const finalDecision=commands.data.rows.find(e=>e.operation==='decide'&&e.actor===data.users.hr.email);assert.ok(finalDecision);
  await select(requester,finalDecision.name);
  const comparisonResponse=requester.waitForResponse(r=>r.url().includes(revPrefix+'compare?'));
  await requester.locator('.revision-compare').click();assert.equal((await comparisonResponse).status(),200);await requester.locator('.revision-comparison').waitFor();
  const comparison=await get(requester,revPrefix+'compare',{name:data.history.name,revision_id:original.name,event_id:finalDecision.name});
  check(lang+': selected submission compared with actual pre-decision HR content',comparison.data.before.lines[0].requested_qty===2&&comparison.data.after.lines[0].requested_qty===3&&comparison.data.after.lines[0].proposed_qty===1&&comparison.data.outcome==='Approved'&&comparison.data.decision==='Approved');
  check(lang+': different revision comparison is explicitly labelled',!comparison.data.same_revision&&await requester.locator('.revision-comparison .alert.warning').count()===1);
  check(lang+': compared original and revised titles rendered',(await requester.locator('.revision-comparison .history-fields').innerText()).includes(data.history.original_title)&&(await requester.locator('.revision-comparison .history-fields').innerText()).includes(data.history.title));
  check(lang+': saved comparison columns fit their containers',await requester.locator('.revision-comparison .table-wrap').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));
  await requester.locator('.revision-comparison .history-fields').screenshot({path:path.join(out,`revision-fields-${lang}.png`),style:'.topbar{visibility:hidden!important}'});
  await requester.locator('.revision-comparison').screenshot({path:path.join(out,`revision-comparison-${lang}.png`),style:'.topbar{visibility:hidden!important}'});
  check(lang+': outside-scope revision detail denied',(await get(outsider,revPrefix+'revision',{name:data.history.name,revision_id:original.name})).status===403);
  check(lang+': outside-scope comparison denied',(await get(outsider,revPrefix+'compare',{name:data.history.name,revision_id:original.name,event_id:finalDecision.name})).status===403);
  check(lang+': comparison cannot borrow another request event',(await get(requester,revPrefix+'compare',{name:data.history.name,revision_id:original.name,event_id:data.history.other_event})).status===403);
  const revisionPage=await get(requester,revPrefix+'revisions',{name:data.history.name,page_length:'2'});
  check(lang+': saved version pagination is bounded',revisionPage.data.rows.length===2&&revisionPage.data.has_more);
  await select(requester,data.history.review_event);
  check(lang+': changing to a non-decision clears comparison',await requester.locator('.revision-comparison').count()===0&&await requester.locator('.revision-compare').isDisabled());
  for(const p of [hr,manager]){await openHistory(p,t);await select(p,data.history.return_event);check(lang+': ordinary '+(p===hr?'HR':'manager')+' can inspect authorized historical review',await p.locator('.history-comparison').isVisible());}
  check(lang+': outsider history list denied',(await get(outsider,prefix+'events',{name:data.history.name})).status===403);
  check(lang+': outsider guessed event denied',(await get(outsider,prefix+'event',{name:data.history.name,event_id:data.history.return_event})).status===403);
  check(lang+': authorized reader cannot mix another request event',(await get(requester,prefix+'event',{name:data.history.name,event_id:data.history.other_event})).status===403);
  const raw=await requester.request.get('http://localhost:8102/api/resource/Kandil%20Command%20Audit/'+data.history.return_event);check(lang+': raw private audit access remains denied',raw.status()===403);
  for(const p of [requester,hr,manager]){
   const role=p===requester?'requester':p===hr?'HR':'manager';
   for(const endpoint of ['/api/resource/Kandil%20Hiring%20Request/','/api/v2/document/Kandil%20Hiring%20Request/']){
    const r=await p.request.get('http://localhost:8102'+endpoint+data.history.name),j=await r.json(),v=j.data;
    check(lang+': '+role+' '+endpoint+' excludes embedded raw history',r.status()===200&&!v.submitted_snapshot&&!v.route_snapshot&&v.approval_steps.every(s=>!s.reviewed_snapshot));
   }
  }
  const revisions=await get(requester,'frappe.client.get_list',{doctype:'Kandil Request Revision',fields:JSON.stringify(['name','snapshot_json']),filters:JSON.stringify({request:data.history.name}),limit_page_length:'100'});
  check(lang+': authorized native immutable revisions remain available',revisions.status===200&&revisions.data.length>0&&revisions.data.every(r=>JSON.parse(r.snapshot_json).name===data.history.name));
  const rev=revisions.data[0];
  const native=await get(requester,'frappe.client.get',{doctype:'Kandil Request Revision',name:rev.name});
  check(lang+': native detail preserves original revision bytes',native.status===200&&native.data.snapshot_json===rev.snapshot_json);
  check(lang+': outsider cannot read native revision',(await get(outsider,'frappe.client.get',{doctype:'Kandil Request Revision',name:rev.name})).status===403);
  check(lang+': bounded page and second page are usable',(await get(requester,prefix+'events',{name:data.history.name,page_length:'2',start:'2'})).data.rows.length===2);
  const linkPrefix='kandil_hr.portal.request_links.';
  await requester.waitForFunction(()=>document.querySelector('.request-links')?.getAttribute('aria-busy')==='false');
  const linked=await get(requester,linkPrefix+'related',{name:data.history.name});
  check(lang+': original lists its permitted amendment',linked.status===200&&linked.data.amendments.some(r=>r.name===data.history.amendment));
  await requester.locator(`[data-linked-request="${data.history.amendment}"]`).click();await ready(requester);
  await requester.locator(`[data-linked-request="${data.history.name}"]`).waitFor();
  check(lang+': amendment opens and provides a link back to original',await requester.locator(`[data-linked-request="${data.history.name}"]`).isVisible());
  check(lang+': navigation replaces history and links without duplicate panels',await requester.locator('.request-links').count()===1&&await requester.locator('.request-history').count()===1);
  await requester.locator('.request-links').screenshot({path:path.join(out,`amendment-links-${lang}.png`),style:'.topbar{visibility:hidden!important}'});
  await requester.locator(`[data-linked-request="${data.history.name}"]`).click();await ready(requester);
  await requester.locator(`[data-linked-request="${data.history.amendment}"]`).waitFor();
  check(lang+': original can be reopened through amendment link',await requester.locator(`[data-linked-request="${data.history.amendment}"]`).isVisible());
  check(lang+': outsider cannot enumerate amendment links',(await get(outsider,linkPrefix+'related',{name:data.history.name})).status===403);
  await openHistory(requester,t,data.history.other_title);await select(requester,data.history.other_event);
  const route=await get(requester,prefix+'event',{name:data.history.other_name,event_id:data.history.other_event});
  check(lang+': route uses original dated rule despite later policy change',route.status===200&&route.data.after.rationale.rules[0].reason==='Original dated review / مراجعة مؤرخة أصلية');
  check(lang+': captured personal-interest exclusion is authority-level',route.data.after.rationale.skipped.some(r=>r.authority==='Department Approval'&&r.reason==='PERSONAL_INTEREST')&&!JSON.stringify(route.data.after.rationale).includes(data.users.manager.email));
  const rationale=requester.locator('.history-snapshot').nth(1).locator('.route-rationale');await rationale.locator('summary').click();
  check(lang+': original rule and personal-interest explanation are rendered',(await rationale.innerText()).includes('Original dated review / مراجعة مؤرخة أصلية')&&(await rationale.innerText()).includes(t('استبعاد مستوى اعتماد لوجود مصلحة شخصية في الطلب','Approval level excluded due to a personal interest in the request')));
  check(lang+': route explanation fits viewport',await requester.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await rationale.screenshot({path:path.join(out,`route-rationale-${lang}.png`),style:'.topbar{visibility:hidden!important}'});
  for(const p of [requester,hr,manager,outsider])await p.context().close();
 }
 const p=await login('requester');await openHistory(p,(ar,en)=>en);await select(p,data.history.return_event);bench('revoke');const response=p.waitForResponse(r=>r.url().includes(prefix+'events'));await p.getByRole('button',{name:'Refresh history',exact:true}).click();assert.equal((await response).status(),403);await settled(p);check('Revocation clears previously displayed history',await p.locator('.history-comparison').count()===0&&await p.locator('.request-history [role=alert]').count()===1);check('Revocation denies exact historical event',(await get(p,prefix+'event',{name:data.history.name,event_id:data.history.return_event})).status===403);const linksResponse=p.waitForResponse(r=>r.url().includes('request_links.related'));await p.getByRole('button',{name:'Refresh links',exact:true}).click();assert.equal((await linksResponse).status(),403);await p.waitForFunction(()=>document.querySelector('.request-links')?.getAttribute('aria-busy')==='false');check('Revocation clears previously displayed amendment links',await p.locator('[data-linked-request]').count()===0&&await p.locator('.request-links [role=alert]').count()===1);await p.context().close();
 const guest=await browser.newContext();check('Guest history denied',(await guest.request.get('http://localhost:8102/api/method/'+prefix+'events?name='+data.history.name)).status()===403);check('Guest amendment links denied',(await guest.request.get('http://localhost:8102/api/method/kandil_hr.portal.request_links.related?name='+data.history.name)).status()===403);await guest.close();check('No JS errors, server failures or external traffic',!errors.length&&!failures.length&&!external.length);check('Source unchanged',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-request-history-browser-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'History journey failure',status:'FAIL',error_type:e.name,error_message:String(e.message).split('\n')[0].slice(0,160)});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',e.name,String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,errors,server_failures:failures,external,source_hashes:source,limits:['Command history, saved revisions, pre-decision comparison, captured route reasons and amendment navigation in AR/EN. Expanded authority/correction browser history, remaining native legacy paths and full S3 acceptance remain open.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
