const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'development/testing');
const c=JSON.parse(fs.readFileSync(path.join(root,'development/test-credentials.json'))),f=JSON.parse(fs.readFileSync(path.join(out,'fixtures.json'))),s=JSON.parse(fs.readFileSync(path.join(out,'pilot-state.json')));
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const observations=[];
async function session(key){const context=await browser.newContext({viewport:{width:1440,height:1000}});const login=await context.request.post('http://localhost:8101/api/method/login',{form:{usr:c[key].email,pwd:c[key].password}});if(!login.ok())throw Error('Synthetic login failed');return context;}
const requester=await session('employee_a');
let response=await requester.request.post('http://localhost:8101/api/resource/Kandil%20Hiring%20Request',{data:{company:f.company,department:f.department,title:'PILOT HR Review — two locations',lines:[{capacity:s.a,requested_qty:1},{capacity:s.b,requested_qty:1}]}});
if(!response.ok())throw Error('Could not create browser fixture: '+response.status());
const record=(await response.json()).data;fs.writeFileSync(path.join(out,'pilot-demo.json'),JSON.stringify({request:record.name},null,2));
for (const key of ['employee_a','manager2','manager']) {
 const context=key==='employee_a'?requester:await session(key); const page=await context.newPage(); const errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)failed.push({status:r.status(),url:r.url()});});
 // Keep the synthetic approver in English for this button interaction test.
 if(key==='manager2'){
  const admin=await browser.newContext();await admin.request.post('http://localhost:8101/api/method/login',{form:{usr:'Administrator',pwd:fs.readFileSync(path.join(root,'.secrets/admin_password'),'utf8').trim()}});
  await admin.request.put('http://localhost:8101/api/resource/User/'+encodeURIComponent(c[key].email),{data:{language:'en'}});await admin.close();
 }
 await page.goto('http://localhost:8101/desk/kandil-hiring-request/'+record.name,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:key==='employee_a'?'Submit for Approval':'Approve',exact:true}).waitFor();
 if(key==='employee_a'){
   await page.getByRole('button',{name:'Submit for Approval',exact:true}).click();
   await page.getByRole('button',{name:'Yes',exact:true}).click();
 }else{
   await page.getByRole('button',{name:'Approve',exact:true}).click();
   await page.locator('.modal:visible textarea[data-fieldname="comment"]').fill('Approved through browser test');
   await page.getByRole('button',{name:'Submit',exact:true}).click();
 }
 await page.waitForFunction(expected=>window.cur_frm && cur_frm.doc.status===expected,key==='manager'?'Approved':'Pending');
 await page.locator('.modal:visible').waitFor({state:'hidden'});
 await page.screenshot({path:path.join(out,'pilot-browser-'+key+'.png'),fullPage:true});
 const doc=await (await context.request.get('http://localhost:8101/api/resource/Kandil%20Hiring%20Request/'+record.name)).json();
 observations.push({account:key,request:record.name,status:doc.data.status,pageErrors:errors,serverErrors:failed});
 await context.close();
}
const managerContext=await session('manager');const home=await managerContext.newPage();await home.goto('http://localhost:8101/kandil-pilot',{waitUntil:'networkidle'});
await home.getByRole('heading',{name:/HR workspace/}).waitFor();await home.screenshot({path:path.join(out,'pilot-home.png'),fullPage:true});await managerContext.close();
await browser.close();fs.writeFileSync(path.join(out,'pilot-browser-results.json'),JSON.stringify(observations,null,2));console.log(JSON.stringify(observations,null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
