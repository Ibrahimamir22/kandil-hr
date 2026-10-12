// v0.8.1 (CHG-40): HC exception approved separately by the HR Sector Manager, internal HR notes,
// daily job (reminders, escalation, 30-day auto-reject, digest, email budget, trigger), delegation,
// editable lists (reasons + activity types), job / grade edit with history.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
const prop = (k, v) => vm.runInContext("PropertiesService.getScriptProperties().setProperty('" + k + "','" + v + "')", ctx);
const getProp = k => vm.runInContext("PropertiesService.getScriptProperties().getProperty('" + k + "')", ctx);
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const T = '\t';
const day = n => { const d = new Date(Date.now() + 3 * 3600000 + n * 864e5); return d.toISOString().slice(0, 10); };
const ago = n => day(-n) + 'T09:00:00';
ctx.setupSystem();
// v0.40.1 (decision 48) made it 5 working days (reminder 2, escalation 3, warning 1 before) — this suite was written for
// the old 3 / 7 / 30 / 5 and keeps them; the new values are tested in phase40
ctx.update_('CONFIG', 'APPROVAL_EXPIRE_DAYS', { Config_Value: '30' }, 'x'); ctx.update_('CONFIG', 'APPROVAL_EXPIRY_WARN_DAYS', { Config_Value: '5' }, 'x');
ctx.update_('CONFIG', 'APPROVAL_REMIND_DAYS', { Config_Value: '3' }, 'x'); ctx.update_('CONFIG', 'APPROVAL_ESCALATE_DAYS', { Config_Value: '7' }, 'x');
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '1']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = {
  cfo: user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي']), acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']),
  hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']),
  rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']),
  dep: user('dep@t.com', 'نائب مدير الحسابات', '', null)
};
fresh(); const owner = ctx.findUserByEmail_('owner@test.com').User_ID;
const t = {}; Object.keys(U).forEach(k => { t[k] = login(k + '@t.com'); });
const base = { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال الشهري', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01' };
const req = (tok, pos, hc, extra) => must(api('req.submit', tok, Object.assign({}, base, { lines: [{ Position_ID: pos, Requested_HC: hc }] }, extra || {})), 'submit ' + hc);
const chainOf = (tok, id) => must(api('req.get', tok, { Request_ID: id }), 'get ' + id).chain.map(s => s.Step_Type + ':' + s.Status).join();

// =============== 1) HC exception: separate approval by the HR Sector Manager ===============
const r1 = req(t.acc, P['محاسب تكاليف'], 4, { Exception_Justification: 'موسم إقفال الميزانية السنوية' });
ok(r1.exception, 'request above structure flagged');
ok(chainOf(t.acc, r1.Request_ID) === 'LINE:PENDING,HR:WAITING,HC_EXC:WAITING', 'chain has the exception step: ' + chainOf(t.acc, r1.Request_ID));
must(api('req.action', t.cfo, { Request_ID: r1.Request_ID, action: 'APPROVE' }), 'cfo approves');
let g = must(api('req.get', t.hr, { Request_ID: r1.Request_ID }), 'hr get');
ok(g.can.hrStep && !g.can.alsoHcExc && g.hcLines.length === 1 && g.hcLines[0].over === 2, 'HR manager reviews; not his exception: ' + JSON.stringify(g.hcLines));
must(api('req.action', t.hr, { Request_ID: r1.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'IMPORTANT', HR_Notes: 'تمام', HR_Internal_Notes: 'المرتب المتوقع أعلى من السوق' } }), 'hr approves');
g = must(api('req.get', t.hr, { Request_ID: r1.Request_ID }), 'hr get 2');
ok(g.request.Status === 'HR_REVIEW' && g.currentStep.indexOf('استثناء العدد') >= 0 && !g.can.act, 'waits for the HR Sector Manager');
bad(api('req.action', t.hr, { Request_ID: r1.Request_ID, action: 'APPROVE' }), /مش عندك/, 'HR manager cannot approve the exception');
g = must(api('req.get', tO, { Request_ID: r1.Request_ID }), 'owner get');
ok(g.can.hcExcStep && g.can.act, 'HR Sector Manager acts on the exception');
bad(api('req.action', t.hr, { Request_ID: r1.Request_ID, action: 'APPROVE_WITHIN_HC' }), null, 'within-HC only for the exception approver');
let rr = must(api('req.action', tO, { Request_ID: r1.Request_ID, action: 'APPROVE_WITHIN_HC', comment: 'مفيش ميزانية للزيادة' }), 'approve within HC');
ok(rr.Status === 'APPROVED', 'request approved after the exception step');
fresh();
ok(ctx.find_('REQUEST_LINES', { Request_ID: r1.Request_ID })[0].Approved_HC === '2', 'cut to the 2 free in the structure');
ok(ctx.find_('VACANCIES', { Request_ID: r1.Request_ID })[0].Required_HC === '2', 'vacancy for 2');
ok(ctx.find_('EVENTS', { Entity_ID: r1.Request_ID }).some(e => e.Event === 'HC_EXC_CAPPED'), 'capped event');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /استثناء العدد اترفض/.test(n.Body)), 'requester told about the cut');
// requester never sees internal notes
g = must(api('req.get', t.acc, { Request_ID: r1.Request_ID }), 'requester get');
ok(!('HR_Internal_Notes' in g.request) && g.request.HR_Notes === 'تمام' && !g.can.internalNotes, 'internal notes hidden from the requester');
g = must(api('req.get', t.rec, { Request_ID: r1.Request_ID }), 'recruiter get');
ok(g.request.HR_Internal_Notes === 'المرتب المتوقع أعلى من السوق' && g.can.internalNotes, 'HR team sees internal notes');
fresh(); ok(!ctx.find_('EVENTS', { Entity_ID: r1.Request_ID }).some(e => /أعلى من السوق/.test(e.Comment + e.Data_JSON)), 'internal notes not in the timeline');
ok(!ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /أعلى من السوق/.test(n.Body)), 'internal notes not notified');
must(api('req.hrNote', t.rec, { Request_ID: r1.Request_ID, HR_Internal_Notes: 'اتفقنا مع المدير على مرشح داخلي' }), 'recruiter adds internal note');
bad(api('req.hrNote', t.acc, { Request_ID: r1.Request_ID, HR_Internal_Notes: 'x' }), null, 'requester cannot write internal notes');
fresh(); ok(ctx.find_('AUDIT_LOG', { Entity_ID: r1.Request_ID, Field: 'HR_Internal_Notes' }).length >= 2, 'internal notes audited');

// HR cuts the number inside the structure → no exception step needed
const r2 = req(t.acc, P['محاسب عام'], 3, { Exception_Justification: 'تغطية إجازات الصيف' });
must(api('req.action', t.cfo, { Request_ID: r2.Request_ID, action: 'APPROVE' }), 'cfo 2');
const l2 = must(api('req.get', t.hr, { Request_ID: r2.Request_ID }), 'g2').lines[0];
rr = must(api('req.action', t.hr, { Request_ID: r2.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'NORMAL', HR_Notes: 'واحد كفاية', lines: [{ Line_ID: l2.Line_ID, Approved_HC: '1' }] } }), 'hr cuts to 1');
ok(rr.Status === 'APPROVED', 'approved without the exception step');
ok(/HC_EXC:SKIPPED/.test(chainOf(tO, r2.Request_ID)), 'exception step skipped with reason');

// the HR Sector Manager reviewing as HR gives both approvals in one go (two records)
const r3 = req(t.acc, P['محاسب تكاليف'], 2, { Exception_Justification: 'فريق تاني للمخازن الجديدة' });
must(api('req.action', t.cfo, { Request_ID: r3.Request_ID, action: 'APPROVE' }), 'cfo 3');
g = must(api('req.get', tO, { Request_ID: r3.Request_ID }), 'owner get 3');
ok(g.can.hrStep && g.can.alsoHcExc, 'owner offered both approvals');
rr = must(api('req.action', tO, { Request_ID: r3.Request_ID, action: 'APPROVE', alsoHcExc: true, hr: { HR_Classification: 'NORMAL' } }), 'owner approves both');
ok(rr.Status === 'APPROVED' && /HR:APPROVED,HC_EXC:APPROVED/.test(chainOf(tO, r3.Request_ID)), 'two separate approvals recorded');
fresh(); const ex3 = ctx.find_('APPROVAL_INSTANCES', { Entity_ID: r3.Request_ID, Step_Type: 'HC_EXC' })[0];
ok(ex3.Decision_By === owner && JSON.parse(ex3.Snapshot_JSON).lines.length === 1, 'exception decision with its own snapshot');

// the HR Sector Manager's own request with an exception: his submission approves both
const r4 = req(tO, P['محاسب عام'], 5, { Exception_Justification: 'مشروع التحول الرقمي للحسابات' });
ok(r4.Status === 'APPROVED' && /HC_EXC:APPROVED/.test(chainOf(tO, r4.Request_ID)), 'own request: exception approved with the submission: ' + chainOf(tO, r4.Request_ID));
// the exception step can be rejected like any step
const r5 = req(t.acc, P['محاسب تكاليف'], 9, { Exception_Justification: 'زيادة كبيرة للتجربة' });
must(api('req.action', t.cfo, { Request_ID: r5.Request_ID, action: 'APPROVE' }), 'cfo 5');
must(api('req.action', t.hr, { Request_ID: r5.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }), 'hr 5');
rr = must(api('req.action', tO, { Request_ID: r5.Request_ID, action: 'REJECT', reasonCode: 'NO_BUDGET' }), 'exception rejected');
ok(rr.Status === 'REJECTED', 'rejected at the exception step');
fresh(); ok(ctx.find_('AUTHORITY_RULES', { Rule_Type: 'HC_EXCEPTION_APPROVER', Active: 'Y' }).every(r => r.Authority === 'HR_SECTOR_MANAGER'), 'old HR Manager / CEO exception rules stopped');

// =============== 2) Daily job: reminders, escalation, warning, expiry ===============
const EXJ = { Exception_Justification: 'تغطية مؤقتة لضغط الشغل' };
const a = req(t.acc, P['محاسب عام'], 1, EXJ);       // waits at the sector manager
const b = req(t.acc, P['محاسب عام'], 1, Object.assign({ Justification: 'طلب تاني للاختبار اليومي' }, EXJ));
const c = req(t.acc, P['محاسب عام'], 1, Object.assign({ Justification: 'طلب تالت للاختبار اليومي' }, EXJ));
const pcr = must(api('pcr.submit', t.acc, { Org_Unit_ID: ctx.get_('POSITIONS', P['مدير الحسابات']).Org_Unit_ID, Proposed_Title: 'محلل مالي',
  Number_Of_Positions: '1', Reports_To_Position_ID: P['مدير الحسابات'], Location_ID: ctx.get_('POSITIONS', P['مدير الحسابات']).Location_ID,
  Justification: 'تحليل التكاليف والموازنات', Responsibilities: 'تقارير التحليل المالي', Qualifications: 'تجارة' }), 'pcr');
fresh();
const step = id => ctx.find_('APPROVAL_INSTANCES', { Entity_ID: id, Status: 'PENDING' })[0];
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');     // calendar days in this test (weekly days off are tested in phase11)
ctx.update_('APPROVAL_INSTANCES', step(a.Request_ID).Approval_ID, { Activated_At: ago(4) }, 'x');     // reminder
ctx.update_('APPROVAL_INSTANCES', step(b.Request_ID).Approval_ID, { Activated_At: ago(26) }, 'x');    // warning + escalation
ctx.update_('APPROVAL_INSTANCES', step(c.Request_ID).Approval_ID, { Activated_At: ago(31) }, 'x');    // expired
ctx.update_('APPROVAL_INSTANCES', step(pcr.PCR_ID).Approval_ID, { Activated_At: ago(30) }, 'x');      // expired (PCR)
prop('DAILY_RUN', day(-1)); prop('DAILY_TRIGGER', 'N');
prop('MAIL_COUNT', '0');      // v0.35: the digest may use at most half the day's budget
mails.length = 0;
fresh(); let out = ctx.runDaily_(true);
ok(out.sla && out.sla.reminded === 1 && out.sla.warned === 1 && out.sla.expired === 2 && out.sla.escalated === 1, 'daily SLA counts: ' + JSON.stringify(out.sla));
fresh();
const nCfo = ctx.find_('NOTIFICATIONS', { User_ID: U.cfo });
ok(nCfo.some(n => /تذكير: طلب مستني اعتمادك من 4 يوم/.test(n.Title) && n.Link_ID === a.Request_ID), 'reminder to the approver');
ok(nCfo.some(n => /هيترفض تلقائياً بعد 4 يوم/.test(n.Title) && n.Link_ID === b.Request_ID), 'expiry warning to the approver');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /هيترفض تلقائياً/.test(n.Title) && n.Link_ID === b.Request_ID), 'expiry warning to the requester');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /تصعيد/.test(n.Title) && n.Link_ID === b.Request_ID && /المدير المالي/.test(n.Body)), 'escalated to HR with the approver name');
ok(ctx.find_('NOTIFICATIONS', { User_ID: owner }).some(n => /تصعيد/.test(n.Title)), 'escalated to the HR Sector Manager');
ok(ctx.get_('RECRUITMENT_REQUESTS', c.Request_ID).Status === 'REJECTED' && ctx.get_('POSITION_CHANGE_REQUESTS', pcr.PCR_ID).Status === 'REJECTED', 'expired requests rejected');
const exStep = ctx.find_('APPROVAL_INSTANCES', { Entity_ID: c.Request_ID }).find(x => x.Status === 'REJECTED');
ok(exStep && exStep.Decision_By === 'SYSTEM' && /رفض تلقائي/.test(exStep.Comment), 'step rejected by the system');
ok(ctx.find_('APPROVAL_INSTANCES', { Entity_ID: c.Request_ID }).every(x => x.Status !== 'WAITING' && x.Status !== 'PENDING'), 'later steps cancelled');
ok(ctx.find_('EVENTS', { Entity_ID: c.Request_ID }).some(e => e.Event === 'EXPIRED'), 'expiry on the timeline');
ok(ctx.find_('AUDIT_LOG', { Entity_ID: c.Request_ID, Action: 'AUTO_REJECT' }).length === 1, 'expiry audited');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.acc }).some(n => /اترفض تلقائياً/.test(n.Title) && n.Link_ID === c.Request_ID), 'requester told');
ok(mails.some(m => m.to === 'acc@t.com' && /اترفض تلقائياً/.test(m.subject)), 'auto-rejection emailed to the requester');
// digest: one email per approver with something waiting
const dg = mails.filter(m => /ملخص اليوم/.test(m.subject));
ok(out.digest && out.digest.sent === dg.length && dg.some(m => m.to === 'cfo@t.com' && m.htmlBody.indexOf(a.Request_ID) > 0 && m.htmlBody.indexOf(b.Request_ID) > 0), 'digest to the sector manager lists both');
ok(!dg.some(m => m.to === 'rec@t.com'), 'no digest when nothing is waiting');
// second run on the same day does nothing; next day: no duplicate warning / escalation, reminder waits its interval
fresh(); ok(ctx.runDaily_(true).skipped, 'once a day');
prop('DAILY_RUN', day(-1)); fresh(); out = ctx.runDaily_(false);
ok(out.sla.warned === 0 && out.sla.escalated === 0 && out.sla.reminded === 0 && !out.digest, 'no repeats the next day; no digest from the fallback: ' + JSON.stringify(out));
fresh(); ctx.update_('APPROVAL_INSTANCES', step(a.Request_ID).Approval_ID, { Last_Reminder_At: ago(3) }, 'x');
prop('DAILY_RUN', day(-1)); fresh(); out = ctx.runDaily_(false);
ok(out.sla.reminded === 1, 'reminder repeats after 3 days');
fresh(); ok(ctx.get_('APPROVAL_INSTANCES', step(a.Request_ID).Approval_ID).Reminder_Count === '2', 'reminder count kept');
// English digest for an English user
fresh(); ctx.update_('USERS', U.cfo, { Lang: 'en' }, 'x');
prop('DAILY_RUN', day(-1)); mails.length = 0; fresh(); ctx.runDaily_(true);
const en = mails.find(m => m.to === 'cfo@t.com');
ok(en && /Daily summary/.test(en.subject) && /waiting for your approval/i.test(en.htmlBody) && en.htmlBody.indexOf('dir="ltr"') > 0, 'English digest: ' + (en ? en.subject : 'none'));
fresh(); ctx.update_('USERS', U.cfo, { Lang: '' }, 'x');
// email budget
fresh(); ctx.update_('CONFIG', 'EMAIL_DAILY_BUDGET', { Config_Value: '0' }, 'x');
prop('DAILY_RUN', day(-1)); mails.length = 0; fresh(); out = ctx.runDaily_(true);
ok(out.digest.sent === 0 && out.digest.skipped > 0 && !mails.length, 'budget stops the digest');
mails.length = 0; pub('auth.requestCode', { email: 'acc@t.com' }); ok(mails.length === 1, 'login codes still go');
fresh(); ctx.update_('CONFIG', 'EMAIL_DAILY_BUDGET', { Config_Value: '80' }, 'x');
// fallback from the first call of the day when no trigger exists
prop('DAILY_RUN', day(-1)); prop('DAILY_TRIGGER', 'N');
must(api('todo', t.acc, {}), 'first call of the day');
// v0.32.1: the request does not wait for it — the job is scheduled in the background a minute later
ok(getProp('DAILY_RUN') === day(-1) && ctx.ScriptApp.__triggers.some(x => x.fn === 'dailySoonTrigger'), 'fallback scheduled the daily job in the background');
fresh(); ctx.dailySoonTrigger(); ok(getProp('DAILY_RUN') === day(0), 'fallback ran the daily job');
prop('DAILY_SOON', '');
// trigger installed: the portal call does not run it again before the scheduled hour
prop('DAILY_RUN', day(-1)); prop('DAILY_TRIGGER', 'Y');
must(api('todo', t.acc, {}), 'call with trigger'); ok(getProp('DAILY_RUN') === day(-1), 'scheduled run left to the trigger');
prop('DAILY_RUN', day(-3));
must(api('todo', t.acc, {}), 'trigger missed days');
fresh(); ctx.dailySoonTrigger(); ok(getProp('DAILY_RUN') === day(0), 'missed trigger → fallback runs');
// trigger install + digest time change
fresh(); const tr = ctx.installTriggers_();
const sched = () => ctx.ScriptApp.__triggers.filter(x => x.fn === 'dailyTrigger' || x.fn === 'hourlyTrigger');
ok(tr.hour === 8 && sched().length === 2 && sched()[0].fn === 'dailyTrigger' && sched()[1].fn === 'hourlyTrigger', 'daily trigger at 8 (+ hourly reminders)');
bad(api('config.update', tO, { Config_Key: 'DIGEST_TIME', Config_Value: '7:30', reason: 'تجربة' }), /ساعة كاملة/, 'digest time must be a full hour');
rr = must(api('config.update', tO, { Config_Key: 'DIGEST_TIME', Config_Value: '07:00', reason: 'قبل بداية الشغل' }), 'digest time');
ok(rr.trigger === 'installed' && sched().length === 2 && sched()[0].hour === 7, 'trigger moved to 7');
const ds = must(api('daily.status', tO, {}), 'daily status');
ok(ds.trigger && ds.hour === '7' && ds.lastRun === day(0), 'daily status');
bad(api('daily.status', t.hr, {}), null, 'daily status for owner / HR sector');

// =============== 3) Delegation ===============
let D = must(api('dlg.list', t.hr, {}), 'dlg list');
ok(D.heads.some(h => h.id === P['مدير القطاع المالي'] && h.holders === 'المدير المالي'), 'unit heads listed with holders');
bad(api('dlg.save', t.rec, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Effective_To: day(10), Reason: 'إجازة' }), null, 'recruiter cannot delegate');
bad(api('dlg.save', t.hr, { From_Position_ID: P['محاسب عام'], To_User_ID: U.dep, Effective_To: day(10), Reason: 'إجازة' }), /وظيفة مدير/, 'only head positions');
bad(api('dlg.save', t.hr, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.cfo, Effective_To: day(10), Reason: 'إجازة' }), /نفسه/, 'not to the holder');
bad(api('dlg.save', t.hr, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Effective_To: day(10), Reason: 'إجازة' }), /مدير قطاع الموارد البشرية أو مالك النظام/, 'v0.34: a sector head\'s authority is delegated by the owner / HR sector manager only');
bad(api('dlg.save', tO, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Reason: 'إجازة' }), /آخر يوم/, 'end date required');
bad(api('dlg.save', tO, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Effective_To: day(100), Reason: 'إجازة' }), /90 يوم/, 'v0.34: max 90 days');
const dl = must(api('dlg.save', tO, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Effective_To: day(10), Reason: 'إجازة سنوية' }), 'delegate');
bad(api('dlg.save', tO, { From_Position_ID: P['مدير القطاع المالي'], To_User_ID: U.dep, Effective_To: day(5), Reason: 'تاني' }), /ساري/, 'no overlapping duplicate');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.dep }).some(n => /اتفوضت لك/.test(n.Title)), 'delegate told');
g = must(api('req.get', t.dep, { Request_ID: a.Request_ID }), 'delegate sees the waiting request');
ok(g.can.act, 'delegate can approve');
ok(must(api('todo', t.dep, {}), 'dep todo').approvals >= 1, 'in his approvals');
must(api('req.action', t.dep, { Request_ID: a.Request_ID, action: 'APPROVE', comment: 'بالتفويض' }), 'delegate approves');
D = must(api('dlg.list', t.hr, {}), 'dlg list 2');
ok(D.rows[0].Delegation_ID === dl.Delegation_ID && D.rows[0].state === 'ACTIVE' && D.rows[0].toName === 'نائب مدير الحسابات', 'listed as active');
must(api('dlg.stop', t.hr, { Delegation_ID: dl.Delegation_ID, reason: 'رجع من الإجازة' }), 'stop');
bad(api('dlg.stop', t.hr, { Delegation_ID: dl.Delegation_ID, reason: 'تاني' }), /منتهي/, 'already stopped');
rr = api('req.get', t.dep, { Request_ID: b.Request_ID });
ok(!rr.ok || !rr.data.can.act, 'stopped delegation has no authority');
ok(must(api('todo', t.dep, {}), 'dep todo 2').approvals === 0, 'nothing waiting for him after the stop');
fresh(); ok(ctx.find_('AUDIT_LOG', { Entity_Type: 'DELEGATION' }).length >= 2, 'delegation audited');

// =============== 4) Editable lists ===============
let Ls = must(api('lists.get', t.hr, {}), 'lists');
ok(Ls.processes.length === 7 && Ls.processes.find(p => p.code === 'ACTIVITY_TYPE').items.length === 5, 'seven lists, five activity types');
bad(api('lists.save', t.hr, { Process: 'CANDIDATE_REJECT', Label_AR: 'المؤهل أو التخصص غير مطابق' }), /بنفس الاسم/, 'duplicate label');
bad(api('lists.save', t.rec, { Process: 'CANDIDATE_REJECT', Label_AR: 'سبب جديد' }), null, 'recruiter cannot edit lists');
const nr = must(api('lists.save', t.hr, { Process: 'CANDIDATE_REJECT', Label_AR: 'رفض العرض المبدئي للمرتب', Label_EN: 'Declined the initial salary range' }), 'new reason');
ok(/^C\d+$/.test(nr.Code) && nr.Status === 'Active', 'new item code ' + nr.Code);
const other = Ls.processes.find(p => p.code === 'CANDIDATE_REJECT').items.find(i => i.Code === 'OTHER');
bad(api('lists.save', t.hr, { Reason_ID: other.Reason_ID, Label_AR: 'أخرى', Status: 'Inactive' }), /أساسي/, '"Other" cannot be stopped');
const call = Ls.processes.find(p => p.code === 'ACTIVITY_TYPE').items.find(i => i.Code === 'CALL');
bad(api('lists.save', t.hr, { Reason_ID: call.Reason_ID, Label_AR: 'مكالمة', Status: 'Inactive' }), /أساسي/, 'core activity type cannot be stopped');
must(api('lists.save', t.hr, { Reason_ID: call.Reason_ID, Label_AR: 'مكالمة تليفون', Label_EN: 'Phone call' }), 'rename core type');
const visit = must(api('lists.save', t.hr, { Process: 'ACTIVITY_TYPE', Label_AR: 'زيارة للموقع', Label_EN: 'Site visit', Requires_Note: 'Y' }), 'new activity type');
const meet = Ls.processes.find(p => p.code === 'ACTIVITY_TYPE').items.find(i => i.Code === 'MEETING');
must(api('lists.save', t.hr, { Reason_ID: meet.Reason_ID, Label_AR: meet.Label_AR, Requires_Note: 'Y', Status: 'Inactive' }), 'stop meeting');
let co = must(api('cand.options', t.rec, {}), 'cand options');
ok(co.actTypes.some(x => x.code === visit.Code && x.name === 'زيارة للموقع' && x.note) && !co.actTypes.some(x => x.code === 'MEETING') &&
  co.actTypes.find(x => x.code === 'CALL').name === 'مكالمة تليفون', 'activity types from the list');
let ro = must(api('req.options', t.rec, {}), 'req options'); ok(ro.reasons.some(x => x.code === nr.Code && x.process === 'CANDIDATE_REJECT'), 'new reason offered');
// use them on a candidate
must(api('vac.assign', t.rm, { Vacancy_ID: ctx.find_('VACANCIES', { Request_ID: r1.Request_ID })[0].Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign');
fresh(); const vac1 = ctx.find_('VACANCIES', { Request_ID: r1.Request_ID })[0].Vacancy_ID;
must(api('vac.update', t.rm, { Vacancy_ID: vac1, action: 'OPEN' }), 'open');
const cand = must(api('cand.create', t.rec, { Vacancy_ID: vac1, Full_Name: 'أحمد سمير', Mobile: '01055556666', Source: 'WALK_IN', consent: 'Y' }), 'candidate');
const appId = cand.application.Application_ID;
bad(api('cand.activity', t.rec, { Application_ID: appId, Type: visit.Code }), /الملاحظة/, 'custom type needs its note');
must(api('cand.activity', t.rec, { Application_ID: appId, Type: visit.Code, Note: 'زار المصنع وشاف المكن' }), 'custom activity');
bad(api('cand.activity', t.rec, { Application_ID: appId, Type: 'MEETING', Note: 'مقابلة' }), /نوع النشاط/, 'stopped type refused');
must(api('cand.activity', t.rec, { Application_ID: appId, Type: 'CALL', Outcome: 'REACHED' }), 'core type still works');
must(api('cand.activity', t.rec, { Application_ID: appId, Type: 'MESSAGE', Template_Code: 'ACK' }), 'message record still works');
must(api('cand.move', t.rec, { Application_ID: appId, to: 'REJECTED', reasonCode: nr.Code }), 'reject with the new reason');
fresh(); ok(ctx.get_('APPLICATIONS', appId).Close_Code === nr.Code, 'new reason stored');
fresh(); ok(ctx.tr_('رفض العرض المبدئي للمرتب', 'en') === 'Declined the initial salary range', 'English name of a new item used');
bad(api('lists.save', t.hr, { Process: 'X', Label_AR: 'شيء' }), /القائمة/, 'unknown list');

// =============== 5) Job / grade edit with history ===============
const job = ctx.get_('POSITIONS', P['محاسب تكاليف']).Job_Code;
let jd = must(api('jd.get', t.hr, { Job_Code: job }), 'jd get');
ok(jd.canEditJob && !jd.canEditGrade && jd.job.status === 'Active', 'HR manager edits the job, not the grade');
bad(api('jobs.update', t.hr, { Job_Code: job, Grade_Code: '9', reason: 'تقييم' }), /قطاع الموارد البشرية/, 'grade for HR sector only');
bad(api('jobs.update', t.hr, { Job_Code: job, Job_Title_AR: jd.job.title, reason: 'لا شيء' }), /مفيش تعديل/, 'no-op refused');
bad(api('jobs.update', t.hr, { Job_Code: job, Job_Level: 'JL9', reason: 'خطأ' }), /المستوى/, 'bad level');
bad(api('jobs.update', t.hr, { Job_Code: job, Job_Title_AR: 'محاسب عام', reason: 'خطأ' }), /بنفس الاسم/, 'duplicate title');
bad(api('jobs.update', t.hr, { Job_Code: job, Status: 'Inactive', reason: 'خطأ' }), /مكان وظيفي/, 'job with positions cannot stop');
must(api('jobs.update', t.hr, { Job_Code: job, Job_Title_AR: 'محاسب تكاليف أول', Job_Title_EN: 'Senior Cost Accountant', Job_Level: 'JL3', reason: 'توحيد المسميات' }), 'edit job');
must(api('jobs.update', tO, { Job_Code: job, Grade_Code: '9', reason: 'إعادة تقييم Korn Ferry' }), 'grade by HR sector');
const H = must(api('jobs.history', t.hr, { Job_Code: job }), 'history');
ok(H.length === 2 && H[0].changes.length === 1 && H[0].changes[0].field === 'Grade_Code' && H[0].changes[0].to === '9' && H[0].reason === 'إعادة تقييم Korn Ferry', 'latest change first: grade');
ok(H[1].changes.map(c => c.field).sort().join() === 'Job_Level,Job_Title_AR,Job_Title_EN' && H[1].by === 'منى', 'first change: titles and level');
jd = must(api('jd.get', t.acc, { Job_Code: job }), 'manager sees job');
ok(!jd.canEditJob && jd.job.title === 'محاسب تكاليف أول' && jd.job.grade === '9', 'manager read only, new values shown');

// =============== 6) misc ===============
const me = must(api('me', tO, {}), 'me');
ok(me.can.jobEdit && me.can.lists && me.app.version === vm.runInContext('APP.VERSION', ctx), 'profile flags + version');
fresh(); ok(ctx.findOne_('CONFIG', { Config_Key: 'APPROVAL_EXPIRE_DAYS' }).Config_Value === '30', 'expiry setting kept as set (30 here; the seed is 5 since v0.40.1)');

console.log('\n' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
