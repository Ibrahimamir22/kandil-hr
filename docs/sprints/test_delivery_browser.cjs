/* Synthetic parity-only native UI proof. Credentials are read only from the private fixture. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('node:assert/strict');
const {chromium} = require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runId = process.argv[2];
assert.match(runId || '', /^[a-f0-9]{12}$/);
const app = path.resolve(__dirname, '../..'), bench = path.resolve(app, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(bench, 'sites/kandil-parity.localhost/private', `kandil-browser-${runId}.json`)));
assert.equal(fixture.company, 'Kandil BROWSER TEST ' + runId);
assert.equal(fixture.purpose, 'document-delivery-and-revocation-browser');
const out = path.join(__dirname, 'evidence/browser/document-delivery', runId), base = 'http://localhost:8102';
fs.mkdirSync(out, {recursive:true});
const sourcePaths=['kandil_hr/organization/document_delivery.py','kandil_hr/organization/documents.py','kandil_hr/public/js/document_delivery.js','kandil_hr/foundation/delegation.py','kandil_hr/kandil_hr/doctype/kandil_delegation/kandil_delegation.js','kandil_hr/organization/delivery_browser_fixture.py','docs/sprints/test_delivery_browser.cjs'];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,p))).digest('hex')]));
const sourceHashes=hashes();
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
  const checks = [], captures = [], runtimeErrors = [];
  async function check(name, fn) {
    try {await fn(); checks.push({name, status:'PASS'}); console.log('PASS ' + name);}
    catch (e) {checks.push({name, status:'FAIL', error:e.message}); process.exitCode = 1; console.log('FAIL ' + name + ': ' + e.message);}
  }
  async function login(key) {
    const context = await browser.newContext({viewport:{width:1440,height:1040},acceptDownloads:true});
    const user = fixture.users[key];
    assert.equal((await context.request.post(base + '/api/method/login', {form:{usr:user.email,pwd:user.password}})).status(),200);
    return context;
  }
  async function form(context, doctype, name) {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => runtimeErrors.push(e.message));
    await page.goto(base + '/desk/' + doctype.toLowerCase().replaceAll(' ', '-') + '/' + encodeURIComponent(name), {waitUntil:'networkidle'});
    await page.waitForFunction(({doctype,name})=>window.cur_frm?.doctype===doctype && window.cur_frm?.doc?.name===name,{doctype,name});
    return page;
  }
  async function label(page, value) {return page.evaluate(value=>__(value),value);}
  async function action(page, group, entry) {
    await page.getByRole('button',{name:await label(page,group),exact:true}).click();
    await page.getByRole('menuitem',{name:await label(page,entry),exact:true}).click();
  }
  for (const language of ['en','ar']) await check(`Native ${language} HR captures approved JD with private HTML and PDF`, async()=>{
    const context = await login(language==='en'?'hr':'hr_ar');
    try {
      const page = await form(context,'Kandil JD Revision',fixture.jd);
      assert.equal(await page.evaluate(()=>frappe.boot.lang),language);
      await action(page,'Documents','Capture document delivery locally');
      const dialog=page.locator('.modal:visible').last();
      await dialog.locator('[data-fieldname="recipients"] .form-control').first().click();
      const item=dialog.locator('.selectable-item').filter({hasText:fixture.users.recipient.email});
      await item.click();
      await dialog.locator('.modal-title').click();
      await dialog.locator('select[data-fieldname="language"]').selectOption(language);
      await dialog.locator('textarea[data-fieldname="note"]').fill(language==='ar'?'اختبار محلي فقط — لا يتم إرسال بريد.':'Synthetic local capture only — no email transmission.');
      await page.screenshot({path:path.join(out,`capture-${language}-dialog.png`),fullPage:true});
      await dialog.getByRole('button',{name:await label(page,'Capture locally'),exact:true}).click();
      await page.waitForFunction(()=>window.cur_frm?.doctype==='Kandil Document Delivery' && !!window.cur_frm?.doc?.name,{},{timeout:60000});
      const doc=await page.evaluate(()=>({name:cur_frm.doc.name,status:cur_frm.doc.status,language:cur_frm.doc.language}));
      assert.equal(doc.status,'Captured locally'); assert.equal(doc.language,language); captures.push(doc);
      await page.locator('.modal:visible .btn-modal-close').click().catch(()=>{});
      await page.screenshot({path:path.join(out,`capture-${language}-saved.png`),fullPage:true});
    } finally {await context.close();}
  });
  await check('Recipient native download returns actual composed EML, HTML and PDF attachment',async()=>{
    assert.equal(captures.length,2);
    const context=await login('recipient');
    try {for(const doc of captures) {
      const page=await form(context,'Kandil Document Delivery',doc.name);
      const downloadPromise=page.waitForEvent('download',{timeout:30000});
      await page.getByRole('button',{name:await label(page,'Download captured mail'),exact:true}).click();
      const download=await downloadPromise;
      const target=path.join(out,`recipient-${doc.language}.eml`);await download.saveAs(target);
      const mime=fs.readFileSync(target,'utf8');
      assert(mime.includes('X-Kandil-Delivery: Captured locally'));
      assert(mime.includes('Content-Type: text/html'));assert(mime.includes('Content-Type: application/pdf'));
      assert(mime.includes('Content-Disposition: attachment'));
      const pdfPart=mime.split('Content-Type: application/pdf')[1];
      const body=pdfPart.split(/\r?\n\r?\n/)[1].split(/\r?\n--/)[0];
      assert.equal(Buffer.from(body.replace(/\s/g,''),'base64').subarray(0,5).toString(),'%PDF-');
      await page.screenshot({path:path.join(out,`recipient-${doc.language}-native.png`),fullPage:true});
      await page.close();
    }} finally {await context.close();}
  });
  await check('Outsider cannot download captured mail or original document',async()=>{
    assert.equal(captures.length,2);const context=await login('outsider');
    try {
      for(const doc of captures) assert.equal((await context.request.get(base+'/api/method/kandil_hr.organization.document_delivery.download?'+new URLSearchParams({name:doc.name}))).status(),403);
      assert.equal((await context.request.get(base+'/api/method/kandil_hr.organization.documents.download_pdf?'+new URLSearchParams({name:fixture.jd,language:'ar',kind:'jd'}))).status(),403);
    } finally {await context.close();}
  });
  for(const language of ['en','ar']) await check(`Native ${language} delegation revocation requires and records reason`,async()=>{
    const context=await login(language==='en'?'sector':'sector_ar');
    try {
      const page=await form(context,'Kandil Delegation',fixture.delegations[language]);
      assert.equal(await page.evaluate(()=>frappe.boot.lang),language);
      await action(page,'Delegation actions','Revoke delegation');
      const dialog=page.locator('.modal:visible').last();
      const primary=dialog.locator('.btn-modal-primary');
      await primary.click();
      const errors=page.locator('.modal:visible').filter({has:page.locator('.msgprint')});
      if(await errors.count()) await errors.last().locator('.btn-modal-close').click();
      assert.equal(await page.evaluate(()=>!!cur_frm.doc.revoked),false);
      await dialog.locator('textarea[data-fieldname="revocation_reason"]').fill(language==='ar'?'إلغاء تفويض اختبار محلي موثق.':'Documented synthetic browser revocation.');
      await page.screenshot({path:path.join(out,`revoke-${language}-reason.png`),fullPage:true});
      await primary.click();
      await page.waitForFunction(()=>window.cur_frm?.doc?.revoked===1 && !window.cur_frm.is_dirty());
      assert((await page.evaluate(()=>cur_frm.doc.revocation_reason)).length>10);
      await page.screenshot({path:path.join(out,`revoke-${language}-saved.png`),fullPage:true});
    } finally {await context.close();}
  });
  await check('Capture and revocation UI have no client runtime errors',async()=>assert.deepEqual(runtimeErrors,[]));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checked_at:new Date().toISOString(),site:'kandil-parity.localhost',run_id:runId,checks,captures,runtimeErrors,source_hashes:sourceHashes,source_unchanged:JSON.stringify(sourceHashes)===JSON.stringify(hashes()),limitations:['Synthetic data only. Captured locally; no email provider or external transmission.','HR content and deployment policy sign-off remain separate.']},null,2)+'\n');
  await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
