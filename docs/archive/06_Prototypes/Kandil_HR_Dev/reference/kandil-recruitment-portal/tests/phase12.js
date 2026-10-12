// Phase 4B (v0.12.0): practical / technical assessments (criteria from the JD, safety checklist, result, evidence files,
// retest), round templates per job / family, plan frozen at the first interview, reconfirmation, candidate reminder email,
// 2-hour reminders (hourly job), interviewer analytics, migration of 0.11 plans.
const fs = require('fs'), path = require('path');
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
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
// no function defined twice across the server files (a later file would silently replace the earlier one)
const SRC = path.join(__dirname, '..', 'src'), seenFn = {}, dupFn = [];
fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).forEach(f => (fs.readFileSync(path.join(SRC, f), 'utf8').match(/^function [A-Za-z0-9_]+/gm) || []).forEach(m => { if (seenFn[m]) dupFn.push(m + ' (' + seenFn[m] + ', ' + f + ')'); seenFn[m] = f; }));
ok(!dupFn.length, 'no duplicate function names: ' + dupFn.join('; '));

const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الإنتاج', '', '', '', '', 'مدير قطاع الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الإنتاج', 'مصنع الإضاءة', '', '', '', 'مدير المصنع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الإنتاج', 'مصنع الإضاءة', '', '', '', 'فني تجميع', 'العبور', '', '', '', '9'],
  ['قنديل مصر', 'قطاع الإنتاج', 'مصنع الإضاءة', '', '', '', 'فني دهانات', 'العبور', '', '', '', '9']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير المصنع', P['مدير المصنع'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), sup: user('sup@t.com', 'مشرف التجميع', ''), out: user('out@t.com', 'شخص بعيد', '') };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), sup: login('sup@t.com'), out: login('out@t.com') };
const JOB = P['فني تجميع'].Job_Code, JOB2 = P['فني دهانات'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Job_Family: 'PRD' }, 'x'); ctx.update_('JOBS', JOB2, { Job_Family: 'PRD' }, 'x');
const FAM = 'PRD';
must(api('jd.import', t.hr, { kind: 'library', commit: true,
  comps: [{ code: 'C01', group: 'CORE', name: 'الالتزام', levels: ['a', 'b', 'c', 'd'], req: [2, 2, 2, 3, 3, 4, 4] },
          { code: 'PR01', group: 'PRD', name: 'قراءة الرسومات', levels: ['a', 'b', 'c', 'd'], req: [2, 2, 3, 3, 3, 3, 3] },
          { code: 'PR02', group: 'PRD', name: 'إتقان الحرفة', levels: ['w', 'x', 'y', 'z'], req: [2, 2, 3, 3, 3, 3, 3] }],
  questions: [], tests: [{ code: 'PR01', name: 'قراءة رسم تنفيذي', how: 'يشرح رسمة وحدة إضاءة', duration: '15 دقيقة', pass: 'يحدد المقاسات صح', owner: 'مشرف القسم' }] }), 'library');
must(api('jd.import', t.hr, { kind: 'jds', commit: true, reason: 'x', jds: [
  { code: JOB, title: 'فني تجميع', level: 'JL2', purpose: 'تجميع وحدات الإضاءة بجودة', resp: ['يجمع', 'يختبر', 'ينظف'], comps: [{ c: 'C01', l: 2 }, { c: 'PR01', l: 2 }, { c: 'PR02', l: 3 }], test: 'تجميع وحدة إضاءة كاملة في ساعة' },
  { code: JOB2, title: 'فني دهانات', level: 'JL2', purpose: 'دهان القطع بجودة عالية', resp: ['يجهز', 'يدهن', 'يراجع'], comps: [{ c: 'C01', l: 2 }] }] }), 'jds');
must(api('jd.approve', t.hr, { all: 'Y', reason: 'x' }), 'approve');
function vacancy(pos, just) {
  const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
    Justification: just, Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: pos, Requested_HC: 3 }] }), 'req ' + just);
  fresh(); const id = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
  must(api('vac.assign', t.rm, { Vacancy_ID: id, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: id, action: 'OPEN' }), 'open');
  return id;
}
const VAC = vacancy(P['فني تجميع'].Position_ID, 'شاغر فني تجميع للاختبار'), VAC2 = vacancy(P['فني دهانات'].Position_ID, 'شاغر فني دهانات للاختبار');
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
fresh(); const LOC = ctx.all_('LOCATIONS')[0].Location_ID, today = ctx.today_(), tmr = ctx.tomorrow_();

// =============== default plan: practical test after HR when the JD has one ===============
let PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC }), 'plan');
ok(PL.rounds.length === 4 && PL.rounds[0].type === 'HR' && PL.rounds[1].type === 'PRACTICAL' && PL.rounds[1].req === 'REQUIRED' && PL.rounds[1].safety === 'Y' && PL.rounds[2].type === 'MANAGER', 'practical test inserted after HR, safety on: ' + PL.rounds.map(r => r.type).join(','));
ok(must(api('int.plan', t.rec, { Vacancy_ID: VAC2 }), 'plan 2').rounds.length === 3, 'no practical test in the JD → no test round');

// =============== templates per family / job ===============
bad(api('rt.save', t.rec, { Scope_Type: 'FAMILY', Scope_Value: FAM, rounds: [{ name: 'مقابلة', type: 'HR' }] }), null, 'recruiter cannot edit templates');
bad(api('rt.save', t.rm, { Scope_Type: 'FAMILY', Scope_Value: 'XX', rounds: [{ name: 'مقابلة', type: 'HR' }] }), /العائلة/, 'family must exist');
const tf = must(api('rt.save', t.rm, { Scope_Type: 'FAMILY', Scope_Value: FAM, Notes: 'كل وظايف الإنتاج',
  rounds: [{ name: 'مقابلة HR سريعة', type: 'HR', req: 'REQUIRED' }, { name: 'اختبار عملي في الورشة', type: 'PRACTICAL', req: 'REQUIRED', safety: 'Y' }, { name: 'مقابلة مدير المصنع', type: 'MANAGER', req: 'REQUIRED', reconfirm: 'Y' }] }), 'family template');
bad(api('rt.save', t.rm, { Scope_Type: 'FAMILY', Scope_Value: FAM, rounds: [{ name: 'مقابلة', type: 'HR' }] }), /قالب شغال/, 'one active template per family');
ok(must(api('int.plan', t.rec, { Vacancy_ID: VAC2 }), 'plan 2b').rounds.map(r => r.type).join() === 'HR,PRACTICAL,MANAGER', 'family template applies');
must(api('rt.save', t.rm, { Scope_Type: 'JOB', Scope_Value: JOB2, rounds: [{ name: 'اختبار دهان عينة', type: 'SKILLS', req: 'REQUIRED' }, { name: 'مقابلة', type: 'MANAGER', req: 'OPTIONAL' }] }), 'job template');
PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC2 }), 'plan 2c');
ok(PL.rounds.map(r => r.type).join() === 'SKILLS,MANAGER' && PL.rounds[0].safety === '', 'job template wins over the family; safety off for a skills demo');
let RT = must(api('rt.list', t.rec, {}), 'templates list'); ok(RT.rows.length === 2 && !RT.canEdit && RT.rows.some(r => r.Scope_Type === 'JOB' && /فني دهانات/.test(r.scopeName)), 'templates listed');
PL = must(api('int.plan', t.rec, { Vacancy_ID: VAC }), 'plan VAC'); ok(PL.rounds.map(r => r.type).join() === 'HR,PRACTICAL,MANAGER' && PL.rounds[2].reconfirm === 'Y', 'VAC follows the family template too');

// =============== candidates ===============
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
function cand(vac, name, mobile, email) { const a = must(api('cand.create', t.rec, { Vacancy_ID: vac, Full_Name: name, Mobile: mobile, Email: email || '', Source: 'WALK_IN', consent: 'Y' }), 'cand').application.Application_ID; must(api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }), 'shortlist'); return a; }
const A1 = cand(VAC, 'أحمد علي حسن', '01011112222', 'ahmed@example.com'), A2 = cand(VAC, 'كريم محمود سالم', '01033334444'), A3 = cand(VAC, 'هالة سمير علي', '01044445555', 'hala@example.com');
const base = { Date: today, Time: '10:00', Mode: 'IN_PERSON', Location_ID: LOC, Place: 'الورشة' };

// =============== assessment: chain + safety ===============
const as1 = must(api('int.create', t.rec, Object.assign({ Application_ID: A1, Round_ID: 'R2', panel: [{ User_ID: U.sup, Role: 'LEAD' }] }, base)), 'schedule assessment').interview;
ok(as1.Kind === 'ASSESSMENT' && as1.Safety_Required === 'Y' && as1.Status === 'PROPOSED', 'assessment round: kind, safety, assessor confirms first');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.sup }).some(n => /اختبار محتاج تأكيدك/.test(n.Title)), 'assessor asked to confirm');
fresh(); ok(!!ctx.get_('VACANCIES', VAC).Plan_JSON, 'the vacancy plan is frozen at its first interview');
must(api('rt.save', t.rm, { Template_ID: tf.Template_ID, Scope_Type: 'FAMILY', Scope_Value: FAM, rounds: [{ name: 'مقابلة', type: 'HR' }] }), 'template changed later');
ok(must(api('int.plan', t.rec, { Vacancy_ID: VAC }), 'frozen').rounds.length === 3, 'a later template change does not touch a vacancy in progress');
bad(api('int.action', t.rec, { Interview_ID: as1.Interview_ID, action: 'INVITED' }), /يأكّد/, 'invitation after the assessor confirms');
must(api('int.action', t.sup, { Interview_ID: as1.Interview_ID, action: 'CONFIRM' }), 'assessor confirms');
must(api('int.action', t.rec, { Interview_ID: as1.Interview_ID, action: 'INVITED', channel: 'CALL' }), 'invited');
must(api('int.action', t.rec, { Interview_ID: as1.Interview_ID, action: 'CAND_CONFIRM' }), 'candidate confirms');
must(api('int.action', t.rec, { Interview_ID: as1.Interview_ID, action: 'CHECKIN' }), 'check-in');
bad(api('int.action', t.sup, { Interview_ID: as1.Interview_ID, action: 'START' }), /السلامة/, 'safety checklist before a shop-floor test');
bad(api('int.action', t.sup, { Interview_ID: as1.Interview_ID, action: 'START', safety: { BRIEF: 'Y', PPE: 'Y' } }), /السلامة/, 'every safety item');
must(api('int.action', t.sup, { Interview_ID: as1.Interview_ID, action: 'START', safety: { BRIEF: 'Y', PPE: 'Y', SUPERVISOR: 'Y' } }), 'start after safety');
fresh(); ok(JSON.parse(ctx.get_('INTERVIEWS', as1.Interview_ID).Safety_JSON).by === U.sup, 'safety confirmation recorded with who and when');

// =============== workspace + result ===============
let W = must(api('int.get', t.sup, { Interview_ID: as1.Interview_ID, open: 'Y' }), 'assessor workspace');
ok(W.kind === 'ASSESSMENT' && W.typeName === 'اختبار عملي' && W.guide.kind === 'ASSESSMENT' && W.safety.done, 'assessment workspace');
ok(W.guide.criteria.length === 2 && W.guide.criteria.some(c => c.k === 'PR01' && c.pass === 'يحدد المقاسات صح') && W.guide.criteria.some(c => c.k === 'PR02' && /تجميع وحدة/.test(c.name)), 'criteria from the competency test + the JD practical test: ' + W.guide.criteria.map(c => c.name).join(' | '));
ok(W.candidate.Mobile === undefined, 'assessor (not on the recruitment team) sees no contact');
bad(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, files: [{ name: 'x.exe', mime: 'application/x-msdownload', data: pdf }] }), /صورة|PDF/, 'evidence must be an image or PDF');
let E = must(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, crit: [{ k: 'PR01', r: 'PASS', n: 'قرا الرسمة صح' }], Score: '72', files: [{ name: 'sheet.pdf', mime: 'application/pdf', data: pdf }, { name: 'piece.jpg', mime: 'image/jpeg', data: pdf }] }), 'draft with evidence');
ok(E.evaluation.Status === 'DRAFT' && E.evaluation.data.files.length === 2 && E.evaluation.data.score === '72', 'draft keeps the score and two files');
const fileId = E.evaluation.data.files[0].id;
bad(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, submit: 'Y', crit: [{ k: 'PR01', r: 'PASS' }], Summary: 'كويس' }), /نتيجة الاختبار/, 'result required');
bad(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, submit: 'Y', Result: 'PASS', crit: [{ k: 'PR01', r: 'PASS' }], Summary: 'كويس' }), /حدد نتيجة بند/, 'every criterion marked');
bad(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, submit: 'Y', Result: 'FAIL', crit: [{ k: 'PR01', r: 'PASS' }, { k: 'PR02', r: 'FAIL' }], Summary: 'ضعيف' }), /سبب الرسوب/, 'a fail needs the reason');
bad(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, submit: 'Y', Result: 'PASS', crit: [{ k: 'PR01', r: 'PASS' }, { k: 'PR02', r: 'PASS' }], Score: '120', Summary: 'كويس جداً' }), /0 لـ 100/, 'score 0–100');
E = must(api('eval.save', t.sup, { Interview_ID: as1.Interview_ID, submit: 'Y', Result: 'FAIL', Score: '45', keepFiles: [fileId],
  crit: [{ k: 'PR01', r: 'PASS', n: 'قرا الرسمة صح' }, { k: 'PR02', r: 'FAIL', n: 'التوصيلات غلط والوحدة ماشتغلتش' }], added: [{ q: 'سرعة الشغل', r: 'FAIL', n: 'خلّص في ساعتين' }],
  Summary: 'الوحدة ماشتغلتش بعد التجميع والوقت ضعف المطلوب' }), 'assessor submits a fail');
ok(E.evaluation.Status === 'SUBMITTED' && E.evaluation.Recommendation === 'FAIL' && E.evaluation.data.files.length === 1 && E.interview.Status === 'EVALUATED', 'result recorded, one evidence file kept, assessment evaluated');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /راسب — محتاج قرار/.test(n.Title)), 'recruiter told: failed — needs a decision');
fresh(); ok(ctx.get_('APPLICATIONS', A1).Stage === 'INTERVIEW', 'a failed assessment never rejects by itself');
const fr = must(api('int.file', t.rec, { Interview_ID: as1.Interview_ID, File_ID: fileId }), 'evidence file');
ok(fr.name === 'sheet.pdf' && fr.data === pdf, 'evidence opens for the team');
bad(api('int.file', t.out, { Interview_ID: as1.Interview_ID, File_ID: fileId }), /صلاحية/, 'not for outsiders');
bad(api('int.file', t.rec, { Interview_ID: as1.Interview_ID, File_ID: 'nope' }), /غير موجود/, 'only files of this interview');
let AP = must(api('cand.app', t.rec, { Application_ID: A1 }), 'candidate page');
const r2 = AP.iv.rounds.find(r => r.id === 'R2');
ok(r2.kind === 'ASSESSMENT' && r2.result === 'FAIL' && r2.score === '45' && AP.iv.readiness.failed, 'card shows the failed test and flags the candidate');
let C = must(api('int.compare', t.rec, { Vacancy_ID: VAC }), 'compare');
ok(C.rows.find(r => r.Application_ID === A1).tests[0].result === 'FAIL' && C.rows.find(r => r.Application_ID === A1).failed, 'comparison shows test results');

// =============== retest ===============
const as2 = must(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: 'R2', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Time: '11:00' })), 'A2 assessment').interview;
must(api('int.action', t.rec, { Interview_ID: as2.Interview_ID, action: 'CHECKIN' }), 'c');
must(api('int.action', t.rec, { Interview_ID: as2.Interview_ID, action: 'START', safety: { BRIEF: 'Y', PPE: 'Y', SUPERVISOR: 'Y' } }), 's');
must(api('eval.save', t.rec, { Interview_ID: as2.Interview_ID, submit: 'Y', Result: 'RETEST', crit: [{ k: 'PR01', r: 'PASS' }, { k: 'PR02', r: 'FAIL' }], Summary: 'الماكينة عطلت في نص الاختبار' }), 'needs retest');
AP = must(api('cand.app', t.rec, { Application_ID: A2 }), 'A2 page');
ok(AP.iv.rounds.find(r => r.id === 'R2').status === 'RETEST' && !AP.iv.readiness.failed && AP.iv.readiness.code === 'NOT_READY', 'retest keeps the round open');
const as2b = must(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: 'R2', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Time: '13:00' })), 'retest scheduled without an extra-interview reason').interview;
must(api('int.action', t.rec, { Interview_ID: as2b.Interview_ID, action: 'CHECKIN' }), 'c2');
must(api('int.action', t.rec, { Interview_ID: as2b.Interview_ID, action: 'START', safety: { BRIEF: 'Y', PPE: 'Y', SUPERVISOR: 'Y' } }), 's2');
must(api('eval.save', t.rec, { Interview_ID: as2b.Interview_ID, submit: 'Y', Result: 'PASS', Score: '88', crit: [{ k: 'PR01', r: 'PASS' }, { k: 'PR02', r: 'PASS' }], Summary: 'الوحدة اشتغلت من أول مرة' }), 'pass');
AP = must(api('cand.app', t.rec, { Application_ID: A2 }), 'A2 page 2');
ok(AP.iv.rounds.find(r => r.id === 'R2').status === 'DONE' && AP.iv.rounds.find(r => r.id === 'R2').result === 'PASS', 'the latest session counts: pass');
bad(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: 'R2', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Time: '15:00' })), /اكتب سبب/, 'another session after a pass needs a reason');

// =============== reconfirmation + candidate email ===============
const ivR = must(api('int.create', t.rec, Object.assign({ Application_ID: A3, Round_ID: 'R3', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }, base, { Date: tmr })), 'manager round tomorrow').interview;
ok(ivR.Reconfirm_Required === 'Y', 'round needs reconfirmation');
must(api('int.action', t.rec, { Interview_ID: ivR.Interview_ID, action: 'INVITED', channel: 'WHATSAPP' }), 'invited');
must(api('int.action', t.rec, { Interview_ID: ivR.Interview_ID, action: 'CAND_CONFIRM' }), 'confirmed');
ok(must(api('todo', t.rec, {}), 'todo').iv.reconfirm === 1, 'home counter: reconfirm');
ok(must(api('int.list', t.rec, { tab: 'team' }), 'team').some(r => r.Interview_ID === ivR.Interview_ID && r.need === 'RECONFIRM'), 'team list asks to reconfirm');
mails.length = 0; fresh();
const sla = ctx.interviewSla_();
ok(sla.candidate === 1 && sla.reconfirm === 1, 'daily: candidate email + reconfirm task: ' + JSON.stringify(sla));
ok(mails.some(m => m.to === 'hala@example.com' && /تذكير بمعادك/.test(m.subject) && /الورشة/.test(m.htmlBody)), 'candidate gets the reminder email with the place');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /أكّد حضوره تاني/.test(n.Title)) && ctx.find_('ACTIVITIES', { Application_ID: A3, Type: 'EMAIL' }).some(a => a.Template_Code === 'INTERVIEW_REMINDER'), 'recruiter told; email logged on the candidate');
must(api('int.action', t.rec, { Interview_ID: ivR.Interview_ID, action: 'RECONFIRM' }), 'reconfirmed');
bad(api('int.action', t.rec, { Interview_ID: ivR.Interview_ID, action: 'RECONFIRM' }), /قبل كده/, 'once');
ok(must(api('todo', t.rec, {}), 'todo 2').iv.reconfirm === 0, 'counter cleared');

// =============== 2-hour reminder (hourly job) ===============
const nowLocal = new Date(Date.now() + 3 * 3600000);
if (nowLocal.getUTCHours() <= 21) {
  const later = new Date(nowLocal.getTime() + 60 * 60000), hh = ('0' + later.getUTCHours()).slice(-2) + ':' + ('0' + later.getUTCMinutes()).slice(-2);
  const ivH = must(api('int.create', t.rec, Object.assign({ Application_ID: A3, Round_ID: 'R1', panel: [{ User_ID: U.rec, Role: 'LEAD' }, { User_ID: U.mgr, Role: 'TECHNICAL' }] }, base, { Time: hh })), 'in an hour').interview;
  fresh(); let h = ctx.hourlyRun_();
  ok(h.reminded === 1, 'hourly: reminder about 2 hours before');
  fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.mgr }).some(n => /كمان ساعتين/.test(n.Title)), 'panel member reminded');
  fresh(); h = ctx.hourlyRun_(); ok(h.reminded === 0, 'only once');
} else { ok(true, 'late evening — 2-hour test skipped'); ok(true, ''); ok(true, ''); }
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][nowLocal.getUTCDay()] }, 'x');
fresh(); ok(ctx.hourlyRun_().weekend, 'no hourly reminders on a day off');
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');

// =============== interviewer analytics ===============
const ivM = must(api('int.create', t.rec, Object.assign({ Application_ID: A2, Round_ID: 'R3', panel: [{ User_ID: U.mgr, Role: 'LEAD' }, { User_ID: U.rec, Role: 'HR' }] }, base, { Time: '16:00' })), 'manager interview A2').interview;
must(api('int.action', t.mgr, { Interview_ID: ivM.Interview_ID, action: 'CONFIRM' }), 'conf');
must(api('int.action', t.rec, { Interview_ID: ivM.Interview_ID, action: 'CHECKIN' }), 'in');
must(api('int.action', t.mgr, { Interview_ID: ivM.Interview_ID, action: 'START' }), 'go');
const g = must(api('int.get', t.mgr, { Interview_ID: ivM.Interview_ID }), 'guide').guide;
const evp = (rate, rec) => ({ Interview_ID: ivM.Interview_ID, submit: 'Y', comps: g.comps.map(c => ({ c: c.code, r: rate, n: 'دليل واضح من الإجابات' })),
  reqs: g.reqs.map(r => ({ k: r.k, s: 'MET', e: 'تمام' })), qs: g.std.filter(q => q.kind === 'MANDATORY').map(q => ({ id: q.id, asked: 'Y' })), Recommendation: rec, Summary: 'مناسب للوظيفة' });
must(api('eval.save', t.mgr, evp('3', 'PROCEED')), 'manager rates 3');
must(api('eval.save', t.rec, evp('4', 'PROCEED')), 'recruiter rates 4');
bad(api('int.analytics', t.rec, {}), null, 'analytics for recruitment managers / HR only');
const AN = must(api('int.analytics', t.rm, {}), 'analytics');
const mg = AN.rows.find(r => r.User_ID === U.mgr);
ok(mg && mg.evals === 1 && mg.midShare === 100 && mg.avg === 3 && mg.led === 1 && AN.company.ratings === g.comps.length * 2 && AN.company.avg === 3.5 && AN.company.midShare === 50, 'per interviewer vs company: ' + JSON.stringify(mg) + ' ' + JSON.stringify(AN.company));
ok(!AN.rows.some(r => r.User_ID === U.sup && r.evals > 0), 'assessments are not mixed into interview analytics');

// =============== migration of 0.11 plans ===============
fresh(); ctx.update_('VACANCIES', VAC, { Plan_JSON: '' }, 'x'); delete props.MIGRATE_0120;
fresh(); ctx.migrate0120_();
fresh(); const mp = JSON.parse(ctx.get_('VACANCIES', VAC).Plan_JSON);
ok(mp.length === 3 && mp.map(r => r.type).join() === 'HR,MANAGER,SENIOR', 'vacancies with interviews keep the 0.11 plan (settings default)');
fresh(); ok(!ctx.get_('VACANCIES', VAC2).Plan_JSON, 'vacancies without interviews are left to the templates');

// =============== v0.12.1: a fast upgrade inside a user's request ===============
const cfgSheet = () => ctx.ss_('CORE').getSheetByName('CONFIG');
fresh(); delete cfgSheet().prot; props.SCHEMA_APP_VERSION = '0.12.0'; delete props.SHEETS_PROTECTED;
props.UPGRADE_STARTED = ctx.APP.VERSION + '|' + Date.now();
bad(pub('auth.requestCode', { email: 'rec@t.com' }), /بتتحدّث/, 'while one request upgrades, the others get a clear message (no queue)');
ok(props.SCHEMA_APP_VERSION === '0.12.0', 'not upgraded twice at the same time');
props.UPGRADE_STARTED = ctx.APP.VERSION + '|' + (Date.now() - 7 * 60 * 1000);
ok(pub('auth.requestCode', { email: 'rec@t.com' }).ok, 'a stuck upgrade (over 6 minutes) is retried');
ok(props.SCHEMA_APP_VERSION === ctx.APP.VERSION && !props.UPGRADE_STARTED, 'upgraded, marker cleared');
ok(!cfgSheet().prot, 'existing sheets are not re-protected inside a user request');
fresh(); delete props.DAILY_RUN; ctx.runDaily_(true);
ok(cfgSheet().prot && cfgSheet().prot.warn && props.SHEETS_PROTECTED === 'Y', 'the daily job protects the existing sheets once');

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
