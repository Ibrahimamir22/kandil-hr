/* Employee referrals, immutable intake snapshots and competing referrers; synthetic only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex'),out=path.join(__dirname,'evidence','referral-changes-'+run);
fs.mkdirSync(out,{recursive:true});const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
const files=['kandil_hr/sourcing/referrals.py','kandil_hr/sourcing/test_referrals.py','kandil_hr/portal/referral_fixture.py','kandil_hr/candidates/intake.py','kandil_hr/candidates/recovery.py','kandil_hr/recruitment/command_audit.py','kandil_hr/foundation/command_audit.py','kandil_hr/sourcing/sources.py','frontend/portal/src/Referrals.tsx','frontend/portal/src/Candidates.tsx','frontend/portal/src/CandidateRecovery.tsx','kandil_hr/public/portal/portal.js','docs/portal/test_referral_changes.cjs','kandil_hr/sourcing/referral_changes.py','frontend/portal/src/ReferralManagement.tsx','frontend/portal/src/candidateCommands.ts','frontend/portal/src/main.tsx','frontend/portal/src/portal.css'];
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
 if(influencing)await form.getByRole('checkbox',{name:lang==='ar'?'إضافة ترشيح مؤثّر من موظف':'Add an influencing employee referral',exact:true}).check();
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
const C='kandil_hr.sourcing.referral_changes.';
async function ctx(p,name){const r=await call(p,C+'context',{name});assert.equal(r.status,200);return r.body}
async function args(p,name,extra={}){const d=await ctx(p,name);return {name:d.request,opening_name:d.opening,application:name,application_version:d.application_version,expected_version:d.expected_version,referral_version:d.current.version,action:'BONUS',bonus_status:'ELIGIBLE',reason:'Synthetic reviewed bonus decision',command_id:crypto.randomUUID(),...extra}}
async function open(p,name,lang='en'){
 await route(p,lang==='ar'?'المرشحون':'Candidates','.candidates');
 await p.locator('.candidates .candidate-row').filter({hasText:name}).first().click();
 await p.locator('.referral-management[aria-busy="false"] h2').waitFor();
}
async function decideUI(p,action,lang='en',drop=false){
 const ar=lang==='ar',panel=p.locator('.referral-management');
 await panel.getByLabel(ar?'إجراء الترشيح':'Referral action',{exact:true}).selectOption(action);
 if(action==='SET'){
  await panel.locator('.referral-picker[aria-busy="false"]').waitFor();
  await panel.getByLabel(ar?'بحث عن موظف بالاسم أو الكود':'Find employee by name or code',{exact:true}).fill('Second Referrer');
  await panel.getByRole('button',{name:ar?'بحث الموظفين':'Search employees',exact:true}).click();
  await panel.locator('.referral-picker .candidate-row').filter({hasText:data.referral_employees[1].name}).click();
  await panel.getByLabel(ar?'صلة الموظف بالمرشح':'Relationship to candidate',{exact:true}).fill(ar?'زميل سابق موثق':'Reviewed former colleague');
 }
 if(action==='BONUS')await panel.getByLabel(ar?'قرار المكافأة الجديد':'New bonus decision',{exact:true}).selectOption('PAID');
 await panel.getByLabel(ar?'سبب قرار الترشيح أو بيانات الصرف المُبلّغ عنه':'Referral decision reason or reported payment details',{exact:true}).fill(ar?'مراجعة موثقة للتغيير':'Synthetic reviewed replacement or bonus report');
 await panel.getByRole('checkbox',{name:ar?'راجعت الترشيح الحالي والتغيير والسبب وأريد تسجيل القرار.':'I reviewed the current referral, proposed change and reason and want to record the decision.',exact:true}).check();
 await capture(p,'.referral-management .referral-change-form','referral-decision-'+action+'-'+lang);
 let dropped=false;
 if(drop)await p.route('**/api/method/kandil_hr.candidates.recovery.execute',async r=>{if(!dropped){dropped=true;await r.fetch();await r.abort('failed')}else await r.continue()});
 await panel.getByRole('button',{name:ar?'تسجيل قرار الترشيح':'Record referral decision',exact:true}).click();
 if(drop){await panel.getByRole('button',{name:'Retry the same referral decision',exact:true}).waitFor();check('Uncertain change freezes reviewed choice',await panel.getByLabel('Referral action',{exact:true}).isDisabled());await panel.getByRole('button',{name:'Retry the same referral decision',exact:true}).click();await p.unroute('**/api/method/kandil_hr.candidates.recovery.execute')}
 await panel.locator('.referral-history article').first().waitFor();
 await p.waitForFunction(()=>!document.querySelector('.referral-management[aria-busy="true"]'));
}
(async()=>{try{
 bench('prepare');data=JSON.parse(fs.readFileSync(manifest,'utf8'));const baseline=bench('snapshot');restart();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
 const recruiter=await login('recruiter'),peer=await login('recruiter'),hr=await login('hr'),outsider=await login('outsider');
 const name=await create(recruiter,'en',true);
 await recruiter.locator('.referral-management[aria-busy="false"] h2').waitFor();
 check('Recruiter UI offers no bonus decision',await recruiter.locator('.referral-management option[value=BONUS]').count()===0);
 const original=(await call(recruiter,R+'application',{name})).body.submission;
 // Intake influencing helper selected employee 2; choose a changed relationship.
 await decideUI(recruiter,'SET','en',true);
 let d=await ctx(recruiter,name);
 check('Lost response retry records exactly one reviewed change',d.history.rows.length===1&&d.current.value.relationship==='Reviewed former colleague');
 check('Original intake snapshot remains unchanged',isDeepStrictEqual(original,(await call(recruiter,R+'application',{name})).body.submission));
 const denied=await call(recruiter,C+'change',await args(recruiter,name),'POST');
 check('Recruiter cannot bypass HR bonus UI',denied.status===403);
 check('Outsider cannot read referral history',(await call(outsider,C+'context',{name})).status===403);
 const outside=await call(outsider,C+'listing');check('Outsider register reveals no referrals',outside.status===403||(outside.status===200&&outside.body.total===0));
 await open(hr,name);await decideUI(hr,'BONUS');
 d=await ctx(hr,name);check('HR reported payment is explicit and unverified',d.current.value.bonus_status==='PAID'&&d.current.value.payment_verified===false);
 await route(hr,'Employee referrals','.referral-register');
 await hr.getByLabel('Bonus status',{exact:true}).selectOption('PAID');await hr.locator('.referral-register[aria-busy="false"] .candidate-row').waitFor();
 check('Register filters current HR decisions',await hr.locator('.referral-register .candidate-row').count()===1&&await hr.locator('.referral-register').innerText().then(s=>s.includes('Payment reported — not verified')));
 await capture(hr,'.referral-register','referral-register-en');
 await hr.locator('.referral-register .candidate-row').click();await hr.locator('.referral-management[aria-busy="false"]').waitFor();
 check('Register opens the permitted application',await hr.locator('.candidates').innerText().then(s=>s.includes(name)));
 // Concurrent ordinary HTTP connections, same reviewed version.
 const a=await args(hr,name,{bonus_status:'ELIGIBLE'}),b=await args(hr,name,{bonus_status:'NOT_ELIGIBLE',command_id:crypto.randomUUID()});
 const hrPeer=await login('hr');
 const race=await Promise.all([call(hr,C+'change',a,'POST'),call(hrPeer,C+'change',b,'POST')]);
 check('Competing bonus decisions commit one and reject stale review',race.filter(r=>r.status===200).length===1&&race.filter(r=>r.type==='TimestampMismatchError').length===1);
 check('Race adds one history entry',(await ctx(hr,name)).history.rows.length===3);
 // Approved retry cannot bypass revoked company HR authority.
 const winner=race[0].status===200?a:b;bench('revoke_hr');
 check('Revoked HR cannot replay completed decision',(await call(hr,C+'change',winner,'POST')).status===403);bench('restore_hr');
 const ar=await login('recruiter','ar');await open(ar,name,'ar');await decideUI(ar,'VOID','ar');
 check('Influencing void clears current referral without deleting history',(await ctx(ar,name)).current.value===null&&(await ctx(ar,name)).history.rows.length===4);
 await capture(ar,'.referral-management','referral-history-ar');
 await route(ar,'ترشيحات الموظفين','.referral-register');
 check('Voided referral leaves active register',(await call(ar,C+'listing')).body.total===0);
 await capture(ar,'.referral-register','referral-register-ar');
 // Add it again, then race a closure against replacement. Both outcomes lock further changes.
 const pick=(await call(recruiter,R+'employees',{company:data.company,query:'First Referrer'})).body;
 const selection={employee:data.referral_employees[0].name,employee_version:data.referral_employees[0].version,employee_name:data.referral_employees[0].label,relationship:'Restored claim',policy_version:pick.policy.version};
 let set=await args(recruiter,name,{action:'SET',referral:selection});delete set.bonus_status;
 assert.equal((await call(recruiter,C+'change',set,'POST')).status,200);
 const cc=(await call(recruiter,'kandil_hr.candidates.closure.context',{name})).body;
 const close={name:cc.request,opening_name:cc.opening,application:name,application_version:cc.application_version,expected_version:cc.expected_version,decision:'Rejected',reason_code:'OTHER',catalog_version:cc.catalogs.Rejected.version,internal_note:'Synthetic concurrent closure',candidate_message:'',command_id:crypto.randomUUID()};
 set=await args(peer,name,{action:'SET',referral:{...selection,relationship:'Concurrent correction'}});delete set.bonus_status;
 const closing=await Promise.all([call(recruiter,'kandil_hr.candidates.closure.close',close,'POST'),call(peer,C+'change',set,'POST')]);
 check('Closure and correction race keeps a committed closure',closing[0].status===200&&[200,403,417].includes(closing[1].status));
 check('Recorded outcome locks all later attribution',(await ctx(recruiter,name)).locked===true);
 set=await args(peer,name,{action:'VOID'});delete set.bonus_status;
 check('Locked attribution rejects void',(await call(peer,C+'change',set,'POST')).status===403);
 const final=bench('snapshot');check('Existing records and capacity preserved',isDeepStrictEqual(baseline.capacity,final.capacity)&&baseline.applications.every(a=>final.applications.some(b=>isDeepStrictEqual(a,b))));
 check('No page errors server failures or external requests',!errors.length&&!failures.length&&!external.length);
 check('Tested source unchanged',isDeepStrictEqual(beforeSource,hashes()));
}catch(e){if(page)await page.screenshot({path:`/tmp/kandil-referral-changes-failure-${run}.png`}).catch(()=>{});fs.writeFileSync(`/tmp/kandil-referral-changes-browser-${run}.txt`,String(e.stack),{mode:0o600});console.log('FAIL',String(e.message).split('\n')[0]);process.exitCode=1}
finally{await browser?.close();if(fs.existsSync(manifest)){try{bench('restore_hr');cleanup=bench('cleanup');restart()}catch(e){cleanup={error:String(e.message)};process.exitCode=1}}const result={status:process.exitCode?'FAIL':'PASS',run_id:run,checks,cleanup,errors,server_failures:failures,external,source_hashes:beforeSource,limits:['Synthetic referral correction, HR bonus report and register evidence; no payment execution or verification.','Dedicated primary-source removal, HR acceptance and independent security/capacity/production gates remain open.']};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,run_id:run,checks:checks.length,evidence:out}))}
})();
