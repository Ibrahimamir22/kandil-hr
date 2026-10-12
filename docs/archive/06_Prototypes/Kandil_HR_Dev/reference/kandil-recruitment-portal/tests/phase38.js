// v0.38.0: privacy and legal rules (CHG-80 / CHG-81) — the candidate's own consent before work goes on (consent link,
// once, 7 days, a new link replaces the old), the apply form's privacy questions (salary range, relatives with a match
// alert, accommodation and disability for HR only, under-18 with a guardian, the photo's own consent), the no-relation
// declaration of interviewers and approvers, the photo hidden from the hiring manager until the first interview is done,
// the usage policy, data-subject requests with an identity check and the AI withdrawal, the insurance start exception,
// the no-insurance legal basis, and the disability flag carried to the employee with the 5 % share.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '8']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), hs: user('hs@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), hs: login('hs@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسبين تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 6 }] }), 'request');
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
must(api('vac.assign', t.rm, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' }), 'open');
must(api('pay.structures', tO, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' }), 'structure');
const today = ctx.today_(), ver = String(ctx.cfg_('PRIVACY_VERSION', '1'));
fresh(); ctx.update_('VACANCIES', V.Vacancy_ID, { Apply_Enabled: 'Y', Apply_Code: ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code || 'APPLY38X' }, 'x');
fresh(); const code = ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code;

// ---------- 1. the candidate's own consent before work goes on ----------
ctx.__consentReal = true;
const C1 = must(api('cand.create', t.rec, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Source: 'WALK_IN', consent: 'Y' }), 'hand-added').application;
let A1 = must(api('cand.app', t.rec, { Application_ID: C1.Application_ID }), 'app');
ok(A1.person.consentOk === false, 'hand-added: no own consent yet');
must(api('cand.move', t.rec, { Application_ID: C1.Application_ID, to: 'CONTACTED' }), 'contacted is allowed');
bad(api('cand.move', t.rec, { Application_ID: C1.Application_ID, to: 'SCREENING' }), /لينك الموافقة/, 'screening refused without his own consent');
bad(api('cand.move', t.rec, { Application_ID: C1.Application_ID, to: 'SHORTLISTED' }), /لينك الموافقة/, 'shortlist refused too');
const L1 = must(api('cand.consentLink', t.rec, { Application_ID: C1.Application_ID }), 'link 1');
const tok1 = /\?consent=([A-Za-z0-9]+)/.exec(L1.url)[1];
ok(L1.until === ctx.addDaysIso_(7).slice(0, 10) && /كريم/.test(L1.text) && L1.phone === '201011112222', 'link 7 days, WhatsApp text with the first name');
const L2 = must(api('cand.consentLink', t.rec, { Application_ID: C1.Application_ID }), 'link 2 (send a new link)');
const tok2 = /\?consent=([A-Za-z0-9]+)/.exec(L2.url)[1];
bad(pub('consent.info', { token: tok1 }), /اتستخدم أو اتلغى/, 'the old link stops working');
let CI = must(pub('consent.info', { token: tok2 }), 'consent page');
ok(CI.name === 'كريم' && CI.version === ver && !JSON.stringify(CI).includes('01011112222'), 'page: first name and the notice, no contact data');
bad(pub('consent.accept', { token: tok2, consent: 'Y', consentTransfer: 'Y', version: 'old' }), /إشعار الخصوصية/, 'old notice version refused');
bad(pub('consent.accept', { token: tok2, consent: 'Y', version: ver }), /حفظ البيانات/, 'storage consent needed');
must(pub('consent.accept', { token: tok2, consent: 'Y', consentTransfer: 'Y', version: ver }), 'candidate agrees');
bad(pub('consent.accept', { token: tok2, consent: 'Y', consentTransfer: 'Y', version: ver }), /اتستخدم/, 'the link works once');
fresh(); const per1 = ctx.get_('PERSONS', C1.Person_ID);
ok(per1.Consent_Version === ver && !per1.Consent_Link_Hash, 'own consent recorded, link cleared');
ok(ctx.all_('CONSENTS').filter(c => c.Person_ID === C1.Person_ID && c.Channel === 'LINK').length === 2, 'consents logged (processing + storage) by the link');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /وافق على إشعار الخصوصية/.test(n.Title)), 'recruiter told');
must(api('cand.move', t.rec, { Application_ID: C1.Application_ID, to: 'SCREENING' }), 'screening after the consent');
bad(api('cand.consentLink', t.rec, { Application_ID: C1.Application_ID }), /بالفعل/, 'no link once he agreed');
// an expired link
const C2 = must(api('cand.create', t.rec, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'هالة سمير فهمي', Mobile: '01011113333', Source: 'WALK_IN', consent: 'Y' }), 'hand-added 2').application;
const tok3 = /\?consent=([A-Za-z0-9]+)/.exec(must(api('cand.consentLink', t.rec, { Application_ID: C2.Application_ID }), 'link 3').url)[1];
fresh(); ctx.update_('PERSONS', C2.Person_ID, { Consent_Link_Until: '2000-01-01T00:00:00' }, 'x');
bad(pub('consent.info', { token: tok3 }), /انتهت/, 'expired link refused');
bad(api('cand.consentLink', t.mgr, { Application_ID: C2.Application_ID }), null, 'the hiring manager cannot send consent links');

// ---------- 2. the apply form's privacy questions ----------
must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: 'E-501', Full_Name: 'محمود أحمد السيد', Position_ID: P['مدير الحسابات'].Position_ID, Hire_Date: '2020-01-01', Employment_Kind: 'PERMANENT' }), 'employee');
const base = { code, Full_Name: 'ياسر محمود أحمد', Mobile: '01022223333', consent: 'Y', consentVersion: ver, consentTransfer: 'Y', elapsed: 60000,
  Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3' };
bad(pub('apply.submit', Object.assign({}, base, { Expected_Salary: '9000', Expected_Salary_Max: '8000', consentSalary: 'Y' })), /أعلى المرتب/, 'range top below its bottom refused');
bad(pub('apply.submit', Object.assign({}, base, { Has_Relative: 'Y', Relative_Name: '' })), /قريبك/, 'relative name needed');
let r = must(pub('apply.submit', Object.assign({}, base, { Current_Salary: '7000', Expected_Salary: '9000', Expected_Salary_Max: '11000', consentSalary: 'Y',
  Has_Relative: 'Y', Relative_Name: 'محمود احمد', Relative_Relation: 'أب', Accommodation: 'دور أرضي', Disability: 'Y' })), 'apply with privacy answers');
fresh(); const pA = ctx.all_('PERSONS').find(x => x.Mobile === '01022223333'), aA = ctx.find_('APPLICATIONS', { Person_ID: pA.Person_ID })[0];
ok(pA.Current_Salary === '' && pA.Expected_Salary === '9000' && pA.Expected_Salary_Max === '11000', 'expected range kept; the current salary is not asked on the apply form');
ok(pA.Relative_Match === 'E-501', 'relative matched to the employee (أحمد / احمد written either way)');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /قريب موظف/.test(n.Title)), 'lead recruiter alerted');
ok(pA.Disability === 'Y' && pA.Accommodation === 'دور أرضي', 'accommodation and disability saved');
let vRec = must(api('cand.app', t.rec, { Application_ID: aA.Application_ID }), 'recruiter view').person;
let vHr = must(api('cand.app', t.hr, { Application_ID: aA.Application_ID }), 'HR view').person;
ok(vRec.Disability === undefined && vRec.Accommodation === undefined && vRec.Relative_Match === 'E-501', 'recruiter: sees the relative alert, not the disability');
ok(vHr.Disability === 'Y' && vHr.Accommodation === 'دور أرضي', 'HR sees accommodation and disability');
// under 18
const b16 = (Number(today.slice(0, 4)) - 16) + today.slice(4);
bad(pub('apply.submit', Object.assign({}, base, { Mobile: '01022224444', Birth_Date: b16 })), /ولي الأمر/, 'under 18 (by birth date) needs a guardian');
bad(pub('apply.submit', Object.assign({}, base, { Mobile: '01022224444', Minor: 'Y', Guardian_Name: 'محمد علي حسن', Guardian_Mobile: '01022225555' })), /ولي الأمر/, 'guardian consent needed');
must(pub('apply.submit', Object.assign({}, base, { Mobile: '01022224444', Birth_Date: b16, Guardian_Name: 'محمد علي حسن', Guardian_Mobile: '01022225555', consentGuardian: 'Y' })), 'minor with a guardian');
fresh(); const pM = ctx.all_('PERSONS').find(x => x.Mobile === '01022224444');
ok(pM.Minor === 'Y' && pM.Guardian_Mobile === '01022225555' && ctx.all_('CONSENTS').some(c => c.Person_ID === pM.Person_ID && c.Kind === 'GUARDIAN'), 'guardian recorded with a GUARDIAN consent');

// ---------- 3. photos ----------
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
bad(api('photo.set', t.rec, { id: 'P:' + C1.Person_ID, data: JPG }), /موافق إن صورته/, 'recruiter upload needs the candidate\'s photo consent');
must(api('photo.set', t.rec, { id: 'P:' + C1.Person_ID, data: JPG, photoConsent: 'Y' }), 'photo with consent');
fresh(); ok(ctx.get_('PERSONS', C1.Person_ID).Photo_Consent === 'Y' && ctx.all_('CONSENTS').some(c => c.Person_ID === C1.Person_ID && c.Kind === 'PHOTO'), 'photo consent recorded');
must(api('cand.move', t.rec, { Application_ID: C1.Application_ID, to: 'SHORTLISTED' }), 'shortlist C1');
let g = must(api('photo.get', t.mgr, { ids: ['P:' + C1.Person_ID] }), 'manager photo before the interview');
ok(!('P:' + C1.Person_ID in g), 'hiring manager: no photo before the first interview is done');
const iv = must(api('int.create', t.rec, { Application_ID: C1.Application_ID, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'interview').interview;
must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }), 'start');
// ---------- 4. the no-relation declaration (interview) ----------
ctx.__relReal = true;
bad(api('eval.save', t.rec, { Interview_ID: iv.Interview_ID, submit: 'Y', Recommendation: 'HIRE' }), /صلة قرابة/, 'evaluation submit needs the declaration');
bad(api('eval.save', t.rec, { Interview_ID: iv.Interview_ID, submit: 'Y', Recommendation: 'HIRE', noRelation: 'N' }), /حد تاني/, 'a declared relation stops the evaluation');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'RELATION_DECLARED' && a.Entity_ID === C1.Application_ID), 'declared relation audited');
must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'COMPLETE' }), 'interview completed');
g = must(api('photo.get', t.mgr, { ids: ['P:' + C1.Person_ID] }), 'manager photo after');
ok(g['P:' + C1.Person_ID] === JPG, 'hiring manager sees the photo after the interview');

// ---------- 5. the no-relation declaration (offer approval), the no-insurance basis ----------
must(api('sel.save', t.rec, { Application_ID: C1.Application_ID, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' }), 'select');
bad(api('offer.save', t.rec, { Application_ID: C1.Application_ID, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01', No_Insurance: 'Y' }), /السند القانوني/, 'no insurance needs a legal basis');
let O = must(api('offer.save', t.rec, { Application_ID: C1.Application_ID, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01', No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' }), 'offer').offer;
ok(O.No_Ins_Basis === 'صاحب معاش', 'basis saved');
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'SUBMIT' }), 'submit').offer;
bad(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE' }), /صلة قرابة/, 'offer approval needs the declaration');
must(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE', noRelation: 'Y' }), 'approved with the declaration');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'NO_RELATION_DECLARED' && a.Entity_ID === C1.Application_ID && /OFFER/.test(a.New_Value)), 'declaration audited');
ctx.__relReal = false;

// ---------- 6. disability carried to the employee; the 5 % share ----------
fresh(); ctx.update_('PERSONS', C1.Person_ID, { Disability: 'Y', National_ID: '29001011234567' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }), 'present').offer;
must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وقّع' }), 'accept');
const J = must(api('cand.app', t.rec, { Application_ID: C1.Application_ID }), 'app').joining;
must(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm');
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'WAIVED' }, 'x'));
must(api('offer.noInsUpload', t.rec, { Offer_ID: O.Offer_ID, files: [{ name: 'signed.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 signed').toString('base64') }] }), 'signed no-insurance form');
{ fresh(); const ak = ctx.findOne_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID, Doc_Code: 'NO_INS_ACK' }); must(api('doc.action', t.rec, { Doc_ID: ak.Doc_ID, action: 'VERIFY' }), 'acknowledgement reviewed'); must(api('doc.action', t.rec, { Doc_ID: ak.Doc_ID, action: 'PHYSICAL' }), 'its original received'); }   // v0.46.2: a joining document like the others
must(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'JOINED', date: today, Employee_ID: 'E-900' }), 'joined');
fresh(); const EMP = ctx.get_('JOININGS', J.Joining_ID).Employee_ID; ok(EMP && ctx.get_('EMPLOYEES', EMP).Disability === 'Y', 'disability carried to the employee record');
const EL = must(api('emp.list', t.hr, {}), 'employees (HR)');
ok(EL.disability && EL.disability.disabled === 1 && EL.disability.employees === 2 && EL.disability.pct === 50 && EL.disability.target === 5, 'share against the 5 %: ' + JSON.stringify(EL.disability));
const ELr = api('emp.list', t.rm, {}); ok(!ELr.ok || ELr.data.disability === null, 'outside HR: no share');

// ---------- 7. the usage policy ----------
fresh(); ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'Y' }, 'x');
let me = must(api('me', t.mgr, {}), 'me'); ok(me.security.gate === 'POLICY' && /مؤشرات خدمة/.test(me.security.policy), 'policy gate with the service-indicators notice');
bad(api('req.list', t.mgr, {}), null, 'gated until accepted');
must(api('policy.accept', t.mgr, {}), 'accept');
me = must(api('me', t.mgr, {}), 'me 2'); ok(me.security.gate === '', 'accepted once');
fresh(); ok(ctx.get_('USERS', U.mgr).Policy_Version === '1' && ctx.all_('AUDIT_LOG').some(a => a.Action === 'POLICY_ACCEPTED' && a.Entity_ID === U.mgr), 'version and audit recorded');
fresh(); ctx.update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: '2' }, 'x');
me = must(api('me', t.mgr, {}), 'me 3'); ok(me.security.gate === 'POLICY', 'a new version is accepted again');
fresh(); ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'N' }, 'x');

// ---------- 8. data-subject requests: identity check, AI withdrawal ----------
const R = must(api('dsr.save', t.hr, { Person_ID: pA.Person_ID, Kind: 'AI_WITHDRAW', Channel: 'EMAIL', Details: 'مش عايز الذكاء الاصطناعي يقرا سيرتي' }), 'AI withdrawal request');
ok(R.Due_Date === ctx.addDaysYmd_(today, 30), '30 days');
bad(api('dsr.close', t.hr, { Request_ID: R.Request_ID, Status: 'DONE', Outcome: 'اتنفذ' }), /شخصية/, 'closing needs the identity check');
must(api('dsr.close', t.hr, { Request_ID: R.Request_ID, Status: 'DONE', Outcome: 'اتنفذ', Identity_Method: 'REG_EMAIL' }), 'closed');
fresh(); const dr = ctx.get_('DATA_REQUESTS', R.Request_ID);
ok(dr.Identity_Method === 'REG_EMAIL' && dr.Identity_Checked_By === U.hr && dr.Identity_Checked_At, 'identity check recorded');
ok(ctx.get_('PERSONS', pA.Person_ID).Ai_Opt_Out === 'Y', 'AI consent withdrawn');
fresh(); ctx.update_('CONFIG', 'CVAI_ENABLED', { Config_Value: 'Y' }, 'x'); ctx.PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', 'sk-ant-test-key-abcdefghijklmnopqrstuvwxyz');
fresh(); ctx.update_('PERSONS', pA.Person_ID, { CV_File_ID: ctx.saveCv_(pA.Person_ID, { bytes: [37, 80, 68, 70], mime: 'application/pdf', name: 'cv.pdf' }).id }, 'x');
bad(api('cvai.read', t.rec, { Application_ID: aA.Application_ID }), /سحب موافقته/, 'no AI reading after the withdrawal');

// ---------- 9. social insurance from day one: a different start is an exception ----------
fresh(); const IC = ctx.insert_('INSURANCE_CASES', { Case_ID: 'INS-90001', Joining_ID: 'JX', Employee_ID: 'E-77', Person_ID: '', Full_Name: 'سعيد', Location_ID: '', Office: 'العبور', Rule: 'DAY_ONE',
  Joined_Date: today, Start_Date: today, Due_Date: ctx.addDaysYmd_(today, 7), Status: 'TO_SUBMIT' }, 'x');
const later = ctx.addDaysYmd_(today, 20);
bad(api('ins.action', t.hr, { Case_ID: IC.Case_ID, action: 'START', date: later, reason: 'قصير' }), /بالتفصيل/, 'exception needs a detailed reason');
let IV = must(api('ins.action', t.hr, { Case_ID: IC.Case_ID, action: 'START', date: later, reason: 'المستندات التأمينية بتاعته اتأخرت من المكتب' }), 'exception asked');
ok(IV.start === today && IV.startRequest === later, 'start stays on day one until approved');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.hs && /استثناء في بداية التأمين/.test(n.Title)), 'HR Sector Manager asked');
bad(api('ins.action', t.hr, { Case_ID: IC.Case_ID, action: 'APPROVE_START' }), /مدير قطاع/, 'HR manager cannot approve');
IV = must(api('ins.action', t.hs, { Case_ID: IC.Case_ID, action: 'APPROVE_START' }), 'approved');
ok(IV.start === later && !IV.startRequest && /استثناء بموافقة/.test(IV.note), 'exception applied with the approver named');
IV = must(api('ins.action', t.hr, { Case_ID: IC.Case_ID, action: 'START', date: today, reason: 'رجوع لأول يوم' }), 'back to day one (no approval needed)');
ok(IV.start === today, 'day one again');

console.log(`phase38: ${pass} passed, ${failN} failed`);
