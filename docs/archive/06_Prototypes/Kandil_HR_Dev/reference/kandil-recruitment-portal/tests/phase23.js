// v0.21.0: audit fixes — who may edit an account, approval race, daily job claim, upload content check,
// shared table cache (correctness + no sheet reads on warm requests), batched writes, housekeeping, one boot call.
const { ctx, mails, fresh, vm, props } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  if (!mails.length) return null;
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  const r = pub('auth.verifyCode', { email, code });
  return r.ok ? r.data.token : null;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='المالك';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
function user(email, name, roles) {
  const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name }), 'create ' + email);
  if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles ' + email);
  return u;
}
const owner = ctx.all_('USERS').find(u => u.Email === 'owner@test.com');
const sec = user('sector@test.com', 'مدير القطاع', ['HR_SECTOR_MANAGER']);
const hrm = user('hrm@test.com', 'مدير الموارد', ['HR_MANAGER']);
const rec = user('rec@test.com', 'أخصائي', ['RECRUITER']);
const fresh1 = user('new@test.com', 'لسه مادخلش', null);
const tH = login('hrm@test.com'), tR = login('rec@test.com');
const save = (t, u, patch) => api('users.save', t, Object.assign({ User_ID: u.User_ID, Email: u.Email, Full_Name_AR: u.Full_Name_AR, Status: 'Active' }, patch));

// ---- who may edit an account
bad(save(tH, sec, { Email: 'mine@test.com' }), /مالك النظام أو مدير القطاع/, 'HR manager cannot take over an HR sector manager account');
bad(save(tH, owner, { Status: 'Inactive' }), /مالك النظام بس/, 'HR manager cannot switch the owner off');
const tS = login('sector@test.com');
bad(save(tS, owner, { Mobile: '0100' }), /مالك النظام بس/, 'HR sector manager cannot edit the owner account');
must(save(tO, sec, { Mobile: '0101' }), 'owner edits the HR sector manager');
must(save(tS, sec, { Mobile: '0102' }), 'the HR sector manager edits his own account');
bad(save(tH, rec, { Email: 'other@test.com' }), /دخل البوابة قبل كده/, 'HR manager cannot change the email of someone who signed in');
must(save(tH, rec, { Mobile: '0111' }), 'HR manager still edits other fields');
must(save(tH, fresh1, { Email: 'new2@test.com' }), 'HR manager fixes a typo in a never-used email');
ok(must(api('me', tR, {}), 'recruiter session alive').user.Email === 'rec@test.com', 'session before email change');
must(save(tO, rec, { Email: 'rec2@test.com' }), 'owner changes a used email');
bad(api('me', tR, {}), /انتهت الجلسة/, 'email change closes the sessions opened through the old one');
ok(!!login('rec2@test.com'), 'signs in with the new email');
// demo account emails never change
fresh(); ctx.withLock_(() => ctx.update_('USERS', fresh1.User_ID, { Is_Demo: 'Y' }, 'x'));
bad(save(tO, Object.assign({}, fresh1, { Email: 'new2@test.com' }), { Email: 'grab@test.com' }), /التجريبي/, 'demo user email locked, even for the owner');

// ---- consultant: viewing, not exporting
fresh(); ok(!ctx.consultantMay_('privacy.export', {}) && ctx.consultantMay_('privacy.find', {}), 'consultant may search, not export, personal data');

// ---- approval race: a decision taken on a step someone else already decided is refused
fresh();
ctx.withLock_(() => ctx.insert_('APPROVAL_INSTANCES', { Approval_ID: 'APR-T-1', Entity_Type: 'REQUEST', Entity_ID: 'REQ-T', Entity_Version: '1', Sequence: '1',
  Step_Type: 'HR', Authority: 'ROLE:HR_MANAGER', Label: 'HR', Status: 'PENDING' }, 'x'));
const step = ctx.get_('APPROVAL_INSTANCES', 'APR-T-1');
const c1 = { user: ctx.get_('USERS', hrm.User_ID) }, c2 = { user: ctx.get_('USERS', sec.User_ID) };
ctx.decideStep_(c1, step, 'APPROVED', 'first');
let raced = null;
try { fresh(); ctx.decideStep_(c2, step, 'REJECTED', 'second, same moment'); } catch (e) { raced = e; }
ok(raced && /اتاخد فيها قرار/.test(raced.message), 'second decision on the same step refused');
fresh(); const st = ctx.get_('APPROVAL_INSTANCES', 'APR-T-1');
ok(st.Status === 'APPROVED' && st.Decision_By === hrm.User_ID, 'first decision kept');

// ---- daily job: the day is claimed once
fresh(); props.DAILY_RUN = '2000-01-01';
const d1 = ctx.runDaily_(false); fresh(); const d2 = ctx.runDaily_(false);
ok(!d1.skipped && d2.skipped, 'daily job runs once a day');

// ---- upload content: the declared type is not trusted
fresh();
let refused = false; try { ctx.cvCheck_({ name: 'cv.pdf', mime: 'application/pdf', data: Buffer.from('MZ\x90 not a pdf').toString('base64') }, 'ar'); } catch (e) { refused = true; }
ok(refused, 'fake PDF CV refused');
const real = ctx.cvCheck_({ name: 'cv.pdf', mime: 'image/png', data: Buffer.from('%PDF-1.7 x').toString('base64') }, 'ar');
ok(real.mime === 'application/pdf', 'stored under its real type');
ok(ctx.sniffMime_(Array.from(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))) === 'image/jpeg' && ctx.sniffMime_(Array.from(Buffer.from('PK\x03\x04'))) !== '', 'jpeg / docx signatures');

// ---- shared cache: what one request writes, the next one reads
const sheetReads = () => {
  let n = 0;
  const SA = ctx.SpreadsheetApp, open = SA.openById;
  SA.openById = id => { n++; return open(id); };
  return () => { SA.openById = open; return n; };
};
api('todo', tO, {}); api('lookups', tO, {});      // warm
let stop = sheetReads(); api('todo', tO, {}); api('lookups', tO, {}); api('notif.list', tO, {});
ok(stop() === 0, 'warm requests read no spreadsheet');
must(api('users.save', tO, { User_ID: hrm.User_ID, Email: 'hrm@test.com', Full_Name_AR: 'اسم جديد', Status: 'Active' }), 'rename');
ok(must(api('users.list', tO, {}), 'list').find(u => u.User_ID === hrm.User_ID).Full_Name_AR === 'اسم جديد', 'next request sees the write');
must(api('config.update', tO, { Config_Key: 'IDLE_MINUTES', Config_Value: '45', reason: 'test' }), 'config change');
ok(must(api('me', tO, {}), 'me').idleMinutes === 45, 'config change seen at once');
// a copy made before a write is never served after it
fresh(); ctx.all_('USERS');                                    // this request cached USERS…
const genBefore = ctx.tcGens_().USERS;
fresh(); ctx.withLock_(() => ctx.update_('USERS', rec.User_ID, { Mobile: '0199' }, 'x'));
fresh(); ok(ctx.tcGens_().USERS !== genBefore && ctx.get_('USERS', rec.User_ID).Mobile === '0199', 'write retires the cached copy');
// a big table full of Arabic text still fits (chunks are sized in bytes, not characters)
fresh(); const bigSnap = { headers: ['K', 'V'], raw: [] };
for (let i = 0; i < 4000; i++) bigSnap.raw.push([i + 2, 'K' + i, 'وصف وظيفي طويل بالعربي للتجربة رقم ' + i + ' — مسؤوليات ومهام ومتطلبات']);
ctx.tcPut_('JOB_DESCRIPTIONS', bigSnap, ctx.tcGenEnsure_('JOB_DESCRIPTIONS'));
fresh(); const back = ctx.tcGet_('JOB_DESCRIPTIONS');
ok(back && back.raw.length === 4000 && back.raw[3999][2] === bigSnap.raw[3999][2], 'large Arabic table cached (' + Math.round(Buffer.byteLength(JSON.stringify(bigSnap)) / 1024) + ' KB)');
fresh(); ctx.tcRetire_(true);
// reads under the lock always come from the sheet
fresh(); stop = sheetReads(); ctx.withLock_(() => ctx.all_('USERS')); ok(stop() > 0, 'reads under the lock go to the sheet');

// ---- batched writes: many row updates in one lock = few sheet writes
fresh();
const ids = ctx.nextIds_('NOTIFICATION', 40);
ctx.withLock_(() => ctx.insertMany_('NOTIFICATIONS', ids.map(id => ({ Notification_ID: id, User_ID: owner.User_ID, Title: 't', Body: '', Link_Type: '', Link_ID: '', Read_At: '' })), 'x'));
fresh(); const sh = ctx.sheet_('NOTIFICATIONS'), w0 = sh.writes;
const rd = must(api('notif.read', tO, {}), 'mark all read');
ok(rd.read >= 40 && sh.writes - w0 <= 2, 'marking ' + rd.read + ' read took ' + (sh.writes - w0) + ' sheet write(s)');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: owner.User_ID }).every(n => n.Read_At), 'all marked read');

// ---- housekeeping (scheduled run): old sessions / codes / read notifications go, the rest stays
fresh(); ctx.withLock_(() => {
  ctx.insert_('SESSIONS', { Session_ID: 'SES-OLD-1', User_ID: owner.User_ID, Token_Hash: 'x', Expires_At: '2020-01-01T00:00:00', Last_Seen_At: '', Revoked_At: '', Revoked_By: '', User_Agent: '' }, 'x');
  ctx.insert_('NOTIFICATIONS', { Notification_ID: 'NTF-OLD-READ', User_ID: owner.User_ID, Title: 'old', Body: '', Link_Type: '', Link_ID: '', Read_At: '2020-01-01T00:00:00' }, 'x');
  ctx.insert_('NOTIFICATIONS', { Notification_ID: 'NTF-OLD-UNREAD', User_ID: owner.User_ID, Title: 'old', Body: '', Link_Type: '', Link_ID: '', Read_At: '' }, 'x');
});
fresh(); const hk = ctx.housekeeping_();
fresh();
ok(!ctx.get_('SESSIONS', 'SES-OLD-1') && !ctx.get_('NOTIFICATIONS', 'NTF-OLD-READ') && ctx.get_('NOTIFICATIONS', 'NTF-OLD-UNREAD'), 'housekeeping: ' + JSON.stringify(hk));
ok(must(api('me', tO, {}), 'owner still signed in').user.Email === 'owner@test.com', 'live sessions kept');

// ---- one call to start the page; owner sees whether the daily job is installed
props.DAILY_TRIGGER = 'Y';
const B = must(api('boot', tO, {}), 'boot');
ok(B.me && B.lookups && B.lookups.units && B.opt, 'boot = profile + lookups + request options');
ok(B.me.jobs && B.me.jobs.daily === true, 'daily job installed');
delete props.DAILY_TRIGGER;
ok(must(api('boot', tO, {}), 'boot').me.jobs.daily === false, 'owner told when the daily job is not installed');
ok(must(api('boot', tH, {}), 'boot HR manager').me.jobs === null, 'others do not get the job status');

console.log(`phase23: ${pass} passed, ${failN} failed`);
if (failN) process.exit(1);
