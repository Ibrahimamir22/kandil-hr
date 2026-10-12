/* Synthetic parity browser/HTTP checks. Never prints credentials or response bodies. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),bench=path.resolve(app,'../..');
const fixture=JSON.parse(fs.readFileSync(path.join(bench,'sites/kandil-parity.localhost/private/kandil-review.json')));
const base='http://localhost:8102',out=path.join(__dirname,'evidence/browser');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const contexts={},checks=[],errors=[],serverErrors=[];
 async function session(key){if(contexts[key])return contexts[key];const c=await browser.newContext({viewport:{width:1440,height:1040}});const x=fixture.credentials[key];const r=await c.request.post(base+'/api/method/login',{form:{usr:x.email,pwd:x.password}});assert.equal(r.status(),200,'synthetic role login');contexts[key]=c;return c;}
 async function screen(key,route){const c=await session(key),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)serverErrors.push({url:r.url().split('?')[0],status:r.status()});});await p.goto(base+route,{waitUntil:'networkidle'});return p;}
 async function language(key,value) {
   const p=await screen(key,'/desk');const csrf=await p.evaluate(()=>frappe.csrf_token);
   const c=await session(key),r=await c.request.post(base+'/api/method/frappe.client.set_value',{headers:{'X-Frappe-CSRF-Token':csrf},data:{doctype:'User',name:fixture.credentials[key].email,fieldname:'language',value}});
   assert.equal(r.status(),200,'own language preference update');await p.close();
 }
 async function check(name,fn){try{await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){checks.push({name,status:'FAIL',error:e.message});console.log('FAIL '+name+': '+e.message);process.exitCode=1;}}
 await check('Guest cannot read a private hiring request',async()=>{const c=await browser.newContext();const r=await c.request.get(base+'/api/resource/Kandil%20Hiring%20Request/'+fixture.requests.pending);assert([401,403].includes(r.status()));await c.close();});
 await check('Scoped requester sees native request form and live values',async()=>{const p=await screen('requester','/desk/kandil-hiring-request/'+fixture.requests.draft);await p.waitForFunction(()=>window.cur_frm?.doc?.doctype==='Kandil Hiring Request');assert.equal(await p.evaluate(()=>cur_frm.doc.status),'Draft');await p.getByRole('button',{name:'Submit for Approval',exact:true}).waitFor();await p.screenshot({path:path.join(out,'request-en.png'),fullPage:true});await p.close();});
 await check('Out-of-scope recruiter denied detail and sees empty queue',async()=>{const c=await session('outsider');const r=await c.request.get(base+'/api/resource/Kandil%20Hiring%20Request/'+fixture.requests.approved);assert.equal(r.status(),403);const q=await c.request.get(base+'/api/method/kandil_hr.recruitment.vacancies.queue');assert.equal(q.status(),200);assert.deepEqual((await q.json()).message,[]);});
 await check('Native vacancy queue shows approved openings and controls',async()=>{const p=await screen('hr','/desk/kandil-vacancy-queue');await p.getByRole('button',{name:'Assign selected',exact:true}).waitFor();await p.locator('.table tbody tr').first().waitFor();assert.equal(await p.locator('.table tbody tr').filter({hasText:fixture.requests.approved}).count(),2);assert.equal(await p.locator('.table tbody tr').filter({hasText:fixture.requests.draft}).count(),0);await p.screenshot({path:path.join(out,'queue-en.png'),fullPage:true});await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page must fit narrow viewport; table scroll is internal');await p.screenshot({path:path.join(out,'queue-mobile-en.png'),fullPage:true});await p.close();});
 await check('Arabic request and queue render RTL on desktop and mobile',async()=>{
   await language('requester','ar');await language('hr','ar');
   const request=await screen('requester','/desk/kandil-hiring-request/'+fixture.requests.draft+'?_lang=ar');
   await request.waitForFunction(()=>window.cur_frm?.doc?.doctype==='Kandil Hiring Request');
   assert.equal(await request.evaluate(()=>getComputedStyle(document.body).direction),'rtl');
   await request.screenshot({path:path.join(out,'request-ar.png'),fullPage:true});await request.close();
   const p=await screen('hr','/desk/kandil-vacancy-queue?_lang=ar');
   await p.locator('.table tbody tr').first().waitFor();
   assert.equal(await p.evaluate(()=>getComputedStyle(document.body).direction),'rtl');
   assert.match(await p.locator('body').innerText(),/قائمة الشواغر/);
   await p.screenshot({path:path.join(out,'queue-ar.png'),fullPage:true});
   await p.setViewportSize({width:390,height:844});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.screenshot({path:path.join(out,'queue-mobile-ar.png'),fullPage:true});await p.close();
   await language('requester','en');await language('hr','en');
 });
 await check('No client runtime errors or server 5xx',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checked_at:new Date().toISOString(),site:fixture.site,checks,errors,serverErrors,limitations:['Native EN/AR rendering and saved user language tested; business mutations tested separately','Persistent synthetic review fixtures only']},null,2)+'\n');
 await browser.close();
})();
