/* Personal-session native revision attachment boundaries; loopback synthetic only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {request}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex');
const out=path.join(__dirname,'evidence',`note-access-${run}`),manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
fs.mkdirSync(out,{recursive:true});
const files=['kandil_hr/recruitment/history_references.py','kandil_hr/recruitment/note_projection.py','kandil_hr/recruitment/privacy.py','kandil_hr/recruitment/event_access.py','kandil_hr/recruitment/history_access.py','kandil_hr/recruitment/history_schema.py','kandil_hr/pilot/permissions.py','kandil_hr/pilot/models.py','kandil_hr/foundation/security.py','kandil_hr/recruitment/review_views.py','kandil_hr/portal/note_access_fixture.py','kandil_hr/kandil_hr/doctype/kandil_hiring_request/kandil_hiring_request.json','kandil_hr/kandil_hr/doctype/kandil_recruitment_event/kandil_recruitment_event.json','docs/portal/test_note_access.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')])),source=hashes();
const checks=[],sessions=[],serverFailures=[];let data,cleanup,unchanged;
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.note_access_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-note-access-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Fixture '+action+' failed; diagnostics private')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function login(role){const session=await request.newContext({baseURL:'http://localhost:8102'});sessions.push(session);const res=await session.post('/api/method/login',{form:{usr:data.users[role].email,pwd:data.users[role].password}});assert.equal(res.status(),200);return session}
async function get(session,url,params={}){const res=await session.get(url,{params});if(res.status()>=500)serverFailures.push({path:url,status:res.status()});return res}
async function method(session,name,params){const res=await get(session,'/api/method/'+name,params);return {status:res.status(),body:await res.json()}}
async function listing(session){return method(session,'frappe.client.get_list',{doctype:'File',fields:JSON.stringify(['name','file_name','file_url']),filters:JSON.stringify({name:data.note_case.file})})}
async function detail(session,doctype,name){return method(session,'frappe.client.get',{doctype,name})}
async function post(session,name,values){const boot=await method(session,'kandil_hr.portal.api.bootstrap',{});const res=await session.post('/api/method/'+name,{headers:{'X-Frappe-CSRF-Token':boot.body.message.csrf_token},data:values});if(res.status()>=500)serverFailures.push({path:name,status:res.status()});return {status:res.status(),body:await res.json()}}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest,'utf8'));
 const owner=await login('requester'),hr=await login('hr'),outsider=await login('outsider'),c=data.note_case;
 const reason='تصحيح المتطلبات / Correct requirements',command={name:c.request,command_id:crypto.randomUUID().replaceAll('-',''),expected_version:c.version,reason,fields:{qualifications:'Updated synthetic requirements'}};
 const first=await post(hr,'kandil_hr.recruitment.corrections.correct_approved',command);
 check('Ordinary HR correction returns readable reason without nested audit payload',first.status===200&&first.body.message.decision_note===reason&&first.body.message.decision_reason===reason&&!first.body.message.route_snapshot);
 const replay=await post(hr,'kandil_hr.recruitment.corrections.correct_approved',command);
 assert.deepEqual(replay.body.message,first.body.message);check('Same command replays the same safe response',replay.status===200);
 const stored=bench('capture');
 for(const [role,session] of [['requester',owner],['hr',hr]]){
   for(const prefix of ['/api/resource/','/api/v2/document/']){
     let res=await get(session,prefix+encodeURIComponent('Kandil Hiring Request')+'/'+c.request);let body=await res.json();let row=body.data;
     check(role+': '+prefix+' current request hides raw note and shows explanation',res.status()===200&&!row.decision_note&&row.decision_reason===reason);
     res=await get(session,prefix+encodeURIComponent('Kandil Recruitment Event')+'/'+stored.correction_event);body=await res.json();row=body.data;
     check(role+': '+prefix+' event hides raw note and shows explanation',res.status()===200&&!row.note&&row.public_note===reason&&!!row.snapshot);
   }
   const rows=await method(session,'frappe.client.get_list',{doctype:'Kandil Recruitment Event',fields:JSON.stringify(['*']),filters:JSON.stringify({name:stored.correction_event})});
   check(role+': native wildcard list has public explanation but no encoded note',rows.status===200&&rows.body.message.length===1&&!rows.body.message[0].note&&rows.body.message[0].public_note===reason);
   for(const [doctype,name,field] of [['Kandil Hiring Request',c.request,'decision_note'],['Kandil Recruitment Event',stored.correction_event,'note']]){
     const raw=await method(session,'frappe.client.get_value',{doctype,filters:JSON.stringify({name}),fieldname:field});
     check(role+': explicit get_value cannot retrieve '+field,raw.status<500&&!raw.body.message?.[field]);
   }
   const timeline=await method(session,'kandil_hr.recruitment.review_views.timeline',{name:c.request});
   check(role+': timeline displays correction reason',timeline.status===200&&timeline.body.message.events.some(x=>x.name===stored.correction_event&&x.note===reason));
   const revision=await detail(session,'Kandil Request Revision',stored.revision);
   check(role+': authorized raw revision keeps original bytes',revision.status===200&&crypto.createHash('sha256').update(revision.body.message.snapshot_json).digest('hex')===stored.snapshot_sha256);
   const print=await get(session,'/printview',{doctype:'Kandil Recruitment Event',name:stored.correction_event,format:'Standard',no_letterhead:'1'});const html=await print.text();
   check(role+': standard print shows reason without encoded correction records',print.status()===200&&html.includes('Correct requirements')&&!html.includes('route_snapshot')&&!html.includes('replacement_employee'));
 }
 check('Outsider cannot read current request',(await detail(outsider,'Kandil Hiring Request',c.request)).status===403);
 check('Outsider cannot read correction event',(await detail(outsider,'Kandil Recruitment Event',stored.correction_event)).status===403);
 check('Owner initially sees Event attachment metadata',(await listing(owner)).body.message.length===1);
 check('Owner initially downloads Event attachment',(await get(owner,c.file_url)).status()===200);
 bench('restrict');
 check('Event-specific restriction keeps current request accessible',(await detail(owner,'Kandil Hiring Request',c.request)).status===200);
 check('Event-specific restriction keeps allowed correction accessible',(await detail(owner,'Kandil Recruitment Event',stored.correction_event)).status===200);
 check('Event-specific restriction hides original event',(await detail(owner,'Kandil Recruitment Event',c.event)).status===403);
 check('Event restriction hides attachment metadata',(await listing(owner)).body.message.length===0);
 check('Event restriction denies attachment detail',(await detail(owner,'File',c.file)).status===403);
 check('Event restriction denies private download',(await get(owner,c.file_url)).status()===403);
 unchanged=bench('inspect');check('Reads and restriction preserve raw current and historical audit bytes',unchanged.snapshot_unchanged&&unchanged.note_unchanged&&unchanged.current_matches_audit);
 check('No HTTP server failures',serverFailures.length===0);check('Source unchanged during HTTP test',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-note-access-http-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'Note access HTTP failure',status:'FAIL',error_type:e.name});process.exitCode=1}
 finally{for(const s of sessions)await s.dispose();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.length>0&&checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,unchanged,server_failures:serverFailures,source_hashes:source,limits:['Synthetic personal-session HTTP corrections, native v1/v2 reads, print, timeline, exact raw history and Event attachment revocation. Not independent security or sustained capacity certification.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
