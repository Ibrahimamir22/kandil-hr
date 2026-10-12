// v0.25.0 (phase 7, stage 1): probation — opening (joining hook / existing employee), one period of at most 90 days, goals and the
// employee's acknowledgement, the performance log, follow-up reviews, the improvement plan, self-assessment and the final evaluation,
// recommendation and decision (ending the employment = HR sector only), reminders and escalation; medical insurance after confirmation.
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
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) {
  const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email);
  if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles');
  return u.User_ID;
}
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), fin: user('fin@t.com', 'مدير القطاع المالي', P['مدير القطاع المالي'].Position_ID),
  tre: user('tre@t.com', 'مدير الخزينة', P['مدير الخزينة'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sec: user('sec@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']),
  staff: user('staff@t.com', 'أخصائي', '', ['HR_STAFF']), cons: null };
const t = { mgr: login('mgr@t.com'), fin: login('fin@t.com'), tre: login('tre@t.com'), hr: login('hr@t.com'), sec: login('sec@t.com'), staff: login('staff@t.com') };
const today = ctx.today_(), add = (d, n) => ctx.addDaysYmd_(d, n);
function emp(id, name, pos, hire) { must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: id, Full_Name: name, Position_ID: P[pos].Position_ID, Hire_Date: hire, Employment_Kind: 'PERMANENT', reason: 'x' }), 'emp ' + id); }
emp('E-1', 'كريم محمود سالم', 'محاسب تكاليف', add(today, -74));     // final evaluation due today
emp('E-2', 'منى سعيد حسن', 'محاسب تكاليف', add(today, -29));       // day 30 today
emp('E-3', 'هاني فؤاد علي', 'أمين خزينة', add(today, -200));       // too old for a probation
emp('E-4', 'سارة نبيل أحمد', 'محاسب تكاليف', add(today, -2));

// =============== settings ===============
fresh();
ok(ctx.probDays_() === 90 && ctx.probDecisionDay_() === 80 && JSON.stringify(ctx.probCheckpoints_()) === '{"D30":30,"D60":60,"FINAL":75}', 'defaults: 90 days, reviews 30/60/75, decision by 80');
ctx.update_('CONFIG', 'PROBATION_DAYS', { Config_Value: '120' }, 'x'); fresh(); ok(ctx.probDays_() === 90, 'never more than 90 days');
ctx.update_('CONFIG', 'PROBATION_DAYS', { Config_Value: '90' }, 'x'); fresh();
const W = ctx.probWeights_(); ok(Object.values(W).reduce((a, b) => a + b, 0) === 100 && W.PROD === 35, 'weights sum to 100');

// =============== opening ===============
bad(api('prob.start', t.mgr, { Employee_ID: 'E-1' }), null, 'a unit manager cannot open a probation');
bad(api('prob.start', t.hr, { Employee_ID: 'E-3' }), /خلصت/, 'period already over → refused');
bad(api('prob.start', t.hr, { Employee_ID: 'E-1', Start_Date: add(today, -80) }), /قبل تاريخ التعيين/, 'not before the hire date');
const p1 = must(api('prob.start', t.hr, { Employee_ID: 'E-1' }), 'open E-1').id;
const p2 = must(api('prob.start', t.hr, { Employee_ID: 'E-2' }), 'open E-2').id;
bad(api('prob.start', t.hr, { Employee_ID: 'E-1' }), /مرة واحدة/, 'one probation per employee');
fresh();
let x = ctx.get_('PROBATIONS', p1);
ok(x.Start_Date === add(today, -74) && x.End_Date === add(x.Start_Date, 89) && x.Decision_Due === add(x.Start_Date, 79), 'end = day 90, decision = day 80');
ok(x.Manager_User_ID === U.mgr && x.Skip_User_ID === U.fin, 'direct manager = unit head, his manager = sector head');
const revs = ctx.find_('PROB_REVIEWS', { Probation_ID: p1 });
ok(revs.length === 5 && revs.find(r => r.Kind === 'FINAL').Due_Date === today && revs.find(r => r.Kind === 'D30').Due_Date === add(x.Start_Date, 29), 'five reviews (with the stay interview) dated from day one');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.mgr }).some(n => /فترة اختبار بدأت/.test(n.Title)), 'manager told to set the goals');

// hook on joining
fresh();
const j = { Joining_ID: 'JON-T1', Person_ID: 'CND-T1', Is_Demo: '' };
const viaJoin = ctx.probOnJoined_('SYSTEM', j, { Position_ID: P['أمين خزينة'].Position_ID, Location_ID: '' }, today, 'E-9', 'يوسف طارق');
ok(viaJoin && viaJoin.Manager_User_ID === U.tre && viaJoin.Joining_ID === 'JON-T1', 'joining opens the probation under the right manager');
fresh(); ok(ctx.probOnJoined_('SYSTEM', j, { Position_ID: P['أمين خزينة'].Position_ID }, today, 'E-9', 'يوسف طارق') === null, 'joining twice → no second probation');
const p9 = viaJoin.Probation_ID;

// =============== who sees ===============
let L = must(api('prob.list', t.mgr, { tab: 'all' }), 'manager list');
ok(L.rows.length === 2 && L.rows.every(r => r.manager === 'مدير الحسابات'), 'unit manager sees his two');
L = must(api('prob.list', t.tre, { tab: 'all' }), 'other manager'); ok(L.rows.length === 1 && L.rows[0].id === p9, 'another manager sees only his own');
bad(api('prob.get', t.tre, { Probation_ID: p1 }), /نطاقك/, 'not someone else’s');
L = must(api('prob.list', t.fin, { tab: 'all' }), 'sector head'); ok(L.rows.length === 3, 'sector head sees the whole sector');
L = must(api('prob.list', t.staff, { tab: 'all' }), 'HR staff'); ok(L.rows.length === 3 && L.canStart, 'HR sees all and can open');
L = must(api('prob.list', t.mgr, { tab: 'mine' }), 'mine'); ok(L.rows.length === 2 && L.rows[0].next.k === 'GOALS', 'manager: goals to set first');

// =============== goals ===============
const goals = [{ t: 'إقفال تكاليف الشهر في موعده', m: 'تقرير التكاليف قبل يوم 5', d: '' }, { t: 'مطابقة المخزون مع الحسابات', m: 'فروق أقل من 1%', d: '' }, { t: 'تعلم نظام التكاليف المعياري', m: 'يحسب أمر تشغيل لوحده', d: '' }];
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'GOALS', goals: goals.slice(0, 2) }), /من 3 لـ 5/, 'at least three goals');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'GOALS', goals: goals.concat([{ t: 'هدف', m: '' }]) }), /رقم 4/, 'every goal measurable');
bad(api('prob.action', t.tre, { Probation_ID: p1, action: 'GOALS', goals }), /نطاقك/, 'not his employee');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'GOALS', goals }), 'goals set');
must(api('prob.action', t.mgr, { Probation_ID: p2, action: 'GOALS', goals }), 'goals set p2');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'REVIEW', kind: 'D30', overall: 3, goals: [], strengths: 'xxx', improve: 'yyy' }), /اتسجلت|بتتفتح|حدد/, 'review needs every goal');
// link and the employee's page
const lk = must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'LINK' }), 'link');
const tok = /prob=([A-Za-z0-9]+)/.exec(lk.link)[1];
let I = must(pub('prob.info', { token: tok }), 'employee page');
ok(I.goals.length === 3 && !I.ackAt && I.day === 75 && I.days === 90 && I.self && I.self.open, 'employee sees goals, day 75 of 90, self-assessment open');
bad(pub('prob.info', { token: 'x'.repeat(30) }), /مش شغال/, 'wrong token');
I = must(pub('prob.submit', { token: tok, action: 'ACK' }), 'employee acknowledges');
ok(!!I.ackAt, 'acknowledged on the link');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'GOALS', goals }), /سبب التعديل/, 'changing acknowledged goals needs a reason');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'GOALS', goals, reason: 'إضافة دقة للمقياس' }), 'goals changed');
fresh(); ok(!ctx.get_('PROBATIONS', p1).Goals_Ack_At, 'acknowledgement reset after a change');
must(api('prob.action', t.hr, { Probation_ID: p1, action: 'ACK', channel: 'IN_PERSON' }), 'HR records the acknowledgement in person');
bad(api('prob.action', t.hr, { Probation_ID: p1, action: 'ACK' }), /بالفعل/, 'once');

// =============== performance log ===============
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'POS', date: add(today, 1), text: 'خلص تقرير التكاليف بدري' }), /المستقبل/, 'no future notes');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'POS', date: add(today, -100), text: 'خلص تقرير التكاليف بدري' }), /جوه فترة الاختبار/, 'inside the period');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'POS', text: 'كويس' }), /بالتفصيل/, 'a real description');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'POS', date: add(today, -10), text: 'سلّم تقرير التكاليف قبل الميعاد بيومين', impact: 'الإدارة أخدت قرار التسعير بدري' }), 'positive note');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'COR', date: add(today, -5), text: 'أخطاء في قيود المخزون الأسبوع ده' }), 'corrective note');
let D = must(api('prob.get', t.mgr, { Probation_ID: p1 }), 'detail');
const corId = D.notes.find(n => n.kind === 'COR').id;
I = must(pub('prob.info', { token: tok }), 'page');
ok(I.notes.length === 2 && I.notes[0].kind === 'COR', 'employee sees the notes, newest first');
I = must(pub('prob.submit', { token: tok, action: 'REPLY', Note_ID: corId, text: 'كان في عطل في السيستم يومين' }), 'reply');
bad(pub('prob.submit', { token: tok, action: 'REPLY', Note_ID: corId, text: 'تاني' }), /قبل كده/, 'one reply');
bad(api('prob.action', t.staff, { Probation_ID: p1, action: 'VOID_NOTE', Note_ID: corId, reason: '' }), /سبب/, 'voiding needs a reason');
bad(api('prob.action', t.fin, { Probation_ID: p1, action: 'VOID_NOTE', Note_ID: corId, reason: 'اتضح إنه عطل' }), /لكاتبها/, 'only the writer or HR voids');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'VOID_NOTE', Note_ID: corId, reason: 'اتضح إنه عطل في السيستم' }), 'voided');
I = must(pub('prob.info', { token: tok }), 'page'); ok(I.notes.length === 1, 'voided note hidden from the employee');
D = must(api('prob.get', t.hr, { Probation_ID: p1 }), 'detail'); ok(D.notes.length === 2 && D.notes.some(n => n.status === 'Voided' && n.reply), 'HR still sees it, with the reply');
fresh(); ok(ctx.find_('AUDIT_LOG', { Entity_Type: 'PROB_NOTE' }).length > 0, 'voiding audited');

// =============== reviews ===============
const gp = [{ st: 'ON' }, { st: 'BEHIND', n: 'لسه بيتعلم' }, { st: 'ON' }];
must(api('prob.action', t.mgr, { Probation_ID: p2, action: 'REVIEW', kind: 'D30', overall: 4, goals: gp, strengths: 'منظمة وسريعة', improve: 'محتاجة تدريب على النظام' }), 'day 30 review');
bad(api('prob.action', t.mgr, { Probation_ID: p2, action: 'REVIEW', kind: 'D60', overall: 3, goals: gp, strengths: 'xxx', improve: 'yyy' }), /بتتفتح/, 'day 60 not open yet');
bad(api('prob.action', t.mgr, { Probation_ID: p2, action: 'REVIEW', kind: 'D30', overall: 4, goals: gp, strengths: 'xxx', improve: 'yyy' }), /قبل كده/, 'once');
mails.length = 0;
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'REVIEW', kind: 'D30', overall: 3, goals: gp, strengths: 'ملتزم', improve: 'الدقة' }), 'p1 day 30 (late)');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'REVIEW', kind: 'D60', overall: 2, goals: gp, strengths: 'ملتزم', improve: 'الدقة في القيود' }), 'p1 day 60 low');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /تقييم منخفض/.test(n.Title)), 'a low review alerts HR');

// =============== improvement plan ===============
const pip = { goals: [{ t: 'قيود مخزون من غير أخطاء', m: 'صفر أخطاء في المراجعة الأسبوعية' }, { t: 'إقفال الشهر في موعده', m: 'قبل يوم 5' }], support: 'تدريب يومين مع مدير الحسابات ومراجعة أسبوعية', review: add(today, 14) };
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'PIP_START', ...pip }), /يوم 60/, 'too late for a plan on day 75 — no extension');
bad(api('prob.action', t.mgr, { Probation_ID: p2, action: 'PIP_START', ...pip, review: add(today, 5) }), /أسبوعين لـ 4/, 'review 2–4 weeks out');
bad(api('prob.action', t.mgr, { Probation_ID: p2, action: 'PIP_START', ...pip, support: 'لا' }), /الدعم/, 'support written');
must(api('prob.action', t.mgr, { Probation_ID: p2, action: 'PIP_START', ...pip }), 'plan started on p2');
bad(api('prob.action', t.mgr, { Probation_ID: p2, action: 'PIP_OUTCOME', outcome: 'PASSED', note: 'تحسن واضح في الأسبوعين' }), /قرب ميعاد/, 'outcome near the review date');
I = must(pub('prob.info', { token: /prob=([A-Za-z0-9]+)/.exec(must(api('prob.action', t.mgr, { Probation_ID: p2, action: 'LINK' }), 'link2').link)[1] }), 'p2 page');
ok(I.pip && I.pip.goals.length === 2 && !I.self.open && I.self.opensOn === add(ctx.get_('PROBATIONS', p2).Start_Date, 64), 'plan shown to the employee; self-assessment not open yet');

// =============== final evaluation ===============
const sc = (s, e) => ({ PROD: { s, e }, QUAL: { s, e }, V1: { s, e }, V2: { s, e }, V3: { s, e }, V4: { s, e } });
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'FINAL', scores: sc(3, ''), strengths: 'xxx', improve: 'yyy' }), /مثال أو دليل/, 'evidence for each item');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'RECOMMEND', rec: 'CONFIRM', reason: 'كويس' }), /التقييم النهائي الأول/, 'recommend after the final evaluation');
// self-assessment first: open today, final due today → the manager may go ahead anyway (due date reached); do it the proper way
bad(pub('prob.submit', { token: tok, action: 'SELF', scores: { PROD: 4 } }), /كل البنود/, 'self-assessment: every item');
must(pub('prob.submit', { token: tok, action: 'SELF', scores: { PROD: 4, QUAL: 3, V1: 4, V2: 5, V3: 4, V4: 4 }, comment: 'اتعلمت كتير' }), 'self-assessment');
bad(pub('prob.submit', { token: tok, action: 'SELF', scores: { PROD: 4, QUAL: 3, V1: 4, V2: 5, V3: 4, V4: 4 } }), /اتقفل/, 'once');
const scores = { PROD: { s: 3, e: 'التقارير في ميعادها' }, QUAL: { s: 2, e: 'أخطاء قيود الشهر الماضي' }, V1: { s: 3, e: 'اقترح شيت متابعة' }, V2: { s: 4, e: 'ملتزم بالمواعيد' }, V3: { s: 3, e: 'علاقته كويسة' }, V4: { s: 1, e: 'رفض يساعد زميله' } };
const F = must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'FINAL', scores, strengths: 'ملتزم ومنظم', improve: 'الدقة والتعاون' }), 'final');
ok(F.computed.avg === 2.7 && !F.computed.pass && F.computed.minValue === 1, 'weighted score 2.7, below the bar (and a value at 1)');
D = must(api('prob.get', t.mgr, { Probation_ID: p1 }), 'detail');
ok(D.reviews.find(r => r.kind === 'SELF').status === 'DONE' && D.reviews.find(r => r.kind === 'SELF').scores.V2.s === 5 && D.can.recommend, 'manager sees the self-assessment, can recommend');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'RECOMMEND', rec: 'CONFIRM', reason: 'محتاج فرصة' }), /بالتفصيل/, 'against the score → detailed reason');
must(api('prob.action', t.mgr, { Probation_ID: p1, action: 'RECOMMEND', rec: 'TERMINATE', reason: 'التقييم أقل من المطلوب في الجودة والعمل الجماعي' }), 'recommend not to confirm');
fresh(); ok(ctx.get_('PROBATIONS', p1).Status === 'PENDING_DECISION' && ctx.find_('NOTIFICATIONS', { User_ID: U.sec }).some(n => /توصية/.test(n.Title)), 'waits on HR; the HR sector manager told');
L = must(api('prob.list', t.sec, { tab: 'mine' }), 'sector mine'); ok(L.rows.some(r => r.id === p1), 'on the HR sector manager’s list');
fresh(); let td = ctx.probTodo_({ user: ctx.get_('USERS', U.sec), readOnly: false }); ok(td.decide === 1, 'todo: one decision');

// =============== decision ===============
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'DECIDE', decision: 'TERMINATED', note: 'x' }), /الموارد البشرية/, 'managers do not decide');
bad(api('prob.action', t.hr, { Probation_ID: p1, action: 'DECIDE', decision: 'TERMINATED', note: 'التقييم 2.7 والجودة والتعاون أقل من المطلوب' }), /قطاع الموارد البشرية بس/, 'ending the employment: HR sector only');
bad(api('prob.action', t.sec, { Probation_ID: p1, action: 'DECIDE', decision: 'TERMINATED', note: 'ضعيف' }), /بالتفصيل/, 'reasons in detail');
bad(api('prob.action', t.sec, { Probation_ID: p1, action: 'MEETING', date: today }), /بعد القرار/, 'meeting after the decision');
must(api('prob.action', t.sec, { Probation_ID: p1, action: 'DECIDE', decision: 'TERMINATED', note: 'التقييم 2.7 والجودة والعمل الجماعي أقل من المطلوب رغم المتابعة' }), 'decided: not confirmed');
fresh(); x = ctx.get_('PROBATIONS', p1);
ok(x.Status === 'TERMINATED' && !ctx.findOne_('MEDICAL_CASES', { Probation_ID: p1 }) && ctx.find_('EMPLOYEE_HISTORY', { Employee_ID: 'E-1' }).some(h => h.Event === 'PROBATION_TERMINATED'), 'closed, no medical case, employee history');
must(api('prob.action', t.hr, { Probation_ID: p1, action: 'MEETING', date: today }), 'meeting recorded');
must(api('prob.action', t.hr, { Probation_ID: p1, action: 'LETTER' }), 'letter printed');
bad(api('prob.action', t.mgr, { Probation_ID: p1, action: 'NOTE', kind: 'POS', text: 'ملاحظة بعد القفل خالص' }), /اتقفلت/, 'nothing after closing');
bad(pub('prob.submit', { token: tok, action: 'ACK' }), /اتقفلت/, 'the page is read-only after closing');

// confirm path on the joined one (day 1): fast-forward its dates
fresh();
ctx.update_('PROBATIONS', p9, { Start_Date: add(today, -76), End_Date: add(today, 13), Decision_Due: add(today, 3) }, 'x');
ctx.find_('PROB_REVIEWS', { Probation_ID: p9 }).forEach(r => ctx.update_('PROB_REVIEWS', r.Review_ID, { Due_Date: add(today, { D30: -47, D60: -17, FINAL: -2, SELF: -2, STAY: -16 }[r.Kind]) }, 'x'));
must(api('prob.action', t.tre, { Probation_ID: p9, action: 'GOALS', goals }), 'goals p9');
must(api('prob.action', t.tre, { Probation_ID: p9, action: 'FINAL', scores: sc(4, 'أداء ممتاز طول الفترة'), strengths: 'دقيق', improve: 'السرعة' }), 'final p9 (self window passed)');
must(api('prob.action', t.tre, { Probation_ID: p9, action: 'RECOMMEND', rec: 'CONFIRM', reason: 'حقق كل الأهداف' }), 'recommend confirm');
must(api('prob.action', t.staff, { Probation_ID: p9, action: 'DECIDE', decision: 'CONFIRMED', note: 'تثبيت حسب التوصية' }), 'HR staff confirms');
fresh(); const mc = ctx.findOne_('MEDICAL_CASES', { Probation_ID: p9 });
ok(ctx.get_('PROBATIONS', p9).Status === 'CONFIRMED' && mc && mc.Status === 'TO_ADD' && mc.Due_Date === add(today, 14), 'confirmed → medical insurance case, due in 14 days');

// =============== medical insurance ===============
bad(api('med.list', t.mgr, {}), null, 'managers do not see medical insurance');
let M = must(api('med.list', t.hr, { tab: 'open' }), 'medical list'); ok(M.rows.length === 1 && M.counts.open === 1 && M.counts.late === 0, 'one open case');
bad(api('med.action', t.hr, { Case_ID: mc.Case_ID, action: 'ADD', provider: 'شركة', card: '' }), /رقم الكارت/, 'card number');
bad(api('med.action', t.hr, { Case_ID: mc.Case_ID, action: 'ADD', provider: 'شركة', card: '12345', date: add(today, 1) }), /غير صحيح/, 'no future date');
must(api('med.action', t.hr, { Case_ID: mc.Case_ID, action: 'ADD', provider: 'أكسا', card: '٧٧٨٨٩٩', dependents: 2 }), 'added');
fresh(); ok(ctx.get_('MEDICAL_CASES', mc.Case_ID).Card_No === '778899' && ctx.get_('MEDICAL_CASES', mc.Case_ID).Dependents === '2', 'Arabic digits normalised');
bad(api('med.action', t.staff, { Case_ID: mc.Case_ID, action: 'REOPEN', reason: 'غلط' }), /مديرين/, 'reopen: HR managers');
must(api('med.action', t.hr, { Case_ID: mc.Case_ID, action: 'REOPEN', reason: 'رقم الكارت غلط' }), 'reopened');
D = must(api('prob.get', t.hr, { Probation_ID: p9 }), 'detail HR'); ok(D.medical && D.medical.status === 'TO_ADD', 'HR sees the medical case on the probation');
D = must(api('prob.get', t.tre, { Probation_ID: p9 }), 'detail mgr'); ok(D.medical === null, 'the manager does not');
fresh(); ctx.update_('MEDICAL_CASES', mc.Case_ID, { Due_Date: add(today, -1) }, 'x');
fresh(); ok(ctx.medDaily_().late === 1 && ctx.medDaily_().late === 0, 'late case reported once');

// =============== daily reminders & escalation ===============
emp('E-5', 'رامي عادل حسين', 'محاسب تكاليف', add(today, -40));
const p5 = must(api('prob.start', t.hr, { Employee_ID: 'E-5' }), 'open E-5').id;   // day 30 review 11 days late, no goals yet
fresh(); ctx.update_('CONFIG', 'PROB_ESCALATE_DAYS', { Config_Value: '3,7' }, 'x');
fresh(); let out = ctx.probDaily_();
fresh();
const n = id => ctx.find_('NOTIFICATIONS', { Link_ID: p5 }).filter(x => x.User_ID === id).map(x => x.Title).join(' | ');
ok(/لسه ماتحطتش/.test(n(U.mgr)), 'goals reminder to the manager');
ok(/متأخر/.test(n(U.fin)) && /متأخر/.test(n(U.sec)), 'late review → manager’s manager, then the HR sector');
const before = ctx.find_('NOTIFICATIONS', {}).length; fresh(); ctx.probDaily_(); fresh();
ok(ctx.find_('NOTIFICATIONS', {}).length === before, 'each reminder once');
// decision late + employee who left
fresh(); ctx.update_('PROBATIONS', p2, { Decision_Due: add(today, -1) }, 'x'); fresh(); ctx.probDaily_(); fresh();
ok(ctx.find_('NOTIFICATIONS', { Link_ID: p2 }).some(x => /القرار.*متأخر|قرار فترة الاختبار متأخر/.test(x.Title)), 'late decision escalated');
fresh(); ctx.update_('EMPLOYEES', 'E-5', { Status: 'Exited', Exit_Date: today, Exit_Reason: 'RESIGNATION' }, 'x');
fresh(); ctx.probDaily_(); fresh();
ok(ctx.get_('PROBATIONS', p5).Status === 'ENDED', 'probation of an employee who left is closed');

// =============== consultant (view only) ===============
fresh();
ok(ctx.consultantMay_('prob.list', {}) && ctx.consultantMay_('prob.get', {}) && ctx.consultantMay_('med.list', {}), 'consultant may view probations and medical cases');
ok(!ctx.consultantMay_('prob.action', {}) && !ctx.consultantMay_('prob.start', {}) && !ctx.consultantMay_('med.action', {}), 'but never change them');

console.log('phase25: ' + pass + ' passed, ' + failN + ' failed');
