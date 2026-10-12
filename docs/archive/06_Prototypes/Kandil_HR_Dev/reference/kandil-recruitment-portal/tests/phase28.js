// v0.28.0: the open blueprint gaps — REQ-011 change after approval (only a higher number goes back to approval), VAC-005 several
// vacancies in one step, ORG-003 the approved JD by e-mail to portal users, CAN-005 no zero salary.
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
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
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مراجع حسابات', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مشرف إنتاج', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'عامل تعبئة', 'العبور', '', '', '', '5'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'فني معمل', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'مراجع حسابات', 'أمين خزينة', 'مراقب جودة', 'فني معمل', 'مشرف إنتاج'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['محصل', 'فني تشغيل', 'عامل تعبئة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
// real data that must survive the wipe: a real HR user (with a manager position) and a real employee
const real = must(api('users.save', tO, { Email: 'real.hr@t.com', Full_Name_AR: 'مستخدم حقيقي', Position_ID: P['مدير الحسابات'].Position_ID }), 'real user');
must(api('users.setRoles', tO, { User_ID: real.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'real roles');
const tR = login('real.hr@t.com');
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };

const tPlain = (() => { must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user'); return login('plain@t.com'); })();
const ownerCtx = () => { fresh(); return { user: ctx.get_('USERS', ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID), readOnly: false }; };

// ================= REQ-011: change an approved request =================
fresh();
const openV = ctx.all_('VACANCIES').filter(v => ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0);
const target = openV.find(v => ctx.get_('RECRUITMENT_REQUESTS', v.Request_ID).Status === 'APPROVED' && !ctx.all_('APPLICATIONS').some(a => a.Vacancy_ID === v.Vacancy_ID && a.Stage === 'ACCEPTED') && Number(v.Joined_HC || 0) === 0);
ok(!!target, 'an approved request with an open vacancy');
const RID = target.Request_ID, VID = target.Vacancy_ID, LID = target.Line_ID, req0 = ctx.get_('RECRUITMENT_REQUESTS', RID);
const tReq = tAs(req0.Requester_User_ID);
let G = must(api('req.get', T2.hr, { Request_ID: RID }), 'get (HR)');
ok(G.change && G.change.minor && G.change.increase && G.change.lines.some(l => l.Vacancy_ID === VID), 'HR: change form with the open vacancy');
G = must(api('req.get', tReq, { Request_ID: RID }), 'get (requester)');
ok(G.change && !G.change.minor && G.change.increase, 'requester: may ask for more only');
bad(api('req.change', tReq, { Request_ID: RID, fields: { Notes: 'تعديل' }, reason: 'تعديل البيانات' }), /بيسجله HR/, 'requester cannot change the data');
bad(api('req.change', T2.hr, { Request_ID: RID, fields: { Notes: 'x' }, reason: '' }), /سبب/, 'reason required');
bad(api('req.change', T2.hr, { Request_ID: RID, fields: {}, lines: [], reason: 'مفيش حاجة' }), /مفيش تغيير/, 'nothing changed');
bad(api('req.change', T2.hr, { Request_ID: RID, fields: { Required_By_Date: '2020-01-01' }, reason: 'تاريخ قديم' }), /النهارده/, 'date in the past');
const newDate = ctx.addDaysYmd_(ctx.today_(), 45);
let R = must(api('req.change', T2.hr, { Request_ID: RID, fields: { Required_By_Date: newDate, Education: 'بكالوريوس تجارة', Notes: 'بعد التعديل' }, reason: 'المدير طلب تأجيل الموعد' }), 'HR minor change');
fresh();
ok(R.applied.length === 3 && !R.increase, 'three fields applied, no approval');
ok(ctx.get_('RECRUITMENT_REQUESTS', RID).Required_By_Date === newDate && ctx.get_('VACANCIES', VID).Required_By_Date === newDate, 'request and vacancy carry the new date');
ok(ctx.get_('RECRUITMENT_REQUESTS', RID).Version === req0.Version && ctx.get_('RECRUITMENT_REQUESTS', RID).Status === 'APPROVED', 'still approved, approval version unchanged');
ok(ctx.all_('REQUEST_VERSIONS').some(x => x.Request_ID === RID && x.Version === req0.Version + '.1' && /المدير طلب تأجيل/.test(x.Reason)), 'amendment kept as version ' + req0.Version + '.1');
ok(ctx.find_('NOTIFICATIONS', { Link_ID: RID }).some(n => /تعديل على طلب توظيف معتمد/.test(n.Title) && n.User_ID === req0.Requester_User_ID), 'requester told');
ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_ID === RID && /تعديل بعد الاعتماد/.test(a.Reason)), 'audited with the reason');
// headcount: decrease / increase
const hc0 = Number(ctx.get_('VACANCIES', VID).Required_HC);
if (hc0 > 1) {
  must(api('req.change', T2.hr, { Request_ID: RID, lines: [{ Line_ID: LID, HC: hc0 - 1 }], reason: 'المدير اكتفى بعدد أقل' }), 'decrease');
  fresh(); ok(Number(ctx.get_('VACANCIES', VID).Required_HC) === hc0 - 1, 'decrease applied at once');
}
fresh(); const hc1 = Number(ctx.get_('VACANCIES', VID).Required_HC);
bad(api('req.change', T2.hr, { Request_ID: RID, lines: [{ Line_ID: LID, HC: 0 }], reason: 'العدد صفر غلط' }), /من 1 لـ 999/, 'not below 1');
bad(api('req.change', T2.hr, { Request_ID: RID, lines: [{ Line_ID: LID, Location_ID: 'LOC-XX' }], reason: 'موقع تاني' }), /ثابت من الهيكل|فرع صحيح/, 'location of a non-branch position is fixed');
// committed candidates block a deep decrease
fresh(); const app = ctx.all_('APPLICATIONS').find(a => a.Vacancy_ID === VID);
if (app && hc1 > 1) {
  ctx.update_('VACANCIES', VID, { Joined_HC: String(hc1 - 1) }, 'x'); fresh();
  bad(api('req.change', T2.hr, { Request_ID: RID, lines: [{ Line_ID: LID, HC: 1 }], reason: 'تقليل كبير' }), /اتعينوا أو قبلوا/, 'not below those already hired');
  ctx.update_('VACANCIES', VID, { Joined_HC: '0' }, 'x');
}
// increase → linked request through the normal chain
R = must(api('req.change', tReq, { Request_ID: RID, lines: [{ Line_ID: LID, HC: hc1 + 2 }], reason: 'الشغل زاد في الموسم' }), 'increase by the requester');
ok(R.increase && R.increase.Request_ID && R.applied.length === 0, 'increase opens a linked request');
fresh();
const SUP = ctx.get_('RECRUITMENT_REQUESTS', R.increase.Request_ID);
ok(SUP.Parent_Request_ID === RID && ['IN_APPROVAL', 'HR_REVIEW', 'PENDING_CEO', 'PENDING_BOARD'].indexOf(SUP.Status) >= 0, 'linked request is in approval: ' + SUP.Status);
const SL = ctx.find_('REQUEST_LINES', { Request_ID: SUP.Request_ID })[0];
ok(SL.Topup_Vacancy_ID === VID && SL.Requested_HC === '2', 'its line adds 2 to the same vacancy');
ok(Number(ctx.get_('VACANCIES', VID).Required_HC) === hc1, 'the vacancy keeps the approved number meanwhile');
bad(api('req.change', tReq, { Request_ID: RID, lines: [{ Line_ID: LID, HC: hc1 + 5 }], reason: 'زيادة تانية' }), /لسه تحت الاعتماد/, 'one increase at a time');
G = must(api('req.get', T2.hr, { Request_ID: RID }), 'parent shows the increase');
ok(G.increases.length === 1 && G.increases[0].hc === 2, 'parent lists its increase');
G = must(api('req.get', T2.hr, { Request_ID: SUP.Request_ID }), 'linked request');
ok(G.parent === RID, 'linked request points to its parent');
// final approval adds to the vacancy (no new vacancy)
const vBefore = ctx.all_('VACANCIES').length;
fresh(); const fin = ctx.finalizeRequest_(ownerCtx(), SUP.Request_ID);
fresh();
ok(fin.topped.length === 1 && fin.vacancies.length === 0 && ctx.all_('VACANCIES').length === vBefore, 'approval adds to the vacancy, no new one');
ok(Number(ctx.get_('VACANCIES', VID).Required_HC) === hc1 + 2, 'vacancy number raised to ' + (hc1 + 2));
ok(Number(ctx.get_('REQUEST_LINES', LID).Approved_HC) === hc1 + 2, 'parent line approved number raised');
ok(ctx.find_('EVENTS', { Entity_ID: RID }).some(e => e.Event === 'INCREASE_APPROVED'), 'parent timeline: increase approved');
// a closed vacancy gets a new one
R = must(api('req.change', T2.hr, { Request_ID: RID, lines: [{ Line_ID: LID, HC: hc1 + 3 }], reason: 'زيادة واحد كمان' }), 'second increase (after the first was approved)');
fresh(); ctx.update_('VACANCIES', VID, { Status: 'CLOSED' }, 'x'); fresh();
const fin2 = ctx.finalizeRequest_(ownerCtx(), R.increase.Request_ID);
ok(fin2.vacancies.length === 1 && fin2.topped.length === 0, 'vacancy closed meanwhile → a new vacancy');
fresh(); ctx.update_('VACANCIES', VID, { Status: target.Status }, 'x');
bad(api('req.change', T2.hr, { Request_ID: fin2.vacancies.length ? RID + 'X' : RID, fields: { Notes: 'x' }, reason: 'غلط' }), /غير موجود/, 'unknown request');
// not approved → refused
fresh(); const draft = ctx.all_('RECRUITMENT_REQUESTS').find(r => r.Status === 'DRAFT' || r.Status === 'IN_APPROVAL');
if (draft) bad(api('req.change', T2.hr, { Request_ID: draft.Request_ID, fields: { Notes: 'x' }, reason: 'قبل الاعتماد' }), /المعتمدة بس/, 'only approved requests');

// ================= VAC-005: several vacancies in one step =================
fresh();
const recs = must(api('vac.recruiters', T2.rm, {}), 'recruiters');
const rec2 = recs.find(r => r.id !== U.rec1).id;
const open2 = ctx.all_('VACANCIES').filter(v => ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED', 'ON_HOLD'].indexOf(v.Status) >= 0).slice(0, 3).map(v => v.Vacancy_ID);
bad(api('vac.assignMany', T2.rm, { Vacancy_IDs: open2, Lead_Recruiter_ID: U.rec1, reason: '' }), /السبب/, 'reason required');
bad(api('vac.assignMany', T2.rec1, { Vacancy_IDs: open2, Lead_Recruiter_ID: U.rec1, reason: 'x x x' }), null, 'a recruiter cannot assign');
fresh(); const n0 = ctx.find_('NOTIFICATIONS', { User_ID: U.rec1 }).length;
let M = must(api('vac.assignMany', T2.rm, { Vacancy_IDs: open2.concat(['VAC-NONE']), Lead_Recruiter_ID: U.rec1, recruiters: [rec2], reason: 'توزيع الشهر' }), 'assign many');
fresh();
ok(M.done.length === open2.length && M.failed.length === 1 && M.failed[0].id === 'VAC-NONE', 'all selected assigned; the unknown one reported');
ok(open2.every(id => ctx.get_('VACANCIES', id).Lead_Recruiter_ID === U.rec1), 'lead set on every vacancy');
ok(open2.every(id => ctx.all_('VACANCY_RECRUITERS').some(r => r.Vacancy_ID === id && r.User_ID === rec2 && r.Active === 'Y' && r.Role === 'SUPPORT')), 'support recruiter on every vacancy');
const nNew = ctx.find_('NOTIFICATIONS', { User_ID: U.rec1 }).length - n0;
ok(nNew <= 1, 'one notification for the lot (' + nNew + ')');
// move everything of rec1 to rec2, same roles
fresh(); const had = ctx.all_('VACANCIES').filter(v => ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED', 'ON_HOLD'].indexOf(v.Status) >= 0 && (v.Lead_Recruiter_ID === U.rec1 || ctx.all_('VACANCY_RECRUITERS').some(r => r.Vacancy_ID === v.Vacancy_ID && r.User_ID === U.rec1 && r.Active === 'Y'))).map(v => v.Vacancy_ID);
bad(api('vac.assignMany', T2.rm, { From_User_ID: U.rec1, To_User_ID: U.rec1, reason: 'غلط' }), /هيستلم/, 'from ≠ to');
M = must(api('vac.assignMany', T2.rm, { From_User_ID: U.rec1, To_User_ID: rec2, reason: 'استقالة' }), 'move all');
fresh();
ok(M.done.length === had.length && had.length >= 3, 'every vacancy of the leaver moved: ' + M.done.length);
ok(had.every(id => ctx.get_('VACANCIES', id).Lead_Recruiter_ID !== U.rec1 && !ctx.all_('VACANCY_RECRUITERS').some(r => r.Vacancy_ID === id && r.User_ID === U.rec1 && r.Active === 'Y')), 'the leaver is on none of them');
ok(open2.every(id => ctx.get_('VACANCIES', id).Lead_Recruiter_ID === rec2), 'his lead vacancies have the colleague as lead');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec1 }).some(n => /شغلك اتنقل/.test(n.Title)), 'the leaver is told');
bad(api('vac.assignMany', T2.rm, { From_User_ID: U.rec1, To_User_ID: rec2, reason: 'تاني' }), /مفيش شواغر/, 'nothing left to move');

// ================= ORG-003: the approved JD by e-mail =================
fresh();
const job = ctx.get_('JOBS', target.Job_Code);
const oc = ownerCtx();
ctx.withLock_(() => { ctx.jdUpsertDraft_(oc.user.User_ID, job.Job_Code, { Purpose: 'حساب التكاليف بدقة', Responsibilities: JSON.stringify(['مسؤولية 1', 'مسؤولية 2']), KPIs: '[]', Authority: '[]', Competencies_JSON: '[]', Qualifications: 'بكالوريوس تجارة', Experience: 'سنتين', Working_Conditions: 'مكتب' }); });
fresh(); try { ctx.jdApproveOne_(oc.user.User_ID, job.Job_Code, 'اعتماد'); } catch (e) { console.log('approve: ' + e.message); }
fresh();
let J = must(api('jd.get', T2.hr, { Job_Code: job.Job_Code }), 'jd get');
ok(J.approved && J.canSend, 'HR can send an approved JD');
J = must(api('jd.get', tPlain, { Job_Code: job.Job_Code }), 'jd get (no role)');
ok(!J.canSend, 'someone with no role / unit cannot');
bad(api('jd.send', tPlain, { Job_Code: job.Job_Code, to: [U.hr] }), /لفريق الموارد البشرية/, 'refused for him on the server');
const people = must(api('jd.recipients', T2.hr, {}), 'recipients');
ok(people.length >= 5 && people.every(p => p.id && p.name), 'portal users to pick from');
bad(api('jd.send', T2.hr, { Job_Code: job.Job_Code, to: [] }), /واحد على الأقل/, 'at least one');
bad(api('jd.send', T2.hr, { Job_Code: job.Job_Code, to: people.slice(0, 11).map(p => p.id) }), /10/, 'at most 10');
bad(api('jd.send', T2.hr, { Job_Code: job.Job_Code, to: ['USR-NOPE'] }), /مش موجود/, 'portal users only');
const noJd = ctx.all_('JOBS').find(j => !ctx.jdApproved_(j.Job_Code));
if (noJd) bad(api('jd.send', T2.hr, { Job_Code: noJd.Job_Code, to: [U.rm] }), /مالهاش وصف وظيفي معتمد/, 'approved version only');
const realU = ctx.all_('USERS').find(u => u.Email === 'real.hr@t.com').User_ID;
vm.runInContext("PropertiesService.getScriptProperties().setProperty('MAIL_COUNT', '0')", ctx);
mails.length = 0;
const S1 = must(api('jd.send', T2.hr, { Job_Code: job.Job_Code, to: [realU], note: 'للاطلاع قبل المقابلة' }), 'send');
ok(S1.sent === 1 && S1.pdf === true, 'sent with the PDF');
ok(mails.length === 1 && mails[0].to === 'real.hr@t.com' && /الوصف الوظيفي/.test(mails[0].subject) && /حساب التكاليف بدقة/.test(mails[0].htmlBody) && /للاطلاع قبل المقابلة/.test(mails[0].htmlBody), 'mail has the JD and the note');
ok(mails[0].attachments && mails[0].attachments.length === 1 && /\.pdf$/.test(mails[0].attachments[0].getName()), 'PDF attached');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'JD' && a.Action === 'SENT' && a.Entity_ID === job.Job_Code), 'sending audited');
fresh(); ok(!ctx.consultantMay_('jd.send', {}), 'consultant cannot send');

// ================= CAN-005: never a zero salary =================
fresh();
const pf = x => { try { ctx.personFields_(Object.assign({ Full_Name: 'مرشح تجربة', Mobile: '01012345678', Governorate: 'القاهرة', lang: 'ar' }, x), false); return 'ok'; } catch (e) { return e.message; } };
ok(/صفر/.test(pf({ Current_Salary: '0' })), 'zero current salary refused');
ok(/صفر/.test(pf({ Expected_Salary: '٠' })), 'Arabic zero refused');
ok(pf({ Current_Salary: '', Expected_Salary: '' }) === 'ok', 'empty salary still fine (optional)');
ok(pf({ Current_Salary: '8000', Expected_Salary: '10,000' }) === 'ok', 'real salary fine');
console.log('phase28: ' + pass + ' passed, ' + failN + ' failed');
