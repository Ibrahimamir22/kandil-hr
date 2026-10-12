// Phase 4A (v0.11.0): interview plan, scheduling + confirmation chain, panel, check-in & evidence, workspace,
// independent evaluations with versions, readiness + live comparison, waive / ad-hoc / reschedule / no-show,
// daily reminders, HR question bank.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { cfo: user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي'].Position_ID), acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID),
  hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']),
  exp: user('exp@t.com', 'خبير التكاليف', ''), out: user('out@t.com', 'شخص بعيد', '') };
const t = { cfo: login('cfo@t.com'), acc: login('acc@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), exp: login('exp@t.com'), out: login('out@t.com') };

// JD with competencies (CORE, FIN, LEAD) so each round shows its own part
const JOB = P['محاسب تكاليف'].Job_Code;
must(api('jd.import', t.hr, { kind: 'library', commit: true,
  comps: [{ code: 'C01', group: 'CORE', name: 'النزاهة والمسؤولية', levels: ['l1', 'l2', 'l3', 'l4'], req: [2, 2, 2, 3, 3, 4, 4] },
          { code: 'FN01', group: 'FIN', name: 'محاسبة التكاليف', levels: ['f1', 'f2', 'f3', 'f4'], req: [1, 2, 3, 3, 3, 3, 3] },
          { code: 'LD01', group: 'LEAD', name: 'قيادة الفريق', levels: ['a', 'b', 'c', 'd'], req: [0, 0, 1, 2, 2, 3, 4] }],
  questions: [{ code: 'C01', seq: 1, q: 'احكي عن غلطة عملتها', strong: 'اعترف', weak: 'برر', from: 'JL1' },
              { code: 'FN01', seq: 1, q: 'إزاي بتحسب تكلفة المنتج؟', strong: 'مباشر وغير مباشر', weak: 'عام', from: 'JL1' }], tests: [] }), 'library');
must(api('jd.import', t.hr, { kind: 'jds', commit: true, reason: 'x', jds: [{ code: JOB, title: 'محاسب تكاليف', level: 'JL3', purpose: 'حساب تكلفة المنتجات بدقة', resp: ['يحسب', 'يطابق', 'يحلل'],
  comps: [{ c: 'C01', l: 2 }, { c: 'FN01', l: 3 }, { c: 'LD01', l: 1 }] }] }), 'jd');
must(api('jd.approve', t.hr, { all: 'Y', reason: 'x' }), 'approve jd');

// vacancy with requirements (education, experience, essential skill)
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Experience_Years: '3',
  skills: [{ Skill: 'SAP', Proficiency: 'GOOD', Importance: 'ESSENTIAL' }, { Skill: 'Excel', Proficiency: 'GOOD', Importance: 'PREFERRED' }],
  lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
fresh(); const LOC = ctx.all_('LOCATIONS')[0].Location_ID;
const today = ctx.today_();

// =============== plan ===============
let PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC }), 'plan');
ok(PL.rounds.length === 3 && PL.rounds[0].type === 'HR' && PL.rounds[1].req === 'REQUIRED' && PL.rounds[2].req === 'OPTIONAL' && PL.canEdit && !PL.custom, 'default plan from settings');
bad(api('int.plan', t.rec, { Vacancy_ID: VAC, rounds: [{ name: 'x', type: 'HR', req: 'REQUIRED' }] }), /اسم/, 'round name');
bad(api('int.plan', t.rec, { Vacancy_ID: VAC, rounds: [{ name: 'جولة غريبة', type: 'XX', req: 'REQUIRED' }] }), /نوع/, 'round type');
bad(api('int.plan', t.out, { Vacancy_ID: VAC }), /صلاحية/, 'outsider cannot read the plan');
PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC, rounds: PL.rounds.concat([{ name: 'مقابلة مع المدير المالي', type: 'SENIOR', req: 'CONDITIONAL' }]) }), 'add a round');
ok(PL.rounds.length === 4 && PL.rounds[3].id === 'R4', 'new round id');
PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC, rounds: PL.rounds.slice(0, 3) }), 'remove unused round');
ok(PL.rounds.length === 3 && PL.custom, 'plan saved on the vacancy');
const R = { HR: 'R1', MGR: 'R2', SEN: 'R3' };

// =============== candidates ===============
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
function cand(name, mobile, cv) {
  const a = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y', Expected_Salary: '15000',
    cv: cv ? { name: 'cv.pdf', mime: 'application/pdf', data: pdf } : null }), 'cand ' + name).application.Application_ID;
  return a;
}
const A1 = cand('أحمد علي حسن', '01011112222', true), A2 = cand('منى سعيد حسن', '01022223333'), A3 = cand('كريم محمود سالم', '01033334444'), A4 = cand('هالة سمير علي', '01044445555');
[A1, A2, A3].forEach(a => must(api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }), 'shortlist'));
bad(api('cand.move', t.rec, { Application_ID: A1, to: 'INTERVIEW' }), /أول مقابلة/, 'INTERVIEW stage only through scheduling');

// =============== people & validation ===============
let PP = must(api('int.people', t.rec, { Vacancy_ID: VAC, Round_ID: R.MGR }), 'people');
ok(PP.suggest[0].User_ID === U.acc && PP.suggest[0].Role === 'LEAD' && PP.suggest.some(x => x.User_ID === U.rec && x.Role === 'HR'), 'manager round suggests the direct manager as lead + me as HR');
ok(must(api('int.people', t.rec, { Vacancy_ID: VAC, Round_ID: R.SEN }), 'people senior').suggest[0].User_ID === U.cfo, 'senior round suggests the sector head');
ok(PP.users.some(u => u.id === U.exp) && PP.users.find(u => u.id === U.acc).title === 'مدير الحسابات', 'all active users with titles');
const base = { Date: today, Time: '10:00', Mode: 'IN_PERSON', Location_ID: LOC, Place: 'غرفة الاجتماعات' };
const mgrPanel = [{ User_ID: U.acc, Role: 'LEAD' }, { User_ID: U.rec, Role: 'HR' }, { User_ID: U.exp, Role: 'TECHNICAL' }, { User_ID: U.rm, Role: 'OBSERVER' }];
bad(api('int.create', t.rec, Object.assign({ Application_ID: A4, Round_ID: R.MGR, panel: mgrPanel }, base)), /القائمة المختصرة/, 'not shortlisted');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel }, base, { Date: '2020-01-01' })), /النهارده أو بعد/, 'past date');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel }, base, { Location_ID: '' })), /مكان/, 'place needed in person');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel }, base, { Mode: 'VIDEO', Meeting_Link: 'zoom' })), /لينك/, 'video needs a link');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: [{ User_ID: U.acc, Role: 'LEAD' }, { User_ID: U.exp, Role: 'LEAD' }] }, base)), /مسؤول واحد/, 'one lead');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: [{ User_ID: U.acc, Role: 'TECHNICAL' }] }, base)), /مسؤول واحد/, 'a lead is required');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: 'R9', panel: mgrPanel }, base)), /الجولة/, 'unknown round');
bad(api('int.create', t.out, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel }, base)), null, 'outsider cannot schedule');

// =============== HR round: recruiter leads himself → confirmed at once ===============
const ivHR = must(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.HR, panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Time: '09:00' })), 'HR interview').interview;
ok(ivHR.Status === 'MANAGER_CONFIRMED' && /^INT-\d{4}-\d{5}$/.test(ivHR.Interview_ID), 'self-led → confirmed: ' + ivHR.Interview_ID);
fresh(); ok(ctx.get_('APPLICATIONS', A1).Stage === 'INTERVIEW', 'first interview moves the candidate to INTERVIEW');
ok(ctx.find_('ACTIVITIES', { Application_ID: A1, Type: 'STAGE' }).some(x => x.Stage_To === 'INTERVIEW'), 'stage logged');

// =============== manager round: the chain ===============
mails.length = 0;
const iv2 = must(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel, Notes: 'ركّز على SAP' }, base)), 'manager interview').interview;
ok(iv2.Status === 'PROPOSED' && iv2.Lead_User_ID === U.acc, 'proposed, waiting for the manager');
ok(mails.some(m => m.to === 'acc@t.com'), 'lead gets an email to confirm');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.exp }).some(n => /اتضفت للجنة/.test(n.Title)), 'panel told');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.MGR, panel: mgrPanel }, base)), /بالفعل/, 'one live interview per round');
bad(api('int.action', t.rec, { Interview_ID: iv2.Interview_ID, action: 'INVITED' }), /قبل ما المقابِل يأكّد/, 'no invitation before the manager confirms (INT-001)');
let L = must(api('int.list', t.acc, { tab: 'mine' }), 'manager list');
ok(L.length === 1 && L[0].need === 'CONFIRM' && L[0].myRole === 'LEAD' && /غرفة/.test(L[0].place), 'manager schedule shows it with place (INT-002)');
ok(must(api('todo', t.acc, {}), 'todo').iv.confirm === 1, 'home counter: confirm');
bad(api('int.action', t.out, { Interview_ID: iv2.Interview_ID, action: 'CONFIRM' }), /صلاحية/, 'outsider');
bad(api('int.action', t.exp, { Interview_ID: iv2.Interview_ID, action: 'CHECKIN' }), /مااتأكدتش/, 'no check-in before confirmation');
must(api('int.action', t.exp, { Interview_ID: iv2.Interview_ID, action: 'CONFIRM' }), 'technical member confirms attendance');
fresh(); ok(ctx.get_('INTERVIEWS', iv2.Interview_ID).Status === 'PROPOSED', 'only the lead confirms the interview');
must(api('int.action', t.acc, { Interview_ID: iv2.Interview_ID, action: 'CONFIRM' }), 'manager confirms');
fresh(); let x = ctx.get_('INTERVIEWS', iv2.Interview_ID);
ok(x.Status === 'MANAGER_CONFIRMED' && x.Manager_Confirmed_By === U.acc, 'manager confirmed');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /ابعت الدعوة/.test(n.Title)), 'recruiter told to invite');
bad(api('int.action', t.acc, { Interview_ID: iv2.Interview_ID, action: 'CONFIRM' }), /قبل كده/, 'no double confirm');
bad(api('int.action', t.acc, { Interview_ID: iv2.Interview_ID, action: 'INVITED' }), /فريق التوظيف/, 'manager cannot log the invitation');
bad(api('int.action', t.rec, { Interview_ID: iv2.Interview_ID, action: 'CAND_CONFIRM' }), /الدعوة/, 'candidate confirms after the invitation');
must(api('int.action', t.rec, { Interview_ID: iv2.Interview_ID, action: 'INVITED', channel: 'WHATSAPP', Template_Code: 'INTERVIEW_INVITE' }), 'invited');
fresh(); ok(ctx.find_('ACTIVITIES', { Application_ID: A1, Type: 'WHATSAPP' }).some(a => /دعوة مقابلة/.test(a.Note) && a.Template_Code === 'INTERVIEW_INVITE'), 'invitation in the candidate log');
must(api('int.action', t.rec, { Interview_ID: iv2.Interview_ID, action: 'CAND_CONFIRM' }), 'candidate confirmed');
fresh(); ok(ctx.get_('INTERVIEWS', iv2.Interview_ID).Status === 'CONFIRMED', 'confirmed');

// =============== workspace (panel member without vacancy access) ===============
let W = must(api('int.get', t.exp, { Interview_ID: iv2.Interview_ID }), 'expert opens');
ok(W.access.panel === 'TECHNICAL' && !W.access.full && W.access.evaluator, 'panel access');
ok(W.candidate.Full_Name === 'أحمد علي حسن' && W.candidate.Mobile === undefined && W.candidate.Expected_Salary === undefined, 'no contact / salary for technical interviewers');
ok(W.jd && W.jd.comps.length === 3 && W.guide.comps.length === 1 && W.guide.comps[0].code === 'FN01' && W.guide.comps[0].questions.length === 1, 'manager round shows the functional competency + its questions (INT-006/007)');
ok(W.guide.std.some(q => q.kind === 'MANDATORY') && W.guide.reqs.length === 3 && W.guide.reqs.some(r => /SAP/.test(r.label)) && W.guide.reqsRequired, 'requirements from the request (education, experience, essential skill)');
ok(W.can.indexOf('CHECKIN') >= 0 && W.can.indexOf('INVITED') < 0, 'expert can check in, cannot invite');
bad(api('cand.app', t.exp, { Application_ID: A1 }), /صلاحية/, 'no candidate page for the expert');
const cvr = api('cand.cv', t.exp, { Person_ID: W.candidate.Person_ID, Interview_ID: iv2.Interview_ID });
ok(cvr.ok, 'CV through the interview: ' + (cvr.ok ? '' : cvr.error));
bad(api('cand.cv', t.out, { Person_ID: W.candidate.Person_ID, Interview_ID: iv2.Interview_ID }), /صلاحية/, 'no CV for outsiders');
let WH = must(api('int.get', t.rec, { Interview_ID: ivHR.Interview_ID }), 'HR workspace');
ok(WH.guide.comps.length === 1 && WH.guide.comps[0].code === 'C01' && WH.guide.std.filter(q => q.kind === 'MANDATORY').length === 6, 'HR round: core competency + six mandatory HR questions (INT-007)');
ok(WH.candidate.Mobile === '01011112222' && WH.candidate.Expected_Salary === '15000', 'recruiter sees full data');

// =============== check-in, evidence, start ===============
must(api('int.action', t.rec, { Interview_ID: iv2.Interview_ID, action: 'CHECKIN' }), 'check-in');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /وصل ومستنيك/.test(n.Title)), 'panel told the candidate arrived');
ok(must(api('todo', t.acc, {}), 'todo 2').iv.waiting === 1, 'waiting counter');
// back-date the check-in 12 minutes to read the waiting time
fresh(); x = ctx.get_('INTERVIEWS', iv2.Interview_ID);
const ci = new Date(Date.now() + 3 * 3600000 - 12 * 60000).toISOString().slice(0, 19);
ctx.update_('INTERVIEWS', iv2.Interview_ID, { Checked_In_At: ci }, 'x');
W = must(api('int.get', t.exp, { Interview_ID: iv2.Interview_ID, open: 'Y' }), 'expert opens after check-in');
fresh(); ok(ctx.find_('EVENTS', { Entity_Type: 'INTERVIEW', Entity_ID: iv2.Interview_ID, Event: 'OPENED' }).length === 1, 'screen opened recorded');
W = must(api('int.get', t.rec, { Interview_ID: iv2.Interview_ID }), 'detail');
const wait = W.evidence.find(e => e.k === 'WAIT');
ok(wait && wait.min >= 11 && wait.min <= 13 && /استنى 1\d دقيقة/.test(wait.text), 'evidence: waited ~12 minutes before the first panel activity: ' + (wait && wait.text));
must(api('eval.save', t.exp, { Interview_ID: iv2.Interview_ID, comps: [{ c: 'FN01', r: '4', n: 'شرح طريقة التحميل' }] }), 'draft during the interview');
bad(api('eval.save', t.exp, { Interview_ID: iv2.Interview_ID, submit: 'Y', Recommendation: 'PROCEED', Summary: 'كويس جداً في التكاليف' }), /ابدأ المقابلة/, 'submit after start');
must(api('int.action', t.acc, { Interview_ID: iv2.Interview_ID, action: 'START' }), 'start');

// =============== evaluations: validation, independence ===============
const reqs = W.guide.reqs.map(r => ({ k: r.k, s: 'MET', e: 'مكتوب في السيرة وأكّده' }));
const mand = W.guide.std.filter(q => q.kind === 'MANDATORY').map(q => ({ id: q.id, asked: 'Y', n: 'جاوب كويس' }));
const good = { Interview_ID: iv2.Interview_ID, comps: [{ c: 'FN01', r: '4', n: 'شرح طريقة التحميل' }], reqs, qs: mand, Recommendation: 'PROCEED', Summary: 'كويس جداً في التكاليف', submit: 'Y' };
bad(api('eval.save', t.exp, Object.assign({}, good, { Recommendation: '' })), /التوصية/, 'recommendation required');
bad(api('eval.save', t.exp, Object.assign({}, good, { reqs: reqs.slice(1) })), /حدد حالة/, 'every requirement in a manager round');
bad(api('eval.save', t.exp, Object.assign({}, good, { reqs: [Object.assign({}, reqs[0], { e: '' })].concat(reqs.slice(1)) })), /الدليل/, 'evidence on each requirement');
bad(api('eval.save', t.exp, Object.assign({}, good, { comps: [{ c: 'FN01', r: '5', n: '' }] })), /الدليل/, 'a 5 needs evidence');
bad(api('eval.save', t.exp, Object.assign({}, good, { comps: [{ c: 'FN01', r: '7' }] })), /1 لـ 5/, 'scale 1–5');
bad(api('eval.save', t.exp, Object.assign({}, good, { qs: [] })), /الإجباري/, 'mandatory questions must be asked');
bad(api('eval.save', t.exp, Object.assign({}, good, { comps: [{ c: 'C01', r: '3' }] })), /كفاءة واحدة/, 'only the round\'s competencies count');
bad(api('eval.save', t.rm, good), /اللي بيقيّموا/, 'observer does not evaluate');
let E = must(api('eval.save', t.exp, Object.assign({}, good, { Recommendation: 'STRONG_PROCEED', added: [{ q: 'سألته عن الجرد', n: 'إجابة كويسة' }] })), 'expert submits');
ok(E.evaluation.Status === 'SUBMITTED' && E.evaluation.data.added.length === 1 && !E.evaluation.Late, 'submitted with an interviewer-added question');
fresh(); x = ctx.get_('INTERVIEWS', iv2.Interview_ID); ok(x.Status === 'COMPLETED' && x.Completed_At, 'submission ends a started interview');
bad(api('eval.save', t.exp, good), /تعديل التقييم/, 'no silent change after submitting');
W = must(api('int.get', t.acc, { Interview_ID: iv2.Interview_ID }), 'manager before evaluating');
ok(W.evaluations.length === 0 && W.hiddenEvals === 1 && W.can.indexOf('EVALUATE') >= 0, 'others\' evaluations hidden until he submits (INT-008)');
let AP = must(api('cand.app', t.acc, { Application_ID: A1 }), 'manager candidate page');
ok(AP.iv.hidden && AP.iv.list.every(i => !i.recs.length), 'candidate page hides recommendations too');
W = must(api('int.get', t.rm, { Interview_ID: iv2.Interview_ID }), 'recruitment manager (observer)');
ok(W.evaluations.length === 1 && W.evaluations[0].Recommendation === 'STRONG_PROCEED', 'observer / team sees submitted evaluations');
must(api('eval.save', t.acc, Object.assign({}, good, { Recommendation: 'DO_NOT_PROCEED', comps: [{ c: 'FN01', r: '1', n: 'ماعرفش يفرق بين المباشر وغير المباشر' }], Summary: 'خبرته في التكاليف ضعيفة' })), 'manager submits');
W = must(api('int.get', t.acc, { Interview_ID: iv2.Interview_ID }), 'manager after evaluating');
ok(W.evaluations.length === 2, 'now he sees the others');
must(api('eval.save', t.rec, Object.assign({}, good, { Recommendation: 'PROCEED' })), 'HR member submits');
fresh(); x = ctx.get_('INTERVIEWS', iv2.Interview_ID); ok(x.Status === 'EVALUATED' && x.Evaluated_At, 'all evaluators → EVALUATED');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /اتسلّم تقييم/.test(n.Title)), 'organizer told when an evaluation comes in');

// =============== HR round → readiness ===============
must(api('int.action', t.rec, { Interview_ID: ivHR.Interview_ID, action: 'CHECKIN' }), 'HR check-in (confirmed by the recruiter himself)');
must(api('int.action', t.rec, { Interview_ID: ivHR.Interview_ID, action: 'START' }), 'HR start');
must(api('int.action', t.rec, { Interview_ID: ivHR.Interview_ID, action: 'COMPLETE' }), 'HR complete');
WH = must(api('int.get', t.rec, { Interview_ID: ivHR.Interview_ID }), 'HR guide');
bad(api('eval.save', t.rec, { Interview_ID: ivHR.Interview_ID, comps: [{ c: 'C01', r: '3' }], reqs: WH.guide.reqs.map(r => ({ k: r.k, s: 'MET', e: 'تمام' })), qs: WH.guide.std.slice(0, 2).map(q => ({ id: q.id, asked: 'Y' })), Recommendation: 'PROCEED', Summary: 'مناسب من ناحية HR', submit: 'Y' }), /الإجباري/, 'all six HR questions');
must(api('eval.save', t.rec, { Interview_ID: ivHR.Interview_ID, comps: [{ c: 'C01', r: '3' }], reqs: WH.guide.reqs.map(r => ({ k: r.k, s: r.k === 'EXP' ? 'VERIFY' : 'MET', e: 'من المقابلة' })),
  qs: WH.guide.std.filter(q => q.kind === 'MANDATORY').map(q => ({ id: q.id, asked: 'Y' })), Recommendation: 'PROCEED', Summary: 'مناسب من ناحية HR', Strengths: 'مستقر', Concerns: 'المرتب', submit: 'Y' }), 'HR evaluation');
AP = must(api('cand.app', t.rec, { Application_ID: A1 }), 'candidate page');
ok(AP.iv.readiness.code === 'READY' && AP.iv.readiness.conflict && AP.iv.readiness.evals.submitted === 4 && AP.iv.readiness.evals.expected === 4, 'ready for decision, with an evaluation conflict (INT-009)');
ok(AP.iv.rounds[2].status === 'NONE' && AP.iv.rounds[2].req === 'OPTIONAL' && AP.iv.list.length === 2 && AP.iv.canSchedule && !AP.iv.canWaive, 'optional round not needed; recruiter cannot waive');
let C = must(api('int.compare', t.acc, { Vacancy_ID: VAC }), 'compare (hiring manager)');
let c1 = C.rows.find(r => r.Application_ID === A1);
ok(c1 && c1.readiness === 'READY' && c1.conflict && c1.recs.length === 4 && c1.expected === undefined, 'compare row; no salary for the manager');
ok(c1.comps.FN01.n === 3 && c1.comps.FN01.avg === 3 && c1.comps.FN01.spread === 3 && c1.reqs.EXP === 'VERIFY' && c1.reqs.EDU === 'MET', 'ratings shown with count and spread, requirements by worst status: ' + JSON.stringify(c1.comps));
ok(C.comps.length === 3 && C.reqs.length === 3, 'comparison columns');
ok(must(api('int.compare', t.rec, { Vacancy_ID: VAC }), 'compare (recruiter)').rows.find(r => r.Application_ID === A1).expected === '15000', 'team sees the expected salary');

// =============== revision = new version with reason ===============
bad(api('eval.revise', t.acc, { Interview_ID: iv2.Interview_ID }), /سبب/, 'revision needs a reason');
must(api('eval.revise', t.acc, { Interview_ID: iv2.Interview_ID, reason: 'راجعت شغله الفعلي بعد المقابلة' }), 'revise');
bad(api('eval.revise', t.acc, { Interview_ID: iv2.Interview_ID, reason: 'تاني مرة' }), /مفتوح/, 'one open revision');
E = must(api('eval.save', t.acc, Object.assign({}, good, { Recommendation: 'PROCEED', comps: [{ c: 'FN01', r: '3', n: '' }], Summary: 'بعد المراجعة: مقبول' })), 'resubmit');
ok(E.evaluation.Version === '2' && E.evaluation.Revision_Reason, 'version 2 with the reason');
fresh(); ok(ctx.find_('EVALUATIONS', { Interview_ID: iv2.Interview_ID, Evaluator_ID: U.acc }).map(e => e.Status).sort().join() === 'SUBMITTED,SUPERSEDED', 'old version kept as superseded');
c1 = must(api('int.compare', t.rec, { Vacancy_ID: VAC }), 'compare 2').rows.find(r => r.Application_ID === A1);
ok(!c1.conflict && c1.comps.FN01.avg === 3.7, 'conflict cleared, current versions only: ' + c1.comps.FN01.avg);

// =============== decline → reschedule; candidate decline; ad-hoc; panel change ===============
const iv3 = must(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: R.MGR, panel: [{ User_ID: U.acc, Role: 'LEAD' }] }, base, { Time: '13:00' })), 'A2 manager interview').interview;
bad(api('int.action', t.acc, { Interview_ID: iv3.Interview_ID, action: 'DECLINE' }), /السبب/, 'decline needs a reason');
must(api('int.action', t.acc, { Interview_ID: iv3.Interview_ID, action: 'DECLINE', note: 'عندي اجتماع ميزانية — ممكن بكرة' }), 'manager declines');
fresh(); ok(ctx.get_('INTERVIEWS', iv3.Interview_ID).Status === 'MANAGER_DECLINED', 'declined');
ok(must(api('todo', t.rec, {}), 'todo rec').iv.reschedule === 1, 'recruiter has one to reschedule');
const tmr = ctx.tomorrow_();
const iv3b = must(api('int.reschedule', t.rec, { Interview_ID: iv3.Interview_ID, Date: tmr, Time: '11:00', reason: 'المدير طلب بكرة' }), 'reschedule').interview;
fresh(); ok(ctx.get_('INTERVIEWS', iv3.Interview_ID).Rescheduled_To === iv3b.Interview_ID && iv3b.Status === 'PROPOSED' && iv3b.Rescheduled_From === iv3.Interview_ID && iv3b.Place === 'غرفة الاجتماعات', 'new interview linked, lead confirms again');
bad(api('int.reschedule', t.rec, { Interview_ID: iv3.Interview_ID, Date: tmr, Time: '12:00', reason: 'xxx' }), /مش ممكن/, 'only once');
must(api('int.action', t.acc, { Interview_ID: iv3b.Interview_ID, action: 'CONFIRM' }), 'confirm new');
must(api('int.action', t.rec, { Interview_ID: iv3b.Interview_ID, action: 'INVITED', channel: 'CALL' }), 'invite by phone');
bad(api('int.action', t.rec, { Interview_ID: iv3b.Interview_ID, action: 'CAND_DECLINE' }), /السبب/, 'candidate decline reason');
must(api('int.action', t.rec, { Interview_ID: iv3b.Interview_ID, action: 'CAND_DECLINE', note: 'مسافر' }), 'candidate declines');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /المرشح اعتذر/.test(n.Title)), 'panel told');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: R.HR, panel: [{ User_ID: U.rec, Role: 'LEAD' }], adhoc: 'Y' }, base)), /سبب/, 'ad-hoc needs a reason');
const ivAd = must(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: R.HR, panel: [{ User_ID: U.hr, Role: 'LEAD' }], adhoc: 'Y', reason: 'المرشحة جت من غير معاد ومسافرة بكرة' }, base)), 'ad-hoc').interview;
ok(ivAd.Status === 'CONFIRMED' && ivAd.Is_Adhoc === 'Y' && !ivAd.Manager_Confirmed_By, 'controlled ad-hoc: confirmed without the chain, reason kept');
bad(api('int.panel', t.rec, { Interview_ID: ivAd.Interview_ID, panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), /سبب/, 'panel change reason');
must(api('int.panel', t.rec, { Interview_ID: ivAd.Interview_ID, panel: [{ User_ID: U.rec, Role: 'LEAD' }, { User_ID: U.hr, Role: 'OBSERVER' }], reason: 'منى في اجتماع' }), 'panel changed');
fresh(); ok(ctx.get_('INTERVIEWS', ivAd.Interview_ID).Lead_User_ID === U.rec && ctx.find_('EVENTS', { Entity_ID: ivAd.Interview_ID, Event: 'PANEL_CHANGED' }).length === 1, 'interviewer change recorded');

// =============== waive (authority), no-show, closing cancels live interviews ===============
bad(api('int.waive', t.rec, { Application_ID: A3, Round_ID: R.HR, reason: 'اتعملت في شاغر تاني' }), null, 'recruiter cannot waive');
bad(api('int.waive', t.rm, { Application_ID: A3, Round_ID: R.HR, reason: 'x' }), /سبب/, 'waive reason');
must(api('int.waive', t.rm, { Application_ID: A3, Round_ID: R.HR, reason: 'اتعمل له مقابلة HR الشهر اللي فات على نفس الوظيفة' }), 'waived');
bad(api('int.waive', t.rm, { Application_ID: A3, Round_ID: R.HR, reason: 'تاني مرة خالص' }), /اتعملت/, 'not twice');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A3, Round_ID: R.HR, panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base)), /اتلغت/, 'waived round cannot be scheduled');
const ivNs = must(api('int.create', t.rec, Object.assign({ Application_ID: A3, Round_ID: R.MGR, panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Time: '00:00' })), 'early interview').interview;
must(api('int.action', t.rec, { Interview_ID: ivNs.Interview_ID, action: 'NO_SHOW', note: 'مردش على التليفون' }), 'no-show');
AP = must(api('cand.app', t.rec, { Application_ID: A3 }), 'A3 page');
ok(AP.iv.rounds[0].status === 'WAIVED' && AP.iv.rounds[1].status === 'MISSED' && AP.iv.readiness.code === 'NOT_READY', 'waived counts as done; missed round keeps him not ready');
bad(api('cand.move', t.rec, { Application_ID: A2, to: 'SHORTLISTED', note: 'رجوع' }), /مقابلة متحددة/, 'cannot step back with a live interview');
must(api('cand.move', t.rec, { Application_ID: A2, to: 'REJECTED', reasonCode: 'EXPERIENCE' }), 'reject A2');
fresh(); ok(ctx.get_('INTERVIEWS', ivAd.Interview_ID).Status === 'CANCELLED', 'closing the candidate cancels the live interview');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /اتلغت/.test(n.Title)), 'panel told it was cancelled');
fresh(); const a2 = ctx.find_('APPLICATIONS', { Application_ID: A2 })[0];
must(api('cand.move', t.rec, { Application_ID: A1, to: 'SHORTLISTED', note: 'رجوع للتجربة' }), 'A1 back to shortlist (no live interview)');
must(api('cand.move', t.rec, { Application_ID: A1, to: 'INTERVIEW' }), 'A1 back to interviews (has interviews)');

// =============== hiring manager view ===============
let PI = must(api('cand.pipeline', t.acc, { Vacancy_ID: VAC }), 'manager pipeline');
ok(PI.access === 'SHORTLIST' && PI.rows.some(r => r.Application_ID === A1 && r.Stage === 'INTERVIEW' && r.iv && r.iv.ready === 'READY'), 'manager sees candidates in interviews, with readiness');
PI = must(api('cand.pipeline', t.rec, { Vacancy_ID: VAC }), 'team pipeline');
ok(PI.counts.INTERVIEW === 2 && PI.rows.find(r => r.Application_ID === A1).iv.evals === '4/4', 'INTERVIEW stage count + evaluations');

// =============== lists, tasks ===============
L = must(api('int.list', t.rec, { tab: 'team' }), 'team list');
ok(L.length >= 6 && L.some(r => r.Interview_ID === iv2.Interview_ID), 'team list');
L = must(api('int.list', t.exp, { tab: 'mine' }), 'expert list'); ok(L.length === 1 && !L[0].need, 'nothing pending for the expert');
let TD = must(api('todo', t.exp, {}), 'todo exp').iv; ok(TD.evaluate === 0 && TD.panel === 0, 'expert counters');

// =============== daily reminders and evaluation SLA ===============
const ivP = must(api('int.create', t.rec, Object.assign({ Application_ID: A3, Round_ID: R.MGR, panel: [{ User_ID: U.acc, Role: 'LEAD' }] }, base, { Date: tmr })), 'pending one').interview;
const ivE = must(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: R.SEN, panel: [{ User_ID: U.rec, Role: 'LEAD' }, { User_ID: U.cfo, Role: 'DECIDER' }] }, base)), 'senior round').interview;
must(api('int.action', t.rec, { Interview_ID: ivE.Interview_ID, action: 'CHECKIN' }), 'c'); must(api('int.action', t.rec, { Interview_ID: ivE.Interview_ID, action: 'START' }), 's');
must(api('int.action', t.rec, { Interview_ID: ivE.Interview_ID, action: 'COMPLETE' }), 'e');
ok(must(api('todo', t.cfo, {}), 'todo cfo').iv.evaluate === 1, 'the decider owes an evaluation');
fresh();
ctx.update_('INTERVIEWS', ivP.Interview_ID, { Created_At: '2020-01-01T08:00:00' }, 'x');
ctx.update_('INTERVIEWS', ivE.Interview_ID, { Completed_At: '2020-01-01T08:00:00' }, 'x');
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const before = ctx.find_('NOTIFICATIONS', {}).length;
let S = ctx.interviewSla_();
ok(S.confirm === 1 && S.evals >= 1 && S.escalated >= 1, 'daily: confirmation reminder, late evaluation reminder + escalation: ' + JSON.stringify(S));
fresh(); const nn = ctx.find_('NOTIFICATIONS', {}).slice(before);
ok(nn.some(n => n.User_ID === U.acc && /مستنية تأكيدك/.test(n.Title)) && nn.some(n => n.User_ID === U.cfo && /متأخر/.test(n.Title)) && nn.some(n => n.User_ID === U.rm && /متأخر أكتر/.test(n.Title)), 'right people reminded');
S = ctx.interviewSla_(); ok(S.confirm === 0 && S.evals === 0 && S.escalated === 0, 'once a day');
const sw = ctx.find_('INTERVIEW_PANEL', { Interview_ID: ivE.Interview_ID, User_ID: U.cfo })[0];
const ev = api('eval.save', t.cfo, { Interview_ID: ivE.Interview_ID, comps: [{ c: 'C01', r: '4' }, { c: 'LD01', r: '3' }], Recommendation: 'PROCEED', Summary: 'مناسب للمستوى المطلوب', submit: 'Y' });
ok(ev.ok && ev.data.evaluation.Late, 'late submission allowed and measured: ' + (ev.ok ? '' : ev.error));
ok(sw.Eval_Escalated_At, 'escalation stamped');

// =============== HR question bank ===============
let IQ = must(api('iq.list', t.rec, {}), 'bank'); ok(IQ.rows.length === 10 && !IQ.canEdit, 'ten seeded questions; recruiter reads only');
bad(api('iq.save', t.rec, { Round_Type: 'HR', Text_AR: 'سؤال جديد للاختبار؟' }), null, 'recruiter cannot edit');
bad(api('iq.save', t.rm, { Round_Type: 'XX', Text_AR: 'سؤال جديد للاختبار؟' }), /الجولة/, 'round type');
const nq = must(api('iq.save', t.rm, { Round_Type: 'HR', Kind: 'MANDATORY', Text_AR: 'عندك أي ارتباطات تمنعك من السفر؟', Text_EN: 'Anything that prevents you from travelling?' }), 'new HR question');
WH = must(api('int.get', t.rec, { Interview_ID: ivHR.Interview_ID }), 'guide after');
ok(WH.guide.std.filter(q => q.kind === 'MANDATORY').length === 7 && WH.guide.std.some(q => q.id === nq.Question_ID), 'new mandatory question appears in HR rounds');
must(api('iq.save', t.rm, { Question_ID: nq.Question_ID, Round_Type: 'HR', Kind: 'MANDATORY', Text_AR: nq.Text_AR, Text_EN: nq.Text_EN, Status: 'Inactive' }), 'stop it');
fresh(); ok(ctx.enNames_()['عندك أي ارتباطات تمنعك من السفر؟'] === 'Anything that prevents you from travelling?', 'English text feeds the translator');

// =============== merge moves interviews; metrics count interviews ===============
let M = must(api('src.metrics', t.rec, {}), 'metrics');
ok(M.rows.find(r => r.source === 'WALK_IN').funnel.interviewed === 3, 'funnel: interviewed: ' + M.rows.find(r => r.source === 'WALK_IN').funnel.interviewed);

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
