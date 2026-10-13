/* Ordinary-session approval deadline projection, privacy and AR/EN rendering. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence',`deadlines-${run}`);
fs.mkdirSync(out,{recursive:true});const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
const files=['kandil_hr/recruitment/sla.py','kandil_hr/foundation/business_calendar.py','kandil_hr/foundation/outbox.py','kandil_hr/foundation/outbox_access.py','kandil_hr/portal/approval_deadlines.py','kandil_hr/portal/deadline_fixture.py','frontend/portal/src/ApprovalDeadlines.tsx','frontend/portal/src/main.tsx','frontend/portal/src/portal.css','kandil_hr/public/portal/portal.js','docs/portal/test_deadlines.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));const source=hashes();
let data,browser,page,cleanup;const checks=[],errors=[],failures=[],external=[];
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
function bench(action,args={}){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.deadline_fixture.'+action,'--kwargs',JSON.stringify({run_id:run,...args})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-deadlines-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
async function login(role){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();page=p;p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)failures.push(r.status())});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await p.locator('main.content[aria-busy="false"] .dashboard-scope bdi').filter({hasText:/20\d\d-/}).waitFor();return p}
async function call(p,method,args={},verb='GET'){return p.evaluate(async({method,args,verb})=>{const boot=(await(await fetch('/api/method/kandil_hr.portal.api.bootstrap')).json()).message;const r=await fetch('/api/method/'+method+(verb==='GET'?'?'+new URLSearchParams(args):''),{method:verb,headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':boot.csrf_token},...(verb==='POST'?{body:JSON.stringify(args)}:{})});const body=await r.json();return {status:r.status,data:body.message,cache:r.headers.get('cache-control')}},{method,args,verb})}
const read=(p,name)=>call(p,'kandil_hr.portal.api.detail',{name});
async function command(p,method,name,args={}){const view=await read(p,name);assert.equal(view.status,200);const r=await call(p,'kandil_hr.recruitment.api.'+method,{name,command_id:crypto.randomUUID(),expected_version:view.data.request.modified,...args},'POST');assert.equal(r.status,200,method);return r.data}
async function approve(p,name){const view=await read(p,name);assert.equal(view.status,200);return command(p,'decide',name,{decision:'Approve',step_id:view.data.actions.step_id})}

const endpoint='kandil_hr.portal.approval_deadlines.get';
async function openRequest(p,title){
 await p.reload();await p.locator('main.content[aria-busy="false"] .dashboard-scope').waitFor();
 await p.locator('button.request-row').filter({hasText:title}).first().click();
 await p.locator('.approval-deadlines[aria-busy="false"]').waitFor();
}
(async()=>{try{
 bench('prepare');data=JSON.parse(fs.readFileSync(manifest,'utf8'));browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const requester=await login('requester'),outsider=await login('outsider');page=requester;
 const title='Approval date review · متابعة مواعيد الاعتماد';
 const created=await call(requester,'kandil_hr.portal.api.save_draft',{command_id:crypto.randomUUID(),payload:JSON.stringify({company:data.company,department:data.department,title,requested_position:data.positions[0],need_reason:'Expansion',requested_priority:'Normal',lines:[{capacity:data.capacities[0],requested_qty:1}]})},'POST');assert.equal(created.status,200);const name=created.data.name;
 const draftProjection=await call(requester,endpoint,{name});assert.equal(draftProjection.status,200,'Draft deadline HTTP status');check('Draft deadline projection is inactive',draftProjection.data.state==='inactive');
 await command(requester,'submit_request',name);bench('waiting',{name});
 const before=await read(requester,name),projection=await call(requester,endpoint,{name});
 check('Ordinary requester sees four server-calculated milestones',projection.status===200&&projection.data.state==='active'&&projection.data.milestones.length===4);
 check('Expiry is advisory and no-store header protects response',projection.data.automatic_rejection===false&&projection.cache?.includes('no-store'));
 check('Deadline read does not change request version or reservations',JSON.stringify(before.data.request)===JSON.stringify((await read(requester,name)).data.request));
 check('Cross-scope account cannot read dates',(await call(outsider,endpoint,{name})).status===403);
 const guest=await browser.newContext();const anonymous=await guest.request.get('http://localhost:8102/api/method/'+endpoint+'?name='+encodeURIComponent(name));check('Unauthenticated HTTP request denied',[401,403].includes(anonymous.status()));await guest.close();
 check('POST rejected for read-only deadline endpoint',(await call(requester,endpoint,{name},'POST')).status===403);
 await openRequest(requester,title);
 for(const lang of ['ar','en']){
  await requester.setViewportSize(lang==='ar'?{width:390,height:844}:{width:1440,height:1000});
  const toggle=requester.getByRole('button',{name:lang==='en'?'English':'العربية',exact:true});if(await toggle.count())await toggle.click();
  const panel=requester.locator('.approval-deadlines');await panel.scrollIntoViewIfNeeded();
  check(lang+': four dates and advisory rendered',(await panel.locator('[data-stage]').count())===4&&(await panel.innerText()).includes(lang==='ar'?'لا يرفض الطلب تلقائيًا':'does not automatically reject'));
  check(lang+': current milestone highlighted',await panel.locator('[data-stage=expiry][aria-current=step]').count()===1);
  check(lang+': correct document direction',await requester.locator('html').getAttribute('dir')===(lang==='ar'?'rtl':'ltr'));
  check(lang+': no horizontal overflow',await requester.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await requester.evaluate(async()=>{window.scrollTo(0,0);await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
  await requester.screenshot({path:path.join(out,'deadlines-'+lang+'.png'),fullPage:true,animations:'disabled'});
 }
 bench('unavailable');const unavailableResponse=requester.waitForResponse(r=>r.url().includes(endpoint));await requester.locator('.approval-deadlines').getByRole('button',{name:'Refresh dates',exact:true}).click();await unavailableResponse;await requester.locator('.approval-deadlines').getByText('Dates are unavailable.',{exact:false}).waitFor();
 check('Missing/ambiguous calendar removes stale dates and shows actionable generic state',await requester.locator('.approval-deadlines [data-stage]').count()===0&&(await requester.locator('.approval-deadlines').innerText()).includes('Dates are unavailable'));
 const hidden=await call(requester,endpoint,{name});check('Calendar failure does not expose private configuration',hidden.data.state==='unavailable'&&!JSON.stringify(hidden.data).includes('Synthetic'));
 bench('revoke');await requester.locator('.approval-deadlines').getByRole('button',{name:'Refresh dates',exact:true}).click();await requester.locator('.approval-deadlines[aria-busy="false"] [role=alert]').waitFor();
 check('Revoked session refresh fails and clears prior projection',await requester.locator('.approval-deadlines [data-stage]').count()===0&&(await call(requester,endpoint,{name})).status===403);
 check('No browser errors, server 5xx or external requests',!errors.length&&!failures.length&&!external.length);check('Source unchanged',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-deadlines-browser-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'Deadline journey failed',status:'FAIL',error_type:e.name,error_message:String(e.message).split('\n')[0].slice(0,160)});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',e.name,String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,errors,server_failures:failures,external,source_hashes:source,limits:['Synthetic ordinary-role HTTP and AR/EN desktop/mobile panel. CLI sets own fixture waiting date. No production load, external email or HR policy acceptance.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
