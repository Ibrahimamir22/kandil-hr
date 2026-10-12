// v0.35.0: data layer and Apps Script limits — fresh cached copies used under the lock, writes dropped on error, the
// generation set before a sheet read, old cache chunks removed, column indexes, the daily job in resumable steps,
// expired rows deleted (never a table rewrite), log archive, per-entity timeline cache, photos by row, e-mail priorities,
// signed apply time, cell size limit, big script properties, rechecks under the lock, English dictionary on demand.
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'أمين خزينة', 'مراقب جودة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['فني تشغيل'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), rm: tAs(U.rm), rec1: tAs(U.rec1) };
const meId = ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID;

const store = require('./mocks').store;
const anySS = Object.values(store)[0];
const RangeP = Object.getPrototypeOf(anySS.getSheets()[0].getRange(1, 1));
let GV = 0; const gv0 = RangeP.getValues; RangeP.getValues = function () { GV++; return gv0.call(this); };
const cache = ctx.CacheService.getScriptCache();

// ============ 1. under the lock: the cached copy is used when its generation is current ============
fresh(); ctx.all_('VACANCIES');                         // cache VACANCIES (outside the lock)
fresh(); GV = 0;
const v0 = ctx.all_('VACANCIES')[0];
ctx.withLock_(() => ctx.update_('VACANCIES', v0.Vacancy_ID, { Public_Summary: 'تحديث تحت القفل' }, 'T'));
ok(GV <= 1, 'update under the lock read no full sheet (only ID/sequence tables): ' + GV);
fresh(); ok(ctx.get_('VACANCIES', v0.Vacancy_ID).Public_Summary === 'تحديث تحت القفل', 'the write is there');
// another "user" writes: our copy from before the lock is dropped when we take the lock
fresh(); ctx.load_('VACANCIES');
const genMine = ctx.REPO_.tables.VACANCIES.gen;
cache.put('TG_VACANCIES', 'otherwriter', 21600);          // someone else retired it meanwhile
ctx.withLock_(() => { ok(!ctx.REPO_.tables.VACANCIES, 'stale copy dropped when the lock is taken (gen ' + genMine + ' ≠ current)'); });

// ============ 2. an error under the lock writes nothing ============
fresh();
const before = ctx.get_('VACANCIES', v0.Vacancy_ID).Public_Summary;
try { ctx.withLock_(() => { ctx.update_('VACANCIES', v0.Vacancy_ID, { Public_Summary: 'نص ناقص' }, 'T'); throw new Error('boom'); }); } catch (e) {}
fresh(); ok(ctx.get_('VACANCIES', v0.Vacancy_ID).Public_Summary === before, 'held-back write dropped after an error');

// ============ 3. generation exists before the sheet is read; old chunks removed ============
fresh(); cache.remove('TG_LOCATIONS');
ctx.REPO_.gens = null; ctx.load_('LOCATIONS');
const g1 = cache.get('TG_LOCATIONS');
ok(!!g1 && ctx.REPO_.tables.LOCATIONS.gen === g1, 'generation created before the read and the copy stored under it');
ok(!!cache.get('TS_LOCATIONS_' + g1 + '_n'), 'copy cached');
fresh(); const loc = ctx.all_('LOCATIONS')[0];
ctx.withLock_(() => ctx.update_('LOCATIONS', loc.Location_ID, { Transport_Zone: 'x' }, 'T'));
ok(!cache.get('TS_LOCATIONS_' + g1 + '_n') && !cache.get('TS_LOCATIONS_' + g1 + '_0'), 'retired copy\'s chunks removed');

// ============ 4. column index stays right after updates ============
fresh();
const apps = ctx.all_('APPLICATIONS'), a0 = apps[0], vid = a0.Vacancy_ID;
const n0 = ctx.find_('APPLICATIONS', { Vacancy_ID: vid }).length;
ctx.withLock_(() => {
  ok(ctx.find_('APPLICATIONS', { Vacancy_ID: vid }).length === n0, 'index lookup = scan');
  ctx.update_('APPLICATIONS', a0.Application_ID, { Vacancy_ID: 'VAC-MOVED' }, 'T');
  ok(ctx.find_('APPLICATIONS', { Vacancy_ID: vid }).length === n0 - 1 && ctx.find_('APPLICATIONS', { Vacancy_ID: 'VAC-MOVED' }).length === 1, 'index follows an update');
  ctx.update_('APPLICATIONS', a0.Application_ID, { Vacancy_ID: vid }, 'T');
  const ids = ctx.find_('APPLICATIONS', { Vacancy_ID: vid }).map(x => x.Application_ID), scan = ctx.all_('APPLICATIONS').filter(x => x.Vacancy_ID === vid).map(x => x.Application_ID);
  ok(JSON.stringify(ids) === JSON.stringify(scan), 'same rows in the same order as a full scan');
});

// ============ 5. the daily job in steps, carried on after the time limit ============
fresh();
const pr = ctx.PropertiesService.getScriptProperties();
pr.setProperty('DAILY_RUN', '2000-01-01');
vm.runInContext('DAILY_BUDGET_MS_ = -1', ctx);              // stop after the first step
let out = ctx.runDaily_(true);
let prog = JSON.parse(pr.getProperty('DAILY_PROGRESS'));
ok(out.continued && prog.done.length === 1 && !prog.complete, 'stopped after one step and asked to continue: ' + prog.done.join(','));
ok(ctx.ScriptApp.__triggers.some(t => t.fn === 'dailyMoreTrigger'), 'continuation scheduled');
vm.runInContext('DAILY_BUDGET_MS_ = 270000', ctx);
const tr = ctx.ScriptApp.__triggers.find(t => t.fn === 'dailyMoreTrigger');
fresh(); out = ctx.dailyMoreTrigger({ triggerUid: tr.getUniqueId() });
prog = JSON.parse(pr.getProperty('DAILY_PROGRESS'));
ok(prog.complete && prog.done.indexOf(prog.done[0]) === 0 && new Set(prog.done).size === prog.done.length, 'continuation finished the rest, nothing twice');
ok(!ctx.ScriptApp.__triggers.some(t => t.fn === 'dailyMoreTrigger'), 'continuation trigger removed itself');
fresh(); ok(ctx.runDaily_(true).skipped, 'done for today');

// ============ 6. housekeeping deletes expired rows only ============
fresh();
ctx.withLock_(() => {
  ['2000-01-01T00:00:00', ctx.addDaysIso_(5)].forEach((exp, i) => ctx.insert_('SESSIONS', { Session_ID: ctx.nextId_('SESSION'), User_ID: 'U-X' + i, Token_Hash: 'h' + i, Expires_At: exp, Last_Seen_At: '', Revoked_At: '', Revoked_By: '', User_Agent: '' }, 'T'));
});
fresh(); const live0 = ctx.all_('SESSIONS').filter(s => s.Expires_At >= ctx.addDaysIso_(-30)).length;
const del = ctx.deleteRowsWhere_('SESSIONS', s => s.Expires_At < ctx.addDaysIso_(-30));
fresh(); ok(del >= 1 && ctx.all_('SESSIONS').length === live0 && ctx.all_('SESSIONS').some(s => s.User_ID === 'U-X1'), 'expired sessions deleted, live ones kept (' + del + ')');

// ============ 7. log archive: old audit rows move to the archive spreadsheet ============
fresh();
ctx.withLock_(() => { const ids = ctx.nextIds_('AUDIT', 1); ctx.insertMany_('AUDIT_LOG', [{ Audit_ID: ids[0], Timestamp: '2001-01-01T00:00:00', User_ID: 'T', On_Behalf_Of: '', Entity_Type: 'X', Entity_ID: 'X1', Action: 'OLD', Field: '', Old_Value: '', New_Value: '', Reason: '', Session_ID: '' }], 'T'); });
// move it to the top (logs are in time order)
const auSh = ctx.sheet_('AUDIT_LOG'), last = auSh.data.length; const row = auSh.data.splice(last - 1, 1)[0]; auSh.data.splice(1, 0, row);
pr.deleteProperty('LOG_ARCHIVE_MONTH');
const arc = ctx.archiveLogsMonthly_();
fresh(); ok(arc.AUDIT_LOG >= 1 && !ctx.all_('AUDIT_LOG').some(a => a.Action === 'OLD'), 'old audit rows left the live sheet');
const ash = ctx.SpreadsheetApp.openById(pr.getProperty('ARCHIVE_SS_ID')).getSheetByName('AUDIT_LOG');
ok(ash && ash.data.some(r => r.indexOf('OLD') >= 0), 'and are in the archive');

// ============ 8. timeline cache ============
fresh();
const reqId = ctx.all_('RECRUITMENT_REQUESTS')[0].Request_ID;
ctx.eventsFor_('REQUEST', reqId);
fresh(); GV = 0; const e1 = ctx.eventsFor_('REQUEST', reqId);
const evReads = GV;
ok(e1.length >= 1, 'timeline has events');
ctx.event_(null, 'REQUEST', reqId, 'NOTE', 'حدث جديد للاختبار');
fresh(); const e2 = ctx.eventsFor_('REQUEST', reqId);
ok(e2.length === e1.length + 1 && e2[e2.length - 1].Comment === 'حدث جديد للاختبار', 'a new event shows at once');
ok(evReads <= 1, 'second read from the cache (no EVENTS sheet read): ' + evReads);

// ============ 9. photos: one row, never the whole sheet ============
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
must(api('photo.set', tO, { id: 'U:' + meId, data: JPG }), 'photo set');
cache.remove('PH_U:' + meId);
const phSh = ctx.sheet_('PHOTOS'); let full = 0; const gr0 = phSh.getRange.bind(phSh);
phSh.getRange = (r, c, nr, nc) => { if ((nr || 1) > 1 && (nc || 1) > 1) full++; return gr0(r, c, nr, nc); };
const g = must(api('photo.get', tO, { ids: ['U:' + meId] }), 'photo get');
ok(g['U:' + meId] === JPG && full === 0, 'a missing photo is read from its own row (no whole-sheet read)');
must(api('photo.set', tO, { id: 'U:' + meId, data: '' }), 'photo removed');
cache.remove('PH_U:' + meId);
ok(must(api('photo.get', tO, { ids: ['U:' + meId] }), 'photo get 2')['U:' + meId] === '', 'removed');
phSh.getRange = gr0;

// ============ 10. e-mail priorities ============
fresh(); ctx.update_('CONFIG', 'EMAIL_DAILY_BUDGET', { Config_Value: '40' }, 'x');
pr.setProperty('MAIL_DAY', ctx.today_()); pr.setProperty('MAIL_COUNT', '20');
fresh(); ok(!ctx.mailOk_('DIGEST') && ctx.mailOk_('APPROVAL') && ctx.mailOk_('CANDIDATE'), 'digest stops at half the budget');
pr.setProperty('MAIL_COUNT', '12');
fresh(); ok(ctx.mailOk_('DIGEST'), 'digest below half');
pr.setProperty('MAIL_COUNT', '33');
fresh(); ok(!ctx.mailOk_('APPROVAL') && ctx.mailOk_('CANDIDATE'), 'approvals leave the candidate reserve');
ok(ctx.all_('NOTIFICATIONS').some(n => /قربت تخلص/.test(n.Title)), 'owner told when 80% is used');
fresh(); ctx.update_('CONFIG', 'EMAIL_DAILY_BUDGET', { Config_Value: '80' }, 'x'); pr.setProperty('MAIL_COUNT', '0');

// ============ 11. apply page: server-signed time ============
fresh(); const vac = ctx.all_('VACANCIES').find(v => v.Apply_Code && ['OPEN', 'PREPARATION', 'APPROVED'].indexOf(v.Status) >= 0);
if (vac) {
  ctx.__noStamp = true;
  const base = { code: vac.Apply_Code, Full_Name: 'متقدم اختبار التوقيت', Mobile: '01098765432', consent: 'Y', consentTransfer: 'Y', consentVersion: ctx.cfg_('PRIVACY_VERSION', '1'), elapsed: 20000, Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '2' };
  let r = pub('apply.submit', base);
  ok(!r.ok && /حدّث الصفحة/.test(r.error), 'no stamp → reload');
  r = pub('apply.submit', Object.assign({}, base, { stamp: Date.now() + '.0123456789abcdef01234567' }));
  ok(!r.ok && /حدّث الصفحة/.test(r.error), 'forged stamp refused');
  const old = String(Date.now() - 7 * 3600 * 1000);
  r = pub('apply.submit', Object.assign({}, base, { stamp: old + '.' + ctx.hash_('APPLY:' + vac.Apply_Code + ':' + old).slice(0, 24) }));
  ok(!r.ok && /حدّث الصفحة/.test(r.error), 'page open more than 6 hours → reload');
  const info = pub('apply.info', { code: vac.Apply_Code }).data;
  ok(/^\d+\.[0-9a-f]{24}$/.test(info.stamp), 'the page gets a signed stamp');
  ctx.__noStamp = false;
} else ok(true, 'no open vacancy with an apply code');

// ============ 12. limits: cell size, big properties ============
let threw = false; try { ctx.withLock_(() => ctx.update_('VACANCIES', v0.Vacancy_ID, { Public_Summary: 'x'.repeat(60000) }, 'T')); } catch (e) { threw = /50 ألف/.test(e.message); }
ok(threw, 'a value over 50,000 characters is refused before writing');
const big = JSON.stringify(Array.from({ length: 3000 }, (_, i) => 'POS-' + i));
ctx.propPutBig_('TEST_BIG', big);
ok(ctx.propGetBig_('TEST_BIG') === big && big.length > 9216, 'a value over 9 KB kept in parts (' + big.length + ' chars)');
ctx.propDelBig_('TEST_BIG'); ok(ctx.propGetBig_('TEST_BIG') === null, 'and deleted');

// ============ 13. rechecks under the lock ============
fresh();
const live = ctx.all_('APPLICATIONS').find(a => a.Stage === 'NEW' || a.Stage === 'CONTACTED');
if (live) {
  const stale = Object.assign({}, live, { Updated_At: '2000-01-01T00:00:00' });   // the page was read before the change
  ctx.withLock_(() => ctx.update_('APPLICATIONS', live.Application_ID, { Next_Action: 'حد تاني عدّل' }, 'T'));
  // the page was read before that change: simulate by moving with the old Updated_At
  const L0 = ctx.loadApp_;
  vm.runInContext('var __L0 = loadApp_;', ctx);
  ctx.loadApp_ = function (c, id, f) { const r = L0(c, id, f); if (id === live.Application_ID) r.app = stale; return r; };
  vm.runInContext('loadApp_ = this.loadApp_;', ctx);
  const r = api('cand.move', tO, { Application_ID: live.Application_ID, to: live.Stage === 'NEW' ? 'CONTACTED' : 'SCREENING' });
  ok(!r.ok && /حد عدّل على ده قبلك/.test(r.error), 'a move based on an old copy is refused');
  vm.runInContext('loadApp_ = __L0;', ctx); ctx.loadApp_ = L0;
} else ok(true, 'no live application');

// ============ 14. English dictionary only when needed ============
ok(vm.runInContext('I18N_EN_', ctx) === null || typeof vm.runInContext('I18N_EN_', ctx) === 'object', 'dictionary variable present');
vm.runInContext('I18N_EN_ = null; I18N_SERVER_TR_ = null;', ctx);
ctx.tr_('موافقة', 'ar');
ok(vm.runInContext('I18N_EN_', ctx) === null, 'Arabic never loads the English dictionary');
ctx.tr_('موافقة', 'en');
ok(vm.runInContext('I18N_EN_', ctx) !== null, 'English loads it on first use');

console.log(`phase35: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
