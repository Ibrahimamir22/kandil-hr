// v0.44.1 (CHG-92): the probation evaluator is a head of section (JL5) or higher — never a technician or a supervisor, even
// when the structure has an assistant report to a technician or a supervisor head a small unit. Walk up to the first eligible
// position with an account; the skip-level the same way; nobody → no manager and HR is told.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
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
// a painting line: production manager → head of the painting section → spray supervisor (heads a small unit) → technician → assistant
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', '', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', '', '', '', 'رئيس قسم الدهان', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مشرف الرش', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'فني رش', 'العبور', 'مشرف الرش', '', '', '2'],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مساعد رش', 'العبور', 'فني رش', '', '', '2']].map(r => r.join('\t')).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ok(ctx.get_('POSITIONS', P['مساعد رش'].Position_ID).Reports_To_Position_ID === P['فني رش'].Position_ID, 'the structure as it is: the assistant reports to the technician');
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), tech: user('tech@t.com', 'فني الرش', P['فني رش'].Position_ID), sup: user('sup@t.com', 'مشرف الرش', P['مشرف الرش'].Position_ID) };
const tH = login('hr@t.com');
const ev = pos => { fresh(); return ctx.probEvaluator_(P[pos].Position_ID).user; };

// no levels yet: technician and supervisor skipped by title, no one else has an account
ok(ev('مساعد رش') === '', 'the technician (reports-to) and the supervisor (a unit head) are never the evaluator; nobody else has an account yet');
const head = user('head@t.com', 'رئيس قسم الدهان', P['رئيس قسم الدهان'].Position_ID);
ok(ev('مساعد رش') === head && ev('فني رش') === head, 'the head of the painting section evaluates the assistant and the technician');
const pm = user('pm@t.com', 'مدير الإنتاج', P['مدير الإنتاج'].Position_ID);
fresh(); let pp = ctx.probPeople_(P['مساعد رش'].Position_ID, '');
ok(pp.manager === head && pp.skip === pm, 'the skip-level reviewer is the production manager');
// levels from approved JDs win over titles
fresh(); ctx.update_('JOBS', P['مشرف الرش'].Job_Code, { Job_Level: 'JL4' }, 'x'); ctx.update_('JOBS', P['رئيس قسم الدهان'].Job_Code, { Job_Level: 'JL5' }, 'x');
ok(ev('مساعد رش') === head, 'JL4 supervisor skipped, JL5 head of section chosen');
fresh(); ctx.update_('JOBS', P['مشرف الرش'].Job_Code, { Job_Level: 'JL5' }, 'x');
ok(ev('مساعد رش') === U.sup, 'a position whose job is set at JL5 qualifies whatever its title');
fresh(); ctx.update_('JOBS', P['مشرف الرش'].Job_Code, { Job_Level: 'JL4' }, 'x');
// the head of section without an account → the next one up
fresh(); ctx.update_('USERS', head, { Status: 'Inactive' }, 'x');
ok(ev('مساعد رش') === pm, 'no account at the section → the production manager');
fresh(); ctx.update_('USERS', head, { Status: 'Active' }, 'x');

// a real probation: opened by HR for an existing employee
must(api('emp.save', tH, { isNew: 'Y', Employee_ID: 'E1', Full_Name: 'سعيد عبد الله حسن', Position_ID: P['مساعد رش'].Position_ID, Hire_Date: ctx.today_(), Employment_Kind: 'PERMANENT' }), 'employee');
let R = must(api('prob.start', tH, { Employee_ID: 'E1', Start_Date: ctx.today_() }), 'probation');
fresh(); let PR = ctx.findOne_('PROBATIONS', { Employee_ID: 'E1' });
ok(PR.Manager_User_ID === head && PR.Skip_User_ID === pm, 'the probation is evaluated by the head of section, reviewed by the production manager (not the technician): ' + PR.Manager_User_ID);
// nobody eligible → no manager, HR told
must(api('emp.save', tH, { isNew: 'Y', Employee_ID: 'E2', Full_Name: 'وليد سامي فريد', Position_ID: P['مساعد رش'].Position_ID, Hire_Date: ctx.today_(), Employment_Kind: 'PERMANENT' }), 'employee 2');
fresh(); [head, pm].forEach(u => ctx.update_('USERS', u, { Status: 'Inactive' }, 'x'));
fresh(); const before = ctx.all_('NOTIFICATIONS').length;
must(api('prob.start', tH, { Employee_ID: 'E2', Start_Date: ctx.today_() }), 'probation 2');
fresh(); PR = ctx.findOne_('PROBATIONS', { Employee_ID: 'E2' });
ok(PR.Manager_User_ID === '' && ctx.all_('NOTIFICATIONS').slice(before).some(n => n.User_ID === U.hr && /من غير مقيّم/.test(n.Title)), 'nobody eligible → opened without a manager and the HR manager is told');
ok(!ctx.all_('NOTIFICATIONS').slice(before).some(n => n.User_ID === U.tech || n.User_ID === U.sup), 'the technician and the supervisor are never asked to evaluate');

console.log('\nPhase 44 (probation evaluator level): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
