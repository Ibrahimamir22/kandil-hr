/* Read-only review acceptance, followed by a real isolated parity regression.
 * No review account retirement or business reset. Secrets never enter evidence.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),workspace=path.resolve(app,'../../..');
const run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence','persistent-review-'+run);
const origin='http://kandil-review.localhost:8112',url=origin+'/hr-portal';
const data=JSON.parse(fs.readFileSync(path.join(workspace,'frappe-bench/sites/kandil-review.localhost/private/kandil-review-accounts.json')));
const compose=['compose','-f',path.join(app,'deployment/review.compose.yaml')];
const opts={cwd:app,env:{...process.env,KANDIL_DEV_WORKSPACE:workspace},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:240000};
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],failures=[],external=[];
const sources=['deployment/review.compose.yaml','deployment/review.py','deployment/prepare_review_site.py','kandil_hr/portal/review_setup.py','kandil_hr/portal/api.py','docs/portal/test_persistent_review.cjs'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));
const sourceBefore=hashes();let browser,page,before,after,regression;
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
function execute(method){return JSON.parse(execFileSync('docker',[...compose,'exec','-T','web','bench','--site','kandil-review.localhost','execute',method],opts).split('\n').filter(x=>x.startsWith('{')).at(-1))}
async function language(p,lang){const b=p.getByRole('button',{name:lang==='en'?'English':'العربية',exact:true});if(await b.count())await b.click()}
async function login(role,lang='en'){
 const context=await browser.newContext({viewport:lang==='ar'?{width:390,height:844}:{width:1440,height:1000}});
 const p=await context.newPage();page=p;
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)failures.push(r.status())});
 p.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});
 await p.goto(url);await p.locator('input[name=usr]').waitFor();await language(p,lang);
 await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);
 await p.locator('.login-submit').click();await p.locator('main.content[aria-busy="false"]').waitFor();return p;
}
async function nav(p,name){
 const menu=p.getByRole('button',{name:/Open navigation|فتح القائمة/});
 if(await menu.isVisible()&&!await p.locator('aside.sidebar').evaluate(el=>el.classList.contains('open')))await menu.click();
 await p.locator('.nav').getByRole('link',{name,exact:true}).click();
}
async function call(p,method,args={}){return p.evaluate(async({method,args})=>{
 const response=await fetch('/api/method/'+method+'?'+new URLSearchParams(args));const b=await response.json();return {status:response.status,body:b.message};
},{method,args})}
async function shot(p,name){await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));check(name+' fits viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,name+'.png'),fullPage:true})}
(async()=>{try{
 before=execute('kandil_hr.portal.review_setup.inspect');
 check('Dedicated site is synthetic, enabled for review, and excludes automated tests',before.companies_synthetic&&before.personal_enabled&&before.candidate_mode&&before.tests_disabled&&before.email_muted&&before.scheduler_paused);
 for(const method of ['prepare','cleanup']){
  const denied=spawnSync('docker',[...compose,'exec','-T','web','bench','--site','kandil-review.localhost','execute','kandil_hr.portal.candidate_fixture.'+method,'--kwargs',JSON.stringify({run_id:run})],opts);
  check('Parity '+method+' refuses the review site before mutation',denied.status!==0&&(String(denied.stdout)+String(denied.stderr)).includes('restricted to the opted-in parity Administrator'));
 }
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const p=await login('personal');check('Personal login sees synthetic banner',await p.locator('.local-test-note').isVisible());
 const boot=await call(p,'kandil_hr.portal.api.bootstrap');
 check('Personal account is scoped recruiter/requester, not migration approver',boot.body.user.id===data.users.personal.email&&boot.body.can_read_candidates&&boot.body.can_create&&!boot.body.can_review_candidate_migration);
 const overview=await call(p,'kandil_hr.portal.api.overview');check('Draft, pending and approved requests are available',overview.body.requests.length===3&&overview.body.vacancies.length===1);
 await shot(p,'review-dashboard-en');await nav(p,'Candidates');await p.locator('.candidates[aria-busy="false"] .candidate-pagination').waitFor();
 check('Candidate intake is enabled with four persistent examples',await p.getByRole('button',{name:'New application',exact:true}).isEnabled()&&await p.locator('.candidate-list .candidate-row').count()===4);
 await shot(p,'review-candidates-en');
 await p.locator('.candidate-row').filter({hasText:'Omar · Synthetic candidate'}).click();await p.getByRole('heading',{name:'Person profile',exact:true}).waitFor();
 check('Native person profile is available through the custom UI',await p.locator('.candidate-details').count()>=2);
 await nav(p,'Unfinished actions');await p.locator('.candidate-recovery[aria-busy="false"] .candidate-row').waitFor();await p.locator('.candidate-recovery .candidate-row').click();
 await p.getByRole('button',{name:'Resume saved action',exact:true}).waitFor();check('Prepared example needs explicit review before execution',await p.getByRole('button',{name:'Resume saved action',exact:true}).isDisabled());await shot(p,'review-recovery-en');
 const ar=await login('personal','ar');await nav(ar,'المرشحون');await ar.locator('.candidates[aria-busy="false"] .candidate-pagination').waitFor();
 check('Arabic uses RTL with enabled intake',await ar.locator('html').getAttribute('dir')==='rtl'&&await ar.getByRole('button',{name:'إضافة طلب ترشح',exact:true}).isEnabled());await shot(ar,'review-candidates-ar');
 const hr=await login('hr');check('Configured HR can review the legacy example',(await call(hr,'kandil_hr.portal.api.bootstrap')).body.can_review_candidate_migration);
 const outsider=await login('outsider');check('Out-of-scope user cannot read candidate directory or guessed application',await outsider.locator('.nav').getByRole('link',{name:'Candidates',exact:true}).count()===0&&(await call(outsider,'kandil_hr.portal.candidates.listing')).status===403&&(await call(outsider,'kandil_hr.portal.candidates.detail',{name:data.applications[0].application})).status===403);
 check('Read-only review and negative guards preserve business rows',JSON.stringify(before)===JSON.stringify(execute('kandil_hr.portal.review_setup.inspect')));
 console.log('Running independent parity regression while the review session stays open');
 const parity=spawnSync(process.execPath,[path.join(__dirname,'test_candidates.cjs')],{...opts,timeout:600000});
 const summary=String(parity.stdout).split('\n').filter(x=>x.startsWith('{')).at(-1);regression=summary?JSON.parse(summary):{status:'FAIL'};
 if(parity.status!==0)fs.writeFileSync('/tmp/kandil-review-parity-error-'+run+'.txt',String(parity.stdout)+'\n'+String(parity.stderr),{mode:0o600});
 check('Independent candidate parity regression passes',parity.status===0&&regression.status==='PASS');
 after=execute('kandil_hr.portal.review_setup.inspect');check('Parity regression preserves review configuration and every inspected business row',JSON.stringify(before)===JSON.stringify(after));
 await p.reload();await p.locator('main.content[aria-busy="false"]').waitFor();check('Personal review login survives parity restart and account retirement',(await call(p,'kandil_hr.portal.api.bootstrap')).body.user.id===data.users.personal.email);
 check('No browser runtime errors, server 5xx or external requests',!errors.length&&!failures.length&&!external.length);
 check('Recorded source unchanged during acceptance',JSON.stringify(sourceBefore)===JSON.stringify(hashes()));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync('/tmp/kandil-persistent-review-'+run+'.txt',String(e.stack||e),{mode:0o600});checks.push({name:String(e.message).split('\n')[0],status:'FAIL'});console.log('FAIL',String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();const result={status:process.exitCode?'FAIL':'PASS',run_id:run,checks,before,after,regression,source_hashes:sourceBefore,errors,server_failures:failures,external,limits:['Persistent review examples intentionally retained; this harness reads them without business mutations.','Shared source files are not production security isolation. Review database/Redis are dedicated; background workers and scheduler remain stopped.','Full HR UAT, security, 1000+ capacity and production gates remain open.']};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,run_id:run,checks:checks.length,evidence:out}))}
})();
