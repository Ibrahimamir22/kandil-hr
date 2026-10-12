/* Synthetic confidential-note UI/HTTP proof. Credentials never printed. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),bench=path.resolve(app,'../..');
const manifest=path.join(bench,'sites/kandil-parity.localhost/private/kandil-review.json');
const fixture=JSON.parse(fs.readFileSync(manifest));
const base='http://localhost:8102',out=path.join(__dirname,'evidence/browser');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const contexts={},checks=[],errors=[];
 async function session(key){const c=await browser.newContext({viewport:{width:1440,height:1000}}),x=fixture.credentials[key];assert.equal((await c.request.post(base+'/api/method/login',{form:{usr:x.email,pwd:x.password}})).status(),200);contexts[key]=c;return c;}
 const hr=await session('hr'),requester=await session('requester'),p=await hr.newPage();p.on('pageerror',e=>errors.push(e.message));
 let noteName;
 try {
  await p.goto(base+'/desk/kandil-hiring-request/'+fixture.requests.approved,{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'Add Confidential HR Note',exact:true}).waitFor();
  await p.getByRole('button',{name:'Add Confidential HR Note',exact:true}).click();
  await p.waitForFunction(()=>window.cur_frm?.doc?.doctype==='Kandil HR Note');
  const marker='Synthetic confidential review — ملاحظة داخلية تجريبية';
  await p.locator('[data-fieldname="note"] textarea').fill(marker);
  await p.locator('[data-fieldname="note"] textarea').press('Tab');
  await p.waitForFunction(value=>window.cur_frm?.doc?.note===value,marker);
  const saved=p.waitForResponse(r=>r.url().includes('/frappe.desk.form.save.savedocs'));
  await p.getByRole('button',{name:'Save',exact:true}).click();
  const saveResponse=await saved;assert.equal(saveResponse.status(),200,'Native note save HTTP');
  await p.waitForFunction(()=>window.cur_frm?.doc?.doctype==='Kandil HR Note'&&!cur_frm.doc.__islocal&&!cur_frm.is_dirty(),{},{timeout:20000});
  noteName=await p.evaluate(()=>cur_frm.doc.name);
  assert.equal(await p.evaluate(()=>cur_frm.doc.note),marker);
  await p.screenshot({path:path.join(out,'confidential-note-hr.png'),fullPage:true});
  checks.push({name:'Scoped HR creates confidential note through native form',status:'PASS'});
  const denied=await requester.request.get(base+'/api/resource/Kandil%20HR%20Note/'+encodeURIComponent(noteName));assert.equal(denied.status(),403);
  checks.push({name:'Requester HTTP detail access denied',status:'PASS'});
  const request=await requester.request.get(base+'/api/resource/Kandil%20Hiring%20Request/'+fixture.requests.approved);assert.equal(request.status(),200);assert(!JSON.stringify(await request.json()).includes(marker));
  const q=await requester.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(base+'/desk/kandil-hiring-request/'+fixture.requests.approved,{waitUntil:'networkidle'});await q.waitForFunction(()=>window.cur_frm?.doc?.doctype==='Kandil Hiring Request');
  await q.waitForFunction(()=>window.cur_frm?.kandil_action_generation>0);
  assert.equal(await q.getByRole('button',{name:'Add Confidential HR Note',exact:true}).count(),0);
  assert(!(await q.locator('body').innerText()).includes(marker));await q.close();
  checks.push({name:'Requester form and HTTP response exclude note and note controls',status:'PASS'});
  assert.deepEqual(errors,[]);checks.push({name:'No client runtime errors',status:'PASS'});
  fixture.docs=fixture.docs||{};fixture.docs.confidential_note=noteName;fs.writeFileSync(manifest,JSON.stringify(fixture,null,2)+'\n',{mode:0o600});
 }catch(error){await p.screenshot({path:path.join(out,'note-failure.png'),fullPage:true});checks.push({name:'Native confidential-note journey',status:'FAIL',error:error.message});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,'notes-results.json'),JSON.stringify({checked_at:new Date().toISOString(),site:fixture.site,note:noteName,checks,errors,limits:['Synthetic note retained as review fixture; no real personal data','Native note controls reviewed in English; Arabic strings statically covered, separate RTL suite covers shared request']},null,2)+'\n');await browser.close();}
 console.log(JSON.stringify({passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL')},null,2));
})();
