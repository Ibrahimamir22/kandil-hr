// v0.15.1: per-user display preferences — screen intros closed / reopened, menu scope colours (owner / HR sector manager).
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
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
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
function user(email, name, roles, extra) { const u = must(api('users.save', tO, Object.assign({ Email: email, Full_Name_AR: name }, extra || {})), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
user('hr@t.com', 'منى', ['HR_MANAGER']); user('sec@t.com', 'مدير القطاع', ['HR_SECTOR_MANAGER']);
const C = user('c@t.com', 'الاستشاري', null, { Access_Expires_At: ctx.addDaysIso_(20).slice(0, 10) });
must(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant');
const t = { hr: login('hr@t.com'), sec: login('sec@t.com'), c: login('c@t.com') };
must(api('nda.accept', t.c, {}), 'nda');

let me = must(api('me', tO, {}), 'me');
ok(me.security.scopeView && JSON.stringify(me.security.prefs) === '{}', 'owner may see scope colours; no prefs yet');
ok(must(api('me', t.sec, {}), 'sec').security.scopeView && !must(api('me', t.hr, {}), 'hr').security.scopeView && !must(api('me', t.c, {}), 'c').security.scopeView, 'scope colours for owner + HR sector manager only (not HR manager, not consultant)');
must(api('me.pref', tO, { key: 'intro', view: 'users', value: true }), 'close intro');
must(api('me.pref', tO, { key: 'intro', view: 'org', value: true }), 'close another');
must(api('me.pref', tO, { key: 'intro', view: 'users', value: false }), 'reopen');
must(api('me.pref', tO, { key: 'scopeDots', value: true }), 'scope dots on');
me = must(api('me', tO, {}), 'me 2');
ok(me.security.prefs.scopeDots === true && me.security.prefs.introHidden.org === 1 && !me.security.prefs.introHidden.users, 'prefs kept per user: ' + JSON.stringify(me.security.prefs));
ok(JSON.stringify(must(api('me', t.hr, {}), 'hr').security.prefs) === '{}', 'other users untouched');
bad(api('me.pref', tO, { key: 'role', value: 'x' }), /غير معروف/, 'unknown key refused');
bad(api('me.pref', tO, { key: 'intro', view: '<b>' }), /غير معروفة/, 'bad screen name refused');
must(api('me.pref', t.c, { key: 'intro', view: 'pay', value: true }), 'consultant may close intros (his own display)');
fresh(); ctx.update_('USERS', C, { Prefs_JSON: '{broken' }, 'x');
ok(JSON.stringify(must(api('me', t.c, {}), 'c me').security.prefs) === '{}', 'broken prefs read as empty');
fresh(); ok(!ctx.all_('AUDIT_LOG').some(a => a.Field === 'Prefs_JSON'), 'display prefs not written to the audit log');

console.log('\nPhase 17 (display preferences): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
