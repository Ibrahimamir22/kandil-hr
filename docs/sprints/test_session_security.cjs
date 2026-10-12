/* ACC-001-01 real native login/session/API/UI proof; synthetic credentials stay private. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),bench=path.resolve(app,'../..'),dev=path.resolve(bench,'../..');
const manifest=path.join(bench,'sites/kandil-parity.localhost/private/security-session-probe.json');
const base='http://localhost:8102',out=path.join(__dirname,'evidence/browser');
function control(action){
 const py=`import os,json,frappe; os.chdir('/workspace/frappe-bench/sites'); frappe.init(site='kandil-parity.localhost'); frappe.connect(); frappe.set_user('Administrator'); from kandil_hr.foundation import session_probe; print(json.dumps(session_probe.${action}())); frappe.destroy()`;
 return execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','frappe','./env/bin/python','-c',py],{cwd:dev,encoding:'utf8',timeout:60000});
}
(async()=>{
 const checks=[];let browser,prepared=false,failed;
 try {
  control('prepare');prepared=true;
  const fixture=JSON.parse(fs.readFileSync(manifest));
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const contexts={};for(const key of ['enabled','disabled','expired'])contexts[key]=await browser.newContext({viewport:{width:1280,height:850}});
  const p=await contexts.enabled.newPage();await p.goto(base+'/login',{waitUntil:'networkidle'});
  await p.locator('#login_email').fill(fixture.credentials.enabled.email);await p.locator('#login_password').fill(fixture.credentials.enabled.password);
  await p.locator('.for-login button[type="submit"]').click();await p.waitForURL(/\/desk/,{timeout:25000});
  const enabled=await contexts.enabled.request.get(base+'/api/method/frappe.auth.get_logged_user');assert.equal(enabled.status(),200);assert.equal((await enabled.json()).message,fixture.credentials.enabled.email);
  await p.screenshot({path:path.join(out,'session-enabled-native-ui.png'),fullPage:true});checks.push({test:'Enabled account native UI login and authenticated API',status:'PASS',http_status:200});
  for(const key of ['disabled','expired']){
   const login=await contexts[key].request.post(base+'/api/method/login',{form:{usr:fixture.credentials[key].email,pwd:fixture.credentials[key].password}});assert.equal(login.status(),200);
   assert.equal((await contexts[key].request.get(base+'/api/method/frappe.auth.get_logged_user')).status(),200);
  }
  control('rollback_disable');
  assert.equal((await contexts.enabled.request.get(base+'/api/method/frappe.auth.get_logged_user')).status(),200);checks.push({test:'Savepoint and full rollback preserve enabled native session',status:'PASS'});
  control('revoke');
  for(const key of ['disabled','expired']){
   const frozenCookies=await contexts[key].cookies();const deniedUiContext=await browser.newContext();await deniedUiContext.addCookies(frozenCookies);
   const api=await contexts[key].request.get(base+'/api/method/frappe.auth.get_logged_user');assert([401,403].includes(api.status()),key+' session must fail authenticated API; HTTP '+api.status()+' identity '+((await api.json()).message===fixture.credentials[key].email?'original':'other'));
   const q=await deniedUiContext.newPage();await q.goto(base+'/desk',{waitUntil:'networkidle'});await q.locator('#login_email').waitFor({state:'visible'});assert(q.url().includes('/login'));
   await q.screenshot({path:path.join(out,`session-${key}-ui-denied.png`),fullPage:true});
   checks.push({test:key+' previously authenticated session denied by API and Desk UI',status:'PASS',http_status:api.status(),ui:'redirected to native login'});
  }
  const blocked=await browser.newContext(),b=await blocked.newPage();await b.goto(base+'/login',{waitUntil:'networkidle'});
  await b.locator('#login_email').fill(fixture.credentials.disabled.email);await b.locator('#login_password').fill(fixture.credentials.disabled.password);
  const response=b.waitForResponse(r=>r.url().includes('/api/method/login'));await b.locator('.for-login button[type="submit"]').click();const denied=await response;assert([401,403].includes(denied.status()));
  await b.locator('#login_email').waitFor({state:'visible'});assert(b.url().includes('/login'));
  await b.screenshot({path:path.join(out,'session-disabled-login-ui.png'),fullPage:true});checks.push({test:'Disabled account fresh native UI login denied',status:'PASS',http_status:denied.status()});
  const freshApi=await blocked.request.post(base+'/api/method/login',{form:{usr:fixture.credentials.disabled.email,pwd:fixture.credentials.disabled.password}});assert([401,403].includes(freshApi.status()));checks.push({test:'Disabled account fresh direct login API denied',status:'PASS',http_status:freshApi.status()});
 }catch(error){failed=error;checks.push({test:'Native session acceptance execution',status:'FAIL',error_type:error.name,message:error.message});process.exitCode=1;}
 finally {
  if(browser)await browser.close();
  if(prepared){try{control('cleanup');checks.push({test:'Synthetic accounts and native sessions cleaned; private manifest removed',status:'PASS'});}catch(error){checks.push({test:'Fixture cleanup',status:'FAIL',error_type:error.name});process.exitCode=1;}}
  const sources=['kandil_hr/foundation/account_sessions.py','kandil_hr/foundation/session_probe.py','docs/sprints/test_session_security.cjs'];
  const result={case:'AT-ACC-001-01',checked_at:new Date().toISOString(),site:'kandil-parity.localhost',result:checks.every(x=>x.status==='PASS')?'PASS':'FAIL',checks,source_sha256:Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')])),limits:['Expiry simulated only for a real synthetic session by aging its native Redis/DB record; no global session policy changed','No provider, MFA, new-device alert or production session-duration acceptance','Screenshots contain only synthetic accounts; passwords and session IDs excluded from evidence']};
  fs.writeFileSync(path.join(out,'session-security-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:result.result,checks:checks.map(({test,status,http_status})=>({test,status,http_status}))}));
 }
})();
