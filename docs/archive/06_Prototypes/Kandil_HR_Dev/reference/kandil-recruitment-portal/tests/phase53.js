// v0.49.0 security layers: CHG-104 sign-in from a new device (recorded; the user told in the portal and by e-mail),
// CHG-105 accounts nobody uses stop by themselves (owner, CEO and board excepted), CHG-106 a tamper-evident audit log
// (every row sealed and chained; an edit, an added row, a removed row or a removed tail is found by the daily check).
const { ctx, store, mails, props, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const UA_PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
function login(email, device, ua) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; mails.length = 0;
  return pub('auth.verifyCode', { email, code, device, userAgent: ua || UA_WIN }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com', 'owner-laptop-0001');
function user(email, name, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name }), 'user ' + name); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', ['HR_MANAGER']), rec: user('rec@t.com', 'سارة', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', ['CEO']),
  old: user('old@t.com', 'حساب قديم', ['HR_STAFF']), never: user('never@t.com', 'مادخلش خالص'), fresh: user('new@t.com', 'حساب جديد') };
const owner = ctx.find_('USERS', { Email: 'owner@test.com' })[0].User_ID;
const audits = (uid, act) => { ctx.flushAudit_(); fresh(); return ctx.all_('AUDIT_LOG').filter(a => a.Entity_ID === uid && a.Action === act); };
const notes = (uid, re) => { fresh(); return ctx.all_('NOTIFICATIONS').filter(n => n.User_ID === uid && re.test(n.Title)); };

// =============== CHG-104: a new device ===============
login('hr@t.com', 'hr-laptop-000001');
ok(audits(U.hr, 'NEW_DEVICE').length === 0 && mails.length === 0, 'the first device we know of is not «new» — no alert');
fresh(); ok(ctx.find_('USER_DEVICES', { User_ID: U.hr }).length === 1 && ctx.find_('USER_DEVICES', { User_ID: U.hr })[0].Label === 'Chrome — Windows', 'the device is recorded with its browser and system');
ok(!ctx.find_('USER_DEVICES', { User_ID: U.hr })[0].Device_Hash.includes('hr-laptop'), 'only a hash of the device id is kept');
login('hr@t.com', 'hr-laptop-000001');
ok(audits(U.hr, 'NEW_DEVICE').length === 0 && mails.length === 0, 'the same device again — nothing');
login('hr@t.com', 'hr-phone-0000002', UA_PHONE);
ok(audits(U.hr, 'NEW_DEVICE').length === 1 && audits(U.hr, 'NEW_DEVICE')[0].New_Value === 'Chrome — Android', 'a new device is logged');
ok(mails.length === 1 && mails[0].to === 'hr@t.com' && /جهاز جديد/.test(mails[0].subject) && /Chrome — Android/.test(mails[0].htmlBody) && /كلّم مدير النظام فوراً/.test(mails[0].htmlBody), 'the user is e-mailed: which device, and what to do if it was not him');
ok(notes(U.hr, /جهاز جديد/).length === 1, 'and told in the portal');
fresh(); ok(ctx.find_('USER_DEVICES', { User_ID: U.hr }).length === 2, 'two devices now');
// a browser that sends no id: told apart by its browser string
login('hr@t.com', '', UA_PHONE.replace('Android 14', 'Android 15'));
ok(audits(U.hr, 'NEW_DEVICE').length === 2, 'no device id → the browser string tells it apart');
login('hr@t.com', 'x!', UA_PHONE.replace('Android 14', 'Android 15'));
ok(audits(U.hr, 'NEW_DEVICE').length === 2, 'a malformed id is ignored the same way (no new alert for the same browser)');

// =============== CHG-105: accounts nobody uses ===============
login('old@t.com', 'old-pc-000000001');
fresh(); ok(ctx.all_('SESSIONS').some(x => x.User_ID === U.old && !x.Revoked_At), 'the old account has an open session');
const ago = d => ctx.addDaysYmd_(ctx.today_(), -d) + 'T09:00:00';
ctx.update_('USERS', U.old, { Last_Login_At: ago(61) }, 'x');
ctx.update_('USERS', U.rec, { Last_Login_At: ago(20) }, 'x');
ctx.update_('USERS', U.never, { Created_At: ago(70) }, 'x');
ctx.update_('USERS', U.fresh, { Created_At: ago(10) }, 'x');
ctx.update_('USERS', U.ceo, { Last_Login_At: ago(200) }, 'x');
ctx.update_('USERS', owner, { Last_Login_At: ago(300) }, 'x');
// the old account signed in earlier, so it has an open session
fresh(); mails.length = 0;
const r = ctx.dormantDaily_(); fresh();
ok(/stopped 2/.test(r), 'two accounts stopped: ' + r);
ok(ctx.get_('USERS', U.old).Status === 'Inactive' && ctx.get_('USERS', U.never).Status === 'Inactive', 'no sign-in for 61 days, and never signed in in 70 days → stopped');
ok(ctx.get_('USERS', U.rec).Status === 'Active' && ctx.get_('USERS', U.fresh).Status === 'Active', 'recent sign-in, or a new account → left alone');
ok(ctx.get_('USERS', U.ceo).Status === 'Active' && ctx.get_('USERS', owner).Status === 'Active', 'the CEO and the system owner are never stopped this way');
ok(audits(U.old, 'DORMANT_STOPPED').length === 1, 'logged');
ok(notes(owner, /حساب مش مستخدم/).length === 1 && mails.some(m => m.to === 'owner@test.com' && /حساب مش مستخدم/.test(m.subject) && /حساب قديم/.test(m.htmlBody)), 'the owner is told (portal and e-mail), with the names');
fresh(); ok(!ctx.all_('SESSIONS').some(s => s.User_ID === U.old && !s.Revoked_At && s.Expires_At > ctx.nowIso_()), 'its sessions are closed');
fresh(); mails.length = 0; pub('auth.requestCode', { email: 'old@t.com' }); ok(mails.length === 0, 'no code mailed to a stopped account');
// turned on again by hand: back to normal
must(api('users.save', tO, { User_ID: U.old, Email: 'old@t.com', Full_Name_AR: 'حساب قديم', Status: 'Active' }), 're-activated');
fresh(); ctx.update_('USERS', U.old, { Last_Login_At: ctx.nowIso_() }, 'x');
fresh(); ok(/stopped 0/.test(ctx.dormantDaily_()), 'nothing more to stop');
fresh(); ctx.update_('CONFIG', 'DORMANT_DAYS', { Config_Value: '0' }, 'x'); ctx.update_('USERS', U.rec, { Last_Login_At: ago(400) }, 'x');
fresh(); ok(ctx.dormantDaily_() === 'off' && ctx.get_('USERS', U.rec).Status === 'Active', 'DORMANT_DAYS 0 = off');

// =============== CHG-106: the tamper-evident audit log ===============
fresh(); ctx.flushAudit_();
let v = ctx.auditChainVerify_();
ok(v.ok && v.sealed > 20 && v.problems.length === 0, 'every row sealed and the chain holds: ' + v.sealed + ' rows ' + JSON.stringify(v.problems));
fresh(); const rows = ctx.all_('AUDIT_LOG');
ok(rows.every(a => a.Content_Hash && a.Chain_Hash), 'each row has its seals');
ok(!JSON.stringify(rows).includes(props.AUDIT_KEY), 'the key never appears in the log');
// someone edits a value in the sheet
const sh = () => store[props.SS_AUDIT].getSheetByName('AUDIT_LOG'), head = () => sh().data[0].map(String);
const col = n => head().indexOf(n);
let i5 = 5, keep = sh().data[i5][col('New_Value')];
sh().data[i5][col('New_Value')] = 'قيمة متغيرة'; fresh();
v = ctx.auditChainVerify_();
ok(!v.ok && v.problems.some(p => p.kind === 'EDITED' && p.id === sh().data[i5][col('Audit_ID')]), 'an edited value is found, on that row');
sh().data[i5][col('New_Value')] = keep; fresh(); ok(ctx.auditChainVerify_().ok, 'put back → holds again');
// a row removed in the middle
const removed = sh().data.splice(8, 1); fresh();
v = ctx.auditChainVerify_();
ok(!v.ok && v.problems.some(p => p.kind === 'BROKEN'), 'a removed row breaks the chain at the next row');
sh().data.splice(8, 0, removed[0]); fresh(); ok(ctx.auditChainVerify_().ok, 'put back → holds');
// a row added outside the portal
const fake = head().map(h => ({ Audit_ID: 'AUD-99999999', Timestamp: ctx.nowIso_(), User_ID: owner, Action: 'LOGIN' }[h] || ''));
sh().data.splice(10, 0, fake); fresh();
v = ctx.auditChainVerify_();
ok(!v.ok && v.problems.some(p => p.kind === 'UNSEALED' && p.id === 'AUD-99999999'), 'a row added in the sheet is found');
sh().data.splice(10, 1); fresh(); ok(ctx.auditChainVerify_().ok, 'removed → holds');
// the newest rows removed
const last = sh().data.length - 1, tail = sh().data.splice(last, 1); fresh();
v = ctx.auditChainVerify_();
ok(!v.ok && v.problems.some(p => p.kind === 'TAIL'), 'the newest row removed is found (the chain head is kept outside the sheet)');
sh().data.push(tail[0]); fresh(); ok(ctx.auditChainVerify_().ok, 'put back → holds');
// a forged seal without the key
const j = 12; sh().data[j][col('Reason')] = 'سبب مزور'; sh().data[j][col('Content_Hash')] = 'AAAAAAAAAAAAAAAAAAAAAAAA'; fresh();
ok(!ctx.auditChainVerify_().ok, 'a seal made up without the key does not pass');
sh().data[j][col('Reason')] = ''; fresh();
// put it right: re-seal from the real row
fresh(); { const key = props.AUDIT_KEY, rr = ctx.all_('AUDIT_LOG')[j - 1]; sh().data[j][col('Content_Hash')] = ctx.auditContent_(rr, key); } fresh();
ok(ctx.auditChainVerify_().ok, 'restored');
// deleting a person's data blanks values but keeps the seals: still holds
fresh(); const someId = ctx.all_('AUDIT_LOG').find(a => a.Entity_ID === U.hr && (a.New_Value || a.Old_Value));
ctx.withLock_(() => ctx.purgeAudit_('x', [U.hr]));
fresh(); const red = ctx.get_('AUDIT_LOG', someId.Audit_ID);
ok(red.Redacted === 'Y' && (red.New_Value === 'محذوف' || red.New_Value === ''), 'deletion blanks the values and marks the row');
v = ctx.auditChainVerify_(); ok(v.ok && v.redacted >= 1, 'the chain still holds after a lawful deletion (' + v.redacted + ' redacted)');
// a «redacted» mark cannot hide an edit
sh().data.find(rw => rw[col('Audit_ID')] === someId.Audit_ID)[col('New_Value')] = 'قيمة جديدة'; fresh();
ok(!ctx.auditChainVerify_().ok, 'a redacted row with a new value is found');
sh().data.find(rw => rw[col('Audit_ID')] === someId.Audit_ID)[col('New_Value')] = 'محذوف'; fresh();
// the daily step tells the owner once a day, and the readiness screen shows it
fresh(); ok(ctx.auditChainVerify_().ok, 'holds before the next test: ' + JSON.stringify(ctx.auditChainVerify_().problems));
const field5 = sh().data[5][col('Field')];
sh().data[5][col('Field')] = 'تلاعب'; fresh(); mails.length = 0;
ok(/BROKEN/.test(ctx.auditChainDaily_()), 'daily step reports it');
ok(mails.some(m => m.to === 'owner@test.com' && /سجل التدقيق/.test(m.subject)) && notes(owner, /سجل التدقيق اتلعب فيه/).length === 1, 'the owner is told (portal and e-mail)');
mails.length = 0; ctx.auditChainDaily_(); ok(mails.length === 0, 'once a day only');
fresh(); const item = ctx.goliveChecks_().find(x => x.code === 'AUDIT_CHAIN');
ok(item && item.status === 'TODO' && /تعديل من برا البوابة/.test(item.detail), 'on the readiness screen: ' + JSON.stringify(item));
// archiving keeps the chain: the anchor carries on from the last archived seal
sh().data[5][col('Field')] = field5; fresh();
ok(ctx.auditChainVerify_().ok, 'restored before archiving');
fresh(); ctx.update_('CONFIG', 'LOG_ARCHIVE_MONTHS', { Config_Value: '1' }, 'x');
for (let k = 1; k <= 6; k++) sh().data[k][col('Timestamp')] = '2000-01-0' + k + 'T00:00:00';
// timestamps are sealed: re-seal those six rows as if they were written then (a test shortcut — the portal never does this)
fresh(); { const key = props.AUDIT_KEY; let prev = ''; ctx.all_('AUDIT_LOG').forEach((rw, k) => { const ch = ctx.auditContent_(rw, key); sh().data[k + 1][col('Content_Hash')] = ch; prev = ctx.auditMac_(prev + '|' + ch, key); sh().data[k + 1][col('Chain_Hash')] = prev; }); props.AUDIT_CHAIN_HEAD = prev; }
fresh(); ok(ctx.auditChainVerify_().ok, 're-sealed');
delete props.LOG_ARCHIVE_MONTH; fresh(); const ar = ctx.archiveLogsMonthly_();
ok(ar.AUDIT_LOG === 6 && props.AUDIT_CHAIN_ANCHOR, 'six old rows archived, the anchor kept: ' + JSON.stringify(ar));
fresh(); ok(ctx.auditChainVerify_().ok, 'the live log still holds after archiving');

console.log('\nPhase 53 (security layers): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
