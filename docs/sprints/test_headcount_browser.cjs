/* Actual parity-only EN/AR native quantity-revision UI. Run with a fresh prepared
 * headcount_http_fixture UUID under an exclusive lease. This runner cleans it.
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), {execFileSync} = require('node:child_process');
const {chromium} = require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runId = process.argv[2];
assert.match(runId || '', /^[a-f0-9]{12}$/);
const app = path.resolve(__dirname, '../..'), benchPath = path.resolve(app, '../..'), devRoot = path.resolve(app, '../../../..');
const manifestPath = path.join(benchPath, 'sites/kandil-parity.localhost/private', `kandil-browser-${runId}.json`);
assert.equal(fs.statSync(manifestPath).mode & 0o077, 0);
const fixture = JSON.parse(fs.readFileSync(manifestPath));
assert.equal(fixture.run_id,runId); assert.equal(fixture.company,'Kandil BROWSER TEST '+runId);
assert.equal(fixture.purpose,'headcount-http-and-browser'); assert.equal(fixture.cleaned,false);
const base='http://localhost:8102', out=path.join(__dirname,'evidence/browser/headcount',runId);
assert(!fs.existsSync(path.join(out,'results.json')),'Use a fresh fixture; do not overwrite earlier evidence');
fs.mkdirSync(out,{recursive:true});
function bench(action, args={}) {
  let output;
  try {output=execFileSync('docker',['compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site','kandil-parity.localhost','execute','kandil_hr.recruitment.headcount_http_fixture.'+action,'--kwargs',JSON.stringify({run_id:runId,...args})],{cwd:devRoot,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:240000});}
  catch {throw new Error('Private synthetic fixture '+action+' failed; raw output withheld');}
  return JSON.parse(output.split('\n').filter(line=>line.startsWith('{')).at(-1));
}
const sourcePaths=['kandil_hr/recruitment/api.py','kandil_hr/recruitment/pending_revision.py','kandil_hr/recruitment/headcount_contract.py','kandil_hr/recruitment/headcount_denials.py','kandil_hr/recruitment/headcount_http_fixture.py','kandil_hr/pilot/navigation.py','kandil_hr/kandil_hr/doctype/kandil_hiring_request/kandil_hiring_request.js','kandil_hr/translations/ar.csv','docs/sprints/test_headcount_browser.cjs'];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,p))).digest('hex')]));
const sourceHashes=hashes();
(async()=>{
  const checks=[], runtimeErrors=[], consoleErrors=[], serverFailures=[];
  let browser, cleanup;
  async function check(name,fn){try{await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){checks.push({name,status:'FAIL',error_type:error.name,error_message:String(error.message).slice(0,180),failure_location:error.stack?.split('\n').find(line=>line.includes(__filename))});process.exitCode=1;console.log('FAIL '+name);}}
  async function login(key){
    const context=await browser.newContext({viewport:{width:1500,height:1050}});
    const user=fixture.users[key];
    assert.equal((await context.request.post(base+'/api/method/login',{form:{usr:user.email,pwd:user.password}})).status(),200);
    return context;
  }
  async function form(context,name){
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>runtimeErrors.push(error.message));
    page.on('console',entry=>{if(entry.type()==='error')consoleErrors.push(entry.text().replace(/\?[^\s]+/g,'?[redacted]'));});
    page.on('response',response=>{if(response.status()>=500)serverFailures.push({status:response.status(),path:new URL(response.url()).pathname});});
    await page.goto(base+'/desk/kandil-hiring-request/'+encodeURIComponent(name),{waitUntil:'networkidle'});
    await page.waitForFunction(name=>window.cur_frm?.doc?.name===name,name);
    await page.waitForFunction(()=>typeof cur_frm.kandil_action_generation==='number');
    return page;
  }
  const label=(page,text)=>page.evaluate(text=>__(text),text);
  try{
    browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    bench('policy',{mode:'Block'});
    for(const locale of ['en','ar']){
      bench('language',{language:locale});
      for(const denied of [false,true]) await check(`Native ${locale} ${denied?'denial retains dialog and quantities':'own reservation2-to3 success restarts approvals'}`,async()=>{
        const key='browser_'+(denied?'denied':'success')+'_'+locale;
        const before=bench('inspect'), record=before.requests[key], context=await login('requester');
        try{
          const page=await form(context,record.name);
          assert.equal(await page.evaluate(()=>frappe.boot.lang),locale);
          const action=await label(page,'Revise pending quantities');
          if(locale==='ar')assert.notEqual(action,'Revise pending quantities');
          await page.getByRole('button',{name:action,exact:true}).click();
          const dialog=page.locator('.modal:visible').last();
          await dialog.locator('input[data-fieldname="q0"]').fill(denied?'4':'3');
          await dialog.locator('textarea[data-fieldname="reason"]').fill(locale==='ar'?'مراجعة عدد اصطناعية لإثبات مسار الاعتماد':'Synthetic reviewed pending quantity change');
          await dialog.locator('textarea[data-fieldname="exception_reason"]').fill('Synthetic justification over ten characters');
          await dialog.locator('.modal-title').click();
          const cells=await dialog.locator('[data-fieldname="review"] tbody tr').first().locator('td').allTextContents();
          assert.deepEqual(cells.slice(1,4),[denied?'4':'3','2',denied?'2':'1']);
          await page.screenshot({path:path.join(out,`${locale}-${denied?'denied':'success'}-review.png`),fullPage:true});
          await dialog.getByRole('button',{name:await label(page,'Review and restart approvals'),exact:true}).click();
          const text=await label(page,'Apply the reviewed quantities and restart all approvals? Existing reservations will change only by the difference.');
          const confirmation=page.locator('.modal').filter({hasText:text}).last();
          await confirmation.waitFor({state:'visible'});
          assert((await confirmation.innerText()).includes(text));
          const responsePromise=page.waitForResponse(response=>response.url().includes('/api/method/kandil_hr.recruitment.pending_revision.revise_pending_quantities')&&response.request().method()==='POST');
          await confirmation.locator('.btn-modal-primary').click();
          const response=await responsePromise;assert.equal(response.status(),200);
          const result=(await response.json()).message;
          const after=bench('inspect');
          if(denied){
            assert.equal(result.outcome,'denied');
            assert.deepEqual(after.requests[key],record);assert.deepEqual(after.capacities,before.capacities);
            const notice=page.locator('.modal').filter({hasText:await label(page,'Headcount change denied')}).last();
            await notice.waitFor({state:'visible'});
            assert((await notice.innerText()).includes(await label(page,'Headcount change denied')));
            assert.equal(await notice.locator('.indicator.red').count(),1);
            assert.equal(await page.evaluate(()=>cur_frm.doc.modified),record.modified);
            await page.screenshot({path:path.join(out,`${locale}-denial-visible.png`),fullPage:true});
            await notice.locator('.btn-modal-close').click();
            const retained=page.locator('.modal:visible').last();
            assert.equal(await retained.locator('input[data-fieldname="q0"]').inputValue(),'4');
            assert((await retained.locator('textarea[data-fieldname="reason"]').inputValue()).length>0);
            assert.equal(after.security_events.filter(event=>event.name===result.event).length,1);
          }else{
            assert.notEqual(result.outcome,'denied');
            await page.waitForFunction(previous=>cur_frm.doc.modified!==previous,record.modified);
            assert.equal(after.requests[key].revision,record.revision+1);
            assert.equal(after.capacities[key].reserved,3);assert.equal(after.capacities[key].available,0);
            assert(after.requests[key].steps.every(step=>step.decision==='Pending'));
            assert(!after.requests[key].steps.some(step=>record.steps.some(old=>old.key===step.key)));
            await page.screenshot({path:path.join(out,`${locale}-success-saved.png`),fullPage:true});
          }
        }finally{await context.close();}
      });
    }
    await check('Ordinary HR cannot see requester-only revision action',async()=>{
      const context=await login('hr');
      try{
        const name=fixture.headcount_requests.browser_denied_en,page=await form(context,name);
        const capabilities=await page.evaluate(name=>frappe.call({method:'kandil_hr.pilot.navigation.request_actions',type:'GET',args:{name}}).then(r=>r.message),name);
        assert.equal(Boolean(capabilities.revise_pending_quantities),false);
        assert.equal(await page.getByRole('button',{name:await label(page,'Revise pending quantities'),exact:true}).count(),0);
        await page.screenshot({path:path.join(out,'hr-no-requester-action.png'),fullPage:true});
      }finally{await context.close();}
    });
    await check('Native headcount pages have no runtime JavaScript or HTTP500 failures',async()=>{assert.deepEqual(runtimeErrors,[]);assert.deepEqual(serverFailures,[]);});
    await check('Source remains unchanged during native proof',async()=>assert.deepEqual(hashes(),sourceHashes));
  }finally{
    if(browser)await browser.close();
    try{cleanup=bench('cleanup');}catch(error){cleanup={status:'FAIL',error_type:error.name};process.exitCode=1;}
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checked_at:new Date().toISOString(),run_id:runId,site:'kandil-parity.localhost',status:checks.length===7&&checks.every(check=>check.status==='PASS')&&cleanup.cleaned?'PASS':'FAIL',checks,runtimeErrors,consoleErrors,serverFailures,cleanup,source_hashes:sourceHashes,source_unchanged:JSON.stringify(hashes())===JSON.stringify(sourceHashes),limits:['Synthetic native UI proof, no production data or external messages.','Database snapshots obtained through separate CLI connection; credentials omitted.','Console errors are recorded separately, not silently classified as clean.']},null,2)+'\n');
  }
})().catch(()=>{console.error('Headcount browser gate failed; inspect sanitized evidence.');process.exitCode=1;});
