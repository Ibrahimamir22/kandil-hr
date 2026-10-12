// Employees screen: import the review workbook (xlsx), list, employee card, exit → manager's replacement request, fill by code.
// Needs SheetJS locally: XLSX_JS=/path/to/xlsx.full.min.js (served in place of the cdnjs URL).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'التجاري', '', '', '', '', 'رئيس القطاع التجاري', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'التجاري', 'المعارض', '', '', '', 'مدير المعارض', 'الفروع', '', 'Y', '', ''],
  ['قنديل مصر', 'التجاري', 'المعارض', '', '', '', 'أخصائي مبيعات', 'الفروع', '', '', '', '30'],
  ['قنديل مصر', 'التجاري', 'المخازن', '', '', '', 'أمين مخزن', 'العبور', '', '', '', '2']].map(r => r.join(T)).join('\n') });
fresh(); const grp = ctx.all_('LOCATIONS').find(l => l.Name_AR === 'الفروع');
api('locations.save', tO, { Location_ID: grp.Location_ID, Name_AR: 'الفروع', Location_Type: 'BRANCH_GROUP', Status: 'Active' });
['فرع النزهة', 'فرع المعادي'].forEach(n => api('locations.save', tO, { Name_AR: n, Location_Type: 'SHOWROOM', Governorate: 'القاهرة' }));
fresh();
const PID = t => ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === t).Position_ID;
const SALES = PID('أخصائي مبيعات'), STORE = PID('أمين مخزن'), MGR = PID('مدير المعارض');
// manager of the showrooms has a portal account
api('users.save', tO, { Email: 'mgr@t.com', Full_Name_AR: 'مدير المعارض', Position_ID: MGR });

// ---- the review workbook (same sheets/headers as Kandil-Employees-Mapping-Review.xlsx)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emp-'));
const book = path.join(tmp, 'review.xlsx');
execFileSync('python3', ['-c', `
import openpyxl,sys
wb=openpyxl.Workbook(); wb.active.title='اقرأني'
d=wb.create_sheet('التوزيعات'); d.append(['رقم التوزيعة','الوظيفة (في التقييم)','القسم (في التقييم)','الوحدة','القطاع','عدد الموظفين','بلاغات تبعية','الثقة في الاقتراح','المقترح: الوظيفة في الهيكل','المقترح: المسار في الهيكل','المقترح: الموقع','بدائل','✅ المكان المعتمد','الفرع المعتمد','ملاحظات'])
d.append(['T001','بائع','المعارض','','',3,'','عالية','','','','','${SALES} | أخصائي مبيعات | المعارض | الفروع','فرع النزهة',''])
d.append(['T002','امين مخزن','المخازن','','',2,'','عالية','','','','','${STORE} | أمين مخزن | المخازن | مصنع العبور','',''])
d.append(['T003','مدير معارض','المعارض','','',1,'','عالية','','','','','${MGR} | مدير المعارض | المعارض | الفروع','',''])
e=wb.create_sheet('الموظفين'); e.append(['الكود','الاسم','تاريخ التعيين','نوع الوظيفة','حالة العمل','الوظيفة (في التقييم)','القسم','الوحدة','المدير المباشر','رقم التوزيعة','بلاغ تبعية مفتوح','تعديل لموظف بعينه (كود المكان)'])
e.append([220001,'احمد السيد على','2010-09-10','فني','يعمل','بائع','المعارض','','','T001','',''])
e.append([220002,'محمود حسن فؤاد','2019-01-01','فني','يعمل','بائع','المعارض','','','T001','','${SALES} فرع المعادي'])
e.append([220003,'كريم عادل سامي','2021-05-05','فني','يومية','بائع','المعارض','','','T001','',''])
e.append([220004,'سامح فتحي','2015-02-02','إداري','يعمل','امين مخزن','المخازن','','','T002','',''])
e.append([220005,'هاني رضا','2016-03-03','إداري','يعمل','امين مخزن','المخازن','','','T002','',''])
e.append([220006,'وائل مدير المعارض','2012-04-04','مدير إدارة','يعمل','مدير معارض','المعارض','','','T003','',''])
e.append([220007,'تامر بدون توزيعة','2020-01-01','فني','يعمل','؟','','','','T099','',''])
m=wb.create_sheet('المديرين'); m.append(['الاسم (في برنامج التقييم)','الإيميل','الكود المقترح','الاسم في سجل الموظفين','المطابقة','موجود في شيت الموظفين؟','✅ الكود المعتمد','ملاحظات'])
m.append(['وائل مدير المعارض','mgr@t.com','220006','وائل مدير المعارض','مطابق','نعم','220006',''])
wb.save(sys.argv[1])`, book]);

const XLSX_JS = process.env.XLSX_JS || path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
if (!fs.existsSync(XLSX_JS)) { console.log('CRASH needs the SheetJS library: npm i --prefix tests --no-save xlsx@0.18.5 (or set XLSX_JS)'); process.exit(1); }
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(XLSX_JS, 'utf8') }));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  await open(tO);
  await page.evaluate(() => go('emps')); await page.waitForSelector('#emList .msg');
  await page.screenshot({ path: OUT + '/e-1-empty.png' });
  // import
  await page.click('#emImp'); await page.waitForSelector('#eiFile');
  await page.setInputFiles('#eiFile', book);
  await page.waitForSelector('#eiGo', { timeout: 15000 });
  const read = await page.textContent('#eiRead'); if (!/7/.test(read) || !/تعديل فردي/.test(read)) errors.push('read summary: ' + read);
  const errRows = await page.$$eval('#eiPrev details tbody tr', r => r.length); if (errRows !== 1) errors.push('error rows ' + errRows);
  await page.screenshot({ path: OUT + '/e-2-import-preview.png', fullPage: true });
  await page.check('#eiSkip'); await page.check('#eiUsers');
  await page.click('#eiGo'); await page.waitForSelector('#eiDone');
  await page.screenshot({ path: OUT + '/e-3-import-done.png' });
  fresh();
  if (ctx.all_('EMPLOYEES').length !== 6) errors.push('employees ' + ctx.all_('EMPLOYEES').length);
  if (ctx.get_('EMPLOYEES', '220002').Location_ID !== ctx.all_('LOCATIONS').find(l => l.Name_AR === 'فرع المعادي').Location_ID) errors.push('override branch');
  if (ctx.get_('EMPLOYEES', '220003').Employment_Kind !== 'DAILY') errors.push('daily');
  if (ctx.get_('POSITIONS', STORE).Occupied_HC !== '2' || ctx.get_('POSITIONS', SALES).Occupied_HC !== '3') errors.push('recount');
  if (ctx.findUserByEmail_('mgr@t.com').Employee_ID !== '220006') errors.push('manager user linked');
  // list + card
  await page.click('#eiDone'); await page.waitForSelector('tr[data-emp]');
  const rows = await page.$$eval('tr[data-emp]', r => r.length); if (rows !== 6) errors.push('list rows ' + rows);
  await page.screenshot({ path: OUT + '/e-4-list.png' });
  await page.fill('#emQ', 'سامح'); await page.waitForFunction(() => { const r = document.querySelectorAll('tr[data-emp]'); return r.length === 1 && /سامح/.test(r[0].textContent); });
  await page.click('tr[data-emp]'); await page.waitForSelector('.modal .facts');
  await page.screenshot({ path: OUT + '/e-5-card.png' });
  // end of service with a future last day
  await page.click('#mActions >> text=نهاية خدمة'); await page.waitForSelector('#exD');
  const d = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
  await page.fill('#exD', d); await page.selectOption('#exR', 'RESIGNATION');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.modal .msg.warn');
  await page.screenshot({ path: OUT + '/e-6-leaving.png' });
  await page.click('#mActions >> text=إغلاق');
  // transfer between branches
  await page.fill('#emQ', 'احمد السيد'); await page.waitForFunction(() => { const r = document.querySelectorAll('tr[data-emp]'); return r.length === 1 && /احمد/.test(r[0].textContent); });
  await page.click('tr[data-emp]'); await page.waitForSelector('.modal .facts');
  await page.click('#mActions >> text=نقل'); await page.waitForSelector('#etPQ');
  await page.fill('#etPQ', 'أخصائي'); await page.waitForSelector('#etPRes [data-pp]'); await page.click('#etPRes [data-pp]');
  await page.selectOption('#etPBr', { label: 'فرع المعادي' }); await page.fill('#etW', 'احتياج فرع المعادي');
  await page.screenshot({ path: OUT + '/e-7-transfer.png' });
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.modal .facts');
  const loc = await page.textContent('.modal .facts'); if (!/فرع المعادي/.test(loc)) errors.push('transfer not shown');
  // the showrooms manager gets the replacement notice (the storekeeper's manager is the sector head — no user), so test with a sales exit
  await page.click('#mActions >> text=نهاية خدمة'); await page.waitForSelector('#exD');
  await page.fill('#exD', d); await page.selectOption('#exR', 'RESIGNATION'); await page.click('#mActions .btn.primary'); await page.waitForSelector('.modal .msg.warn');
  // position modal is read-only for occupied now
  await page.evaluate(() => closeModal());
  // manager opens his notification → prefilled replacement request
  const tM = login('mgr@t.com'); await open(tM);
  await page.click('#btnBell'); await page.waitForSelector('#nList [data-lt="EMP_EXIT"]');
  await page.click('#nList [data-lt="EMP_EXIT"]'); await page.waitForSelector('#rfLines .rowline');
  const type = await page.$eval('#rfType', s => s.value); if (type !== 'REPLACEMENT') errors.push('type ' + type);
  const rep = await page.$eval('#rfReps [data-k="Employee_ID"]', i => i.value); if (rep !== '220001') errors.push('rep code ' + rep);
  const br = await page.$eval('#rfLines [data-br]', s => s.options[s.selectedIndex].textContent); if (br !== 'فرع المعادي') errors.push('rep branch ' + br);
  await page.screenshot({ path: OUT + '/e-8-replacement-request.png', fullPage: true });
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
