const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=__dirname, key='kandil-hr-portal-prototype-v1';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[],external=[],checks=[];let last='startup';
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith('http://localhost:8114')&&!r.url().startsWith('file:'))external.push(r.url())});
 const click=async(a,scope=page)=>scope.locator(`[data-action="${a}"]:visible`).first().click();
 const data=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const check=(name)=>{last=name;checks.push(name)};
 const shot=async n=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,n+'.png'),fullPage:true});};
 try{
 await page.goto('http://localhost:8114');await shot('01-login-ar');
 await click('login');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');check('Arabic login and role dashboard');await shot('02-dashboard-ar');
 await click('new');await page.locator('#qty-0').fill('0');await click('next');assert.match(await page.locator('#form-error').textContent(),/عددًا صحيحًا/);check('Invalid quantities stay on form');
 await page.locator('#qty-0').fill('50');await click('next');assert.match(await page.locator('#form-error').textContent(),/يتجاوز/);check('Demo capacity rejection keeps input');
 await page.locator('#qty-0').fill('2');await click('add-line');await page.locator('#qty-1').fill('1');await shot('03-request-ar');await click('next');
 await page.locator('#reason').fill('توسيع فريق التكاليف لمتابعة التشغيل في الموقعين.');await page.locator('#start').fill('2026-11-15');await click('save-draft');
 await page.reload();await click('next');assert.match(await page.locator('#reason').inputValue(),/توسيع/);check('Draft survives browser reload');
 await click('language');assert.equal(await page.locator('html').getAttribute('dir'),'ltr');assert.match(await page.locator('#reason').inputValue(),/توسيع/);check('Language switch preserves draft');
 await shot('04-request-en');await click('next');await shot('05-review-en');await click('submit-request');await page.locator('[data-action="review-submitted"]').waitFor();
 let d=await data(),r=d.requests.find(r=>r.id==='HR-2026-044');assert.equal(r.status,'pending');assert.equal(r.lines.length,2);check('Two-location request submitted');
 await click('review-submitted');assert.equal((await data()).role,'hr');await shot('06-approval-en');await click('approve-start');await click('approve-confirm');await click('goto',page.locator('.modal'));
 d=await data();assert.equal(d.requests.find(r=>r.id==='HR-2026-044').status,'approved');assert.equal(d.vacancies.filter(v=>v.request==='HR-2026-044').length,2);check('HR approval creates exactly one vacancy per location');
 await shot('07-vacancies-en');await page.locator('[data-action="vacancy"][data-id="HR-2026-044-V1"]').click();await page.locator('#lead').selectOption('salma');await click('save-lead');assert.equal((await data()).vacancies.find(v=>v.id==='HR-2026-044-V1').lead,'salma');check('Lead recruiter assignment persists');
 await page.locator('[data-action="vacancy"][data-id="HR-2026-044-V1"]').click();await click('toggle-vacancy');assert.equal((await data()).vacancies.find(v=>v.id==='HR-2026-044-V1').status,'paused');check('Pause vacancy changes view');
 await page.locator('[data-action="filter"][data-filter="paused"]').click();assert.equal(await page.locator('.vacancy-card').count(),1);await page.locator('[data-action="vacancy"]').click();await click('toggle-vacancy');check('Resume vacancy and status filter');
 await page.locator('[data-route="approvals"]').click();await page.locator('[data-action="detail"][data-id="HR-2026-041"]').click();await click('return-start');await click('return-confirm');assert.match(await page.locator('#return-error').textContent(),/5 characters/);await page.locator('#return-note').fill('Please explain the expected workload across the team.');await click('return-confirm');check('Return requires reviewer note');
 await page.locator('#demo-role').selectOption('manager');await page.locator('[data-route="requests"]').click();await page.locator('[data-action="detail"][data-id="HR-2026-041"]').first().click();assert.equal(await page.locator('[data-action="approve-start"]').count(),0);await click('revise');await click('next');await page.locator('#reason').fill('The expanded workload requires two accountants for weekly cost reports.');await click('next');await click('submit-request');await page.locator('[data-action="review-submitted"]').waitFor();assert.equal((await data()).requests.find(r=>r.id==='HR-2026-041').revision,2);check('Requester revision preserves history and increments version');await click('close');
 await click('search');await page.locator('#global-search').fill('HR-2026-044');assert.equal(await page.locator('.search-result').count(),3);await page.keyboard.press('Escape');check('Global search returns request and related vacancies');
 await click('language');await page.locator('[data-route="vacancies"]').click();await shot('08-vacancies-ar');await page.locator('[data-route="dashboard"]').click();
 await page.setViewportSize({width:390,height:844});await page.reload();await shot('09-dashboard-mobile-ar');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('Arabic mobile dashboard has no page overflow');
 await click('menu');await page.locator('.sidebar-close').click();assert.equal(await page.locator('.sidebar').isVisible(),false);await click('menu');await page.locator('[data-route="requests"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('Mobile navigation and scrollable request table');await click('new');await shot('10-request-mobile-ar');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('Mobile request wizard layout');
 await click('language');await shot('11-request-mobile-en');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('English mobile layout');
 await page.setViewportSize({width:1440,height:1050});await page.goto('http://localhost:8114/#dashboard');await click('guide');await click('reset-start');await click('reset-confirm');assert.equal((await data()).requests.length,3);assert.equal((await data()).vacancies.length,3);check('Scoped demo reset restores sample state');
 await click('profile');await click('logout');assert.equal(await page.locator('#enter-prototype').count(),1);check('Sign out returns to demo login');
 // Test durable file entry as well as the temporary preview server.
 const filePage=await browser.newPage({viewport:{width:1440,height:1000}});filePage.on('pageerror',e=>errors.push(e.message));await filePage.goto('file://'+path.resolve(root,'../dist/index.html'));await filePage.locator('#enter-prototype').click();assert.equal(await filePage.locator('h1').count(),1);check('Offline file entry loads and enters dashboard');await filePage.close();
 assert.equal(errors.length,0);assert.equal(external.length,0);check('No browser errors or external network calls');
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({status:'passed',checked_at:new Date().toISOString(),checks,errors,external,scope:'Synthetic browser interactions only. No backend, authentication-security, load or production acceptance is implied.'},null,2));
 console.log(JSON.stringify({status:'passed',checks:checks.length,errors,external}));
 }catch(e){await page.screenshot({path:path.join(root,'failure.png'),fullPage:true});fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({last,checks,error:e.message,errors},null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
