// v0.45.1 (CHG-98): who is online — each signed-in request leaves «user → screen name, time» in the script cache only;
// the owner and the HR Sector Manager see who acted in the last 6 minutes and on which screen; the policy says so.
const { ctx, mails, props, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p, v) => { fresh(); return ctx.api(a, t, p, v); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
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
function user(email, name, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name }), 'user ' + name); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', ['HR_MANAGER']), sec: user('sec@t.com', 'مدير القطاع', ['HR_SECTOR_MANAGER']), mgr: user('mgr@t.com', 'مدير المصنع') };
const tH = login('hr@t.com'), tS = login('sec@t.com'), tM = login('mgr@t.com');
const cache = ctx.CacheService.getScriptCache();
const entry = id => { const s = cache.get('PRES_' + id); return s ? JSON.parse(s) : null; };

// each signed-in request records the screen's name only
must(api('me', tH, {}, 'jds'), 'hr on the JD list');
ok(entry(U.hr) && entry(U.hr).v === 'jds' && entry(U.hr).at, 'the HR manager is on «jds»');
must(api('me', tM, { Application_ID: 'APP-0001' }, 'app'), 'manager on a candidate file');
ok(entry(U.mgr).v === 'app' && Object.keys(entry(U.mgr)).sort().join() === 'at,v', 'only the screen name and the time are kept — never the record');
api('me', tM, {}, '<img src=x>');
ok(entry(U.mgr).v === '', 'a strange screen name is dropped');
api('me', tM, {}, 'cands');
ok(entry(U.mgr).v === 'cands', 'moving to another screen updates it');
ok(!entry('nobody'), 'nothing for someone who did nothing');
api('me', tM, {});
ok(entry(U.mgr).v === 'cands', 'a request without a screen name leaves the last mark as it is');
let r = api('me', 'bad-token', {}, 'jds');
ok(!r.ok && !entry(undefined), 'no session → nothing recorded');

// who may see it
r = api('presence.list', tH, {});
ok(!r.ok, 'the HR manager does not see who is online');
ok(!api('presence.list', tM, {}).ok, 'a manager does not');
const L = must(api('presence.list', tO, {}, 'online'), 'owner list');
const by = id => L.rows.find(x => x.User_ID === id);
ok(by(U.hr) && by(U.hr).view === 'jds' && by(U.mgr) && by(U.mgr).view === 'cands', 'the owner sees who is online and on which screen');
ok(by(U.hr).name === 'منى' && L.windowMin === 6, 'with the name, in the last 6 minutes');
ok(by(ctx.find_('USERS', { Email: 'owner@test.com' })[0].User_ID).me, 'his own row is marked');
ok(must(api('presence.list', tS, {}), 'sector list').rows.length >= 3, 'the HR Sector Manager sees it too');
ok(must(api('me', tO, {}), 'caps').can.presence === true && must(api('me', tH, {}), 'caps hr').can.presence === false, 'the menu item only for those who may see it');
// stale → gone
cache.put('PRES_' + U.mgr, JSON.stringify({ v: 'cands', at: '2000-01-01T00:00:00' }), 600);
ok(!must(api('presence.list', tO, {}), 'list 2').rows.some(x => x.User_ID === U.mgr), 'no action in the last 6 minutes → not online');
// an inactive account is not listed
fresh(); ctx.withLock_(() => ctx.update_('USERS', U.hr, { Status: 'Inactive' }, 'x'));
ok(!must(api('presence.list', tO, {}), 'list 3').rows.some(x => x.User_ID === U.hr), 'an inactive account is not listed');
// nothing about presence in any sheet
fresh(); ok(!ctx.all_('AUDIT_LOG').some(a => /PRES|presence/i.test(JSON.stringify(a))) && !ctx.all_('EVENTS').some(a => /presence/i.test(JSON.stringify(a))), 'nothing is written to the audit log or the events');

// the usage policy says so; the default text is updated and accepted again
fresh(); const pol = ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value;
ok(/مين فاتح البوابة دلوقتي وعلى أنهي شاشة/.test(pol), 'a fresh install has the new policy text');
const oldAR = vm.runInContext('USAGE_POLICY_AR_0440_', ctx), oldEN = vm.runInContext('USAGE_POLICY_EN_0440_', ctx);
fresh(); ctx.withLock_(() => { ctx.update_('CONFIG', 'USAGE_POLICY_AR', { Config_Value: oldAR }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_EN', { Config_Value: oldEN }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: '1' }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'Y' }, 'x');
  ctx.update_('USERS', U.mgr, { Policy_Accepted_At: '2026-10-01T10:00:00', Policy_Version: '1' }, 'x'); });
fresh(); ok(!ctx.policyNeeded_(ctx.get_('USERS', U.mgr)), 'before: the manager had accepted version 1');
delete props.MIG_0451; fresh(); ctx.migrate0451_();
fresh(); ok(/مين فاتح البوابة/.test(ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value) && /who is using the portal right now/.test(ctx.get_('CONFIG', 'USAGE_POLICY_EN').Config_Value), 'the old default policy text is updated');
ok(ctx.get_('CONFIG', 'USAGE_POLICY_VERSION').Config_Value === '2' && ctx.policyNeeded_(ctx.get_('USERS', U.mgr)), 'version 2 → everyone accepts the policy again');
fresh(); ctx.withLock_(() => { ctx.update_('CONFIG', 'USAGE_POLICY_AR', { Config_Value: 'سياسة كتبها المالك بنفسه' }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: '5' }, 'x'); });
delete props.MIG_0451; fresh(); ctx.migrate0451_();
fresh(); ok(ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value === 'سياسة كتبها المالك بنفسه' && ctx.get_('CONFIG', 'USAGE_POLICY_VERSION').Config_Value === '5', 'a policy the owner wrote himself is left as it is');

console.log('\nPhase 49 (who is online): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
