/* Ordinary AR/EN sessions inspect recorded decisions after later HR changes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex');
const out=path.join(__dirname,'evidence',`history-workflows-${run}`),manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
fs.mkdirSync(out,{recursive:true});
const files=['kandil_hr/recruitment/note_projection.py','kandil_hr/recruitment/event_access.py','kandil_hr/recruitment/review_views.py','kandil_hr/pilot/permissions.py','kandil_hr/pilot/models.py','kandil_hr/portal/history_workflows_fixture.py','kandil_hr/portal/board_fixture.py','kandil_hr/portal/request_history.py','kandil_hr/portal/request_revisions.py','kandil_hr/portal/history_rationale.py','kandil_hr/recruitment/corrections.py','kandil_hr/recruitment/pending_revision.py','kandil_hr/recruitment/api.py','kandil_hr/recruitment/authority.py','kandil_hr/foundation/files.py','kandil_hr/foundation/board_files.py','kandil_hr/portal/board.py','kandil_hr/pilot/navigation.py','kandil_hr/recruitment/preview.py','frontend/portal/src/RequestHistory.tsx','frontend/portal/src/RequestRevisions.tsx','frontend/portal/src/HistoryCapture.tsx','frontend/portal/src/main.tsx','kandil_hr/public/portal/portal.js','docs/portal/test_history_workflows.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')])),source=hashes();
const prefix='kandil_hr.portal.request_history.',revPrefix='kandil_hr.portal.request_revisions.';
let browser,page,data,cleanup,unchanged;const checks=[],errors=[],failures=[],external=[];
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.history_workflows_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-history-workflows-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function ready(p){await p.locator('main.content').waitFor();await p.waitForFunction(()=>document.querySelector('main.content')?.getAttribute('aria-busy')==='false')}
async function login(role,lang='en'){const c=await browser.newContext({viewport:lang==='ar'?{width:390,height:844}:{width:1440,height:1000}}),p=await c.newPage();page=p;p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.name));p.on('response',r=>{if(r.status()>=500)failures.push({status:r.status(),path:new URL(r.url()).pathname})});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();if(lang==='en')await p.getByRole('button',{name:'English',exact:true}).click();await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await ready(p);return p}
async function get(p,endpoint,args){return p.evaluate(async({endpoint,args})=>{const r=await fetch('/api/method/'+endpoint+'?'+new URLSearchParams(args));return {status:r.status,data:(await r.json()).message}},{endpoint,args})}
async function settled(p){await p.waitForFunction(()=>document.querySelector('.request-history')?.getAttribute('aria-busy')==='false')}
async function open(p,c,t){page=p;if(await p.locator('.mobile-menu').isVisible())await p.locator('.mobile-menu').click();await p.locator('.sidebar').getByRole('link',{name:t('طلبات التوظيف','Hiring requests'),exact:true}).click();await p.locator('.request-register .request-row').filter({has:p.getByText(c.title,{exact:true})}).click();await ready(p);const response=p.waitForResponse(r=>r.url().includes(prefix+'events'));await p.getByRole('button',{name:t('عرض سجل المراجعات','View review history'),exact:true}).click();assert.equal((await response).status(),200);await settled(p)}
async function select(p,c,id){const response=p.waitForResponse(r=>r.url().includes(prefix+'event?'));await p.locator(`[data-event-id="${id}"]`).click();const r=await response;assert.equal(r.status(),200);await settled(p);await p.locator('.history-comparison').waitFor();return (await r.json()).message}
async function capture(p,selector,file){await p.locator(selector).screenshot({path:path.join(out,file),style:'.topbar{visibility:hidden!important}'});check(file+': viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest,'utf8'));browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const b=data.workflow_cases.board,q=data.workflow_cases.pending;
 for(const lang of ['en','ar']){
  const t=(ar,en)=>lang==='ar'?ar:en;
  const requester=await login('requester',lang),delegate=await login('recruiter',lang),ceo=await login('ceo',lang),chair=await login('chair',lang),hr=await login('hr',lang),outsider=await login('outsider',lang);
  await open(delegate,b,t);let v=await select(delegate,b,b.events.delegate);
  check(lang+': delegate sees original two-seat review and distinct principal',v.before.lines[0].proposed_qty===2&&v.event.actor===data.users.recruiter.email&&v.event.principal===data.users.manager.email);
  check(lang+': delegate identity is rendered beside principal',(await delegate.locator('.history-comparison').innerText()).includes(data.users.manager.email)&&(await delegate.locator('.history-comparison').innerText()).includes(data.users.recruiter.email));
  await capture(delegate,'.history-captures',`delegate-${lang}.png`);
  await open(ceo,b,t);v=await select(ceo,b,b.events.ceo);
  check(lang+': CEO historical review preserves requested two versus proposed one',v.before.lines[0].requested_qty===2&&v.before.lines[0].proposed_qty===1&&v.event.actor===data.users.ceo.email&&v.after.status==='Pending');
  check(lang+': CEO reference reads do not enable live headcount preview',(await get(ceo,'kandil_hr.recruitment.preview.headcount',{name:b.name})).status===403);
  await capture(ceo,'.history-captures',`ceo-${lang}.png`);
  await open(chair,b,t);v=await select(chair,b,b.events.board_return);
  check(lang+': old Board return survives a later approval and HR correction',v.before.revision===1&&v.after.status==='Returned'&&(await get(chair,'kandil_hr.portal.api.detail',{name:b.name})).data.request.revision===3);
  check(lang+': actual Board member is distinct from recorder and frozen chair',v.event.principal===data.users.vice.email&&v.event.actor===data.users.sector.email&&v.after.approval_steps.at(-1).principal===data.users.chair.email&&v.after.approval_steps.at(-1).board_member===data.users.vice.email);
  const proof=chair.locator('.history-snapshot').nth(1).getByRole('link',{name:t('فتح المستند الداعم','Open supporting evidence'),exact:true});
  check(lang+': retained supporting proof appears on old decision',await proof.isVisible()&&await proof.getAttribute('href')===b.proof_url);
  const downloaded=await chair.request.get('http://localhost:8102'+b.proof_url);
  check(lang+': current authorized member downloads original retained bytes',downloaded.status()===200&&await downloaded.text()===b.proof_text);
  check(lang+': outsider cannot download historical Board proof',(await outsider.request.get('http://localhost:8102'+b.proof_url)).status()===403);
  await capture(chair,'.history-captures',`board-retained-${lang}.png`);
  const savedResponse=chair.waitForResponse(r=>r.url().includes(revPrefix+'revisions?'));await chair.getByRole('button',{name:t('عرض النسخ المحفوظة','Browse saved versions'),exact:true}).click();const saved=(await(await savedResponse).json()).message;
  const original=saved.rows.find(r=>r.revision===1&&r.action==='Submitted');assert.ok(original);
  await chair.locator(`[data-revision-id="${original.name}"]`).click();await chair.locator('.revision-detail').waitFor();
  const compared=chair.waitForResponse(r=>r.url().includes(revPrefix+'compare?'));await chair.locator('.revision-compare').click();const comparison=(await(await compared).json()).message;await chair.locator('.revision-comparison').waitFor();
  check(lang+': original submission compares with exact old Board reviewed quantity',comparison.before.lines[0].proposed_qty===2&&comparison.after.lines[0].proposed_qty===1&&comparison.decision==='Returned'&&comparison.event.principal===data.users.vice.email);
  await capture(chair,'.revision-comparison',`board-comparison-${lang}.png`);
  await open(hr,b,t);v=await select(hr,b,b.events.correction);
  check(lang+': correction preserves original requested quantity and reduces approval',v.before.lines[0].approved_qty===2&&v.after.lines[0].approved_qty===1&&v.after.lines[0].requested_qty===2&&v.before.revision===2&&v.after.revision===3);
  check(lang+': correction shows captured reason and changed requirements',v.action.reason==='Reduced need / تخفيض الاحتياج'&&v.after.qualifications==='Corrected requirements / متطلبات مصححة'&&(await hr.locator('.history-action-reason').innerText()).includes('Reduced need'));
  check(lang+': ordinary correction is not labelled approval restart',!v.action.approval_restart&&await hr.locator('.history-restarted').count()===0);
  await capture(hr,'.history-comparison',`correction-${lang}.png`);
  await open(requester,q,t);v=await select(requester,q,q.events.noop);
  check(lang+': unchanged quantity request has no new revision or restart',v.action.no_change&&!v.action.approval_restart&&v.before.revision===v.after.revision&&v.before.lines[0].reserved_qty===v.after.lines[0].reserved_qty);
  check(lang+': no-change explanation is visible',await requester.locator('.history-unchanged').isVisible()&&await requester.locator('.history-restarted').count()===0);
  await capture(requester,'.history-comparison',`unchanged-${lang}.png`);
  v=await select(requester,q,q.events.restart);
  check(lang+': increased quantities show original and new reservation',v.before.lines[0].reserved_qty===2&&v.after.lines[0].reserved_qty===3&&v.before.revision===1&&v.after.revision===2);
  check(lang+': completed approval was replaced by fresh pending steps',v.before.approval_steps[0].decision==='Approved'&&v.after.approval_steps.every(s=>s.decision==='Pending')&&v.action.approval_restart&&!v.action.no_change);
  check(lang+': restart reason and explanation are visible',await requester.locator('.history-restarted').isVisible()&&(await requester.locator('.history-action-reason').innerText()).includes('Three now needed'));
  await capture(requester,'.history-comparison',`restart-${lang}.png`);
  v=await select(requester,q,q.events.old_decision);
  check(lang+': old manager decision retains two seats after later three-seat approvals',v.before.revision===1&&v.before.lines[0].requested_qty===2&&v.after.approval_steps[0].decision==='Approved');
  const versionsResponse=requester.waitForResponse(r=>r.url().includes(revPrefix+'revisions?'));await requester.getByRole('button',{name:t('عرض النسخ المحفوظة','Browse saved versions'),exact:true}).click();const versions=(await(await versionsResponse).json()).message;
  const previous=versions.rows.find(r=>r.action==='Pending quantity revision source');assert.ok(previous);
  check(lang+': pre-change saved version has a localized label',(await requester.locator(`[data-revision-id="${previous.name}"]`).innerText()).includes(t('المحتوى قبل تعديل الأعداد','Content before quantity change')));
  const previousResponse=requester.waitForResponse(r=>r.url().includes(revPrefix+'revision?'));await requester.locator(`[data-revision-id="${previous.name}"]`).click();const previousCapture=(await(await previousResponse).json()).message;
  check(lang+': saved source remains readable despite earlier unchanged command',previousCapture.location_source==='exact_command_capture'&&previousCapture.snapshot.lines[0].requested_qty===2&&previousCapture.snapshot.revision===1);

  check(lang+': outsider cannot enumerate expanded history',(await get(outsider,prefix+'events',{name:b.name})).status===403);
  check(lang+': a permitted request cannot borrow an event from another',(await get(requester,prefix+'event',{name:q.name,event_id:b.events.board_return})).status===403);
  for(const p of [requester,delegate,ceo,chair,hr,outsider])await p.context().close();
 }
 const chair=await login('chair');await open(chair,b,(ar,en)=>en);await select(chair,b,b.events.board_return);bench('revoke');
 const refresh=chair.waitForResponse(r=>r.url().includes(prefix+'events'));await chair.getByRole('button',{name:'Refresh history',exact:true}).click();assert.equal((await refresh).status(),403);await settled(chair);
 check('Revoked Board grant clears historical decision and proof link',await chair.locator('.history-comparison').count()===0&&await chair.getByRole('link',{name:'Open supporting evidence',exact:true}).count()===0);
 check('Revoked Board grant denies the old proof download',(await chair.request.get('http://localhost:8102'+b.proof_url)).status()===403);await chair.context().close();
 unchanged=bench('inspect');check('All recorded revision and audit bytes unchanged by history reads',unchanged.history_unchanged);
 check('No JavaScript errors, server failures or external browser traffic',!errors.length&&!failures.length&&!external.length);check('Source unchanged',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-history-workflows-browser-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'History workflow failure',status:'FAIL',error_type:e.name,error_message:String(e.message).split('\n')[0].slice(0,160)});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',e.name,String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,unchanged,cleanup,errors,server_failures:failures,external,source_hashes:source,limits:['Synthetic ordinary-session historical views; mutation workflows have separate acceptance. Remaining native raw history/reference audit and independent HR/security/capacity gates stay open.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
