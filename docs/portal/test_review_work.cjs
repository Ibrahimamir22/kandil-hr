/* Read-only candidate-work smoke check on the persistent synthetic review site.
 * Credentials are read privately; no candidate writes, account reset or cleanup.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),workspace=path.resolve(app,'../../..');
const privatePath=path.join(workspace,'frappe-bench/sites/kandil-review.localhost/private/kandil-review-accounts.json');
const data=JSON.parse(fs.readFileSync(privatePath)),origin='http://kandil-review.localhost:8112';
const out=path.join(__dirname,'evidence','review-work-'+Date.now());fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],failures=[],external=[];let browser;
function check(name,condition){assert.ok(condition,name);checks.push({name,status:'PASS'});console.log('PASS',name)}
function snapshot(){return JSON.parse(execFileSync('docker',['compose','-f','deployment/review.compose.yaml','exec','-T','web','bench','--site',data.site,'execute','kandil_hr.portal.review_setup.inspect'],{cwd:app,env:{...process.env,KANDIL_DEV_WORKSPACE:workspace},encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(x=>x.startsWith('{')).at(-1))}
(async()=>{try{
 const before=snapshot();
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 for(const lang of ['en','ar']){
  const ctx=await browser.newContext({viewport:lang==='en'?{width:1440,height:1000}:{width:390,height:844}});const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)failures.push(r.status())});p.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin)});
  await p.goto(origin+'/hr-portal');await p.locator('input[name=usr]').waitFor();
  const language=p.getByRole('button',{name:lang==='en'?'English':'العربية',exact:true});if(await language.count())await language.click();
  await p.locator('input[name=usr]').fill(data.users.personal.email);await p.locator('input[name=pwd]').fill(data.users.personal.password);await p.locator('.login-submit').click();await p.locator('main.content[aria-busy="false"]').waitFor();
  const menu=p.getByRole('button',{name:/Open navigation|فتح القائمة/});if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Candidate follow-ups':'متابعة المرشحين',exact:true}).click();await p.locator('.candidate-queue[aria-busy="false"] .candidate-pagination').waitFor();
  check(lang+' connected follow-up queue loads with five bucket controls',await p.locator('.candidate-queue [role=alert]').count()===0&&await p.locator('.followup-counts button').count()===5);
  await p.screenshot({path:path.join(out,'review-queue-'+lang+'.png')});
  if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Rejection messages':'رسائل الاعتذار',exact:true}).click();await p.locator('.candidate-message-queue[aria-busy="false"] .candidate-pagination').waitFor();
  check(lang+' connected message queue loads with four task filters',await p.locator('.candidate-message-queue [role=alert]').count()===0&&await p.locator('.candidate-message-queue .followup-counts button').count()===4);
  check(lang+' message queue viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(out,'review-message-queue-'+lang+'.png')});
  if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Message templates':'قوالب الرسائل',exact:true}).click();await p.locator('.message-templates[aria-busy="false"]').waitFor();
  check(lang+' template library is read-only for the personal recruiter',await p.locator('.message-templates [role=alert]').count()===0&&await p.getByRole('button',{name:lang==='en'?'New template':'قالب جديد',exact:true}).count()===0);
  check(lang+' template library viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Privacy notices':'إشعارات الخصوصية',exact:true}).click();await p.locator('.privacy-notices[aria-busy="false"] .current-privacy-notice').waitFor();
  check(lang+' personal privacy notice is read-only and no legal text is seeded',await p.locator('.privacy-notices [role=alert]').count()===0&&await p.locator('.privacy-notice-editor').count()===0&&await p.locator('.privacy-notice-history').count()===0&&await p.locator('.current-privacy-notice').getByText(lang==='en'?'No published notice is available. This cannot be treated as consent from any candidate.':'لا يوجد إشعار منشور متاح. لا يمكن اعتبار ذلك موافقة من أي مرشح.',{exact:true}).isVisible());
  await p.locator('.pool-policy[aria-busy="false"] h2').waitFor();
  check(lang+' pool policy has no seeded wording or retention and is read-only',await p.locator('.pool-policy form').count()===0&&await p.locator('.pool-policy [role=alert]').count()===0&&await p.locator('.pool-policy').getByText(lang==='en'?'No published talent-pool policy is available.':'لا توجد سياسة منشورة لقاعدة المرشحين.',{exact:true}).isVisible());
  check(lang+' privacy notice viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(out,'review-privacy-notice-'+lang+'.png')});
  if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Candidates':'المرشحون',exact:true}).click();await p.locator('.candidate-list .candidate-row').first().waitFor();await p.locator('.candidate-list .candidate-row').first().click();await p.locator('.candidate-work[aria-busy="false"] h2').waitFor();
  check(lang+' personal login and one connected work panel',await p.locator('.candidate-work').count()===1&&await p.locator('.local-test-note').isVisible());
  check(lang+' read-only work context loads without errors',await p.locator('.candidate-work [role=alert]').count()===0);
  await p.locator('.candidate-activities[aria-busy="false"] h2').waitFor();
  check(lang+' connected activity panel loads without errors',await p.locator('.candidate-activities').count()===1&&await p.locator('.candidate-activities [role=alert]').count()===0);
  await p.locator('.candidate-consent[aria-busy="false"] h2').waitFor();
  check(lang+' consent panel shows no invented notice or candidate acceptance',await p.locator('.candidate-consent [role=alert]').count()===0&&await p.locator('.candidate-consent').getByText(lang==='en'?'No link issued':'لم يُصدر رابط',{exact:true}).isVisible()&&await p.locator('.candidate-consent form').count()===0);
  await p.locator('.consent-history[aria-busy="false"]').waitFor();
  check(lang+' consent history is empty and no revocation is invented',await p.locator('.consent-history').getByText(lang==='en'?'No links recorded for this application.':'لا توجد روابط مسجلة لهذا الطلب.',{exact:true}).isVisible()&&await p.locator('.consent-revoke').count()===0);
  await p.locator('.candidate-stages[aria-busy="false"] h2').waitFor();
  check(lang+' screening gate requires candidate consent without invented eligibility',await p.locator('.candidate-stages [role=alert]').count()===0&&await p.locator('.candidate-stages form').count()===0&&await p.locator('.candidate-stages').getByText(lang==='en'?'The candidate must accept the privacy notice before screening or reopening.':'يلزم أن يوافق المرشح بنفسه على إشعار الخصوصية قبل بدء الفحص أو إعادة الفتح.',{exact:true}).isVisible());
  await p.locator('.candidate-pool[aria-busy="false"] h2').waitFor();
  check(lang+' pool consent has no invented grant or policy',await p.locator('.candidate-pool [role=alert]').count()===0&&await p.locator('.candidate-pool').getByText(lang==='en'?'No pool consent':'لا توجد موافقة للقاعدة',{exact:true}).isVisible()&&await p.locator('.candidate-pool option[value="GRANT"]').count()===0);
  await p.locator('.candidate-membership[aria-busy="false"] h2').waitFor();
  check(lang+' membership is empty without invented consent',await p.locator('.candidate-membership [role=alert]').count()===0&&await p.locator('.candidate-membership form').count()===0&&await p.locator('.candidate-membership').getByText(lang==='en'?'Not in the pool':'غير مضاف للقاعدة',{exact:true}).isVisible());
  await p.locator('.candidate-closure[aria-busy="false"] h2').waitFor();
  check(lang+' connected closure panel loads without errors',await p.locator('.candidate-closure').count()===1&&await p.locator('.candidate-closure [role=alert]').count()===0);
  await p.locator('.candidate-decision-history[aria-busy="false"]').waitFor();
  check(lang+' decision history loads read-only without errors',await p.locator('.candidate-decision-history [role=alert]').count()===0);
  await p.locator('.candidate-template-composer[aria-busy="false"]').waitFor();
  check(lang+' candidate template choices load without writes or errors',await p.locator('.candidate-template-composer [role=alert]').count()===0);
  check(lang+' viewport and direction',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)&&await p.locator('html').getAttribute('dir')===(lang==='ar'?'rtl':'ltr'));
  await p.locator('.candidate-work').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'review-work-'+lang+'.png')});
  if(await menu.isVisible())await menu.click();
  await p.locator('.nav').getByRole('link',{name:lang==='en'?'Talent pool':'قاعدة المرشحين',exact:true}).click();await p.locator('.talent-pool[aria-busy="false"] h2').waitFor();
  check(lang+' connected pool has no invented memberships',await p.locator('.talent-pool [role=alert]').count()===0&&await p.locator('.talent-pool .candidate-row').count()===0&&await p.locator('.talent-pool .empty').isVisible());
  check(lang+' pool viewport fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await ctx.close();
 }
 check('Review business records preserved',JSON.stringify(before)===JSON.stringify(snapshot()));
 check('No browser errors, server 5xx or external requests',!errors.length&&!failures.length&&!external.length);
}catch(e){checks.push({name:String(e.message).split('\n')[0],status:'FAIL'});process.exitCode=1;console.log('FAIL',String(e.message).split('\n')[0])}
finally{await browser?.close();const result={status:process.exitCode?'FAIL':'PASS',checks,errors,server_failures:failures,external,limits:['Read-only personal-role smoke check; mutation behavior is tested on the separate parity site. No production or capacity certification.']};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,evidence:out}))}
})();
