// Phase 3B-3 (v0.10.0): screening questions + knockout review, talent pool, bulk import, transfer,
// vacancy cancellation decisions, former employees + hiring restrictions, source metrics.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']);
const U = { rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), rec2: user('rec2@t.com', 'علي', '', ['RECRUITER']) };
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), rec2: login('rec2@t.com') };
function vacancy(pos, hc, just) {
  const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
    Justification: just, Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: pos, Requested_HC: hc }] }), 'req ' + just);
  fresh(); const id = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
  must(api('vac.assign', t.rm, { Vacancy_ID: id, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: id, action: 'OPEN' }), 'open');
  return id;
}
const vacA = vacancy(P['محاسب تكاليف'], 2, 'شاغر محاسب تكاليف للاختبار');
const vacB = vacancy(P['محاسب عام'], 2, 'شاغر محاسب عام للاختبار');

// =============== screening questions ===============
let Q = must(api('sq.list', t.rec, {}), 'library');
ok(Q.rows.length === 6 && !Q.canEdit, 'six seeded questions; recruiter cannot edit the library');
const qShift = Q.rows.find(q => /ورديات/.test(q.Text_AR)), qExp = Q.rows.find(q => q.Answer_Type === 'NUMBER'), qMil = Q.rows.find(q => q.Answer_Type === 'CHOICE'), qArea = Q.rows.find(q => q.Answer_Type === 'TEXT');
bad(api('sq.save', t.rm, { Text_AR: 'تقدر تشتغل يوم السبت؟', Answer_Type: 'CHOICE', options: [{ ar: 'أيوه' }] }), /اختيارين/, 'choice needs 2 options');
const qNew = must(api('sq.save', t.rm, { Text_AR: 'تعرف تشتغل على برنامج Odoo؟', Text_EN: 'Can you use Odoo?', Answer_Type: 'YES_NO' }), 'new question');
bad(api('vac.questions', t.rec, { Vacancy_ID: vacA, questions: [{ id: qArea.Question_ID, kind: 'KNOCKOUT' }] }), /مايبقاش شرط/, 'text cannot be knockout');
bad(api('vac.questions', t.rec, { Vacancy_ID: vacA, questions: [{ id: qMil.Question_ID, kind: 'KNOCKOUT', pass: [] }] }), /الإجابات المقبولة/, 'choice knockout needs accepted answers');
bad(api('vac.questions', t.rec2, { Vacancy_ID: vacA, questions: [] }), null, 'recruiter off the team cannot set questions');
let VQ = must(api('vac.questions', t.rec, { Vacancy_ID: vacA, questions: [
  { id: qShift.Question_ID, kind: 'KNOCKOUT', pass: 'Y' }, { id: qExp.Question_ID, kind: 'KNOCKOUT', pass: '2' },
  { id: qMil.Question_ID, kind: 'KNOCKOUT', pass: ['DONE', 'EXEMPT'] }, { id: qArea.Question_ID, kind: 'INFO', required: 'N' }, { id: qNew.Question_ID, kind: 'INFO' }] }), 'vacancy questions');
ok(VQ.length === 5 && VQ[0].kind === 'KNOCKOUT' && VQ[3].required === false, 'saved with rules');
fresh(); const code = must(api('cand.applySettings', t.rec, { Vacancy_ID: vacA, Apply_Enabled: 'Y' }), 'apply on').code;
let info = must(pub('apply.info', { code }), 'apply info');
ok(info.questions.length === 5 && info.questions.every(q => q.kind === undefined && q.pass === undefined) && info.questions[2].options.length === 4, 'public form gets questions without rules');
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3', src: 'WUZZUF' };
bad(pub('apply.submit', Object.assign({}, base, { Full_Name: 'أحمد علي حسن', Mobile: '01011112222', answers: {} })), /جاوب على/, 'required questions');
bad(pub('apply.submit', Object.assign({}, base, { lang: 'en', Full_Name: 'Ahmed Ali Hassan', Mobile: '01011112222', answers: {} })), /Please answer/, 'required questions (English)');
const good = {}; good[qShift.Question_ID] = 'Y'; good[qExp.Question_ID] = '٤'; good[qMil.Question_ID] = 'DONE'; good[qNew.Question_ID] = 'N';
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'أحمد علي حسن', Mobile: '01011112222', answers: good })), 'passes');
const badA = Object.assign({}, good); badA[qShift.Question_ID] = 'N'; badA[qExp.Question_ID] = '1';
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'منى سعيد حسن', Mobile: '01022223333', answers: badA })), 'fails two knockouts — still accepted');
fresh();
const apps = ctx.find_('APPLICATIONS', { Vacancy_ID: vacA });
const aGood = apps.find(a => a.Knockout_Flag !== 'Y'), aBad = apps.find(a => a.Knockout_Flag === 'Y');
ok(aGood && aBad && aBad.Stage === 'NEW', 'knockout flags, nothing rejected');
ok(/ورديات/.test(aBad.Knockout_Detail) && /خبرة/.test(aBad.Knockout_Detail), 'failed questions named: ' + aBad.Knockout_Detail);
ok(JSON.parse(aGood.Answers_JSON).find(x => x.q === qExp.Question_ID).a === '4', 'Arabic digits normalised in answers');
let g = must(api('cand.app', t.rec, { Application_ID: aBad.Application_ID }), 'bad app');
ok(g.knockout && !g.knockout.reviewed && g.answers.length === 5 && g.answers.find(x => x.q === qShift.Question_ID).s === 'لا' && g.questions[0].pass === 'Y', 'answers + knockout on the page');
let pl = must(api('cand.pipeline', t.rec, { Vacancy_ID: vacA }), 'pipeline'); ok(pl.rows.find(r => r.Application_ID === aBad.Application_ID).knockout, 'knockout tag on the card');
let tk = must(api('cand.tasks', t.rec, {}), 'tasks'); ok(tk.counts.knockout === 1 && tk.knockout[0].Application_ID === aBad.Application_ID, 'knockout review task for the owner');
bad(api('cand.knockout', t.rec, { Application_ID: aBad.Application_ID }), /ليه/, 'review needs a note');
must(api('cand.knockout', t.rec, { Application_ID: aBad.Application_ID, note: 'المدير وافق يجرّبه في وردية ثابتة' }), 'reviewed: continue');
tk = must(api('cand.tasks', t.rec, {}), 'tasks 2'); ok(tk.counts.knockout === 0, 'review clears the task');
bad(api('cand.knockout', t.rec, { Application_ID: aGood.Application_ID, note: 'xxxx' }), /مفيش شرط/, 'nothing to review');
// recruiter records answers for a walk-in
const walk = must(api('cand.create', t.rec, { Vacancy_ID: vacA, Full_Name: 'سامح عادل فهمي', Mobile: '01033334444', Source: 'WALK_IN', consent: 'Y' }), 'walk-in').application.Application_ID;
const wa = {}; wa[qMil.Question_ID] = 'POSTPONED'; wa[qShift.Question_ID] = 'Y';
const aw = must(api('cand.answers', t.rec, { Application_ID: walk, answers: wa }), 'answers recorded');
ok(aw.Knockout_Flag === 'Y' && /التجنيد/.test(aw.Knockout_Detail), 'recorded answers evaluated (military postponed)');

// =============== talent pool ===============
let sg = must(api('pool.suggest', t.rec, { Application_ID: aGood.Application_ID }), 'suggest');
ok(sg.suggestion.category === 'ACC' || sg.suggestion.category !== undefined, 'suggested category: ' + sg.suggestion.category);
ok(sg.suggestion.tags.indexOf('محاسب تكاليف') >= 0 && sg.suggestion.tags.indexOf('مؤهل عالي') >= 0 && sg.suggestion.tags.indexOf('القاهرة') >= 0, 'suggested tags: ' + sg.suggestion.tags);
bad(api('pool.add', t.rec, { Application_ID: aGood.Application_ID, Category: 'XYZ' }), /التصنيف/, 'unknown category');
const fam = sg.suggestion.category || 'ACC';
bad(api('pool.add', t.rec, { Application_ID: aGood.Application_ID, Category: fam }), /بموافقة المرشح/, 'pool needs the candidate consent');
const pe = must(api('pool.add', t.rec, { Application_ID: aGood.Application_ID, Category: fam, Tags: sg.suggestion.tags, Note: 'ممتاز بس الشاغر اكتمل', consent: 'Y', consentNote: 'وافق في مكالمة' }), 'add to pool');
fresh(); ok(ctx.get_('PERSONS', aGood.Person_ID).Pool_Consent === 'Y' && ctx.find_('CONSENTS', { Person_ID: aGood.Person_ID, Kind: 'POOL' }).length === 1, 'pool consent recorded with its end date');
must(api('pool.add', t.rec, { Application_ID: aGood.Application_ID, Category: fam, Tags: ['تكاليف', 'SAP'] }), 'update pool entry');
fresh(); ok(ctx.find_('TALENT_POOL', { Status: 'Active' }).length === 1 && /SAP/.test(ctx.find_('TALENT_POOL', {})[0].Tags), 'one entry per person, updated');
let PL = must(api('pool.list', t.rec2, { tag: 'sap' }), 'pool list by tag');
ok(PL.rows.length === 1 && PL.rows[0].name === 'أحمد علي حسن' && PL.rows[0].lastJob === 'محاسب تكاليف' && PL.categories[0].n === 1, 'pool list');
ok(must(api('pool.list', t.rec, { q: '0101111' }), 'by mobile').rows.length === 1 && must(api('pool.list', t.rec, { q: 'مش موجود' }), 'none').rows.length === 0, 'pool search');
const toB = must(api('pool.toVacancy', t.rec, { Person_ID: aGood.Person_ID, Vacancy_ID: vacB }), 'pool → vacancy B');
fresh(); ok(ctx.get_('APPLICATIONS', toB.application.Application_ID).Source === 'TALENT_POOL', 'source = talent pool');
bad(api('pool.toVacancy', t.rec, { Person_ID: aGood.Person_ID, Vacancy_ID: vacB }), /بالفعل/, 'not twice on the same vacancy');

// =============== transfer ===============
const tr = must(api('cand.transfer', t.rec, { Application_ID: walk, Vacancy_ID: vacB, note: 'أنسب للمحاسبة العامة' }), 'transfer');
fresh();
const nw = ctx.get_('APPLICATIONS', tr.application.Application_ID), old = ctx.get_('APPLICATIONS', walk);
ok(nw.Origin_Application_ID === walk && nw.Vacancy_ID === vacB && nw.Stage === 'NEW' && nw.Source === 'WALK_IN', 'new linked application');
ok(old.Stage === 'WITHDRAWN' && old.Close_Code === 'TRANSFERRED' && old.Source_Locked_At, 'original closed as transferred');
bad(api('cand.transfer', t.rec, { Application_ID: walk, Vacancy_ID: vacB }), /مقفول/, 'closed application cannot move');

// =============== bulk import ===============
const rows = [
  { Full_Name: 'كريم ممدوح سالم', Mobile: '01044445555', Education: 'بكالوريوس تجارة', Experience_Years: '2', Governorate: 'الجيزة' },
  { Full_Name: 'هالة محمد سعد', Mobile: '01055556666', Education: 'دبلوم', Experience_Years: '5' },
  { Full_Name: 'أحمد علي', Mobile: '01011112222' },                      // person already in the system but not on vacancy B? he is (from the pool) → ON_VACANCY
  { Full_Name: 'منى سعيد', Mobile: '01022223333' },                      // possible duplicate (on vacancy A only)
  { Full_Name: 'بدون موبايل خالص', Mobile: '' },
  { Full_Name: 'رقم غلط جداً', Mobile: '123' },
  { Full_Name: 'كريم ممدوح سالم', Mobile: '01044445555' }];
bad(api('cand.import', t.rec, { Vacancy_ID: vacB, Source: 'REFERRAL', rows }), /واحد واحد/, 'no referral imports');
let pv = must(api('cand.import', t.rec, { Vacancy_ID: vacB, Source: 'FACEBOOK', Sub_Source: 'جروب محاسبين', rows }), 'preview');
ok(pv.counts.NEW === 2 && pv.counts.ON_VACANCY === 1 && pv.counts.POSSIBLE_DUP === 1 && pv.counts.NO_MOBILE === 1 && pv.counts.INVALID === 1 && pv.counts.DUP_IN_FILE === 1, 'preview sorts rows: ' + JSON.stringify(pv.counts));
fresh(); ok(ctx.find_('PERSONS', { Mobile_Norm: '01044445555' }).length === 0, 'preview saves nothing');
bad(api('cand.import', t.rec, { Vacancy_ID: vacB, Source: 'FACEBOOK', rows, commit: true, consent: 'Y' }), /المحتمل في الصف 5/, 'possible duplicate needs a decision');
const dupPid = pv.rows[3].matches[0].Person_ID;
bad(api('cand.import', t.rec, { Vacancy_ID: vacB, Source: 'FACEBOOK', rows, commit: true, decisions: { 3: 'LINK:' + dupPid } }), /أكّد/, 'consent confirmation');
const im = must(api('cand.import', t.rec, { Vacancy_ID: vacB, Source: 'FACEBOOK', Sub_Source: 'جروب محاسبين', fileName: 'candidates.xlsx', rows, commit: true, consent: 'Y', decisions: { 3: 'LINK:' + dupPid, 1: 'SKIP' } }), 'commit');
ok(im.added === 2 && /^IMB-\d{4}-\d{4}$/.test(im.batch.Batch_ID) && im.batch.Rows_New === '1' && im.batch.Rows_Linked === '1' && im.batch.Rows_Error === '2', 'batch: ' + JSON.stringify(im.batch));
fresh(); const ba = ctx.find_('APPLICATIONS', { Import_Batch_ID: im.batch.Batch_ID });
ok(ba.length === 2 && ba.every(a => a.Channel === 'IMPORT' && a.Source === 'FACEBOOK' && a.Owner_User_ID === U.rec), 'imported applications');
ok(ba.some(a => a.Person_ID === dupPid), 'linked to the existing person');
ok(ctx.find_('PERSONS', { Mobile_Norm: '01044445555' })[0].Education === 'BACHELOR', 'education text mapped');

// =============== source metrics ===============
let M = must(api('src.metrics', t.rec, {}), 'metrics');
const fb = M.rows.find(r => r.source === 'FACEBOOK'), wz = M.rows.find(r => r.source === 'WUZZUF');
ok(fb.funnel.applied === 2 && wz.funnel.applied === 2, 'applications per source');
must(api('cand.move', t.rec, { Application_ID: aGood.Application_ID, to: 'SHORTLISTED' }), 'shortlist (jump)');
M = must(api('src.metrics', t.rec, {}), 'metrics 2'); ok(M.rows.find(r => r.source === 'WUZZUF').funnel.shortlisted === 1 && M.rows.find(r => r.source === 'WUZZUF').funnel.contacted === 1, 'reached stages counted');
ok(M.batches.length === 1 && M.batches[0].funnel.applied === 2 && M.batches[0].sourceName === 'Facebook', 'batch funnel');
ok(!M.rows.some(r => r.source === 'WALK_IN' && r.funnel.applied > 0 && r.funnel.withdrawn > 0), 'transferred originals not double-counted');

// =============== vacancy cancellation ===============
let r = api('vac.update', t.hr, { Vacancy_ID: vacA, action: 'CANCEL', reason: 'الميزانية اتلغت' });
ok(!r.ok && r.data && r.data.needDecisions && r.data.apps.length === 2, 'cancel asks for a decision per open candidate: ' + r.error);
fresh(); ok(ctx.get_('VACANCIES', vacA).Status === 'OPEN', 'nothing changed yet');
const openA = r.data.apps;
bad(api('vac.update', t.hr, { Vacancy_ID: vacA, action: 'CANCEL', reason: 'الميزانية اتلغت', decisions: openA.map(x => ({ Application_ID: x.Application_ID, action: x.Application_ID === aGood.Application_ID ? 'HOLD' : 'POOL' })) }), /مش موافق/, 'pool decision needs consent');
must(api('pool.consent', t.rec, { Application_ID: aBad.Application_ID, note: 'وافق في مكالمة' }), 'pool consent recorded');
const dec = openA.map(x => x.Application_ID === aGood.Application_ID ? { Application_ID: x.Application_ID, action: 'TRANSFER', Vacancy_ID: vacB } : { Application_ID: x.Application_ID, action: 'POOL' });
bad(api('vac.update', t.hr, { Vacancy_ID: vacA, action: 'CANCEL', reason: 'الميزانية اتلغت', decisions: dec }), /متقدم بالفعل/, 'transfer target already has him');
dec[openA.findIndex(x => x.Application_ID === aGood.Application_ID)].action = 'HOLD';
r = must(api('vac.update', t.hr, { Vacancy_ID: vacA, action: 'CANCEL', reason: 'الميزانية اتلغت', decisions: dec }), 'cancel with decisions');
ok(r.Status === 'CANCELLED' && r.decisions.HOLD === 1 && r.decisions.POOL === 1, 'decisions applied: ' + JSON.stringify(r.decisions));
fresh();
const bb = ctx.get_('APPLICATIONS', aBad.Application_ID);
ok(bb.Stage === 'REJECTED' && bb.Close_Code === 'VACANCY_CANCELLED' && bb.Reject_Msg_Status === 'PENDING', 'pool decision: regret message pending');
ok(ctx.find_('TALENT_POOL', { Person_ID: aBad.Person_ID, Status: 'Active' })[0].Reason === 'VACANCY_CANCELLED', 'in the pool');
ok(ctx.get_('APPLICATIONS', aGood.Application_ID).Stage === 'ON_HOLD', 'hold decision');

// =============== former employees & restrictions ===============
fresh();
ctx.insert_('EMPLOYEES', { Employee_ID: '2001', Full_Name: 'كريم ممدوح سالم عبد العزيز', Position_ID: P['محاسب عام'], Location_ID: '', Hire_Date: '2019-01-01', Employment_Kind: 'PERMANENT',
  Job_Type: '', Status: 'Exited', Exit_Date: '2024-05-01', Exit_Reason: 'ABSENCE', Exit_Note: '', Source: 'TEST', Notes: '' }, 'x');
ctx.insert_('EMPLOYEES', { Employee_ID: '2002', Full_Name: 'هالة محمد سعد', Position_ID: P['محاسب عام'], Location_ID: '', Hire_Date: '2019-01-01', Employment_Kind: 'PERMANENT',
  Job_Type: '', Status: 'Exited', Exit_Date: '2025-01-01', Exit_Reason: 'RESIGNATION', Exit_Note: '', Source: 'TEST', Notes: '' }, 'x');
const karim = ba.find(a => a.Person_ID !== dupPid);
g = must(api('cand.app', t.rm, { Application_ID: karim.Application_ID }), 'recruitment manager view');
ok(g.flags && g.flags.detail && g.flags.former[0].Employee_ID === '2001' && g.flags.former[0].eligibility === 'REVIEW' && g.flags.former[0].how === 'NAME', 'name match: former employee, needs review (absence)');
g = must(api('cand.app', t.rec, { Application_ID: karim.Application_ID }), 'recruiter view');
ok(g.flags && !g.flags.detail && !g.flags.former && /موظف سابق/.test(g.flags.message), 'recruiter sees only that HR checks');
bad(api('former.confirm', t.rec, { Person_ID: karim.Person_ID, Employee_ID: '2001', same: 'Y' }), null, 'recruiter cannot confirm');
must(api('former.confirm', t.rm, { Person_ID: karim.Person_ID, Employee_ID: '2001', same: 'Y' }), 'confirmed former employee');
// restriction
bad(api('restrict.add', t.rm, { Employee_ID: '2001', Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024', Permanent: 'Y' }), null, 'recruitment manager cannot restrict');
bad(api('restrict.add', t.hr, { Employee_ID: '2001', Reason_Code: 'ABANDONMENT', Evidence: 'انطباع', Permanent: 'Y' }), /السند/, 'evidence required');
bad(api('restrict.add', t.hr, { Employee_ID: '2001', Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024', Permanent: 'N' }), /تاريخ مراجعة/, 'review date or permanent');
const rs = must(api('restrict.add', t.hr, { Employee_ID: '2001', Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024 بعد إنذارين', Review_Date: ctx.addDaysYmd_(ctx.today_(), 365) }), 'restriction');
g = must(api('cand.app', t.hr, { Application_ID: karim.Application_ID }), 'HR view');
ok(g.flags.restricted && g.flags.former[0].eligibility === 'BLOCKED' && /قرار رقم 15/.test(g.flags.restriction.evidence) && /انقطاع/.test(g.flags.restriction.reason), 'HR sees the restriction with evidence');
g = must(api('cand.app', t.rm, { Application_ID: karim.Application_ID }), 'rm view 2');
ok(g.flags.restriction && g.flags.restriction.evidence === '', 'recruitment manager sees the reason, not the evidence');
g = must(api('cand.app', t.rec, { Application_ID: karim.Application_ID }), 'rec view 2'); ok(/قيد تعيين/.test(g.flags.message), 'recruiter: restricted, no reason');
pl = must(api('cand.pipeline', t.rec, { Vacancy_ID: vacB }), 'pipeline B'); ok(pl.rows.find(x => x.Application_ID === karim.Application_ID).restricted, 'restricted marker on the card');
// a new application from the restricted person alerts HR
const pB = ctx.find_('PERSONS', { Person_ID: karim.Person_ID })[0];
const vacC = vacancy(P['محاسب تكاليف'], 1, 'شاغر تالت للقيود');
must(api('cand.create', t.rec, { Vacancy_ID: vacC, Source: 'WALK_IN', usePersonId: pB.Person_ID }), 'restricted person applies again');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rm }).filter(n => /قيد تعيين/.test(n.Title)).length === 0 && ctx.all_('NOTIFICATIONS').some(n => /قيد تعيين/.test(n.Title)), 'HR managers alerted');
let RL = must(api('restrict.list', t.hr, {}), 'restrictions'); ok(RL.rows.length === 1 && RL.reasons.length === 5 && RL.rows[0].byName === 'منى', 'list');
bad(api('restrict.lift', t.hr, { Restriction_ID: rs.Restriction_ID, reason: 'لا' }), /سبب/, 'lift needs a reason');
must(api('restrict.lift', t.hr, { Restriction_ID: rs.Restriction_ID, reason: 'تظلم اتقبل من لجنة الموارد البشرية' }), 'lifted');
g = must(api('cand.app', t.hr, { Application_ID: karim.Application_ID }), 'after lift'); ok(!g.flags.restricted && g.flags.former[0].eligibility === 'REVIEW', 'lifted → back to review');
// a resignation is eligible; NOT_SAME hides the flag
const hala = must(api('cand.create', t.rec, { Vacancy_ID: vacC, Full_Name: 'هالة محمد سعد', Mobile: '01066667777', Source: 'WALK_IN', consent: 'Y' }), 'hala').application.Application_ID;
g = must(api('cand.app', t.hr, { Application_ID: hala }), 'hala HR'); ok(g.flags.former[0].eligibility === 'ELIGIBLE', 'resigned → eligible');
must(api('former.confirm', t.hr, { Person_ID: g.person.Person_ID, same: 'N' }), 'not the same person');
g = must(api('cand.app', t.hr, { Application_ID: hala }), 'hala after'); ok(!g.flags, 'no flag after "not the same person"');
ok(must(api('lists.get', t.hr, {}), 'lists').processes.some(x => x.code === 'HIRING_RESTRICTION'), 'restriction reasons editable');

console.log('\n' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
