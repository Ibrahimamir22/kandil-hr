// v0.42.0: the new look (CHG-87) — the server side of it: the search box at the top goes through the same checks as each
// kind's own screen (candidates only where you may open the application, requests from your own boxes, vacancies you
// may see, employees for HR, nothing personal for a consultant after go-live, never a mobile or e-mail); the stage
// board's days-in-stage and the AI match of the current CV (full access only).
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
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), trs: user('trs@t.com', 'مدير الخزينة', P['مدير الخزينة'].Position_ID),
  hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']),
  rec: user('rec@t.com', 'علي', '', ['RECRUITER']), rec2: user('rec2@t.com', 'هالة', '', ['RECRUITER']) };
const t = {}; Object.keys(U).forEach(k => { t[k] = login(k === 'rec2' ? 'rec2@t.com' : k + '@t.com'); });
must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: 'E1', Full_Name: 'أحمد علي حسن', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'employee');
const today = ctx.today_();
const reqBody = { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع الجديد', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] };
const RQ = must(api('req.submit', tO, reqBody), 'owner request (approved at once)');
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: RQ.Request_ID })[0];
must(api('vac.assign', t.rm, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' }), 'open');
const A = must(api('cand.create', t.rec, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Email: 'karim@mail.com', Gender: 'M', Source: 'WALK_IN', consent: 'Y' }), 'candidate').application;
const accReq = must(api('req.submit', t.acc, Object.assign({}, reqBody, { Justification: 'محاسب تكاليف تاني للفرع' })), 'the accounts manager\'s own request');

// =============== the search box ===============
const S = (tok, q) => must(api('search.all', tok, { q }), 'search ' + q);
let r = S(t.rec, 'مح');
ok(!r.cands.length && !r.reqs.length && !r.vacs.length && !r.emps.length, 'fewer than 3 letters: nothing (no browsing)');
r = S(t.rec, 'كريم عادل');
ok(r.cands.length === 1 && r.cands[0].id === A.Application_ID && r.cands[0].Stage === 'NEW', 'the recruiter on the vacancy finds his candidate, with the application to open');
ok(!/01011112222|karim@mail/.test(JSON.stringify(r)), 'never a mobile or e-mail in the results');
r = S(t.rec, '01011112222');
ok(r.cands.length === 1, 'found by mobile number too (4+ digits) — the number itself is not returned');
ok(!/01011112222/.test(JSON.stringify(r)), '… and the number is not echoed back');
r = S(t.rec2, 'كريم عادل');
ok(!r.cands.length, 'a recruiter not on the vacancy gets nothing (he may not open the application)');
r = S(t.acc, 'كريم عادل');
ok(!r.cands.length, 'the hiring manager (not a recruitment role) gets no candidates from the box');
r = S(t.rec, 'محاسب تكاليف');
ok(r.vacs.some(v => v.id === V.Vacancy_ID), 'the recruiter finds his vacancy');
ok(r.reqs.length >= 2, 'a recruitment role finds requests from all requests');
r = S(t.rec2, 'محاسب تكاليف');
ok(!r.vacs.length, 'a recruiter with no vacancy sees no vacancy');
r = S(t.acc, 'محاسب تكاليف');
ok(r.reqs.some(x => x.id === accReq.Request_ID), 'the requester finds his own request');
ok(r.vacs.some(v => v.id === V.Vacancy_ID), 'the manager finds a vacancy in his own unit');
r = S(t.trs, 'محاسب تكاليف');
ok(!r.reqs.length && !r.vacs.length, 'another unit\'s manager finds neither the request nor the vacancy');
r = S(t.hr, 'أحمد علي');
ok(r.emps.length === 1 && r.emps[0].id === 'E1' && r.emps[0].title === 'محاسب تكاليف', 'HR finds an employee with his job');
ok(!S(t.rec, 'أحمد علي').emps.length && !S(t.acc, 'أحمد علي').emps.length, 'no employees for a recruiter or a unit manager');
r = S(t.hr, RQ.Request_ID);
ok(r.reqs.length === 1 && r.reqs[0].id === RQ.Request_ID, 'a request found by its number');
// a consultant (read-only): personal data until go-live only
fresh(); const hrCtx = { user: ctx.get_('USERS', U.hr), sessionId: '', readOnly: true };
let x = ctx.searchAll_(hrCtx, { q: 'أحمد علي' });
ok(x.emps.length === 1, 'read-only before go-live: employees shown (test data)');
ctx.update_('CONFIG', 'GOLIVE_AT', { Config_Value: ctx.nowIso_() }, 'x');
fresh(); x = ctx.searchAll_({ user: ctx.get_('USERS', U.hr), sessionId: '', readOnly: true }, { q: 'أحمد علي' });
const x2 = ctx.searchAll_({ user: ctx.get_('USERS', U.hr), sessionId: '', readOnly: true }, { q: 'كريم عادل' });
ok(!x.emps.length && !x2.cands.length, 'read-only after go-live: no candidates and no employees (CHG-82)');
fresh(); x = ctx.searchAll_({ user: ctx.get_('USERS', U.hr), sessionId: '' }, { q: 'كريم عادل' });
ok(x.cands.length === 1, '… while HR itself still finds them after go-live');
ctx.update_('CONFIG', 'GOLIVE_AT', { Config_Value: '' }, 'x');
fresh(); ok(ctx.consultantMay_('search.all', { q: 'x' }), 'the consultant may call the search (read only)');

// =============== the stage board: days in the stage, the AI match ===============
fresh(); ctx.update_('APPLICATIONS', A.Application_ID, { Stage_At: ctx.addDaysYmd_(today, -5) + 'T10:00:00' }, 'x');
let PL = must(api('cand.pipeline', t.rec, { Vacancy_ID: V.Vacancy_ID }), 'pipeline');
let row = PL.rows.find(y => y.Application_ID === A.Application_ID);
ok(row.stageDays === 5, 'days in the stage from the stage date: ' + row.stageDays);
ok(row.match === undefined, 'no AI reading → no match shown');
fresh(); ctx.update_('PERSONS', A.Person_ID, { CV_File_ID: 'F1' }, 'x');
ctx.insert_('CV_AI_RUNS', { Run_ID: ctx.nextId_('CV_AI_RUN'), Person_ID: A.Person_ID, Vacancy_ID: V.Vacancy_ID, CV_File_ID: 'F1', Status: 'OK', Result_JSON: JSON.stringify({ match: { score: 4 } }) }, 'x');
PL = must(api('cand.pipeline', t.rec, { Vacancy_ID: V.Vacancy_ID }), 'pipeline 2');
row = PL.rows.find(y => y.Application_ID === A.Application_ID);
ok(row.match === 80, 'the match of the last reading of the current CV: ' + row.match);
fresh(); ctx.update_('PERSONS', A.Person_ID, { CV_File_ID: 'F2' }, 'x');
row = must(api('cand.pipeline', t.rec, { Vacancy_ID: V.Vacancy_ID }), 'pipeline 3').rows.find(y => y.Application_ID === A.Application_ID);
ok(row.match === undefined, 'a new CV → the old reading is not shown');
fresh(); ctx.update_('PERSONS', A.Person_ID, { CV_File_ID: 'F1' }, 'x');
must(api('cand.move', t.rec, { Application_ID: A.Application_ID, to: 'SHORTLISTED' }), 'shortlist (the board move uses the same action)');
row = must(api('cand.pipeline', t.acc, { Vacancy_ID: V.Vacancy_ID }), 'manager pipeline').rows.find(y => y.Application_ID === A.Application_ID);
ok(row && row.match === undefined && row.stageDays === 0, 'the hiring manager (shortlist access) sees days in the stage but not the AI match');

// =============== v0.42.1 (CHG-88): responsibilities by job level — hard limits 3 … 16, a reason above the level's band ===============
const ACC = P['محاسب تكاليف'].Job_Code, PURP = 'حساب تكلفة المنتجات بدقة وفي موعدها';
const R = n => Array.from({ length: n }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها');
const jdNow = () => { fresh(); return ctx.find_('JOB_DESCRIPTIONS', { Job_Code: ACC, Status: 'Draft' })[0]; };
let jr = api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL6', resp: R(17), Resp_Reason: 'وظيفة واسعة جداً بتغطي مصنعين' });
ok(!jr.ok && /أقصى عدد 16/.test(jr.error) && !jdNow(), '17 responsibilities refused even with a reason (hard cap 16): ' + jr.error);
jr = api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL6', resp: R(2) });
ok(!jr.ok && /3 مسؤوليات/.test(jr.error), 'fewer than 3 refused');
must(api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL6', resp: R(16) }), '16 at JL6 (inside 8–16) saved with no reason');
ok(JSON.parse(jdNow().Responsibilities).length === 16 && jdNow().Resp_Reason === '', 'all 16 kept, no reason stored');
jr = api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL3', resp: R(12) });
ok(!jr.ok && /نطاق مستوى JL3 \(6–10\)/.test(jr.error) && JSON.parse(jdNow().Responsibilities).length === 16, '12 at JL3 (6–10) needs a reason — nothing saved: ' + jr.error);
must(api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL3', resp: R(12), Resp_Reason: 'الوظيفة بتغطي التكاليف والمخازن مع بعض' }), '12 at JL3 with a written reason');
ok(JSON.parse(jdNow().Responsibilities).length === 12 && jdNow().Resp_Reason === 'الوظيفة بتغطي التكاليف والمخازن مع بعض', 'the reason kept on the draft');
let JG = must(api('jd.get', t.hr, { Job_Code: ACC }), 'jd get');
ok(JG.draft.Resp_Reason && JG.draft.respBand.join('-') === '6-10', 'the reason and the band come back to the page');
must(api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL3', resp: R(4), Resp_Reason: 'سبب قديم مش محتاجينه' }), 'below the band: a warning on the page only, saved');
ok(jdNow().Resp_Reason === '' && JSON.parse(jdNow().Responsibilities).length === 4, 'inside or below the band: no reason kept');
must(api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: '', resp: R(15) }), 'no level: the hard limits only');
// the Excel import: the same hard cap; above the band loads with a warning
const jdx = (n, lvl, why) => ({ code: ACC, title: 'محاسب تكاليف', level: lvl, purpose: PURP, resp: R(n), kpis: [], auth: [], comps: [], respReason: why || '' });
let IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jdx(20, 'JL6')] }), 'import preview 20');
ok(IM.valid === 0 && /أقصى عدد 16/.test(IM.errors[0].msg), 'import: 20 responsibilities refused (the old import took any number)');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jdx(14, 'JL4')] }), 'import preview 14 at JL4');
ok(IM.valid === 1 && IM.warnings.length === 1 && /فوق نطاق JL4/.test(IM.warnings[0].msg), 'import: above the band loads with a warning');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jdx(14, 'JL4', 'وظيفة بتجمع شغل قسمين في الفرع')] , commit: true, reason: 'تحميل' }), 'import with a reason column');
ok(IM.warnings.length === 0 && jdNow().Resp_Reason === 'وظيفة بتجمع شغل قسمين في الفرع' && JSON.parse(jdNow().Responsibilities).length === 14, 'the reason from the file kept with the 14 responsibilities');

// =============== v0.42.2 (CHG-89): weighted / monitoring KPIs — the weights add up to 100 (hard), counts by level warn ===============
const KW = (ws, mon) => ws.map((w, i) => ['مؤشر موزون ' + (i + 1), 'المعادلة', 'شهري', 'W', w]).concat(Array.from({ length: mon || 0 }, (_, i) => ['مؤشر متابعة ' + (i + 1), 'يوازن المؤشر 1', 'شهري', 'M', '']));
const saveK = (kpis, lvl) => api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: lvl || 'JL4', resp: R(9), kpis });
jr = saveK(KW([30, 30, 30]));
ok(!jr.ok && /مجموع أوزان المؤشرات الموزونة 90/.test(jr.error), 'weights adding up to 90 refused: ' + jr.error);
jr = saveK(KW([50, 50, '']));
ok(!jr.ok && /من غير وزن/.test(jr.error), 'a weighted KPI with no weight refused');
jr = saveK([['مؤشر', 'معادلة', 'شهري', 'نوع غريب', '10']]);
ok(!jr.ok && /«موزون» أو «متابعة»/.test(jr.error), 'an unknown type refused');
must(saveK(KW([40, '35%', 25], 2).map((k, i) => i === 3 ? ['مؤشر متابعة 1', 'يوازن المؤشر 1', 'شهري', 'M', '15'] : k)), 'weights 40 + 35% + 25 = 100 with two monitoring KPIs');
let KS = JSON.parse(jdNow().KPIs);
ok(KS.length === 5 && KS[1][4] === '35' && KS[0][3] === 'W' && KS[3][3] === 'M' && KS[3][4] === '', 'stored with type and weight («35%» → 35; a monitoring KPI keeps no weight)');
must(saveK([['مؤشر قديم', 'معادلة', 'شهري']]), 'an old KPI with no type still saves (old JDs keep working)');
ok(JSON.parse(jdNow().KPIs)[0].length === 5 && JSON.parse(jdNow().KPIs)[0][3] === '', '… stored with an empty type');
must(saveK(KW([12.5, 12.5, 25, 25, 25], 6), 'JL4'), 'over the indicative counts still saves (warning only)');
// the import: the same hard rule, the counts as warnings — on rows shaped like the job-profile file (v0.11)
const jk = (kpis, lvl) => ({ code: ACC, title: 'محاسب تكاليف', level: lvl, purpose: PURP, resp: R(9), kpis, auth: [], comps: [] });
const KA = (ws, mon) => KW(ws, mon).map(k => [k[0], k[1], k[2], k[3] === 'W' ? 'موزون' : 'متابعة', k[4]]);
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jk(KA([50, 40]), 'JL4')] }), 'import: weights 90');
ok(IM.valid === 0 && /مجموع أوزان/.test(IM.errors[0].msg), 'import: a JD whose weights are not 100 is refused');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jk(KA([15, 15, 10, 10, 10, 10, 15, 15], 4), 'JL7')] }), 'import: 8 weighted at JL7');
ok(IM.valid === 1 && IM.warnings.some(w => /8 مؤشر موزون — نطاق JL7: 5–7/.test(w.msg)), 'import: 8 weighted at JL7 loads with a warning (as HRM-001 in v0.11)');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jk(KA([50, 50], 5), 'JL3')] }), 'import: 5 monitoring');
ok(IM.valid === 1 && IM.warnings.some(w => /5 مؤشرات متابعة/.test(w.msg)), 'import: more than 4 monitoring KPIs warns');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [jk(KA([20, 20, 20, 20, 20], 3), 'JL4')], commit: true, reason: 'تحميل v0.11' }), 'import commit');
KS = JSON.parse(jdNow().KPIs);
ok(KS.filter(k => k[3] === 'W').length === 5 && KS.filter(k => k[3] === 'M').length === 3 && KS.every(k => k[3] !== 'M' || k[4] === ''), 'imported: «موزون» / «متابعة» stored as weighted / monitoring with their weights');

// =============== v0.43.0 (CHG-90): certificates on the JD; locations and the direct manager from the structure ===============
must(api('jd.save', t.hr, { Job_Code: ACC, Purpose: PURP, Career_Level: 'JL3', resp: R(6), Certifications: 'رخصة ونش شوكة\n\n  شهادة السلامة المهنية  ' }), 'save with certificates');
ok(jdNow().Certifications === 'رخصة ونش شوكة\nشهادة السلامة المهنية', 'certificates kept one per line, blanks dropped');
JG = must(api('jd.get', t.hr, { Job_Code: ACC }), 'jd get with sites');
ok(JG.draft.Certifications === 'رخصة ونش شوكة\nشهادة السلامة المهنية', 'certificates come back to the page');
ok(JG.job.sites.length === 1 && JG.job.sites[0].location === 'العبور' && JG.job.sites[0].unit === 'الحسابات' && JG.job.sites[0].manager === 'مدير الحسابات',
  'the location, unit and direct manager from the structure: ' + JSON.stringify(JG.job.sites));
fresh(); ctx.update_('POSITIONS', P['محاسب تكاليف'].Position_ID, { Reports_To_Position_ID: P['مدير القطاع المالي'].Position_ID }, 'x');
ok(must(api('jd.get', t.hr, { Job_Code: ACC }), 'jd get 2').job.sites[0].manager === 'مدير القطاع المالي', 'a position\'s own «reports to» wins over the unit head');
fresh(); ctx.update_('POSITIONS', P['محاسب تكاليف'].Position_ID, { Reports_To_Position_ID: '' }, 'x');
IM = must(api('jd.import', t.hr, { kind: 'jds', jds: [Object.assign(jk(KA([60, 40]), 'JL3'), { certs: 'رخصة قيادة مهنية' })], commit: true, reason: 'x' }), 'import with a certificate');
ok(jdNow().Certifications === 'رخصة قيادة مهنية', 'the «الشهادات والتراخيص» column imported');

console.log('\nPhase 42 (new look — search, board): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
