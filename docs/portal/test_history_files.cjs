/* Personal-session native revision attachment boundaries; loopback synthetic only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {request}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex');
const out=path.join(__dirname,'evidence',`history-files-${run}`),manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
fs.mkdirSync(out,{recursive:true});
const files=['kandil_hr/recruitment/history_references.py','kandil_hr/recruitment/note_projection.py','kandil_hr/recruitment/event_access.py','kandil_hr/recruitment/review_views.py','kandil_hr/pilot/permissions.py','kandil_hr/pilot/models.py','kandil_hr/foundation/security.py','kandil_hr/foundation/files.py','kandil_hr/recruitment/history_access.py','kandil_hr/recruitment/history_schema.py','kandil_hr/recruitment/models.py','kandil_hr/portal/history_files_fixture.py','docs/portal/test_history_files.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')])),source=hashes();
const checks=[],sessions=[],serverFailures=[];let data,cleanup,unchanged;
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.history_files_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});return JSON.parse(raw.split('\n').filter(l=>l.startsWith('{')).at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-history-files-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Fixture '+action+' failed; diagnostics private')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function login(role){const session=await request.newContext({baseURL:'http://localhost:8102'});sessions.push(session);const res=await session.post('/api/method/login',{form:{usr:data.users[role].email,pwd:data.users[role].password}});assert.equal(res.status(),200);return session}
async function get(session,url,params={}){const res=await session.get(url,{params});if(res.status()>=500)serverFailures.push({path:url,status:res.status()});return res}
async function method(session,name,params){const res=await get(session,'/api/method/'+name,params);return {status:res.status(),body:await res.json()}}
async function listing(session){return method(session,'frappe.client.get_list',{doctype:'File',fields:JSON.stringify(['name','file_name','file_url']),filters:JSON.stringify({name:data.history_file.file})})}
async function detail(session,doctype,name){return method(session,'frappe.client.get',{doctype,name})}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest,'utf8'));
 const owner=await login('requester'),outsider=await login('outsider'),f=data.history_file;
 let res=await listing(owner);check('Authorized owner can list retained revision attachment metadata',res.status===200&&res.body.message.length===1&&res.body.message[0].file_url===f.file_url);
 res=await detail(owner,'Kandil Request Revision',f.revision);check('Authorized owner reads exact immutable revision bytes',res.status===200&&crypto.createHash('sha256').update(res.body.message.snapshot_json).digest('hex')===f.snapshot_sha256);
 res=await detail(owner,'File',f.file);check('Authorized owner can read native File detail',res.status===200&&res.body.message.file_url===f.file_url);
 let file=await get(owner,f.file_url);check('Authorized owner downloads exact private bytes',file.status()===200&&await file.text()===f.content);
 res=await listing(outsider);check('Outside-scope user sees no attachment metadata',res.status===200&&res.body.message.length===0);
 check('Outside-scope user cannot read File detail',(await detail(outsider,'File',f.file)).status===403);
 check('Outside-scope user cannot download private bytes',(await get(outsider,f.file_url)).status()===403);
 bench('restrict');
 res=await method(owner,'kandil_hr.portal.api.detail',{name:f.request});check('Branch-scoped owner retains current portal request access',res.status===200&&res.body.message.request.name===f.request);
 check('Branch-scoped owner cannot read unredacted old revision',(await detail(owner,'Kandil Request Revision',f.revision)).status===403);
 res=await listing(owner);check('File ownership cannot expose restricted historical filename or URL',res.status===200&&res.body.message.length===0);
 check('Same session loses native File detail immediately',(await detail(owner,'File',f.file)).status===403);
 check('Same session loses private file download immediately',(await get(owner,f.file_url)).status()===403);
 res=await method(owner,'frappe.client.get_list',{doctype:'Kandil Request Revision',fields:JSON.stringify(['name','snapshot_json']),filters:JSON.stringify({request:f.request})});check('Restricted native revision listing contains no historical JSON',res.status===200&&res.body.message.length===0);
 unchanged=bench('inspect');check('Permission checks leave snapshot and attachment bytes unchanged',unchanged.snapshot_unchanged&&unchanged.file_unchanged);
 check('No HTTP server failures',serverFailures.length===0);check('Source unchanged during HTTP test',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-history-files-http-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'History file HTTP failure',status:'FAIL',error_type:e.name});process.exitCode=1}
 finally{for(const s of sessions)await s.dispose();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.length>0&&checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,unchanged,server_failures:serverFailures,source_hashes:source,limits:['Synthetic native HTTP list/detail/download boundaries using personal accounts. No browser rendering, production load or complete raw nested-reference audit is claimed.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
