/* Exact equal-looking A/A1, A/A2, B/B1 native access and scoped-export proof. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),bench=path.resolve(app,'../..'),dev=path.resolve(bench,'../..');
const manifest=path.join(bench,'sites/kandil-parity.localhost/private/security-scope-probe.json');
const base='http://localhost:8102',out=path.join(__dirname,'evidence/browser'),doctype='Kandil Position';
function control(action){
 const py=`import os,json,frappe; os.chdir('/workspace/frappe-bench/sites'); frappe.init(site='kandil-parity.localhost'); frappe.connect(); frappe.set_user('Administrator'); from kandil_hr.foundation import scope_probe; print(json.dumps(scope_probe.${action}())); frappe.destroy()`;
 return execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','frappe','./env/bin/python','-c',py],{cwd:dev,encoding:'utf8',timeout:60000});
}
(async()=>{
 const checks=[];let browser,prepared=false;
 try{
  prepared=true;control('prepare');const f=JSON.parse(fs.readFileSync(manifest));
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  assert.equal((await context.request.post(base+'/api/method/login',{form:{usr:f.email,pwd:f.password}})).status(),200);
  const p=await context.newPage();await p.goto(base+'/desk',{waitUntil:'networkidle'});const csrf=await p.evaluate(()=>frappe.csrf_token);
  const get=(method,params)=>context.request.get(base+'/api/method/'+method,{params});
  const check=(test)=>checks.push({test,status:'PASS'});
  let r=await get('frappe.client.get_list',{doctype,fields:JSON.stringify(['name','title']),filters:JSON.stringify({title:f.title}),limit_page_length:'20'});
  assert.equal(r.status(),200);assert.deepEqual((await r.json()).message.map(x=>x.name),[f.records.A1.name]);check('Native list contains A/A1 only among three equal-title records');
  r=await get('frappe.desk.reportview.get',{doctype,fields:JSON.stringify(['name','title']),filters:JSON.stringify({title:f.title}),page_length:'20',save_user_settings:'false'});
  assert.equal(r.status(),200);const report=await r.json(),reportText=JSON.stringify(report.message);
  assert(reportText.includes(f.records.A1.name));assert(!reportText.includes(f.records.A2.name));assert(!reportText.includes(f.records.B1.name));check('Native report builder row query contains only permitted branch');
  for(const [key,doc] of Object.entries(f.records)){
   const allowed=key==='A1';
   r=await get('frappe.client.get',{doctype,name:doc.name});assert.equal(r.status(),allowed?200:403);
   if(allowed)assert.equal((await r.json()).message.title,f.title);
   r=await get('frappe.desk.search.search_link',{doctype,txt:doc.name,page_length:'20'});assert.equal(r.status(),200);
   const found=(await r.json()).message;assert.equal(found.some(x=>x.value===doc.name),allowed);
   r=await get('frappe.www.printview.get_html_and_style',{doc:doctype,name:doc.name,no_letterhead:'1'});assert.equal(r.status(),allowed?200:403);
   if(allowed)assert((await r.json()).message.html.includes(f.title));
   r=await context.request.get(base+doc.file_url);assert.equal(r.status(),allowed?200:403);
   if(allowed)assert((await r.text()).includes('Synthetic private marker '+f.prefix+key));
   r=await get('frappe.client.get',{doctype:'File',name:doc.file_name});assert.equal(r.status(),allowed?200:403);
   check(key+' exact-ID detail, link search, native print, private download and File metadata scope');
  }
  for(const doc of Object.values(f.records)){
   r=await get('frappe.desk.reportview.export_query',{doctype,fields:JSON.stringify(['name','title']),filters:JSON.stringify({name:doc.name}),file_format_type:'CSV',save_user_settings:'false'});
   assert.equal(r.status(),403);
  }check('Unrestricted native CSV export remains denied for both allowed and forbidden rows');
  r=await get('kandil_hr.foundation.position_register.export_positions',{});assert.equal(r.status(),200);
  let csv=await r.text();assert(csv.includes(f.records.A1.name));assert(!csv.includes(f.records.A2.name));assert(!csv.includes(f.records.B1.name));
  assert.equal(r.headers()['cache-control'],'private, no-store');assert(r.headers()['content-disposition'].includes('attachment'));
  assert.equal(csv.replace(/^\uFEFF/,'').split(/\r?\n/)[0],'name,position_code,title,company,department,branch,status');
  check('Narrow read-grant CSV exports only seven public fields and allowed A/A1 row with no-store header');
  for(const key of ['A2','B1']){
   r=await get('kandil_hr.foundation.position_register.export_positions',{company:f.records[key].company,branch:f.records[key].branch});assert.equal(r.status(),200);csv=await r.text();assert.equal(csv.trim().split(/\r?\n/).length,1);
  }check('Explicit forbidden-company/branch export filters yield only header');
  r=await context.request.post(base+'/api/method/frappe.client.set_value',{headers:{'X-Frappe-CSRF-Token':csrf},data:{doctype,name:f.records.A1.name,fieldname:'title',value:'Forbidden read-only mutation'}});assert.equal(r.status(),403);
  r=await get('frappe.client.get',{doctype,name:f.records.A1.name});assert.equal((await r.json()).message.title,f.title);check('Read-only scope can view/export but native write is denied with unchanged record');
  await p.goto(base+'/desk/kandil-position/'+encodeURIComponent(f.records.A1.name),{waitUntil:'networkidle'});await p.screenshot({path:path.join(out,'scope-read-only-position-ui.png'),fullPage:true});
  await p.goto(base+'/desk/kandil-position',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'Download Position Register',exact:true}).click();
  await p.getByRole('dialog').getByRole('button',{name:'Download CSV',exact:true}).waitFor({state:'visible'});
  await p.screenshot({path:path.join(out,'scope-position-register-download-dialog.png'),fullPage:true});
  const downloadEvent=p.waitForEvent('download');await p.getByRole('dialog').getByRole('button',{name:'Download CSV',exact:true}).click();
  const download=await downloadEvent,chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
  const downloaded=Buffer.concat(chunks).toString('utf8');assert(downloaded.includes(f.records.A1.name));assert(!downloaded.includes(f.records.A2.name));assert(!downloaded.includes(f.records.B1.name));
  assert.equal(download.suggestedFilename(),'kandil-position-register.csv');check('Native Position list button and dialog download the same scoped CSV');
  control('revoke');
  r=await get('frappe.client.get',{doctype,name:f.records.A1.name});assert.equal(r.status(),403);
  r=await context.request.get(base+f.records.A1.file_url);assert.equal(r.status(),403);
  r=await get('kandil_hr.foundation.position_register.export_positions',{});assert.equal(r.status(),200);assert.equal((await r.text()).trim().split(/\r?\n/).length,1);
  check('Revoked grant blocks former direct record/private file and removes former row from CSV');
 }catch(error){checks.push({test:'Scope matrix execution',status:'FAIL',error_type:error.name,message:error.message});process.exitCode=1;}
 finally{
  if(browser)await browser.close();
  if(prepared&&fs.existsSync(manifest)){try{control('cleanup');checks.push({test:'Scoped synthetic records/accounts/private files cleanup',status:'PASS'});}catch(error){checks.push({test:'Scoped cleanup',status:'FAIL',error_type:error.name});process.exitCode=1;}}
  const sources=['kandil_hr/foundation/position_register.py','kandil_hr/foundation/scope_probe.py','kandil_hr/foundation/security.py','kandil_hr/foundation/files.py','docs/sprints/test_scope_security.cjs'];
  const result={cases:['AT-ACC-003-01','AT-ORG-009-02'],checked_at:new Date().toISOString(),site:'kandil-parity.localhost',result:checks.every(x=>x.status==='PASS')?'PASS':'FAIL',checks,source_sha256:Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')])),limits:['Real native HTTP proof for positions and attached private files; not every HR DocType','Native unrestricted export stays forbidden; positive export uses the narrow scoped position register','One read-only Recruiter with a company-and-branch grant; no provider/MFA claims']};
  fs.writeFileSync(path.join(out,'scope-security-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:result.result,checks:result.checks}));
 }
})();
