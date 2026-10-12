// v0.37.0: sign-in and go-live (CHG-82), operations (CHG-79), AI address (CHG-73) — the authenticator for everyone but
// the CEO, sessions of one working day / 7 days with «remember me», the idle lock on the server, the go-live button and
// what it locks, weekly backups and the restore test, the key-rotation and restore reminders, the incident log with
// the 72-hour clock, the daily summary e-mail to managers only, and the far-commute note.
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email, remember) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code, remember: !!remember }).data.token;
}
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
const hoursFromNow = iso => (Date.parse(iso.slice(0, 19) + 'Z') - Date.parse(ctx.nowIso_().slice(0, 19) + 'Z')) / 3600000;
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const user = (email, name, pos, role) => {
  const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + name);
  if (role) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: [{ Role_Code: role }], reason: 'x' }), 'roles ' + name);
  return u.User_ID;
};
const hs = user('hs@t.com', 'مدير القطاع', '', 'HR_SECTOR_MANAGER'), hm = user('hm@t.com', 'مدير الموارد', '', 'HR_MANAGER');
const ceo = user('ceo@t.com', 'الرئيس', P['الرئيس التنفيذي'], 'CEO'), fin = user('fin@t.com', 'مدير المالي', P['مدير القطاع المالي']);
const acc = user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']), dpo = user('dpo@t.com', 'مسؤول البيانات', '');
const tS = login('hs@t.com'), tM = login('hm@t.com'), tA = login('acc@t.com'), tF = login('fin@t.com'), tD = login('dpo@t.com');

// ---------- the authenticator for everyone, the CEO exempt ----------
fresh(); ok(ctx.cfg_('SESSION_HOURS') === 12 && ctx.cfg_('REMEMBER_DAYS') === 7, 'session settings seeded');
ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'ALL' }, 'x');
fresh(); ok(ctx.mfaNeeded_(acc) && ctx.mfaNeeded_(hm) && ctx.mfaNeeded_(dpo), 'ALL: a manager, HR and a user with no role all need the app');
ok(!ctx.mfaNeeded_(ceo), 'the CEO is exempt (trusted phone + PIN)');
let me = must(api('me', tA, {}), 'me manager'); ok(me.security.gate === 'MFA', 'a manager is gated at once');
bad(api('req.list', tA, {}), /Authenticator/, 'gated call refused');
me = must(api('me', login('ceo@t.com'), {}), 'me ceo'); ok(me.security.gate === '', 'the CEO is not gated');
ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'NONE' }, 'x');
// the upgrade turns the old default list into ALL
fresh(); ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'SYS_OWNER,HR_SECTOR_MANAGER,HR_MANAGER,HR_STAFF,RECRUITMENT_MANAGER,RECRUITMENT_SUPERVISOR,RECRUITER,CONSULTANT' }, 'x');
ctx.update_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS', { Config_Value: '3' }, 'x');
ctx.PropertiesService.getScriptProperties().deleteProperty('MIG_0370'); ctx.migrate0370_();
fresh(); ok(ctx.cfg_('TOTP_REQUIRED_ROLES') === 'ALL' && ctx.cfg_('TOTP_AFTER_EMAIL_LOGINS') === 0, 'upgrade: old default → ALL, free sign-ins → 0');
ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'NONE' }, 'x');

// ---------- sessions ----------
const sid = tok => ctx.all_('SESSIONS').find(s => s.Token_Hash === ctx.hash_(tok));
let tok1 = login('acc@t.com', false), tok7 = login('acc@t.com', true);
fresh(); let s1 = sid(tok1), s7 = sid(tok7);
ok(Math.abs(hoursFromNow(s1.Expires_At) - 12) < 0.2 && s1.Remember === '', 'a sign-in lasts 12 hours');
ok(Math.abs(hoursFromNow(s7.Expires_At) - 168) < 0.5 && s7.Remember === 'Y', '«remember me» lasts 7 days');
must(api('ping', tok1, {}), 'ping');
// idle on the server: the last call 40 minutes ago (IDLE_MINUTES 30)
const cache = ctx.CacheService.getScriptCache(), old = ctx.addMinutesIso_(-40);
cache.put('S_' + ctx.hash_(tok1), s1.Session_ID + '|' + old, 21600);
let r = api('todo', tok1, {}); ok(!r.ok && r.auth, 'idle session refused');
fresh(); ok(sid(tok1).Revoked_By === 'IDLE' && sid(tok1).Revoked_At, 'idle session ended on the server');
// a call 20 minutes ago is fine
cache.put('S_' + ctx.hash_(tok7), s7.Session_ID + '|' + ctx.addMinutesIso_(-20), 21600);
must(api('todo', tok7, {}), 'active session within the idle time');
// cache lost: the sheet's last-seen time decides, with 30 more minutes of slack
cache.remove('S_' + ctx.hash_(tok7)); fresh(); ctx.update_('SESSIONS', s7.Session_ID, { Last_Seen_At: ctx.addMinutesIso_(-50) }, 'x');
must(api('todo', tok7, {}), 'cache lost, last seen 50 min ago: still in');
cache.remove('S_' + ctx.hash_(tok7)); fresh(); ctx.update_('SESSIONS', s7.Session_ID, { Last_Seen_At: ctx.addMinutesIso_(-70) }, 'x');
r = api('todo', tok7, {}); ok(!r.ok && r.auth, 'cache lost, last seen 70 min ago: ended');

// ---------- the AI: district + governorate, far commute ----------
fresh(); ctx.update_('LOCATIONS', ctx.all_('LOCATIONS')[0].Location_ID, { Governorate: 'القاهرة' }, 'x');
const loc = ctx.all_('LOCATIONS')[0];
let cm = ctx.cvaiCommute_({ fields: { Governorate: 'محافظة القاهرة', City: 'مدينة نصر' } }, { Location_ID: loc.Location_ID }, {});
ok(!cm.far && cm.area === 'مدينة نصر، محافظة القاهرة', 'same governorate (written differently): no note; area = district, governorate');
cm = ctx.cvaiCommute_({ fields: { Governorate: 'الإسكندرية', City: 'سموحة' } }, { Location_ID: loc.Location_ID }, {});
ok(cm.far && /الإسكندرية/.test(cm.text) && /القاهرة/.test(cm.text), 'different governorate: far-commute note');
ok(ctx.CVAI_FIELDS_.indexOf('National_ID') < 0 && /Never return a National ID/.test(ctx.CVAI_SYSTEM_) && /never a street/.test(ctx.CVAI_SYSTEM_), 'the AI is not asked for the National ID nor a street');

// ---------- weekly backups ----------
const props = ctx.PropertiesService.getScriptProperties();
const wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(ctx.ymdMs_(ctx.today_())).getUTCDay()];
const other = wd === 'FRI' ? 'SAT' : 'FRI';
fresh(); ctx.update_('CONFIG', 'BACKUP_WEEKDAY', { Config_Value: other }, 'x');
fresh(); ok(ctx.backupDaily_() === 'not today', 'not the backup day');
ctx.update_('CONFIG', 'BACKUP_WEEKDAY', { Config_Value: wd }, 'x');
const copies0 = ctx.DriveApp.__copies.length;
fresh(); let br = ctx.backupDaily_();
const nSS = Object.keys(ctx.SS_PROP).filter(g => props.getProperty(ctx.SS_PROP[g])).length;
ok(br === nSS + ' copies' && ctx.DriveApp.__copies.length - copies0 === nSS, 'every spreadsheet copied: ' + br);
ok(ctx.DriveApp.__copies.slice(-1)[0].folder.indexOf(ctx.today_()) >= 0, 'into a dated folder');
fresh(); ok(ctx.backupDaily_() === 'done', 'once a day');
// an entry 10 weeks old goes to the bin on the next backup
let log = JSON.parse(props.getProperty('BACKUP_LOG'));
log = [{ date: ctx.addDaysYmd_(ctx.today_(), -70), folder: 'OLDFOLDER', copies: 4 }].concat(log.map(x => Object.assign({}, x, { date: ctx.addDaysYmd_(ctx.today_(), -7) })));
props.setProperty('BACKUP_LOG', JSON.stringify(log));
fresh(); ctx.backupDaily_();
ok(ctx.DriveApp.__trashed.OLDFOLDER === true, 'backup older than 8 weeks binned');
log = JSON.parse(props.getProperty('BACKUP_LOG'));
ok(log.length === 2 && !log.some(x => x.folder === 'OLDFOLDER'), 'the log keeps the last 8 weeks');
fresh(); ctx.update_('CONFIG', 'BACKUP_WEEKDAY', { Config_Value: 'NONE' }, 'x'); fresh(); ok(ctx.backupDaily_() === 'off', 'NONE = off');

// ---------- the restore test and the reminders ----------
bad(api('ops.restoreTest', tS, { note: 'رجعت نسخة' }), null, 'only the owner records the restore test');
bad(api('ops.restoreTest', tO, { note: 'x' }), /اترجع/, 'note needed');
fresh(); ok(ctx.opsReminders_() === 'restore', 'restore-test reminder when none recorded');
fresh(); ok(ctx.opsReminders_() === 'none', 'once a month');
must(api('ops.restoreTest', tO, { note: 'رجّعت نسخة الأسبوع اللي فات وفتحت الطلبات' }), 'restore test recorded');
fresh(); ok(ctx.cfg_('RESTORE_TEST_LAST') === ctx.today_(), 'date recorded');
let G = must(api('golive.get', tO, {}), 'readiness');
ok(G.auto.some(c => c.code === 'RESTORE' && c.status === 'OK') && G.auto.some(c => c.code === 'BACKUP' && c.status === 'OK'), 'readiness: backup and restore OK');
ok(G.auto.some(c => c.code === 'DPO' && c.status === 'TODO'), 'readiness: no DPO yet');
ok(G.manual.some(m => m.code === 'TRANSFER_LICENCE'), 'readiness: transfer-licence item');
props.setProperty('ANTHROPIC_API_KEY', 'sk-ant-test-key-abcdefghijklmnopqrstuvwxyz');
props.setProperty('CVAI_KEY_SET_AT', ctx.addDaysYmd_(ctx.today_(), -200));
props.deleteProperty('KEY_ROTATE_ASKED');
fresh(); ok(ctx.opsReminders_() === 'key', 'key older than 180 days: reminder');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => /مفتاح الذكاء/.test(n.Title)), 'owner told to rotate the key');
G = must(api('golive.get', tO, {}), 'readiness 2'); ok(G.auto.some(c => c.code === 'KEY' && c.status === 'WARN'), 'readiness: key age warning');
props.deleteProperty('ANTHROPIC_API_KEY');

// ---------- the incident log ----------
bad(api('inc.report', tM, { Detected_At: ctx.today_(), Description: 'تسريب شيت المرشحين', Data_Affected: 'أسماء' }), /تسجيل الحوادث/, 'HR manager cannot report');
bad(api('inc.report', tO, { Detected_At: ctx.today_(), Description: 'قصير', Data_Affected: 'أسماء' }), /اوصف/, 'description needed');
const det = ctx.addMinutesIso_(-60).slice(0, 16);
let inc = must(api('inc.report', tO, { Detected_At: det, Description: 'اتبعت شيت فيه موبايلات مرشحين لعنوان غلط', Data_Affected: 'أسماء وموبايلات', People_Count: '35' }), 'owner reports');
ok(inc.status === 'OPEN' && inc.hoursLeft >= 70 && inc.hoursLeft <= 71, '72-hour clock from detection: ' + inc.hoursLeft);
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === hs && n.Link_ID === inc.id), 'HR Sector Manager told at once');
// no DPO yet: the owner decides
bad(api('inc.update', tS, { Incident_ID: inc.id, op: 'DECIDE', decision: 'NOTIFY', reason: 'بيانات أكتر من 30 شخص' }), /مسؤول حماية/, 'HR Sector Manager does not decide');
// a DPO named: only the DPO decides
fresh(); ctx.update_('CONFIG', 'DPO_USER_ID', { Config_Value: dpo }, 'x');
bad(api('inc.update', tO, { Incident_ID: inc.id, op: 'DECIDE', decision: 'NOTIFY', reason: 'بيانات أكتر من 30 شخص' }), /مسؤول حماية/, 'with a DPO, the owner does not decide');
let L = must(api('inc.list', tD, {}), 'DPO list'); ok(L.canDecide && L.items.length === 1, 'DPO sees and decides');
ok(must(api('todo', tD, {}), 'DPO todo').incidents === 1, 'DPO home count');
bad(api('inc.update', tD, { Incident_ID: inc.id, op: 'DECIDE', decision: 'NOTIFY', reason: 'x' }), /سبب/, 'reason needed');
bad(api('inc.update', tD, { Incident_ID: inc.id, op: 'CLOSE', actions: 'غيرنا الطريقة' }), /بعد القرار/, 'no close before the decision');
inc = must(api('inc.update', tD, { Incident_ID: inc.id, op: 'DECIDE', decision: 'NOTIFY', reason: 'موبايلات 35 شخص اتبعتت لحد برّه الشركة' }), 'DPO decides');
ok(inc.status === 'NOTIFY' && inc.hoursLeft === null, 'decided: the clock stops');
inc = must(api('inc.update', tD, { Incident_ID: inc.id, op: 'NOTIFIED', at: ctx.today_() }), 'regulator told');
inc = must(api('inc.update', tD, { Incident_ID: inc.id, op: 'CLOSE', actions: 'الشيتات بقت بتتبعت بلينك محمي بس' }), 'closed');
ok(inc.status === 'CLOSED' && inc.notifiedAt, 'closed with the notification date');
fresh(); ok(ctx.all_('AUDIT_LOG').filter(a => a.Entity_ID === inc.id).length === 4, 'every step audited');
// 50 hours without a decision → reminder, once
const inc2 = must(api('inc.report', tS, { Detected_At: ctx.addMinutesIso_(-50 * 60).slice(0, 16), Description: 'لابتوب فيه ملفات موظفين اتسرق', Data_Affected: 'ملفات موظفين' }), 'second incident');
fresh(); ok(ctx.incidentDaily_() === 1, '48 hours: reminder'); fresh(); ok(ctx.incidentDaily_() === 0, 'once');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === dpo && /أقل من 24 ساعة/.test(n.Title)), 'DPO reminded');

// ---------- the daily summary e-mail: managers only ----------
const rq = must(api('req.submit', tA, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Reason_Category: 'WORKLOAD', Justification: 'ضغط شغل في قسم الحسابات', Required_By_Date: '2099-01-01',
  lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] }), 'request by the accounts manager');
mails.length = 0; props.setProperty('MAIL_COUNT', '0');
fresh(); let dg = ctx.dailyDigest_();
ok(mails.some(m => m.to === 'fin@t.com'), 'the sector head (a manager) gets the e-mail');
must(api('req.action', tF, { Request_ID: rq.Request_ID, action: 'APPROVE', comment: 'ok' }), 'sector head approves');
mails.length = 0; props.setProperty('MAIL_COUNT', '0'); fresh(); dg = ctx.dailyDigest_();
ok(!mails.some(m => m.to === 'hm@t.com' || m.to === 'hs@t.com') && dg.portalOnly >= 1, 'HR (no unit) is not e-mailed — sees it in the portal: ' + JSON.stringify(dg));

// ---------- go live ----------
const C = user('cons@t.com', 'استشاري', '');
must(api('users.save', tO, { User_ID: C, Email: 'cons@t.com', Full_Name_AR: 'استشاري', Access_Expires_At: ctx.addDaysIso_(60).slice(0, 10) }), 'consultant end date');
must(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant role');
const tC = login('cons@t.com'); must(api('nda.accept', tC, {}), 'nda');
must(api('cand.search', tC, { q: 'محمد' }), 'consultant searches candidates before go-live');
G = must(api('golive.get', tO, {}), 'readiness 3'); ok(G.auto.some(c => c.code === 'CONSULTANT' && c.status === 'WARN'), 'readiness: active consultant warned');
const dw = must(api('dual.request', tM, { Kind: 'WIPE', reason: 'خلصنا التجربة' }), 'a wipe request waiting');
fresh(); const fake = ctx.insert_('USERS', { User_ID: 'USR-9999', Email: 'demo@x.invalid', Full_Name_AR: 'تجريبي', Status: 'Active', Is_Demo: 'Y' }, 'x');
bad(api('golive.start', tS, { phrase: 'تشغيل فعلي' }), null, 'only the owner presses it');
bad(api('golive.start', tO, { phrase: 'تشغيل' }), /بالظبط/, 'phrase needed');
bad(api('golive.start', tO, { phrase: 'تشغيل فعلي' }), /التجريبية/, 'blocked while demo data exists');
fresh(); ctx.update_('USERS', 'USR-9999', { Is_Demo: '', Status: 'Inactive' }, 'x');
const gl = must(api('golive.start', tO, { phrase: 'تشغيل فعلي', note: 'يوم التشغيل' }), 'GO LIVE');
fresh(); ok(ctx.golive_() && ctx.cfg_('GOLIVE_AT').slice(0, 10) === ctx.today_(), 'GOLIVE_AT recorded');
bad(api('golive.start', tO, { phrase: 'تشغيل فعلي' }), /بالفعل/, 'once only');
bad(api('demo.status', tO, {}), /التشغيل الفعلي/, 'demo data locked');
bad(api('demo.wipe', tO, { phrase: 'امسح الحركات', reason: 'xxxxx' }), /التشغيل الفعلي/, 'wipe locked');
bad(api('dual.request', tM, { Kind: 'WIPE', reason: 'تاني مرة' }), /التشغيل الفعلي/, 'no new wipe request');
fresh(); ok(ctx.get_('DUAL_REQUESTS', dw.Dual_ID).Status === 'REJECTED', 'the waiting wipe request closed');
bad(api('cand.search', tC, { q: 'محمد' }), /للعرض فقط/, 'consultant: no candidate search after go-live');
bad(api('emp.get', tC, { Employee_ID: 'X' }), /للعرض فقط/, 'consultant: no employee file');
must(api('kpi.run', tC, {}), 'consultant still sees the KPIs');
ok(!must(api('me', tO, {}), 'me owner').can.demo, 'demo screen hidden after go-live');
G = must(api('golive.get', tO, {}), 'readiness after'); ok(!!G.golive, 'readiness shows the go-live date');

console.log(`phase37: ${pass} passed, ${failN} failed`);
