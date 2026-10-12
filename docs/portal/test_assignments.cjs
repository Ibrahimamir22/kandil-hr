/* Ordinary personal sessions, scoped API negatives and AR/EN organization UI. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex');
const out=path.join(__dirname,'evidence',`assignments-${run}`);fs.mkdirSync(out,{recursive:true});
const manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
let data,browser,page,cleanup;const checks=[],errors=[],failures=[],external=[];
const files=['frontend/portal/src/main.tsx','frontend/portal/src/StructureChanges.tsx','frontend/portal/src/portal.css','kandil_hr/portal/structure.py','kandil_hr/portal/reference_permissions.py','kandil_hr/recruitment/setup.py','kandil_hr/translations/ar.csv','kandil_hr/portal/structure_fixture.py','docs/portal/test_assignments.cjs','kandil_hr/portal/assignment_fixture.py','kandil_hr/organization/assignments.py','kandil_hr/organization/api.py','kandil_hr/organization/models.py'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));const before=hashes();
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.assignment_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){const f=`/tmp/kandil-structure-${run}-${action}.txt`;fs.writeFileSync(f,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Private fixture '+action+' failed')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function ready(p){await p.locator('.structure-changes').waitFor();await p.waitForFunction(()=>document.querySelector('.structure-changes')?.getAttribute('aria-busy')==='false')}
async function get(p,method,args={}){return p.evaluate(async({method,args})=>{const r=await fetch('/api/method/kandil_hr.portal.structure.'+method+'?'+new URLSearchParams(args));return {status:r.status,body:await r.json()}},{method,args})}
async function login(role,lang='en',mobile=false){const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});const p=await c.newPage();page=p;p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.name));p.on('response',r=>{if(r.status()>=500)failures.push({status:r.status(),path:new URL(r.url()).pathname})});p.on('request',r=>{if(!r.url().startsWith('http://localhost:8102/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});await p.goto('http://localhost:8102/hr-portal');await p.locator('input[name=usr]').waitFor();if(lang==='en')await p.getByRole('button',{name:'English',exact:true}).click();await p.locator('input[name=usr]').fill(data.users[role].email);await p.locator('input[name=pwd]').fill(data.users[role].password);await p.locator('.login-submit').click();await p.locator('main.content').waitFor();await p.waitForFunction(()=>document.querySelector('main.content')?.getAttribute('aria-busy')==='false');if(mobile)await p.getByRole('button',{name:'فتح القائمة',exact:true}).click();await p.locator('.nav').getByRole('link',{name:lang==='en'?'Structure changes':'تغييرات الهيكل',exact:true}).click();await ready(p);return p}

async function post(p,method,args){return p.evaluate(async({method,args})=>{const b=await fetch('/api/method/kandil_hr.portal.api.bootstrap');const token=(await b.json()).message.csrf_token;const r=await fetch('/api/method/kandil_hr.portal.structure.'+method,{method:'POST',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':token},body:JSON.stringify(args)});return {status:r.status,body:await r.json()}},{method,args})}
async function button(p,name,method){const response=p.waitForResponse(r=>r.url().includes('portal.structure.'+method)&&r.request().method()==='POST');await p.getByRole('button',{name,exact:true}).click();const r=await response;if(r.status()!==200)throw Error('Structural UI '+method+' HTTP '+r.status());await ready(p);return (await r.json()).message}
async function openChange(p,name){
 await Promise.all([p.waitForResponse(r=>r.url().includes('portal.structure.listing')),p.getByRole('button',{name:/^(Refresh list|تحديث القائمة)$/}).click()]);await ready(p);
 const listing=(await get(p,'listing')).body.message;const row=listing.rows.find(r=>r.name===name);assert.ok(row,'Reviewed proposal is present in scoped list');
 await Promise.all([p.waitForResponse(r=>r.url().includes('portal.structure.detail')),p.getByRole('button',{name:row.reason,exact:true}).click()]);await ready(p);
}
async function back(p,lang='en'){await p.getByRole('button',{name:lang==='en'?'← Change list':'→ قائمة التغييرات',exact:true}).click();await ready(p)}
async function checked(p,lang='en'){await p.getByLabel(lang==='en'?'I reviewed the reason, date and every proposed change':'راجعت السبب والتاريخ وكل التغييرات المقترحة',{exact:true}).check()}
async function prepareSubmit(p,lang='en'){await button(p,lang==='en'?'Prepare preview':'إعداد المعاينة','preview');await checked(p,lang);return button(p,lang==='en'?'Submit for approval':'إرسال للاعتماد','submit')}
async function choose(p,label,value){page=p;const select=p.getByRole('combobox',{name:label,exact:true});await p.waitForFunction(({label,value})=>[...document.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')===label&&[...s.options].some(o=>o.value===value)),{label,value});await select.selectOption(value)}
let state,race;
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest));
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking']});
 const author=await login('manager');
 async function create(type,date,extra){
  await author.getByRole('button',{name:'New change',exact:true}).click();await choose(author,'Change type',type);
  await author.getByLabel('Effective date',{exact:true}).fill(date);await author.getByLabel('Reason for change',{exact:true}).fill('Synthetic '+type+' '+date+' '+run);
  await choose(author,'Position',extra.position||data.positions[0]);
  if(type==='AssignEmployee'){await author.getByLabel('Search: Employee',{exact:true}).fill(data.employee);await choose(author,'Employee',data.employee)}
  else await choose(author,'Current assignment',extra.assignment);
  if(type==='MoveEmployee')await choose(author,'Destination position',data.positions[1]);
  const saved=await button(author,'Save proposal','save');await prepareSubmit(author);return saved.name;
 }
 const assign=await create('AssignEmployee',data.assign_on,{});
 const pending=(await get(author,'detail',{name:assign})).body.message;
 check('Employee assignment submitted through the real portal',pending.operations[0].employee===data.employee&&pending.status==='Pending');
 check('Review explicitly shows the proposed allocation',await author.getByText('Primary',{exact:true}).count()===1);
 check('Individual route requires separate HR and CEO decisions',pending.steps.map(s=>s.authority).join(',')==='HR Approval,CEO Approval');
 const hr=await login('hr','ar',true);const ceo=await login('sector');
 async function approve(name){
  await openChange(hr,name);await checked(hr,'ar');await button(hr,'اعتماد التغيير','decide');
  await openChange(ceo,name);await checked(ceo);await button(ceo,'Approve change','decide');
 }
 await openChange(hr,assign);await checked(hr,'ar');await button(hr,'اعتماد التغيير','decide');
 check('HR alone does not create the assignment',bench('inspect').assignments.length===0);
 await openChange(ceo,assign);await checked(ceo);await button(ceo,'Approve change','decide');
 state=bench('inspect');check('CEO decision creates one future assignment',state.assignments.length===1&&state.assignments[0].valid_from===data.assign_on);
 check('Future assignment leaves current occupied ledgers unchanged',state.capacities.every(c=>c.occupied===0));
 await back(author);await back(hr,'ar');await back(ceo);
 const move=await create('MoveEmployee',data.move_on,{assignment:state.assignments[0].name});
 await approve(move);
 state=bench('inspect');check('Transfer retains source and creates a separate dated destination',state.assignments.length===2&&state.assignments[0].position===data.positions[0]&&state.assignments[1].position===data.positions[1]&&state.assignments[1].valid_from===data.move_on&&state.assignments[0].valid_until<data.move_on);
 const frozen=(await get(ceo,'detail',{name:move})).body.message;
 check('Review retains submitted assignment before-values',frozen.review_basis==='submitted_snapshot'&&frozen.review[0].assignment_before.valid_until===null&&frozen.review[0].assignment_before.employee===data.employee);
 await ceo.screenshot({path:path.join(out,'transfer-en.png'),fullPage:true});await hr.screenshot({path:path.join(out,'review-ar-mobile.png'),fullPage:true});
 check('Arabic assignment review fits mobile viewport',await hr.evaluate(()=>document.documentElement.dir==='rtl'&&document.documentElement.scrollWidth<=innerWidth+2));
 await back(author);await back(hr,'ar');await back(ceo);
 const end=await create('EndAssignment',data.end_on,{position:data.positions[1],assignment:state.assignments[1].name});await approve(end);
 state=bench('inspect');check('Ending preserves both historical episodes and applies the inclusive end date',state.assignments.length===2&&state.assignments[1].valid_until===data.end_on);
 const direct=await hr.evaluate(async({employee,position,department,branch,company,day})=>{
  const b=await fetch('/api/method/kandil_hr.portal.api.bootstrap');const csrf=(await b.json()).message.csrf_token;
  const r=await fetch('/api/resource/Kandil%20Position%20Assignment',{method:'POST',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':csrf},body:JSON.stringify({employee,position,department,branch,company,valid_from:day,allocation:'Acting'})});return r.status;
 },{employee:data.employee,position:data.positions[0],department:data.department,branch:data.branch,company:data.company,day:data.today});
 check('Native REST create cannot bypass HR and CEO approval',[403,417].includes(direct));
 const edit=await hr.evaluate(async name=>{const b=await fetch('/api/method/kandil_hr.portal.api.bootstrap');const csrf=(await b.json()).message.csrf_token;return (await fetch('/api/resource/Kandil%20Position%20Assignment/'+encodeURIComponent(name),{method:'PUT',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':csrf},body:JSON.stringify({valid_until:'2099-01-01'})})).status},state.assignments[1].name);
 check('Native REST edit cannot bypass reviewed dates',[403,417].includes(edit));
 const narrow=await login('recruiter');check('Department-only employee catalog is denied',(await get(narrow,'catalog',{company:data.company,kind:'employee'})).status===403);
 check('Department-only assignment review is denied',(await get(narrow,'detail',{name:move})).status===403);
 // Submit another non-overlapping episode and race a repeated final command.
 await back(author);await back(hr,'ar');await back(ceo);
 const repeat=await create('AssignEmployee','2090-01-01',{});await openChange(hr,repeat);await checked(hr,'ar');await button(hr,'اعتماد التغيير','decide');
 const d=(await get(ceo,'detail',{name:repeat})).body.message;const args={name:d.name,expected_version:d.modified,preview_hash:d.preview_hash,step_id:d.actions.step_id,decision:'Approved',command_id:crypto.randomUUID()};
 const raced=await Promise.all([post(ceo,'decide',args),post(ceo,'decide',args)]);
 race=raced.map(r=>({status:r.status,result:r.body.message,error_type:r.body.exc_type}));
 assert.deepEqual(raced[0].body.message,raced[1].body.message);
 check('Concurrent final approval retries return the same result',raced.every(r=>r.status===200));
 state=bench('inspect');check('Concurrent retries create one new assignment and one final audit',state.assignments.length===3&&state.audit.filter(a=>a.target_name===repeat&&a.actor===data.users.sector.email&&a.operation==='decide').length===1);
 check('No browser exceptions, server failures or external requests',errors.length===0&&failures.length===0&&external.length===0);
 check('Source unchanged during browser verification',JSON.stringify(before)===JSON.stringify(hashes()));
 }catch(e){checks.push({name:'Assignment journey failure',status:'FAIL',error_type:e.name,error_message:String(e.message).split('\n')[0].slice(0,180)});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',e.name,String(e.message).split('\n')[0]);process.exitCode=1}
 finally{await browser?.close();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch(e){cleanup={cleaned:false};process.exitCode=1}}const status=checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,state,race,cleanup,errors,server_failures:failures,external,source_hashes:before,limits:['Synthetic local employee assignment journey; not full S2 or production acceptance.','Future synthetic assignment episodes retained with disabled fixture accounts. Current-date zero occupancy is not permanent.','Current-date transfer/occupancy tested separately in rollback-scoped native tests.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
