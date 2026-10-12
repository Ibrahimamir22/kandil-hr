// v0.44.2 (CHG-93): a job with no level of its own takes one from its Korn Ferry grade (worked out, never stored); a level set on
// the job wins. The probation evaluator rule uses it. The grade is internal (D-21): the JD sent by e-mail does not show it.
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

// the mapping, at every boundary and on the owner's three decisions (follow the grade: PRD-064 / PRD-061 → JL3, PRD-027 → JL2)
const L = (g, t) => ctx.jlFromGrade_(g, t || 'أخصائي');
[[1, 'JL1'], [2, 'JL1'], [3, 'JL2'], [5, 'JL2'], [6, 'JL3'], [7, 'JL3'], [9, 'JL5'], [10, 'JL5'], [11, 'JL6'], [13, 'JL6'], [14, 'JL7'], [15, 'JL7']]
  .forEach(([g, jl]) => ok(L(g) === jl && L(String(g)) === jl, 'grade ' + g + ' → ' + jl + ' (got ' + L(g) + ')'));
ok(L(8, 'مشرف الطلاء') === 'JL4' && L(8, 'رئيس قسم المنتج الخاص') === 'JL4', 'grade 8 supervisor / head → JL4');
ok(L(8, 'محلل مالي') === 'JL3' && L(8, 'مصمم منتجات') === 'JL3' && L(8, 'مراجع داخلي') === 'JL3', 'grade 8 specialist → JL3');
ok(L(6, 'مشرف طلاء') === 'JL3' && L(6, 'إداري PVD') === 'JL3' && L(5, 'إداري طلاء') === 'JL2', 'the three decisions follow the grade');
ok(L('') === '' && L('0') === '' && L('16') === '' && L('4/5') === '' && L('x') === '', 'no grade or a bad one → no level');

fresh(); if (!ctx.all_('GRADES').length) ctx.seedGrades_();     // the 15 Korn Ferry grades
// a painting line with grades: production manager 12, head of section 6 (on purpose), spray supervisor 9, technician 5, assistant 2
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', '', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '12', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', '', '', '', 'رئيس قسم الدهان', 'العبور', '', 'Y', '6', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مشرف الرش', 'العبور', '', 'Y', '9', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'فني رش', 'العبور', 'مشرف الرش', '', '5', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مساعد رش', 'العبور', 'فني رش', '', '2', '']].map(r => r.join('\t')).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const J = t => ctx.get_('JOBS', P[t].Job_Code);
ok(J('مشرف الرش').Grade_Code === '9' && J('مشرف الرش').Job_Level === '', 'the grade is loaded, the job has no level of its own');
ok(ctx.jobLevel_(J('مشرف الرش')) === 'JL5' && ctx.jobLevel_(J('رئيس قسم الدهان')) === 'JL3' && ctx.jobLevel_(J('مدير الإنتاج')) === 'JL6', 'jobLevel_ from the grade');
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sup: user('sup@t.com', 'مشرف الرش', P['مشرف الرش'].Position_ID),
  head: user('head@t.com', 'رئيس قسم الدهان', P['رئيس قسم الدهان'].Position_ID), pm: user('pm@t.com', 'مدير الإنتاج', P['مدير الإنتاج'].Position_ID) };
const tH = login('hr@t.com');
const ev = pos => { fresh(); return ctx.probEvaluator_(P[pos].Position_ID).user; };
ok(ev('مساعد رش') === U.sup, 'grade 9 → JL5: the spray supervisor evaluates, whatever his title');
fresh(); ctx.update_('JOBS', P['مشرف الرش'].Job_Code, { Grade_Code: '8' }, 'x');
ok(ev('مساعد رش') === U.pm, 'grade 8 supervisor (JL4) and grade 6 head (JL3) are skipped → the production manager (grade 12, JL6)');
fresh(); ctx.update_('JOBS', P['رئيس قسم الدهان'].Job_Code, { Job_Level: 'JL5' }, 'x');
ok(ev('مساعد رش') === U.head, 'a level set on the job wins over its grade');
fresh(); ctx.update_('JOBS', P['رئيس قسم الدهان'].Job_Code, { Grade_Code: '10' }, 'x');
fresh(); ok(J('رئيس قسم الدهان').Job_Level === 'JL5', 'nothing is written to the job: its own level stays as set');
fresh(); ctx.update_('JOBS', P['رئيس قسم الدهان'].Job_Code, { Job_Level: '' }, 'x');
ok(ev('مساعد رش') === U.head, 'level cleared → grade 10 → JL5, a later grade change moves the level too');
must(api('emp.save', tH, { isNew: 'Y', Employee_ID: 'E1', Full_Name: 'سعيد عبد الله حسن', Position_ID: P['مساعد رش'].Position_ID, Hire_Date: ctx.today_(), Employment_Kind: 'PERMANENT' }), 'employee');
must(api('prob.start', tH, { Employee_ID: 'E1', Start_Date: ctx.today_() }), 'probation');
fresh(); const PR = ctx.findOne_('PROBATIONS', { Employee_ID: 'E1' });
ok(PR.Manager_User_ID === U.head && PR.Skip_User_ID === U.pm, 'a real probation: head of section (JL5 from grade 10) evaluates, the production manager reviews');

// the JD screens: the list and the job page carry the grade's level, marked; a level set on the job → no mark
const code = P['مشرف الرش'].Job_Code;
let li = must(api('jd.list', tH, {}), 'jd list').rows.find(r => r.Job_Code === code);
ok(li.level === '' && li.levelAuto === 'JL4', 'the list: no level of its own, JL4 from grade 8');
let g = must(api('jd.get', tH, { Job_Code: code }), 'jd get');
ok(g.job.levelAuto === 'JL4' && g.job.levelName === 'مشرف', 'the job page: the level name from the grade');
fresh(); ctx.update_('JOBS', code, { Job_Level: 'JL5' }, 'x');
li = must(api('jd.list', tH, {}), 'jd list 2').rows.find(r => r.Job_Code === code);
g = must(api('jd.get', tH, { Job_Code: code }), 'jd get 2');
ok(li.level === 'JL5' && li.levelAuto === '' && g.job.levelAuto === '' && g.job.levelName === 'رئيس قسم', 'a level on the job: shown as is, no grade level');

// D-21: the approved JD sent by e-mail shows no grade
const resp = Array.from({ length: 8 }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها');
must(api('jd.save', tO, { Job_Code: code, Purpose: 'الإشراف على خط الرش بجودة وفي الموعد', Career_Level: 'JL5', resp }), 'jd draft');
must(api('jd.approve', tO, { Job_Code: code, reason: 'x' }), 'jd approve');
fresh(); mails.length = 0;
must(api('jd.send', tH, { Job_Code: code, to: [U.sup] }), 'jd send');
const m = mails.find(x => /الرش/.test(x.htmlBody || ''));
ok(m && /مشرف الرش/.test(m.htmlBody) && !/الدرجة/.test(m.htmlBody) && !/Job Level/.test(m.htmlBody), 'the e-mailed JD has the job but no grade');
fresh(); ok(J('مشرف الرش').Grade_Code === '8', 'the grade itself is kept on the job');

console.log('\nPhase 45 (job level from the grade): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
