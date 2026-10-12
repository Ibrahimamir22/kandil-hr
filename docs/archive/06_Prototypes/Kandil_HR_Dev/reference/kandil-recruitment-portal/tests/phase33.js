// v0.33.0: profile photos — thumbnails of candidates and users in their own sheet, fetched in one call per screen
// (cached one by one), candidate photos follow candidate access, apply page photo, privacy deletion, demo wipe.
const fs = require('fs'), path = require('path');
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مراجع حسابات', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مشرف إنتاج', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'عامل تعبئة', 'العبور', '', '', '', '5'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'فني معمل', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'مراجع حسابات', 'أمين خزينة', 'مراقب جودة', 'فني معمل', 'مشرف إنتاج'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['محصل', 'فني تشغيل', 'عامل تعبئة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
// real data that must survive the wipe: a real HR user (with a manager position) and a real employee
const real = must(api('users.save', tO, { Email: 'real.hr@t.com', Full_Name_AR: 'مستخدم حقيقي', Position_ID: P['مدير الحسابات'].Position_ID }), 'real user');
must(api('users.setRoles', tO, { User_ID: real.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'real roles');
const tR = login('real.hr@t.com');

// v0.36: the wipe is asked by an HR user and approved (and run) by the owner
function wipeVia(p) {
  fresh(); let d = ctx.all_('DUAL_REQUESTS').find(x => x.Kind === 'WIPE' && x.Status === 'PENDING');
  if (!d) { const rq = api('dual.request', login('real.hr@t.com'), { Kind: 'WIPE', reason: p.reason || 'مسح بعد الاختبار' }); if (!rq.ok) return rq; d = rq.data; }
  const r = api('dual.decide', tO, { Dual_ID: d.Dual_ID, decision: 'APPROVE', phrase: p.phrase, code: p.code, comment: '' });
  return r.ok ? { ok: true, data: r.data.data } : r;
}
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };
const tPlain = (() => { must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user'); return login('plain@t.com'); })();
// a real 2×2 JPEG
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
fresh();
const meId = ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID;
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING'].indexOf(a.Stage) >= 0);
const PID = app.Person_ID;

// users: own photo
let r = must(api('photo.set', tO, { id: 'U:' + meId, data: JPG }), 'my photo');
ok(r.data === JPG, 'saved');
let g = must(api('photo.get', T2.rec1, { ids: ['U:' + meId] }), 'any user sees user photos');
ok(g['U:' + meId] === JPG, 'user photo visible to colleagues');
bad(api('photo.set', T2.rec1, { id: 'U:' + meId, data: JPG }), /صورتك إنت بس/, 'cannot set someone else\'s photo');
must(api('photo.set', T2.hr, { id: 'U:' + U.rec1, data: PNG }), 'HR admin may set a user photo');
bad(api('photo.set', tO, { id: 'U:' + meId, data: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }), /JPG أو PNG/, 'gif refused');
bad(api('photo.set', tO, { id: 'U:' + meId, data: 'data:image/jpeg;base64,' + Buffer.from('not an image').toString('base64') }), /مش صورة/, 'fake jpeg refused');
bad(api('photo.set', tO, { id: 'U:' + meId, data: 'data:image/jpeg;base64,' + 'A'.repeat(50000) }), /صغيرة/, 'too big refused');
bad(api('photo.set', tO, { id: 'X:1', data: JPG }), /غير معروفة/, 'bad id');

// candidates: follow candidate access
must(api('photo.set', tO, { id: 'P:' + PID, data: JPG, photoConsent: 'Y' }), 'candidate photo');
g = must(api('photo.get', tO, { ids: ['P:' + PID, 'U:' + meId, 'U:' + U.rec1, 'P:CND-999999'] }), 'batch');
ok(g['P:' + PID] === JPG && g['U:' + U.rec1] === PNG && g['P:CND-999999'] === '', 'one call returns the batch (missing = empty)');
g = must(api('photo.get', tPlain, { ids: ['P:' + PID, 'U:' + meId] }), 'plain user');
ok(!('P:' + PID in g) && g['U:' + meId] === JPG, 'no candidate access → no candidate photo');
bad(api('photo.set', tPlain, { id: 'P:' + PID, data: JPG }), /صلاحية/, 'no access → cannot set candidate photo');

// cached one by one: the second batch reads no sheet
const anySS = Object.values(require('./mocks').store)[0];
const RangeP = Object.getPrototypeOf(anySS.getSheets()[0].getRange(1, 1));
let gv = 0; const gv0 = RangeP.getValues; RangeP.getValues = function () { if (this.sh.name === 'PHOTOS') gv++; return gv0.call(this); };
must(api('photo.get', tO, { ids: ['P:' + PID, 'U:' + meId, 'P:CND-999999'] }), 'again');
ok(gv === 0, 'second batch from the cache (incl. «no photo»): ' + gv);
// the PHOTOS table is not kept as a whole-table copy, and the persons table did not grow
fresh(); ok(!ctx.tcOn_('PHOTOS'), 'PHOTOS not cached as a whole table');
ok(!ctx.all_('PERSONS')[0].hasOwnProperty('Photo'), 'candidate table unchanged');
// removing
must(api('photo.set', tO, { id: 'P:' + PID, data: '' }), 'remove');
g = must(api('photo.get', tO, { ids: ['P:' + PID] }), 'after remove'); ok(g['P:' + PID] === '', 'removed (cache refreshed)');
must(api('photo.set', tO, { id: 'P:' + PID, data: JPG }), 'set again');

// apply page: optional photo; a bad one never stops the application
fresh();
const v = ctx.all_('VACANCIES').find(x => ['OPEN', 'PARTIALLY_FILLED'].indexOf(x.Status) >= 0 && x.Apply_Code);
if (v) {
  const base = { code: v.Apply_Code, Full_Name: 'سارة محمود علي', Mobile: '01112223334', consent: 'Y', consentVersion: ctx.cfg_('PRIVACY_VERSION', '1'), consentTransfer: 'Y', elapsed: 60000, Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3', answers: {} };
  let a0 = pub('apply.submit', Object.assign({}, base, { photo: JPG, Mobile: '01112223399' }));
  fresh(); const per0 = ctx.all_('PERSONS').find(x => x.Mobile === '01112223399');
  ok(a0.ok && per0 && !ctx.get_('PHOTOS', 'P:' + per0.Person_ID), 'v0.38: no photo consent → the photo is not kept');
  let a1 = pub('apply.submit', Object.assign({}, base, { photo: JPG, consentPhoto: 'Y' }));
  if (!a1.ok) console.log('apply: ' + a1.error);
  fresh(); const per = ctx.all_('PERSONS').find(x => x.Mobile === '01112223334');
  ok(per && ctx.get_('PHOTOS', 'P:' + per.Person_ID) && ctx.get_('PHOTOS', 'P:' + per.Person_ID).Data === JPG, 'apply page photo saved');
  let a2 = pub('apply.submit', Object.assign({}, base, { Mobile: '01112223335', Full_Name: 'هدى سامي حسن', photo: 'data:image/jpeg;base64,xx' }));
  ok(a2.ok, 'bad photo does not stop the application');
} else ok(true, 'no open vacancy with an apply code (skipped)');

// privacy and demo wipe
fresh(); ctx.photoPurge_('x', PID); fresh();
ok(!ctx.get_('PHOTOS', 'P:' + PID).Data, 'privacy deletion blanks the photo');
g = must(api('photo.get', tO, { ids: ['P:' + PID] }), 'after purge'); ok(g['P:' + PID] === '', 'and its cached copy');
must(api('photo.set', tO, { id: 'P:' + PID, data: JPG }), 'set again 2');
fresh(); must(wipeVia({ phrase: 'امسح الحركات', reason: 'اختبار الصور' }), 'wipe');
fresh();
ok(!ctx.all_('PHOTOS').some(x => x.Photo_ID.indexOf('P:') === 0), 'wipe removes candidate photos');
ok(ctx.all_('PHOTOS').some(x => x.Photo_ID === 'U:' + meId) && !ctx.all_('PHOTOS').some(x => x.Photo_ID === 'U:' + U.rec1), 'real user photo kept, demo user photo removed');
ok(fs.readFileSync(path.join(__dirname, '..', 'src', 'Security.gs'), 'utf8').indexOf("'photo.get'") > 0, 'consultant may view photos');
console.log('phase33: ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
