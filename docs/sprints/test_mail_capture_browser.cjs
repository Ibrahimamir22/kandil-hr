/* Native EN/AR local mail capture proof. Private fixture credentials; no external delivery. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('node:assert/strict');
const {chromium} = require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runId = process.argv[2];
assert.match(runId || '', /^[a-f0-9]{12}$/);
const app = path.resolve(__dirname, '../..'), bench = path.resolve(app, '../..');
const fixturePath = path.join(bench, 'sites/kandil-parity.localhost/private', `kandil-browser-${runId}.json`);
const fixture = JSON.parse(fs.readFileSync(fixturePath));
assert.equal(fixture.run_id, runId);
assert.equal(fixture.company, 'Kandil BROWSER TEST ' + runId);
assert.equal(fixture.purpose, 'hiring-request-mail-capture-browser');
assert.equal(fixture.cleaned, false);
const base = 'http://localhost:8102';
const out = path.join(__dirname, 'evidence/browser/mail-capture', runId);
assert(!fs.existsSync(path.join(out, 'results.json')), 'Use a fresh run ID; retain previous results');
fs.mkdirSync(out, {recursive:true});
const sourcePaths = [
  'kandil_hr/foundation/mail_capture.py', 'kandil_hr/foundation/outbox.py',
  'kandil_hr/foundation/outbox_access.py', 'kandil_hr/foundation/security.py',
  'kandil_hr/foundation/files.py', 'kandil_hr/hooks.py',
  'kandil_hr/kandil_hr/doctype/kandil_mail_capture/kandil_mail_capture.json',
  'kandil_hr/kandil_hr/doctype/kandil_mail_capture/kandil_mail_capture.js',
  'kandil_hr/foundation/mail_capture_browser_fixtures.py',
  'kandil_hr/recruitment/browser_fixture.py', 'docs/sprints/test_mail_capture_browser.cjs',
];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, digest(fs.readFileSync(path.join(app,p)))]));
const beforeHashes = hashes();

(async () => {
  const checks = [], runtimeErrors = [], captures = [];
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  async function check(name, fn) {
    try {await fn(); checks.push({name,status:'PASS'}); console.log('PASS ' + name);}
    catch(e) {checks.push({name,status:'FAIL',error:e.message}); process.exitCode=1; console.log('FAIL ' + name);}
  }
  async function login(key) {
    const context = await browser.newContext({viewport:{width:1440,height:1040},acceptDownloads:true});
    const account = fixture.users[key];
    assert.equal(account.email, `browser-${runId}-${key}@example.invalid`);
    const response = await context.request.post(base+'/api/method/login',{form:{usr:account.email,pwd:account.password}});
    assert.equal(response.status(),200,'Synthetic login must succeed');
    return context;
  }
  try {
    await check('Native delivery replay retains one capture and one notification per event', async () => {
      assert.deepEqual(Object.keys(fixture.mail_captures).sort(),['ar','en']);
      for(const value of Object.values(fixture.mail_captures)) {
        assert.equal(value.capture_count,1); assert.equal(value.notification_delta,1);
        assert.equal(value.replay_status,'Delivered locally');
      }
    });
    for(const locale of ['en','ar']) await check(`Native ${locale} recipient form and actual EML download`, async () => {
      const expected = fixture.mail_captures[locale];
      const context = await login(expected.user_key);
      try {
        const page = await context.newPage(); page.setDefaultTimeout(15000);
        page.on('pageerror', error => runtimeErrors.push(error.message));
        await page.goto(base+'/desk/kandil-mail-capture/'+encodeURIComponent(expected.name),{waitUntil:'networkidle'});
        await page.waitForFunction(name => window.cur_frm?.doctype==='Kandil Mail Capture' && cur_frm.doc?.name===name, expected.name);
        assert.equal(await page.evaluate(()=>frappe.boot.lang),locale);
        assert.equal(await page.evaluate(()=>cur_frm.doc.status),'Captured locally');
        const label = await page.evaluate(()=>__('Download captured mail'));
        if(locale==='ar') assert.notEqual(label,'Download captured mail');
        const downloadPromise = page.waitForEvent('download',{timeout:30000});
        await page.getByRole('button',{name:label,exact:true}).click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(),expected.name+'.eml');
        const tempPath = await download.path();
        const bytes = fs.readFileSync(tempPath);
        assert.equal(digest(bytes),expected.content_hash);
        const mime = bytes.toString('utf8');
        assert(mime.includes('X-Kandil-Delivery: Captured locally; no provider transmission'));
        assert(mime.includes('Content-Type: text/plain'));
        assert(mime.includes('Content-Type: text/html'));
        assert(mime.includes('To: '+fixture.users[expected.user_key].email));
        assert(!mime.includes('Bcc:') && !mime.includes('Cc:'));
        await download.delete(); // Do not persist MIME or private fixture data in evidence.
        captures.push({locale,name:expected.name,bytes:bytes.length,sha256:digest(bytes)});
        await page.screenshot({path:path.join(out,`recipient-${locale}-native.png`),fullPage:true});
      } finally {await context.close();}
    });
    await check('Same-company HR outsider is denied native record and mail download', async () => {
      const context = await login('hr');
      try {
        for(const expected of Object.values(fixture.mail_captures)) {
          const native = await context.request.get(base+'/api/resource/Kandil%20Mail%20Capture/'+encodeURIComponent(expected.name));
          assert.equal(native.status(),403);
          const download = await context.request.get(base+'/api/method/kandil_hr.foundation.mail_capture.download?'+new URLSearchParams({name:expected.name}));
          assert.equal(download.status(),403);
        }
      } finally {await context.close();}
    });
    await check('Native capture pages have no client runtime errors',async()=>assert.deepEqual(runtimeErrors,[]));
    await check('Source hashes remain unchanged during browser proof',async()=>assert.deepEqual(hashes(),beforeHashes));
  } finally {
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({
      checked_at:new Date().toISOString(),site:'kandil-parity.localhost',run_id:runId,
      result:checks.length===6 && checks.every(c=>c.status==='PASS')?'PASS':'FAIL',
      checks,captures,runtimeErrors,source_hashes:beforeHashes,source_unchanged:JSON.stringify(hashes())===JSON.stringify(beforeHashes),
      limitations:['Synthetic local capture only; no email provider transmission or inbox delivery.',
        'Replay assertions are prepared by the guarded native fixture; browser exercises recipient UI/download and outsider denial.',
        'Cleanup is a separate required CLI step retaining immutable history. Downloaded copies cannot be revoked.'],
    },null,2)+'\n');
    await browser.close();
  }
})().catch(()=>{console.error('Mail capture browser run failed; inspect sanitized results.');process.exitCode=1;});
