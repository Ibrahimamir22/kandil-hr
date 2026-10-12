// v0.15.0: sign-in with an authenticator app (TOTP), who must turn it on, recovery codes, reset, emergency reset;
// consultant accounts (view only, end date, confidentiality acknowledgement); notes from any screen.
const crypto = require('crypto');
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function emailLogin(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  if (!mails[0]) return null;
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  const r = pub('auth.verifyCode', { email, code });
  return r.ok ? r.data.token : null;
}
// clock: TOTP uses Date.now(); tests move it forward instead of waiting
vm.runInContext('var __off = 0; (function(){ var R = Date; Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + __off); } static now() { return R.now() + __off; } }; })();', ctx);
const tick = sec => vm.runInContext('__off += ' + (sec * 1000), ctx);
const stepNow = () => Math.floor(vm.runInContext('Date.now()', ctx) / 30000);
function b32dec(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; s = s.replace(/\s/g, ''); let bits = 0, val = 0; const out = []; for (const ch of s) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step) {
  const msg = Buffer.alloc(8); msg.writeUInt32BE(step >>> 0, 4);
  const h = crypto.createHmac('sha1', Buffer.isBuffer(secret) ? secret : b32dec(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');
}
function enroll(token, label) {
  const s = must(api('mfa.start', token, {}), label + ': start');
  ok(/^otpauth:\/\/totp\//.test(s.uri) && s.uri.indexOf('secret=' + s.secret.replace(/\s/g, '')) > 0, label + ': otpauth link carries the key');
  const r = must(api('mfa.confirm', token, { code: totp(s.secret, stepNow()) }), label + ': confirm');
  return { secret: s.secret, codes: r.codes };
}

// =============== RFC 6238 vectors + base32 ===============
const K = Buffer.from('12345678901234567890').toJSON().data;
ok(ctx.totpAt_(K, 1) === '287082' && ctx.totpAt_(K, 37037036) === '081804' && ctx.totpAt_(K, 41152263) === '005924', 'RFC 6238 SHA-1 test vectors (6 digits)');
ok(ctx.b32Encode_(Buffer.from('foobar').toJSON().data) === 'MZXW6YTBOI' && Buffer.from(ctx.b32Decode_('MZXW6YTBOI')).toString() === 'foobar', 'base32 RFC 4648');
const r20 = ctx.randomBytes_(20); ok(r20.length === 20 && r20.every(b => b >= 0 && b < 256), 'random secret bytes');
ok(JSON.stringify(ctx.mfaOpen_('USR-1', ctx.mfaSeal_('USR-1', r20))) === JSON.stringify(r20) && JSON.stringify(ctx.mfaOpen_('USR-2', ctx.mfaSeal_('USR-1', r20))) !== JSON.stringify(r20), 'secret sealed per user');

// =============== setup with the real rules ===============
ctx.__keepMfa = true;
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
fresh(); ok(ctx.cfg_('TOTP_AFTER_EMAIL_LOGINS') === 0 && ctx.cfg_('TOTP_REQUIRED_ROLES') === 'ALL' && ctx.cfg_('TOTP_EXEMPT_ROLES') === 'CEO', 'settings seeded (v0.37: everyone from the first sign-in, the CEO exempt)');
fresh(); ok(ctx.get_('ROLES', 'CONSULTANT').Role_Name_AR === 'استشاري (عرض فقط)', 'consultant role seeded');

// owner: gated until the authenticator is on
let tO = emailLogin('owner@test.com');
let me = must(api('me', tO, {}), 'me while gated');
ok(me.security.gate === 'MFA' && me.security.mfa.byRole && !me.security.mfa.enabled, 'owner must set up the authenticator first');
let r = api('users.list', tO, {});
ok(!r.ok && r.data && r.data.gate === 'MFA', 'other screens refused until set up');
must(api('lookups', tO, {}), 'lookups allowed while gated');
const s0 = must(api('mfa.start', tO, {}), 'start');
bad(api('mfa.confirm', tO, { code: '000000' === totp(s0.secret, stepNow()) ? '111111' : '000000' }), /غلط/, 'wrong code refused');
bad(api('mfa.confirm', tO, { code: '12' }), /6 أرقام/, 'short code refused');
const conf = must(api('mfa.confirm', tO, { code: totp(s0.secret, stepNow()) }), 'confirm');
ok(conf.codes.length === 8 && conf.codes.every(c => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)) && new Set(conf.codes).size === 8, '8 recovery codes: ' + conf.codes[0]);
fresh(); const OWNER = ctx.findUserByEmail_('owner@test.com').User_ID, mrow = ctx.get_('USER_MFA', OWNER);
ok(mrow.Enabled_At && mrow.Secret_Enc && mrow.Secret_Enc.indexOf(s0.secret.replace(/\s/g, '').slice(0, 8)) < 0 && !mrow.Pending_Enc && mrow.Recovery_Left === '8' && conf.codes.every(c => mrow.Recovery_JSON.indexOf(c) < 0), 'secret stored sealed; recovery codes stored as hashes only');
bad(api('mfa.start', tO, {}), /مفعّل/, 'cannot start again once on');
me = must(api('me', tO, {}), 'me');
ok(me.security.gate === '' && me.security.mfa.enabled && me.security.mfa.recoveryLeft === 8, 'gate open after set-up');
const ul = must(api('users.list', tO, {}), 'users');
ok(ul.find(u => u.User_ID === OWNER).mfa.on && !/Secret|Recovery_JSON|Pending/.test(JSON.stringify(ul)), 'users list shows status, never secrets');

// email codes stop once the authenticator is on
mails.length = 0; must(pub('auth.requestCode', { email: 'owner@test.com' }), 'request code');
ok(mails.length === 0, 'no email code sent to an authenticator account');
fresh(); ctx.insert_('LOGIN_CODES', { Code_ID: 'LC-X', Email: 'owner@test.com', Code_Hash: ctx.hash_('owner@test.com:123456'), Expires_At: ctx.addMinutesIso_(10), Attempts: '0', Used_At: '' }, 'x');
bad(pub('auth.verifyCode', { email: 'owner@test.com', code: '123456' }), null, 'old email code refused for an authenticator account');

// sign in with the app
bad(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow()) }), /غلط/, 'the code used for set-up cannot be used again (replay)');
let L = must(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow() + 1), userAgent: 'test' }), 'sign in with the next code (clock drift window)');
ok(L.token && !L.recovery, 'session opened');
must(api('users.list', L.token, {}), 'session works');
bad(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow() + 1) }), /غلط/, 'same code twice refused');
bad(pub('auth.totp', { email: 'nobody@test.com', code: '123456' }), /غلط/, 'unknown email: same answer');
tick(90);
tO = must(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow()) }), 'sign in later').token;
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'LOGIN' && a.New_Value === 'TOTP'), 'sign-in method audited');

// recovery codes
L = must(pub('auth.totp', { email: 'owner@test.com', code: conf.codes[0].toLowerCase() }), 'recovery code works (any case)');
ok(L.recovery, 'flagged as recovery');
bad(pub('auth.totp', { email: 'owner@test.com', code: conf.codes[0] }), /غلط/, 'a recovery code works once');
must(pub('auth.totp', { email: 'owner@test.com', code: conf.codes[1].replace('-', '') }), 'recovery code without the dash');
fresh(); ok(ctx.get_('USER_MFA', OWNER).Recovery_Left === '6' && ctx.all_('NOTIFICATIONS').some(n => n.User_ID === OWNER && /كود استرداد/.test(n.Title)), 'count drops; owner told');
bad(api('mfa.codes', tO, { code: '123' }), /6 أرقام/, 'new recovery codes need a current app code');
tick(60);
const nc = must(api('mfa.codes', tO, { code: totp(s0.secret, stepNow()) }), 'new recovery codes');
ok(nc.codes.length === 8, '8 new codes');
bad(pub('auth.totp', { email: 'owner@test.com', code: conf.codes[2] }), /غلط/, 'old recovery codes stop');

// lock after wrong codes
for (let i = 0; i < 5; i++) pub('auth.totp', { email: 'owner@test.com', code: '000001' });
tick(30);
bad(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow()) }), /متوقف 5 دقايق/, 'paused after 5 wrong codes, even a right app code');
must(pub('auth.totp', { email: 'owner@test.com', code: nc.codes[0] }), 'v0.34: a recovery code still works during the pause (nobody can lock the owner out)');
for (let i = 0; i < 5; i++) pub('auth.totp', { email: 'owner@test.com', code: '000001' });
tick(6 * 60);
must(pub('auth.totp', { email: 'owner@test.com', code: totp(s0.secret, stepNow()) }), 'app code works again after the pause');

// =============== who must turn it on ===============
const T = '\t';
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(x => x.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles, extra) { const u = must(api('users.save', tO, Object.assign({ Email: email, Full_Name_AR: name, Position_ID: pos || '' }, extra || {})), 'user ' + email); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(x => ({ Role_Code: x })), reason: 'x' }), 'roles ' + email); return u.User_ID; }
const U = { sec: user('sec@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']),
  rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات']) };
// v0.37.0 (CHG-82): a manager with no HR role must set the app up from the first sign-in too
const tMgr4 = emailLogin('mgr@t.com');
me = must(api('me', tMgr4, {}), 'manager me 1');
ok(me.security.gate === 'MFA' && me.security.mfa.byRole && me.security.mfa.required, 'the manager must set it up from the first sign-in');
bad(api('req.list', tMgr4, {}), /Authenticator/, 'gated');
const mgrSecret = enroll(tMgr4, 'manager').secret;
must(api('req.list', tMgr4, {}), 'manager works after set-up');
// recruiter: role requires it from the first sign-in
const tRec = emailLogin('rec@t.com');
ok(must(api('me', tRec, {}), 'rec me').security.gate === 'MFA', 'recruiter role: from the first sign-in');
const recSecret = enroll(tRec, 'recruiter').secret;
// setting off for others (0) → never forced
fresh(); ctx.update_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS', { Config_Value: '0' }, 'x');
fresh(); ok(!ctx.mfaState_(ctx.get_('USERS', U.mgr)).required, 'state helper sees the manager as enabled anyway');

// =============== reset ===============
let tSec = emailLogin('sec@t.com'); enroll(tSec, 'sector');
tick(60);
let tHr = emailLogin('hr@t.com'); enroll(tHr, 'hr manager');
bad(api('mfa.reset', tHr, { User_ID: U.rec, reason: 'غيّر الموبايل' }), /صلاحية/, 'HR manager cannot reset');
bad(api('mfa.reset', tSec, { User_ID: U.rec }), /سبب/, 'reason required');
bad(api('mfa.reset', tSec, { User_ID: U.sec, reason: 'x x x' }), /لحسابك/, 'not your own');
bad(api('mfa.reset', tSec, { User_ID: OWNER, reason: 'غيّر الموبايل' }), /مالك نظام تاني/, 'only an owner resets an owner');
const rs = must(api('mfa.reset', tSec, { User_ID: U.rec, reason: 'الموبايل اتسرق' }), 'reset recruiter');
ok(rs.sessionsClosed >= 1, 'his sessions closed');
bad(api('me', tRec, {}), /الجلسة/, 'old session ended');
fresh(); ok(!ctx.get_('USER_MFA', U.rec).Enabled_At && ctx.all_('AUDIT_LOG').some(a => a.Action === 'MFA_RESET' && a.Reason === 'الموبايل اتسرق') && ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /إعادة ضبط/.test(n.Title)), 'reset audited and he is told');
bad(pub('auth.totp', { email: 'rec@t.com', code: totp(recSecret, stepNow()) }), /غلط/, 'old phone stops working');
const tRec2 = emailLogin('rec@t.com');
ok(tRec2 && must(api('me', tRec2, {}), 'rec me').security.gate === 'MFA', 'email code works again, set-up asked again');
bad(api('mfa.reset', tSec, { User_ID: U.rec, reason: 'تاني' }), /مش مفعّل/, 'nothing to reset');

// =============== emergency reset (owner, from the editor) ===============
let threw = false; try { fresh(); ctx.emergencyResetAuthenticator(); } catch (e) { threw = /EMERGENCY_RESET/.test(e.message); }
ok(threw, 'emergency reset refuses without the script property (cannot be fired from the web page)');
fresh(); ok(ctx.get_('USER_MFA', OWNER).Enabled_At, 'still on');
ctx.PropertiesService.getScriptProperties().setProperty('EMERGENCY_RESET', 'YES');
fresh(); ctx.emergencyResetAuthenticator(); ctx.flushAudit_();
ok(!ctx.PropertiesService.getScriptProperties().getProperty('EMERGENCY_RESET'), 'property removed after one use');
fresh(); ok(!ctx.get_('USER_MFA', OWNER).Enabled_At, 'emergency reset from the editor turns it off for the owner');
tO = emailLogin('owner@test.com');
ok(tO && must(api('me', tO, {}), 'owner me').security.gate === 'MFA', 'owner signs in by email and sets it up again');
const ownerSecret = enroll(tO, 'owner again').secret;

// =============== consultant ===============
const exp = ctx.addDaysIso_(30).slice(0, 10);
const C = user('consult@t.com', 'د. هشام الاستشاري');
bad(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), /تاريخ انتهاء/, 'consultant needs an end date first');
bad(api('users.save', tO, { User_ID: C, Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Access_Expires_At: '2020-01-01' }), /النهارده/, 'end date in the past refused');
must(api('users.save', tO, { User_ID: C, Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Access_Expires_At: ctx.addDaysIso_(400).slice(0, 10) }), 'save far date (checked when the role is given)');
bad(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), /180 يوم/, 'longest period 180 days');
must(api('users.save', tO, { User_ID: C, Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Access_Expires_At: exp }), 'end date');
bad(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }, { Role_Code: 'VIEWER' }], reason: 'x' }), /لوحده/, 'consultant role alone');
bad(api('users.setRoles', tHr, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), /مدير قطاع/, 'HR manager cannot give the consultant role');
must(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'تقييم النظام' }), 'consultant role');
bad(api('users.save', tO, { User_ID: C, Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Access_Expires_At: '' }), /تاريخ انتهاء/, 'end date cannot be removed');
bad(api('users.save', tO, { User_ID: C, Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Position_ID: P['محاسب تكاليف'] }), /مايتربطش/, 'no position for a consultant');
const tC = emailLogin('consult@t.com');
me = must(api('me', tC, {}), 'consultant me');
ok(me.security.gate === 'MFA' && me.security.readOnly, 'consultant: authenticator first');
enroll(tC, 'consultant');
me = must(api('me', tC, {}), 'consultant me 2');
ok(me.security.gate === 'NDA' && /سرية/.test(me.security.nda) && me.security.accessExpires === exp, 'then the confidentiality acknowledgement, end date shown');
r = api('vac.list', tC, {}); ok(!r.ok && r.data.gate === 'NDA', 'screens closed until accepted');
must(api('nda.accept', tC, {}), 'accept');
bad(api('nda.accept', tO, {}), /الاستشاري/, 'not for others');
me = must(api('me', tC, {}), 'consultant me 3');
ok(me.security.gate === '' && me.roles[0].code === 'CONSULTANT' && me.can.pay && me.can.candidates && me.can.privacy && me.can.hrAdmin && me.can.config && !me.security.feedbackAdmin, 'consultant sees every screen the HR sector manager sees');
for (const a of ['users.list', 'org.tree', 'vac.list', 'req.list', 'pay.admin', 'emp.list', 'cand.search', 'privacy.admin', 'audit.search', 'jd.list', 'todo'])
  must(api(a, tC, {}), 'consultant reads ' + a);
for (const [a, p] of [['users.save', { Email: 'x@t.com', Full_Name_AR: 'تجربة' }], ['req.save', {}], ['config.update', { key: 'IDLE_MINUTES', value: '5' }],
  ['pay.rules', {}], ['users.setRoles', { User_ID: C, roles: [] }], ['mfa.reset', { User_ID: U.rec, reason: 'xxx' }], ['emp.save', {}], ['feedback.save', { Feedback_ID: 'x' }]])
  bad(api(a, tC, p), /للعرض فقط/, 'consultant cannot ' + a);
fresh(); ok(ctx.consultantMay_('int.plan', {}) && !ctx.consultantMay_('int.plan', { rounds: [] }), 'interview plan: read yes, save no');
// every action is either open to the consultant or refused — nothing in between: the list holds only real actions
const acts = Object.keys(ctx.actions_()); const allowed = Object.keys(ctx.consultantActions_());
ok(allowed.every(a => acts.indexOf(a) >= 0), 'consultant list names only real actions: ' + allowed.filter(a => acts.indexOf(a) < 0).join(','));
ok(!allowed.some(a => /\.(save|create|submit|action|update|commit|delete|add|remove|import|approve|reset|fill|assign|move|stop|close|purge)$/.test(a) && a !== 'feedback.add'), 'no save-type action open to the consultant');
// end date
fresh(); ctx.update_('USERS', C, { Access_Expires_At: ctx.yesterday_() }, 'x');
bad(api('me', tC, {}), /الجلسة/, 'account ended: session refused');
mails.length = 0; pub('auth.requestCode', { email: 'consult@t.com' }); ok(mails.length === 0, 'no codes after the end date');
fresh(); ctx.update_('USERS', C, { Access_Expires_At: exp }, 'x');

// =============== notes ===============
bad(api('feedback.add', tC, { text: 'x' }), /ملاحظتك/, 'note text required');
const fb = must(api('feedback.add', tC, { screen: 'pay', title: 'الرواتب والعروض', text: 'جدول البدلات محتاج عمود للمنطقة.' }), 'consultant adds a note');
tick(60); const tMgr5 = must(pub('auth.totp', { email: 'mgr@t.com', code: totp(mgrSecret, stepNow()) }), 'mgr totp').token;
must(api('feedback.add', tMgr5, { screen: 'reqs', title: 'الطلبات', text: 'عايز فلتر بالتاريخ.' }), 'a manager adds a note');
fresh(); ok(ctx.all_('NOTIFICATIONS').filter(n => /ملاحظة جديدة/.test(n.Title)).map(n => n.User_ID).sort().join() === [OWNER, U.sec].sort().join() + ',' + [OWNER, U.sec].sort().join() || ctx.all_('NOTIFICATIONS').some(n => n.User_ID === OWNER && /ملاحظة جديدة/.test(n.Title)), 'owner and HR sector manager told');
ok(must(api('todo', tO, {}), 'todo').feedback === 2 && must(api('todo', tHr, {}), 'hr todo').feedback === 0, 'new notes counted for the owner only');
let FL = must(api('feedback.list', tO, {}), 'list all');
ok(FL.admin && FL.rows.length === 2 && FL.rows.some(x => x.consultant && x.title === 'الرواتب والعروض'), 'owner sees every note, consultant marked');
FL = must(api('feedback.list', tC, {}), 'consultant list');
ok(!FL.admin && FL.rows.length === 1 && FL.rows[0].mine, 'consultant sees his own notes only');
bad(api('feedback.save', tHr, { Feedback_ID: fb.Feedback_ID, Status: 'SEEN' }), /صلاحية/, 'HR manager cannot answer notes');
bad(api('feedback.save', tO, { Feedback_ID: fb.Feedback_ID, Status: 'DECLINED' }), /سبب/, 'declined needs a reason');
must(api('feedback.save', tO, { Feedback_ID: fb.Feedback_ID, Status: 'PLANNED', Reply: 'هنضيفه في الإصدار الجاي.' }), 'answer');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === C && /رد على ملاحظتك/.test(n.Title)), 'consultant told about the answer');
FL = must(api('feedback.list', tC, {}), 'consultant list 2');
ok(FL.rows[0].status === 'PLANNED' && FL.rows[0].reply === 'هنضيفه في الإصدار الجاي.' && FL.rows[0].repliedBy === 'محمد عمارة', 'answer visible to him');
ok(must(api('feedback.list', tO, { status: 'NEW' }), 'filter').rows.length === 1, 'filter by status');

console.log('\nPhase 16 (authenticator, consultant, notes): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
