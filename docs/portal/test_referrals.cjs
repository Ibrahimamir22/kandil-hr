/* Employee referrals, immutable intake snapshots and competing referrers; synthetic only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence','referrals-'+run);
fs.mkdirSync(out,{recursive:true});const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
const files=['kandil_hr/sourcing/referrals.py','kandil_hr/sourcing/test_referrals.py','kandil_hr/portal/referral_fixture.py','kandil_hr/candidates/intake.py','kandil_hr/candidates/recovery.py','kandil_hr/recruitment/command_audit.py','kandil_hr/foundation/command_audit.py','kandil_hr/sourcing/sources.py','frontend/portal/src/Referrals.tsx','frontend/portal/src/Candidates.tsx','frontend/portal/src/CandidateRecovery.tsx','kandil_hr/public/portal/portal.js','docs/portal/test_referrals.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));const beforeSource=hashes();
let data,browser,page,cleanup;const checks=[],errors=[],failures=[],external=[];
function bench(action,args={}){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.'+(['revoke_hr','restore_hr'].includes(action)?'catalog_fixture.':['snapshot','revoke'].includes(action)?'candidate_fixture.':'referral_fixture.')+action,'--kwargs',JSON.stringify({run_id:run,...args})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(x=>x.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-candidates-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
function restart(){execFileSync('docker',['compose','restart','parity-web'],{cwd:dev,stdio:'pipe'});execFileSync('curl',['--retry','8','--retry-all-errors','--retry-delay','1','--retry-connrefused','--max-time','5','-fs','http://localhost:8102/hr-portal'],{stdio:'pipe'})}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function language(p,lang){const button=p.getByRole('button',{name:lang==='en'?'English':'العربية',exact:true});if(await button.count())await button.click()}
async function login(role,lang='en',noStorage=false){const c=await browser.newContext({viewport:lang==='ar'?{width:390,height:844}:{width:1440,height:1000}});if(noStorage)await c.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('Storage unavailable')},configurable:true})});const p=await c.newPage();page=p;p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)failures.push(r.status())});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();await language(p,lang);await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await p.locator('main.content[aria-busy="false"]').waitFor();return p}
async function nav(p,lang='en'){if(!await p.locator('.nav').isVisible())await p.getByRole('button',{name:/Open navigation|فتح القائمة/}).click();await p.locator('.nav').getByRole('link',{name:lang==='ar'?'المرشحون':'Candidates',exact:true}).click();await p.locator('.candidates[aria-busy="false"] > section:has(> .candidate-list) > .candidate-pagination').waitFor();await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'))}
async function call(p,method,args={},verb='GET'){return p.evaluate(async({method,args,verb})=>{const b=await (await fetch('/api/method/kandil_hr.portal.api.bootstrap')).json();const response=await fetch('/api/method/'+method+(verb==='GET'?'?'+new URLSearchParams(args):''),{method:verb,headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':b.message.csrf_token},...(verb==='POST'?{body:JSON.stringify(args)}:{})});const body=await response.json();return {status:response.status,body:body.message,type:body.exc_type}}, {method,args,verb})}
async function shot(p,name){await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));check(name+': viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.evaluate(()=>window.scrollTo(0,0));await p.locator('.candidate-activities').screenshot({path:path.join(out,name+'.png'),style:'.topbar{visibility:hidden!important}'})}
const S='kandil_hr.sourcing.sources.';
async function route(p,label,selector){await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));const menu=p.getByRole('button',{name:/Open navigation|فتح القائمة/});if(await menu.isVisible()&&!await p.locator('.sidebar.open').count())await menu.click();await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));await p.locator('.nav').getByRole('link',{name:label,exact:true}).click();await p.locator(selector+'[aria-busy="false"]').waitFor()}
async function sourceNav(p,lang='en'){await language(p,lang);await route(p,lang==='ar'?'مصادر التوظيف':'Recruitment sources','.recruitment-sources')}
async function capture(p,selector,name){await p.waitForFunction(()=>!document.querySelector('main [aria-busy="true"]'));await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));const el=p.locator(selector);await el.scrollIntoViewIfNeeded();check(name+' fits viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await el.screenshot({path:path.join(out,name+'.png'),animations:'disabled',style:'.topbar{visibility:hidden!important}'})}
async function current(p){const r=await call(p,S+'listing',{company:data.company});assert.equal(r.status,200);return r.body}
async function change(p,code,overrides){const d=await current(p),r=d.items.find(x=>x.code===code);const {locked,...values}=r;delete values.code;return {company:data.company,code,version:d.version,values:{...values,...overrides},reason:'Synthetic source revision',command_id:crypto.randomUUID()}}

const R='kandil_hr.sourcing.referrals.';
async function create(p,lang='en',influencing=false){
 await route(p,lang==='ar'?'المرشحون':'Candidates','.candidates');
 await p.getByRole('button',{name:lang==='ar'?'إضافة طلب ترشح':'New application',exact:true}).click();
 await p.locator('.candidate-intake .candidate-row').filter({hasText:data.candidate.opening}).click();
 const form=p.locator('.candidate-intake');
 await form.getByLabel(lang==='ar'?'مصدر الترشح':'Source channel',{exact:true}).selectOption(influencing?'EMAIL':'REFERRAL');
 if(influencing)await form.getByRole('checkbox',{name:'إضافة ترشيح مؤثّر من موظف',exact:true}).check();
 await p.locator('.referral-picker[aria-busy="false"] h3').waitFor();
 check(lang+' referral prevents confirmation without an employee',await form.getByRole('button',{name:lang==='ar'?'تأكيد إنشاء الطلب':'Confirm application',exact:true}).count()===0);
 await form.getByLabel(lang==='ar'?'بحث عن موظف بالاسم أو الكود':'Find employee by name or code',{exact:true}).fill('Synthetic '+(influencing?'Second':'First'));
 await form.getByRole('button',{name:lang==='ar'?'بحث الموظفين':'Search employees',exact:true}).click();
 await p.locator('.referral-picker .candidate-row').filter({hasText:data.referral_employees[influencing?1:0].name}).click();
 await form.getByLabel(lang==='ar'?'صلة الموظف بالمرشح':'Relationship to candidate',{exact:true}).fill(lang==='ar'?'زميل سابق':'Former colleague');
 await capture(p,'.referral-picker','referrer-picker-'+lang);
 await form.getByLabel(lang==='ar'?'الاسم الكامل':'Full name',{exact:true}).fill('Synthetic referral '+lang+' '+run);
 await form.getByLabel(lang==='ar'?'البريد الإلكتروني':'Email',{exact:true}).fill('referral-'+lang+'-'+run+'@example.invalid');
 await form.getByLabel(lang==='ar'?'الهاتف':'Phone',{exact:true}).fill('01077776666');
 await form.getByLabel(lang==='ar'?'تفاصيل المصدر':'Source detail',{exact:true}).fill('Synthetic reviewed referral');
 await form.getByRole('button',{name:lang==='ar'?'مراجعة التطابقات المحتملة':'Review possible matches',exact:true}).click();
 await form.getByRole('radio',{name:lang==='ar'?'إنشاء ملف شخص جديد':'Create a new person',exact:true}).check();
 await form.getByRole('checkbox',{name:lang==='ar'?'راجعت الشاغر والمصدر والتطابقات واختيار الهوية.':'I reviewed the vacancy, source, possible matches and identity choice.',exact:true}).check();
 let dropped=false;
 if(lang==='en')await p.route('**/api/method/kandil_hr.candidates.recovery.execute',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()});
 await form.getByRole('button',{name:lang==='ar'?'تأكيد إنشاء الطلب':'Confirm application',exact:true}).click();
 if(lang==='en'){
  await form.getByRole('button',{name:'Retry same request',exact:true}).waitFor();
  check('Uncertain referral intake freezes employee choice',await form.getByRole('button',{name:'Search employees',exact:true}).isDisabled());
  await form.getByRole('button',{name:'Retry same request',exact:true}).click();
  await p.unroute('**/api/method/kandil_hr.candidates.recovery.execute');
 }
 await p.locator('.candidate-referral[aria-busy="false"] h2').waitFor();
 const matches=(await call(p,'kandil_hr.portal.candidates.listing',{search:'referral-'+lang+'-'+run+'@example.invalid'})).body;
 check(lang+' referral creates exactly one application',matches.rows.length===1);
 await capture(p,'.candidate-referral','referral-snapshot-'+lang);
 return matches.rows[0].name;
}
(async()=>{try{
 bench('prepare');data=JSON.parse(fs.readFileSync(manifest,'utf8'));const baseline=bench('snapshot');restart();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
 const recruiter=await login('recruiter'),peer=await login('recruiter'),outsider=await login('outsider');
 const picker=await call(recruiter,R+'employees',{company:data.company,query:'Referrer'});
 check('Employee lookup exposes only two minimal active records',picker.status===200&&picker.body.rows.length===2&&picker.body.rows.every(r=>Object.keys(r).sort().join(',')==='job,label,name,version'));
 check('Outsider cannot enumerate referral employees',(await call(outsider,R+'employees',{company:data.company,query:'Referrer'})).status===403);
 const name=await create(recruiter);
 const snapshot=(await call(recruiter,R+'application',{name})).body;
 check('Primary referral retains selected employee and pending decision',snapshot.submission.employee===data.referral_employees[0].name&&snapshot.submission.kind==='PRIMARY'&&snapshot.submission.bonus_status==='PENDING');
 check('Native referral evidence stays private',(await call(recruiter,'frappe.client.get_list',{doctype:'Kandil Referral Submission',fields:JSON.stringify(['name'])})).status===403);
 const target=(await call(recruiter,'kandil_hr.portal.candidates.openings')).body.rows.find(r=>r.name===data.agency_target.opening);
 const person=(await call(recruiter,'kandil_hr.portal.candidates.person',{name:data.candidate.existing.person})).body;
 const make=employee=>({name:target.request,opening_name:target.name,expected_version:target.expected_version,details:{applicant_name:person.profile.full_name,email_id:person.profile.email_id,phone_number:person.profile.phone_number,source_channel:'REFERRAL',source_detail:'Concurrent referrer review'},profile:{},person:data.candidate.existing.person,person_version:person.modified,identity_reason:'Explicitly reviewed same candidate',source_version:picker.body.source_version,referral:{employee:employee.name,employee_version:employee.version,employee_name:employee.label,relationship:'Colleague',policy_version:picker.body.policy.version},command_id:crypto.randomUUID()});
 const source=(await current(recruiter)).version;
 const a=make(data.referral_employees[0]),b=make(data.referral_employees[1]);a.source_version=source;b.source_version=source;
 const race=await Promise.all([call(recruiter,'kandil_hr.candidates.intake.create_application',a,'POST'),call(peer,'kandil_hr.candidates.intake.create_application',b,'POST')]);
 check('Competing referrers commit one application and reject the later claim',race.filter(x=>x.status===200).length===1&&race.filter(x=>x.status===403&&x.type==='PermissionError').length===1);
 const winner=race.find(x=>x.status===200);const win=await call(recruiter,R+'application',{name:winner.body.application});
 check('Known person referral needs review without exposing other application',win.body.submission.bonus_status==='REVIEW'&&win.body.submission.eligibility_reason==='recent_application'&&!JSON.stringify(win.body).includes(data.candidate.existing.application));
 check('Rejected referrer leaves no duplicate application',(await call(recruiter,'kandil_hr.portal.candidates.listing',{person:data.candidate.existing.person})).body.total===2);
 const ar=await login('recruiter','ar');const influencing=await create(ar,'ar',true);
 const inf=(await call(ar,R+'application',{name:influencing})).body.submission;
 check('Arabic influencing referral preserves ordinary source and needs review',inf.employee===data.referral_employees[1].name&&inf.kind==='INFLUENCING'&&inf.bonus_status==='REVIEW'&&(await call(ar,'kandil_hr.sourcing.attribution.context',{name:influencing})).body.current.code==='EMAIL');
 const final=bench('snapshot');check('Existing profiles applications and headcount preserved',isDeepStrictEqual(baseline.capacity,final.capacity)&&baseline.applications.every(a=>final.applications.some(b=>isDeepStrictEqual(a,b)))&&final.people===baseline.people+2);
 bench('revoke');check('Revoked recruiter cannot enumerate employees or read referral evidence',(await call(recruiter,R+'employees',{company:data.company,query:'Referrer'})).status===403&&(await call(recruiter,R+'application',{name})).status===403);
 check('No browser errors server failures or external requests',!errors.length&&!failures.length&&!external.length);
 check('Tested source unchanged',isDeepStrictEqual(beforeSource,hashes()));
}catch(e){if(page)await page.screenshot({path:`/tmp/kandil-referrals-failure-${run}.png`}).catch(()=>{});fs.writeFileSync(`/tmp/kandil-referrals-browser-${run}.txt`,String(e.stack),{mode:0o600});console.log('FAIL',String(e.message).split('\n')[0]);process.exitCode=1}
finally{await browser?.close();if(fs.existsSync(manifest)){try{bench('restore_hr');cleanup=bench('cleanup');restart()}catch(e){cleanup={error:String(e.message)};process.exitCode=1}}const result={status:process.exitCode?'FAIL':'PASS',run_id:run,checks,cleanup,errors,server_failures:failures,external,source_hashes:beforeSource,limits:['Synthetic initial referral intake only; no bonus approval or payment.','Referral replacement, full internal identity, HR acceptance and security/capacity/production gates remain open.']};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,run_id:run,checks:checks.length,evidence:out}))}
})();
