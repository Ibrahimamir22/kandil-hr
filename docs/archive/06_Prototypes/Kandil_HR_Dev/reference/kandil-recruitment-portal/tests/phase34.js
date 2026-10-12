// v0.34.0: review fixes — deletion reaches every copy, recruiters cannot take candidates outside their vacancies,
// sign-in reveals nothing and cannot burn the e-mail limit, editor-only functions, separation of duties (no self roles /
// positions / delegations; CEO and Board roles by the owner or HR sector manager), offboarding, National ID at joining,
// AI spend booked before the call, zip-bomb .docx refused.
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

// ============ 1. a recruiter cannot take a candidate outside his vacancies ============
fresh();
// keep rec1 on one vacancy only (the demo puts her on many)
const firstVR = ctx.all_('VACANCY_RECRUITERS').find(r => r.User_ID === U.rec1 && r.Active === 'Y');
ctx.withLock_(() => ctx.all_('VACANCY_RECRUITERS').filter(r => r.User_ID === U.rec1 && r.Active === 'Y' && r.VR_ID !== firstVR.VR_ID)
  .forEach(r => ctx.update_('VACANCY_RECRUITERS', r.VR_ID, { Active: 'N' }, 'T')));
fresh();
const mineV = {}; ctx.all_('VACANCY_RECRUITERS').filter(r => r.User_ID === U.rec1 && r.Active === 'Y').forEach(r => { mineV[r.Vacancy_ID] = 1; });
const myVacId = Object.keys(mineV)[0];
const foreignApp = ctx.all_('APPLICATIONS').find(a => !mineV[a.Vacancy_ID] && !ctx.all_('APPLICATIONS').some(b => b.Person_ID === a.Person_ID && mineV[b.Vacancy_ID]));
ok(!!myVacId && !!foreignApp, 'demo data: a vacancy of rec1 and a candidate on someone else\'s vacancy');
const FP = ctx.get_('PERSONS', foreignApp.Person_ID);
const base = { Vacancy_ID: myVacId, Source: 'WALK_IN', consent: 'Y', Full_Name: 'أي اسم', Mobile: '01099998888' };
bad(api('cand.create', T2.rec1, Object.assign({}, base, { usePersonId: FP.Person_ID })), /مش على شواغرك/, 'linking another person by number alone refused');
// merge needs access to the target too
fresh();
const myApp = ctx.all_('APPLICATIONS').find(a => mineV[a.Vacancy_ID] && ctx.get_('PERSONS', a.Person_ID).Status === 'Active' && a.Person_ID !== FP.Person_ID);
bad(api('cand.dup', T2.rec1, { Person_ID: myApp.Person_ID, action: 'MERGE', Target_Person_ID: FP.Person_ID }), /المرشح الأصلي/, 'merge into a candidate you have no access to refused');
// search: contact details masked outside your vacancies, at least 3 letters
const q = FP.Full_Name.split(' ')[0];
const S = must(api('cand.search', T2.rec1, { q }), 'search');
const hit = S.find(x => x.Person_ID === FP.Person_ID);
ok(hit && hit.masked && (!FP.Mobile || hit.Mobile !== FP.Mobile) && (!FP.Mobile || /•/.test(hit.Mobile)), 'contact details masked for someone else\'s candidate');
const mine = S.find(x => !x.masked);
ok(!mine || /^[^•]*$/.test(mine.Mobile), 'own candidates unmasked');
ok(must(api('cand.search', T2.rec1, { q: 'م' }), 'short search').length === 0, 'one letter → nothing');
if (FP.Mobile) {
  const r1 = api('cand.create', T2.rec1, Object.assign({}, base, { Mobile: FP.Mobile, usePersonId: FP.Person_ID }));
  ok(r1.ok || !/مش على شواغرك/.test(r1.error), 'linking with his real mobile (the duplicate check) still works → ' + (r1.ok ? 'ok' : r1.error));
}

// ============ 2. deletion reaches AI readings, photo, notifications, audit values ============
fresh();
const delApp = ctx.all_('APPLICATIONS').find(a => ['REJECTED', 'WITHDRAWN'].indexOf(a.Stage) >= 0 && ctx.get_('PERSONS', a.Person_ID).Status === 'Active' &&
  ctx.get_('PERSONS', a.Person_ID).Is_Employee !== 'Y' && !ctx.all_('APPLICATIONS').some(b => b.Person_ID === a.Person_ID && ctx.LIVE_STAGES_().indexOf(b.Stage) >= 0));
ok(!!delApp, 'a closed candidate to delete');
const DP = ctx.get_('PERSONS', delApp.Person_ID);
ctx.withLock_(() => {
  ctx.insert_('CV_AI_RUNS', { Run_ID: ctx.nextId_('CV_AI_RUN'), Person_ID: DP.Person_ID, Application_ID: delApp.Application_ID, Vacancy_ID: delApp.Vacancy_ID, CV_File_ID: 'F', Model: 'm', Status: 'OK', Input_Tokens: '1', Output_Tokens: '1', Cost_USD: '0.01', Result_JSON: '{"fields":{"Full_Name":"x"}}', Error: '' }, 'T');
  ctx.insert_('PHOTOS', { Photo_ID: 'P:' + DP.Person_ID, Data: 'data:image/png;base64,AAAA' }, 'T');
  ctx.insert_('NOTIFICATIONS', { Notification_ID: ctx.nextId_('NOTIFICATION'), User_ID: meId, Title: 'مرشح ' + DP.Full_Name, Body: 'اتصل بـ ' + DP.Full_Name, Link_Type: '', Link_ID: '', Read_At: '' }, 'T');
});
ctx.audit_(null, { userId: meId, entityType: 'PERSON', entityId: DP.Person_ID, action: 'UPDATE', field: 'Mobile', oldValue: '01011112222', newValue: '01033334444' });
ctx.flushAudit_();
must(api('privacy.purge', tO, { Person_ID: DP.Person_ID, reason: 'طلب المرشح حذف بياناته' }), 'purge');
fresh();
ok(ctx.all_('CV_AI_RUNS').filter(r => r.Person_ID === DP.Person_ID).every(r => !r.Result_JSON), 'AI readings blanked on deletion (v0.33 bug fixed)');
const ph = ctx.get_('PHOTOS', 'P:' + DP.Person_ID); ok(!ph || !ph.Data, 'photo removed on deletion');
ok(!ctx.all_('NOTIFICATIONS').some(n => (n.Title + n.Body).indexOf(DP.Full_Name) >= 0), 'name removed from notifications');
ok(ctx.all_('AUDIT_LOG').filter(a => a.Entity_ID === DP.Person_ID && a.Field === 'Mobile').every(a => a.Old_Value === 'محذوف' || a.Old_Value === ''), 'old values in the audit log replaced');
const DP2 = ctx.get_('PERSONS', DP.Person_ID);
ok(DP2.Status === 'Purged' && !DP2.Governorate && !DP2.Gender && !DP2.Education, 'governorate / gender / education deleted too');
// withdrawing the pool consent no longer wipes the AI reading (it was the wrong place)
fresh();
const poolApp = ctx.all_('APPLICATIONS').find(a => ctx.get_('PERSONS', a.Person_ID).Status === 'Active' && a.Person_ID !== FP.Person_ID);
ctx.withLock_(() => { ctx.insert_('CV_AI_RUNS', { Run_ID: ctx.nextId_('CV_AI_RUN'), Person_ID: poolApp.Person_ID, Application_ID: poolApp.Application_ID, Vacancy_ID: poolApp.Vacancy_ID, CV_File_ID: 'F', Model: 'm', Status: 'OK', Input_Tokens: '1', Output_Tokens: '1', Cost_USD: '0', Result_JSON: '{"x":1}', Error: '' }, 'T');
  ctx.poolConsentWithdraw_('T', poolApp.Person_ID, 'PHONE', 'x'); });
fresh(); ok(ctx.all_('CV_AI_RUNS').some(r => r.Person_ID === poolApp.Person_ID && r.Result_JSON), 'pool consent withdrawal keeps the reading (only deletion removes it)');

// ============ 3. sign-in reveals nothing; codes limited for the whole portal ============
let r = pub('auth.requestCode', { email: 'nobody@x.com' });
ok(r.ok && r.data.message === ctx.GENERIC_CODE_MSG, 'unknown address: the usual answer');
const v1 = pub('auth.verifyCode', { email: 'nobody@x.com', code: '123456' });
const v2 = pub('auth.verifyCode', { email: 'owner@test.com', code: '000000' });
ok(!v1.ok && !v2.ok && v1.error === v2.error, 'verify: same message for an unknown address and a wrong code');
fresh(); ctx.update_('CONFIG', 'LOGIN_CODES_HOURLY_MAX', { Config_Value: '1' }, 'x');
fresh(); ctx.withLock_(() => ctx.insert_('LOGIN_CODES', { Code_ID: ctx.nextId_('LOGIN_CODE'), Email: 'z@z.z', Code_Hash: 'h', Expires_At: ctx.addMinutesIso_(10), Attempts: '0', Used_At: '' }, 'T'));
mails.length = 0;
r = pub('auth.requestCode', { email: 'owner@test.com' });
ok(r.ok && mails.length === 0, 'portal-wide hourly cap reached → same answer, no e-mail');
fresh(); ctx.update_('CONFIG', 'LOGIN_CODES_HOURLY_MAX', { Config_Value: '40' }, 'x');

// ============ 4. editor-only functions ============
ctx.Session.__active = '';                                    // a browser visitor (the web app runs as the owner for anyone)
['setupSystem', 'installTriggers', 'clearPortalCache', 'bootstrapOwner', 'authorizeCvAi', 'emergencyResetAuthenticator'].forEach(fn => {
  let threw = false; try { ctx[fn](); } catch (e) { threw = /editor/.test(e.message); }
  ok(threw, fn + ' refused from a browser');
});
let threw = false; try { ctx.dailyTrigger({ triggerUid: 'made-up' }); } catch (e) { threw = /editor/.test(e.message); }
ok(threw, 'dailyTrigger with a made-up trigger id refused');
const trig = ctx.ScriptApp.newTrigger('dailyTrigger').timeBased().everyDays(1).create();
threw = false; try { ctx.dailyTrigger({ triggerUid: trig.getUniqueId() }); } catch (e) { threw = true; console.log(e.message); }
ok(!threw, 'dailyTrigger from its own trigger runs');
ctx.ScriptApp.deleteTrigger(trig);
ctx.Session.__active = 'owner@test.com';
threw = false; try { ctx.clearPortalCache(); } catch (e) { threw = true; } ok(!threw, 'from the editor it runs');

// ============ 5. separation of duties ============
bad(api('users.setRoles', T2.hr, { User_ID: U.hr, roles: [{ Role_Code: 'HR_MANAGER' }, { Role_Code: 'CEO' }], reason: 'x' }), /أدوارك انت/, 'nobody changes his own roles');
bad(api('users.setRoles', T2.hr, { User_ID: U.rec1, roles: [{ Role_Code: 'CEO' }], reason: 'x' }), /الرئيس التنفيذي/, 'HR manager cannot grant the CEO role');
bad(api('users.setRoles', T2.hr, { User_ID: U.rec1, roles: [{ Role_Code: 'BOARD' }], reason: 'x' }), /مجلس الإدارة/, 'HR manager cannot grant the Board role');
fresh(); const hrU = ctx.get_('USERS', U.hr);
bad(api('users.save', T2.hr, { User_ID: U.hr, Email: hrU.Email, Full_Name_AR: hrU.Full_Name_AR, Position_ID: P['الرئيس التنفيذي'].Position_ID, Status: 'Active' }), /وظيفتك انت/, 'nobody moves himself to another position');
fresh(); const recU = ctx.get_('USERS', U.rec1);
bad(api('users.save', T2.hr, { User_ID: U.rec1, Email: recU.Email, Full_Name_AR: recU.Full_Name_AR, Position_ID: P['الرئيس التنفيذي'].Position_ID, Status: 'Active' }), /مدير وحدة/, 'HR manager cannot put someone on a unit head position');
bad(api('dlg.save', T2.hr, { From_Position_ID: P['مدير الحسابات'].Position_ID, To_User_ID: U.hr, Effective_To: ctx.addDaysYmd_(ctx.today_(), 5), Reason: 'إجازة' }), /لنفسك/, 'nobody delegates authority to himself');
bad(api('dlg.save', T2.hr, { From_Position_ID: P['الرئيس التنفيذي'].Position_ID, To_User_ID: U.rec1, Effective_To: ctx.addDaysYmd_(ctx.today_(), 5), Reason: 'إجازة' }), /رئيس الشركة/, 'the CEO\'s authority is delegated by the owner / HR sector manager only');

// ============ 6. offboarding: deactivated recruiter → his work back to «not assigned» ============
fresh();
const leadVac = ctx.all_('VACANCIES').find(v => v.Lead_Recruiter_ID === U.rec1 && ctx.VAC_OPEN_.indexOf(v.Status) >= 0);
must(api('users.save', tO, { User_ID: U.rec1, Email: recU.Email, Full_Name_AR: recU.Full_Name_AR, Position_ID: recU.Position_ID, Status: 'Inactive', reason: 'ترك الشغل' }), 'deactivate recruiter');
fresh();
ok(!ctx.all_('VACANCY_RECRUITERS').some(r => r.User_ID === U.rec1 && r.Active === 'Y'), 'team memberships ended');
ok(!leadVac || ctx.get_('VACANCIES', leadVac.Vacancy_ID).Lead_Recruiter_ID === '', 'vacancy back to «not assigned»');
ok(!ctx.all_('APPLICATIONS').some(a => a.Owner_User_ID === U.rec1 && ctx.LIVE_STAGES_().indexOf(a.Stage) >= 0), 'no live candidate owned by him');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rm && /أخصائي جديد/.test(n.Title)), 'recruitment manager told');
ok(!ctx.all_('SESSIONS').some(s => s.User_ID === U.rec1 && !s.Revoked_At), 'his sessions closed');

// an employee who leaves: his portal account closes
fresh();
const empWithUser = ctx.all_('USERS').find(u => u.Status === 'Active' && u.Employee_ID && ctx.get_('EMPLOYEES', u.Employee_ID) && ctx.get_('EMPLOYEES', u.Employee_ID).Status === 'Active' && u.User_ID !== meId);
if (empWithUser) {
  must(api('emp.exit', tO, { Employee_ID: empWithUser.Employee_ID, Last_Working_Date: ctx.addDaysYmd_(ctx.today_(), -1), reasonCode: 'RESIGNATION', note: 'استقالة' }), 'exit');
  fresh(); ok(ctx.get_('USERS', empWithUser.User_ID).Status === 'Inactive', 'the leaver\'s portal account is closed');
} else ok(true, 'no employee with an account in the demo data');

// ============ 7. AI: zip bomb refused before unpacking ============
const bomb = (() => { const n = Buffer.from('word/document.xml'), c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(500 * 1024 * 1024, 24); c.writeUInt16LE(n.length, 28);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + n.length, 12); e.writeUInt32LE(0, 16);
  return Array.from(Buffer.concat([c, n, e])).map(x => x > 127 ? x - 256 : x); })();
ok(ctx.zipUnpackedSize_(bomb) === 500 * 1024 * 1024 && ctx.cvaiDocxText_(bomb) === '', 'a .docx that unpacks to 500 MB is never unpacked');
ok(ctx.zipUnpackedSize_([1, 2, 3]) === Infinity, 'not a zip → refused');

// ============ 8. National ID required at joining (tested in phase14) · HR edit reason (phase2) ============

console.log(`phase34: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
