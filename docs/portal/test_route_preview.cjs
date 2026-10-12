/* Read-only preview through personal HTTP sessions and the actual AR/EN UI. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence',`route-preview-${run}`);
fs.mkdirSync(out,{recursive:true});const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
const files=['frontend/portal/src/RoutePreview.tsx','frontend/portal/src/RequestForm.tsx','frontend/portal/src/portal.css','kandil_hr/public/portal/portal.js','kandil_hr/portal/api.py','kandil_hr/portal/route_preview.py','kandil_hr/portal/route_preview_fixture.py','docs/portal/test_route_preview.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));const source=hashes();
let browser,page,data,cleanup;const checks=[],errors=[],failures=[],external=[];
const endpoint='/api/method/kandil_hr.portal.route_preview.evaluate';
function bench(action,extra={}){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.route_preview_fixture.'+action,'--kwargs',JSON.stringify({run_id:run,...extra})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-route-preview-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function ready(p){await p.locator('main.content').waitFor();await p.waitForFunction(()=>document.querySelector('main.content')?.getAttribute('aria-busy')==='false')}
async function login(role,lang){const context=await browser.newContext({viewport:lang==='ar'?{width:390,height:844}:{width:1440,height:1000}});const p=await context.newPage();page=p;p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.name));p.on('response',r=>{if(r.status()>=500)failures.push({status:r.status(),path:new URL(r.url()).pathname})});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();if(lang==='en')await p.getByRole('button',{name:'English',exact:true}).click();await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await ready(p);return p}
async function previewAfter(p,action){const response=p.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==='POST');await action();const r=await response;await p.waitForFunction(()=>document.querySelector('.route-preview')?.getAttribute('aria-busy')==='false');return {status:r.status(),data:(await r.json()).message}}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest));browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking']});
 for(const lang of ['en','ar']){
  bench('configure',{scenario:'block'});const p=await login('requester',lang),t=(a,e)=>lang==='ar'?a:e;
  await p.getByRole('button',{name:t('طلب توظيف جديد','New hiring request'),exact:true}).click();await p.getByLabel(t('عنوان الطلب','Request title'),{exact:true}).fill('Preview / معاينة '+run);
  await p.getByLabel(t('الوظيفة','Position'),{exact:true}).selectOption(data.positions[0]);await p.getByLabel(t('الموقع','Location'),{exact:true}).selectOption(data.capacities[0]);await p.getByLabel(t('العدد المطلوب','Quantity'),{exact:true}).fill('2');
  await p.getByRole('button',{name:t('التالي','Continue'),exact:true}).click();const before=bench('inspect');let result=await previewAfter(p,()=>p.getByRole('button',{name:t('التالي','Continue'),exact:true}).click());
  check(lang+': unsaved normal route shows manager then HR',result.status===200&&result.data.ready&&JSON.stringify(result.data.steps.map(s=>s.authority))===JSON.stringify(['Department Approval','HR Approval']));
  assert.deepEqual(bench('inspect'),before);check(lang+': preview creates no request, ledger or notice',true);
  // Full HTTP contract: normal browser cookie alone cannot POST without CSRF.
  const http=await p.evaluate(async({endpoint,payload})=>{
   const get=await fetch(endpoint+'?'+new URLSearchParams({payload:JSON.stringify(payload)}));
   const post=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload})});return {get:get.status,post:post.status};
  },{endpoint,payload:{company:data.company,department:data.department,title:'Synthetic',requested_position:data.positions[0],need_reason:'Expansion',requested_priority:'Normal',lines:[{capacity:data.capacities[0],requested_qty:2}]}});
  check(lang+': GET and missing-CSRF POST are denied',[403,405].includes(http.get)&&http.post===400);
  await p.getByRole('button',{name:t('السابق','Back'),exact:true}).click();await p.getByRole('button',{name:t('السابق','Back'),exact:true}).click();await p.getByLabel(t('العدد المطلوب','Quantity'),{exact:true}).fill('31');await p.getByRole('button',{name:t('التالي','Continue'),exact:true}).click();result=await previewAfter(p,()=>p.getByRole('button',{name:t('التالي','Continue'),exact:true}).click());
  check(lang+': BLOCK shortage explains actual missing seat',!result.data.ready&&result.data.rows[0].shortage===1&&result.data.issues.some(i=>i.code==='HEADCOUNT_BLOCKED'));
  bench('configure',{scenario:'warn'});result=await previewAfter(p,()=>p.getByRole('button',{name:t('تحديث المعاينة','Refresh preview'),exact:true}).click());
  check(lang+': refresh observes changed policy and requires explanation',result.data.policy.headcount_mode==='Warn'&&result.data.issues.some(i=>i.code==='HEADCOUNT_REASON_REQUIRED'));
  await p.getByRole('button',{name:t('السابق','Back'),exact:true}).click();await p.getByLabel(t('مبرر استثناء العدد (عند الحاجة)','Headcount exception justification (if needed)'),{exact:true}).fill('Independent reviewed extra seat / مبرر الاستثناء');result=await previewAfter(p,()=>p.getByRole('button',{name:t('التالي','Continue'),exact:true}).click());
  check(lang+': justified WARN shows independent exception before manager and HR',result.data.ready&&result.data.steps[0].authority==='Headcount Exception'&&result.data.steps[0].principal===data.users.sector.email);
  check(lang+': preview fits viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(out,`preview-${lang}.png`),fullPage:true});
  bench('configure',{scenario:'missing'});result=await previewAfter(p,()=>p.getByRole('button',{name:t('تحديث المعاينة','Refresh preview'),exact:true}).click());
  check(lang+': missing route fails closed and removes prior displayed approvers',!result.data.ready&&result.data.steps.length===0&&result.data.issues.some(i=>i.code==='ROUTE_CONFIGURATION')&&await p.locator('.preview-route li').count()===0);
  assert.deepEqual(bench('inspect'),before);check(lang+': all preview scenarios remain read-only',true);
  if(lang==='ar'){
   bench('configure',{scenario:'revoked'});result=await previewAfter(p,()=>p.getByRole('button',{name:t('تحديث المعاينة','Refresh preview'),exact:true}).click());
   check('Revoked current access denies preview and clears previous data',result.status===403&&await p.locator('.preview-route li').count()===0&&await p.locator('.route-preview [role=alert]').count()===1);
  }
  await p.context().close();
 }
 const guest=await browser.newContext();const response=await guest.request.post('http://localhost:8102'+endpoint,{data:{payload:{}}});check('Guest cannot call preview',response.status()===403);await guest.close();
 check('No browser exceptions, 5xx or external requests',!errors.length&&!failures.length&&!external.length);check('Source unchanged',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync('/tmp/kandil-route-preview-browser-'+run+'.txt',String(e.stack||e),{mode:0o600});checks.push({name:'Preview journey failure',status:'FAIL',error_type:e.name,error_message:String(e.message).split('\n')[0].slice(0,180)});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',e.name,String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,errors,server_failures:failures,external,source_hashes:source,limits:['Synthetic ordinary-role AR/EN preview, not full S3 or production acceptance.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
