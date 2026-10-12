// v0.16.0: org chart — headcount status per position (over / short / full / empty), roll-up per unit, what is on the way
// (open vacancies, new hires waiting to join), sector colours, who sees what.
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
const T = '\t';
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع التصنيع', '', '', '', '', 'مدير قطاع التصنيع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع التصنيع', 'مصنع النجف', '', '', '', 'مدير مصنع النجف', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع التصنيع', 'مصنع النجف', '', '', '', 'فني تجميع', 'العبور', '', '', '', '10']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
const U = {}; ctx.all_('ORG_UNITS').forEach(u => { U[u.Name_AR] = u.Org_Unit_ID; });
const occ = (t, n) => { fresh(); ctx.update_('POSITIONS', P[t], { Occupied_HC: String(n) }, 'x'); };
occ('محاسب تكاليف', 2); occ('محاسب عام', 3); occ('أمين خزينة', 0); occ('فني تجميع', 10); occ('مدير الحسابات', 1); occ('الرئيس التنفيذي', 1);
// structural HC of the head positions: imported blank → default 1
fresh(); ok(ctx.hcStatus_(4, 2) === 'SHORT' && ctx.hcStatus_(2, 3) === 'OVER' && ctx.hcStatus_(2, 0) === 'EMPTY' && ctx.hcStatus_(1, 1) === 'FULL' && ctx.hcStatus_(0, 0) === 'NONE' && ctx.hcStatus_(0, 1) === 'OVER', 'status rule');

let C = must(api('org.chart', tO, {}), 'chart');
const pos = t => C.positions.find(p => p.id === P[t]), unit = n => C.units.find(u => u.id === U[n]);
ok(pos('محاسب تكاليف').status === 'SHORT' && pos('محاسب عام').status === 'OVER' && pos('أمين خزينة').status === 'EMPTY' && pos('فني تجميع').status === 'FULL', 'position statuses');
const acc = unit('الحسابات');
ok(acc.own.approved === 7 && acc.own.occupied === 6 && acc.own.over === 1 && acc.own.short === 1 && acc.status === 'SHORT', 'unit own totals: ' + JSON.stringify(acc.own));
const fin = unit('القطاع المالي');
ok(fin.total.approved === 10 && fin.total.occupied === 6 && fin.total.empty === 2 && fin.total.over === 1, 'sector rolls up its departments: ' + JSON.stringify(fin.total));
ok(C.roots.length === 1 && C.summary.approved === unit('قنديل مصر').total.approved && C.summary.positions === 9, 'company total = summary');
ok(unit('الحسابات').sector === U['القطاع المالي'] && unit('مصنع النجف').sector === U['قطاع التصنيع'] && unit('قنديل مصر').sector === '', 'every unit knows its sector');
ok(C.sectors.length === 2 && C.sectors[0].color !== C.sectors[1].color && unit('الحسابات').color === unit('القطاع المالي').color, 'a colour per sector, shared by its departments');
ok(unit('الحسابات').headHolder === '' && pos('محاسب تكاليف').holders.length === 0, 'holders listed (none yet)');

// what is on the way: an open vacancy of 2 on the cost accountant
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
ok(VAC && ctx.VAC_OPEN_.indexOf(VAC.Status) >= 0, 'vacancy open');
fresh(); ctx.insert_('JOININGS', { Joining_ID: 'JON-T1', Application_ID: 'APP-X', Vacancy_ID: VAC.Vacancy_ID, Person_ID: 'CND-X', Status: 'PENDING' }, 'x');
C = must(api('org.chart', tO, {}), 'chart 2');
ok(pos('محاسب تكاليف').open === 2 && pos('محاسب تكاليف').joining === 1 && unit('القطاع المالي').total.open === 2 && unit('القطاع المالي').total.joining === 1, 'open vacancy and joining counted and rolled up');

// colours from the settings
must(api('config.update', tO, { Config_Key: 'SECTOR_COLORS', Config_Value: JSON.stringify({ [U['قطاع التصنيع']]: '#123456' }), reason: 'لون المصانع' }), 'colour setting');
C = must(api('org.chart', tO, {}), 'chart 3');
ok(unit('مصنع النجف').color === '#123456', 'sector colour from the settings reaches its departments');

// who sees what
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات']); user('hr@t.com', 'منى', '', ['HR_STAFF']); user('emp@t.com', 'موظف', '');
const tM = login('mgr@t.com'), tH = login('hr@t.com'), tE = login('emp@t.com');
const M = must(api('org.chart', tM, {}), 'manager chart');
ok(!M.all && M.units.length === 1 && M.units[0].id === U['الحسابات'] && M.units[0].parent === '' && M.roots[0] === U['الحسابات'], 'manager sees his unit only, as the top');
ok(M.positions.every(p => p.unit === U['الحسابات']) && M.summary.approved === 7, 'his positions and totals only');
ok(must(api('org.chart', tH, {}), 'hr chart').units.length === C.units.length, 'HR staff see everything');
bad(api('org.chart', tE, {}), /الإدارة العليا/, 'a user with no role and no team cannot see it');
fresh(); ctx.update_('ORG_UNITS', U['الحسابات'], { Parent_Org_Unit_ID: U['الحسابات'] }, 'x');
must(api('org.chart', tO, {}), 'a broken tree (unit under itself) does not hang the chart');

console.log('\nPhase 18 (org chart): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
