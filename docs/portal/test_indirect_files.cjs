/* Ordinary-session indirect File access, paginated metadata and zip boundaries. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {request}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),dev=path.resolve(app,'../../../..'),run=crypto.randomBytes(6).toString('hex');
const out=path.join(__dirname,'evidence',`indirect-files-${run}`),manifest=path.resolve(app,'../../sites/kandil-parity.localhost/private',`kandil-portal-${run}.json`);
fs.mkdirSync(out,{recursive:true});
const files=['kandil_hr/foundation/file_links.py','kandil_hr/foundation/files.py','kandil_hr/foundation/security.py','kandil_hr/foundation/reports.py','kandil_hr/recruitment/history_access.py','kandil_hr/recruitment/history_notes.py','kandil_hr/recruitment/history_references.py','kandil_hr/portal/history_files_fixture.py','kandil_hr/portal/indirect_files_fixture.py','docs/portal/test_indirect_files.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));
const source=hashes(),checks=[],sessions=[],serverFailures=[];let data,cleanup,unchanged;
function bench(action){try{const raw=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.portal.indirect_files_fixture.'+action,'--kwargs',JSON.stringify({run_id:run})],{cwd:dev,encoding:'utf8',timeout:120000});return JSON.parse(raw.trim().split('\n').at(-1))}catch(e){fs.writeFileSync(`/tmp/kandil-indirect-files-${run}-${action}.txt`,String(e.stdout||'')+'\n'+String(e.stderr||''),{mode:0o600});throw Error('Fixture '+action+' failed; diagnostics private')}}
function check(name,value){assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
async function login(role){const s=await request.newContext({baseURL:'http://localhost:8102'});sessions.push(s);assert.equal((await s.post('/api/method/login',{form:{usr:data.users[role].email,pwd:data.users[role].password}})).status(),200);return s}
async function get(s,url,params={}){const r=await s.get(url,{params});if(r.status()>=500)serverFailures.push({path:url,status:r.status()});return r}
async function method(s,name,params){const r=await get(s,'/api/method/'+name,params);return {status:r.status(),body:await r.json()}}
async function list(s,names,start=0,page_length=20){return method(s,'frappe.client.get_list',{doctype:'File',fields:JSON.stringify(['name','file_name','file_url']),filters:JSON.stringify({name:['in',names]}),order_by:'name asc',limit_start:start,limit_page_length:page_length})}
async function detail(s,f){return method(s,'frappe.client.get',{doctype:'File',name:f.name})}
async function allowed(s,f,label){const d=await detail(s,f),r=await get(s,f.url);check(label+' detail and original bytes',d.status===200&&d.body.message.file_url===f.url&&r.status()===200&&await r.text()===f.content)}
async function denied(s,f,label){const d=await detail(s,f),r=await get(s,f.url);check(label+' denies detail and private download',d.status===403&&r.status()===403)}
(async()=>{try{
 bench('prepare');assert.equal(fs.statSync(manifest).mode&0o077,0);data=JSON.parse(fs.readFileSync(manifest,'utf8'));
 const owner=await login('requester'),outsider=await login('outsider'),v=data.indirect_files,all=Object.values(v).map(f=>f.name);
 for(const key of ['chain1','chain4','child','child_chain','alias','ordinary'])await allowed(owner,v[key],'Authorized '+key);
 let page=await list(owner,[v.chain1.name,v.chain4.name,v.child_chain.name,v.alias.name,v.ordinary.name]);check('Authorized indirect and ordinary metadata remains listed',page.status===200&&page.body.message.length===5);
 // Upstream native File listing excludes child DocTypes without standalone read
 // roles. Detail/download are supported via the authorized owning HR document.
 page=await list(owner,[v.child.name]);check('Native child-list limitation retained',page.status===200&&page.body.message.length===0);
 for(const key of ['chain1','child_chain','alias'])await denied(outsider,v[key],'Outsider '+key);
 for(const key of ['orphan','cycle1','cycle2','too_deep'])await denied(owner,v[key],'Invalid '+key);
 page=await list(owner,['orphan','cycle1','cycle2','too_deep'].map(k=>v[k].name));check('Broken and cyclic links absent before pagination',page.status===200&&page.body.message.length===0);
 let zip=await get(owner,'/api/method/frappe.core.api.file.zip_files',{files:JSON.stringify([v.chain1.name,v.child.name])});let bytes=await zip.body();check('Authorized zip contains both allowed filenames',zip.status()===200&&bytes.includes(Buffer.from(v.chain1.file_name))&&bytes.includes(Buffer.from(v.child.file_name)));
 bench('restrict');
 let current=await method(owner,'kandil_hr.portal.api.detail',{name:data.history_file.request});check('Narrow scope still reads the current request',current.status===200&&current.body.message.request.name===data.history_file.request);
 for(const key of ['chain1','chain4','alias'])await denied(owner,v[key],'Historical scope revoked '+key);
 for(const key of ['child','child_chain','ordinary'])await allowed(owner,v[key],'Current permitted '+key);
 const expected=[v.child_chain.name,v.ordinary.name].sort(),seen=[];
 for(let start=0;start<3;start++){page=await list(owner,all,start,1);assert.equal(page.status,200);seen.push(...page.body.message.map(r=>r.name))}
 check('Page-one filtering returns only permitted metadata with no denied-row gaps',JSON.stringify(seen)===JSON.stringify(expected));
 zip=await get(owner,'/api/method/frappe.core.api.file.zip_files',{files:JSON.stringify([v.chain1.name,v.alias.name,v.child.name])});bytes=await zip.body();check('Mixed zip omits revoked history and alias but retains permitted child',zip.status()===200&&!bytes.includes(Buffer.from(v.chain1.file_name))&&!bytes.includes(Buffer.from(v.alias.file_name))&&bytes.includes(Buffer.from(v.child.file_name)));
 bench('revoke');
 for(const key of ['child','child_chain'])await denied(owner,v[key],'Full scope revoked '+key);
 await allowed(owner,v.ordinary,'Ordinary owned upload after HR revocation');
 page=await list(owner,all);check('Final metadata includes only the ordinary owned upload',page.status===200&&page.body.message.length===1&&page.body.message[0].name===v.ordinary.name);
 zip=await get(owner,'/api/method/frappe.core.api.file.zip_files',{files:JSON.stringify([v.chain1.name,v.alias.name,v.child.name])});check('Revoked zip contains no protected entries',zip.status()===200&&(await zip.body()).length===22);
 unchanged=bench('inspect');check('All bytes, links and actual requester ownership unchanged',unchanged.unchanged&&unchanged.owner_verified);
 check('No server failures',serverFailures.length===0);check('Source unchanged',JSON.stringify(source)===JSON.stringify(hashes()));
 }catch(e){fs.writeFileSync(`/tmp/kandil-indirect-files-http-${run}.txt`,String(e.stack||e),{mode:0o600});checks.push({name:'Indirect File HTTP failure',status:'FAIL',error_type:e.name});process.exitCode=1}
 finally{for(const s of sessions)await s.dispose();if(fs.existsSync(manifest)){try{cleanup=bench('cleanup')}catch{cleanup={cleaned:false};process.exitCode=1}}const status=checks.length>0&&checks.every(c=>c.status==='PASS')&&cleanup?.cleaned?'PASS':'FAIL';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status,run_id:run,checked_at:new Date().toISOString(),checks,cleanup,unchanged,server_failures:serverFailures,source_hashes:source,limits:['Synthetic ordinary HTTP sessions, indirect File/child/legacy-alias metadata/detail/private download/zip boundaries. Native child listing retains upstream role restrictions. No browser rendering, sustained load or independent security certification.']},null,2)+'\n');console.log(JSON.stringify({status,run_id:run,checks:checks.length,evidence:out}));if(status!=='PASS')process.exitCode=1}
})();
