const { chromium } = require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.dirname(__dirname);
const url = 'http://127.0.0.1:8120/Kandil_Platform_Design_2026-10-11/dist/';
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[], failed=[], results=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
  const click = (a,extra='')=>page.locator(`[data-action="${a}"]${extra}`).first().click();
  const nav = p=>page.locator(`#sidebar [data-page="${p}"]`).click();
  const role = r=>page.selectOption('#role',r);
  async function check(name,fn){await fn();results.push({name,result:'PASS'});}
  try {
    await page.goto(url);
    await check('Desktop overview renders',async()=>{await page.getByRole('heading',{name:'Good morning. Let’s move work forward.'}).waitFor();await page.screenshot({path:path.join(root,'qa','overview-desktop.png'),fullPage:true,animations:'disabled'});});
    await check('Multi-location form rejects unreasoned capacity exception',async()=>{
      await nav('hr');await click('new-request');await page.locator('[name=title]').fill('Demo multi-site hiring');await page.locator('[name=a]').fill('4');await page.locator('[name=b]').fill('2');await page.locator('#request-form [type=submit]').click();
      assert.match(await page.locator('#request-error').innerText(),/requires a justification/);await page.locator('[name=reason]').fill('Temporary sample expansion');await page.locator('#request-form [type=submit]').click();assert.equal(await page.locator('dialog').isVisible(),false);assert.match(await page.locator('main').innerText(),/Awaiting Sector approver/);
    });
    await check('Requester cannot approve; sector then HR sequence works',async()=>{
      await click('request','[data-id="HR-105"]');assert.equal(await page.locator('dialog [data-action=decide]').count(),0);await click('close');
      await role('sector');await nav('approvals');await click('request','[data-id="HR-105"]');await click('decide','[data-decision="approve"]');
      await role('hr');await nav('approvals');await click('request','[data-id="HR-105"]');await click('decide','[data-decision="approve"]');
      await nav('hr');await click('request','[data-id="HR-105"]');assert.match(await page.locator('dialog').innerText(),/Approved/);assert.equal(await page.locator('dialog [data-action=decide]').count(),0);await click('close');
    });
    await check('Rejection requires a reason and removes pending action',async()=>{
      await role('manager');await nav('approvals');await click('request','[data-id="HR-104"]');await click('decide','[data-decision="reject"]');assert.match(await page.locator('#decision-error').innerText(),/Add a reason/);await page.locator('#decision-note').fill('Demo scope needs revision');await click('decide','[data-decision="reject"]');assert.equal(await page.locator('main [data-id="HR-104"]').count(),0);
    });
    await check('Delivery requires note and proof review before completion',async()=>{
      await role('operations');await nav('delivery');await click('delivery-detail');await click('delivery-advance');assert.match(await page.locator('#delivery-error').innerText(),/required/);await page.locator('#delivery-note').fill('Sample receiver and package count recorded');await click('delivery-advance');assert.match(await page.locator('dialog').innerText(),/POD-DEMO-028/);await page.locator('#delivery-note').fill('Synthetic proof and count checked');await click('delivery-advance');assert.equal(await page.locator('dialog [data-action="delivery-advance"]').count(),0);await click('close');
    });
    await check('Estimator arithmetic, review gate and immutable snapshot',async()=>{
      await role('estimator');await nav('estimator');assert.equal(await page.locator('#cost-total').innerText(),'5,773.68');assert(await page.locator('[data-action="save-estimate"]').isDisabled());await page.locator('[name=qty]').fill('20');await click('review-estimate');assert.equal(await page.locator('[data-action="save-estimate"]').isDisabled(),true);await page.locator('#estimate-form [type=submit]').click();assert.equal(await page.locator('#cost-total').innerText(),'8,434.80');await click('review-estimate');await click('save-estimate');assert.match(await page.locator('main').innerText(),/Saved snapshot: 8,434.80/);await page.locator('[name=qty]').fill('21');await page.locator('#estimate-form [type=submit]').click();assert.match(await page.locator('main').innerText(),/Saved snapshot: 8,434.80/);assert(await page.locator('[data-action="save-estimate"]').isDisabled());await page.screenshot({path:path.join(root,'qa','estimator-desktop.png'),fullPage:true,animations:'disabled'});
    });
    await check('Employee letter is labeled SAMPLE and uses Cairo date',async()=>{
      await role('employee');await nav('hr');await click('letter');const waiting=page.waitForEvent('download');await click('download-letter');const download=await waiting;const txt=fs.readFileSync(await download.path(),'utf8');assert.match(txt,/SAMPLE ONLY/);const cairo=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());assert(txt.includes(cairo));await click('close');
    });
    await check('Executive has aggregate HR and read-only delivery/estimator',async()=>{
      await role('executive');await nav('hr');assert.equal(await page.locator('[data-action="new-request"]').count(),0);assert.equal(await page.locator('main [data-action=request]').count(),0);await nav('delivery');await click('delivery-detail');assert.equal(await page.locator('dialog [data-action=delivery-advance]').count(),0);await click('close');await nav('estimator');assert.equal(await page.locator('main [data-action=save-estimate]').count(),0);
    });
    await check('All allowed desktop routes render for all seven roles',async()=>{
      for(const r of ['employee','manager','hr','sector','operations','estimator','executive']){await role(r);const pages=await page.locator('#sidebar [data-page]').evaluateAll(xs=>xs.map(x=>x.dataset.page));for(const p of pages){await nav(p);assert(await page.locator('h1').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${r}/${p} desktop overflow`);}}
      await nav('architecture');await page.screenshot({path:path.join(root,'qa','architecture-desktop.png'),fullPage:true,animations:'disabled'});
    });
    await check('Arabic RTL mobile routes fit and navigation works',async()=>{
      await click('language');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.setViewportSize({width:390,height:844});
      for(const r of ['employee','manager','hr','sector','operations','estimator','executive']){await role(r);const pages=await page.locator('#sidebar [data-page]').evaluateAll(xs=>xs.map(x=>x.dataset.page));for(const p of pages){await click('menu');await nav(p);assert(await page.locator('h1').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${r}/${p} mobile overflow`);}}
      await role('manager');await click('menu');await nav('home');await page.screenshot({path:path.join(root,'qa','overview-ar-mobile.png'),fullPage:true,animations:'disabled'});
      await click('menu');await nav('hr');await click('new-request');await page.locator('[name=title]').fill('فني تجريبي');await page.locator('[name=a]').fill('1');await page.locator('#request-form [type=submit]').click();assert.match(await page.locator('main').innerText(),/فني تجريبي/);
    });
    await check('English mobile and Arabic desktop render',async()=>{
      await click('language');await click('menu');await nav('home');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await click('language');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(root,'qa','overview-ar-desktop.png'),fullPage:true,animations:'disabled'});
    });
    await check('Esc closes dialog',async()=>{await nav('hr');await click('new-request');await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);});
    await check('No browser runtime errors or failed page assets',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);});
  } catch(e) {results.push({name:'Failure',result:'FAIL',error:e.message});await page.screenshot({path:path.join(root,'qa','failure.png'),fullPage:true,animations:'disabled'});process.exitCode=1;}
  fs.writeFileSync(path.join(root,'qa','results.json'),JSON.stringify({testedAt:new Date().toISOString(),scope:'Local synthetic design prototype, not Frappe/Odoo integration or production security',results,errors,failed},null,2));
  console.log(JSON.stringify({results,errors,failed},null,2));await browser.close();
})();
