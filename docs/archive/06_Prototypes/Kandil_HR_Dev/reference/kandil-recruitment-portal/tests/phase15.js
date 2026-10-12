// v0.14.1: personal-data protection — separate recorded consents, legal entities, pool consent with an end date,
// hiring-documents consent, sensitive documents, retention list and deletion, data-subject requests, settings.
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
// v0.38.0 defaults are 24 months with deletion on (after go-live); this phase tests the mechanics with the earlier values
for (const [k, v] of [['RETENTION_ENABLED', 'N'], ['RETENTION_REJECTED_MONTHS', '6'], ['RETENTION_DNJ_MONTHS', '3'], ['RETENTION_POOL_MONTHS', '12']]) ctx.update_('CONFIG', k, { Config_Value: v }, 'x');
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sec: user('sec@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']), rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']),
  rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), rec2: user('rec2@t.com', 'علي', '', ['RECRUITER']) };
const t = { hr: login('hr@t.com'), sec: login('sec@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), rec2: login('rec2@t.com') };
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec, recruiters: [U.rec2], reason: 'دعم' }), 'team');

// =============== settings & legal entities ===============
bad(api('privacy.admin', t.rec, {}), null, 'recruiters do not see the privacy settings');
let A = must(api('privacy.admin', t.hr, {}), 'admin');
ok(A.cfg.PRIVACY_VERSION === '1' && /خارج مصر/.test(A.cfg.PRIVACY_TEXT_AR) && !/لن تتم مشاركة/.test(A.cfg.PRIVACY_TEXT_AR) && A.cfg.RETENTION_ENABLED === 'N' && A.cfg.DPO_TITLE === 'مشرف الأجور', 'interim notice (no false "never shared"), deletion off, DPO = wages supervisor');
ok(A.units.some(u => u.type === 'COMPANY') && !A.canEnable, 'company / sector units listed; HR manager cannot switch deletion on');
const company = A.units.find(u => u.type === 'COMPANY').id;
const E = must(api('privacy.entity', t.hr, { Name_AR: 'شركة قنديل للنجف', Name_EN: 'Kandil Lighting Co.', units: [company] }), 'entity');
fresh(); ok(ctx.entityOfVacancy_(ctx.get_('VACANCIES', VAC)).Entity_ID === E.Entity_ID, 'vacancy inherits the entity from the company unit');
bad(api('privacy.save', t.hr, { cfg: { RETENTION_ENABLED: 'Y' } }), /مدير قطاع/, 'only the HR Sector Manager switches deletion on');
bad(api('privacy.save', t.hr, { cfg: { PRIVACY_EMAIL: 'not-an-email' } }), /إيميل/, 'email checked');
A = must(api('privacy.save', t.hr, { cfg: { PRIVACY_EMAIL: 'privacy@kandil.test', PRIVACY_TEXT_AR: A.cfg.PRIVACY_TEXT_AR + ' للتواصل: privacy@kandil.test' } }), 'save');
ok(A.cfg.PRIVACY_VERSION === '2' && A.cfg.PRIVACY_EMAIL === 'privacy@kandil.test', 'notice change raises the version');
A = must(api('privacy.save', t.hr, { cfg: { DOCS_PRIVACY_AR: A.cfg.DOCS_PRIVACY_AR + '.' } }), 'docs text');
ok(A.cfg.DOCS_PRIVACY_VERSION === '2' && A.cfg.PRIVACY_VERSION === '2', 'documents notice has its own version');

// =============== apply consents ===============
const code = must(api('cand.applySettings', t.rec, { Vacancy_ID: VAC, Apply_Enabled: 'Y' }), 'apply on').code;
const info = must(pub('apply.info', { code }), 'info');
ok(info.privacy.entity === 'شركة قنديل للنجف' && info.privacy.email === 'privacy@kandil.test' && info.privacy.poolMonths === 12, 'apply page: employer, email, pool months');
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '2', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3' };
bad(pub('apply.submit', Object.assign({}, base, { consentVersion: '1', consentTransfer: 'Y', Full_Name: 'أحمد علي حسن', Mobile: '01011112222' })), /سياسة الخصوصية/, 'old notice version refused');
bad(pub('apply.submit', Object.assign({}, base, { Full_Name: 'أحمد علي حسن', Mobile: '01011112222' })), /Google/, 'storage consent required');
bad(pub('apply.submit', Object.assign({}, base, { consentTransfer: 'Y', Full_Name: 'أحمد علي حسن', Mobile: '01011112222', Expected_Salary: '9000' })), /المرتب/, 'salary typed → salary consent required');
must(pub('apply.submit', Object.assign({}, base, { consentTransfer: 'Y', consentSalary: 'Y', consentPool: 'Y', Full_Name: 'أحمد علي حسن', Mobile: '01011112222', Expected_Salary: '9000' })), 'apply with all consents');
must(pub('apply.submit', Object.assign({}, base, { consentTransfer: 'Y', Full_Name: 'منى سعيد حسن', Mobile: '01022223333' })), 'apply, no salary, no pool');
fresh();
const apps = ctx.find_('APPLICATIONS', { Vacancy_ID: VAC }), a1 = apps.find(a => ctx.get_('PERSONS', a.Person_ID).Full_Name === 'أحمد علي حسن'), a2 = apps.find(a => a !== a1);
const kinds = p => ctx.find_('CONSENTS', { Person_ID: p }).map(c => c.Kind).sort().join(',');
ok(kinds(a1.Person_ID) === 'APPLY,POOL,SENSITIVE,TRANSFER' && kinds(a2.Person_ID) === 'APPLY,TRANSFER', 'consents recorded separately: ' + kinds(a1.Person_ID) + ' / ' + kinds(a2.Person_ID));
const p1 = ctx.get_('PERSONS', a1.Person_ID);
ok(p1.Pool_Consent === 'Y' && p1.Pool_Consent_Until === ctx.addMonthsYmd_(ctx.today_(), 12) && ctx.find_('CONSENTS', { Person_ID: a1.Person_ID, Kind: 'POOL' })[0].Version === '2', 'pool consent valid 12 months, with the notice version');
let G = must(api('cand.app', t.rec, { Application_ID: a1.Application_ID }), 'app');
ok(G.privacy.pool && G.privacy.consents.length === 4 && G.privacy.entity === 'شركة قنديل للنجف' && G.privacy.consents[0].by === 'المرشح', 'candidate page shows consents');
// recruiter-created candidate
const m = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: 'كريم محمود سالم', Mobile: '01033334444', Source: 'WALK_IN', consent: 'Y', poolConsent: 'Y', Current_Salary: '6000' }), 'manual');
fresh(); ok(kinds(m.person.Person_ID) === 'APPLY,POOL,SENSITIVE,TRANSFER' && ctx.find_('CONSENTS', { Person_ID: m.person.Person_ID })[0].Channel === 'RECRUITER', 'recruiter records the consents the candidate gave');
// pool consent withdraw / grant from the page
bad(api('pool.consent', t.rec, { Application_ID: a2.Application_ID }), /إزاي/, 'pool consent needs how it was given');
must(api('pool.consent', t.rec, { Application_ID: a2.Application_ID, note: 'وافق في مكالمة' }), 'grant');
must(api('pool.add', t.rec, { Application_ID: a2.Application_ID, Category: '' }), 'pool add with consent');
must(api('pool.consent', t.rec, { Application_ID: a2.Application_ID, action: 'WITHDRAW', note: 'طلب يتشال في مكالمة' }), 'withdraw');
fresh(); ok(!ctx.find_('TALENT_POOL', { Person_ID: a2.Person_ID, Status: 'Active' }).length && ctx.get_('PERSONS', a2.Person_ID).Pool_Consent === 'N', 'withdrawal takes him out of the pool');

// =============== sensitive documents ===============
fresh(); ctx.update_('APPLICATIONS', a1.Application_ID, { Stage: 'ACCEPTED' }, 'x');
let J = must(api('cand.app', t.rec, { Application_ID: a1.Application_ID }), 'app').joining;
const fish = J.docs.find(d => d.Doc_Code === 'CRIMINAL'), birth = J.docs.find(d => d.Doc_Code === 'BIRTH');
ok(fish.sensitive && !birth.sensitive && J.docs.find(d => d.Doc_Code === 'MEDICAL_111').sensitive, 'criminal record and form 111 are sensitive');
const pdf = { name: 'f.pdf', mime: 'application/pdf', data: Buffer.from('%PDF x').toString('base64') };
bad(api('doc.action', t.rec, { Doc_ID: fish.Doc_ID, action: 'UPLOAD', file: pdf }), /الموافقة الورقية/, 'HR upload needs the documents consent');
bad(api('doc.action', t.rec, { Doc_ID: fish.Doc_ID, action: 'UPLOAD', file: pdf, paperConsent: 'Y' }), /إقرار موافقة المرشح على الكشف الجنائي/, 'v0.38: the criminal record needs the signed consent first');
const cc = J.docs.find(d => d.Doc_Code === 'CRIMINAL_CONSENT');
ok(cc && cc.sensitive, 'v0.38: the signed criminal-check consent is a sensitive document');
must(api('doc.action', t.rec, { Doc_ID: cc.Doc_ID, action: 'UPLOAD', file: pdf, paperConsent: 'Y' }), 'consent uploaded');
J = must(api('doc.action', t.rec, { Doc_ID: fish.Doc_ID, action: 'UPLOAD', file: pdf }), 'upload with paper consent').joining;
ok(!!J.docsConsentAt && J.docsConsentChannel === 'ورقي موقّع', 'paper consent recorded');
const fid = J.docs.find(d => d.Doc_Code === 'CRIMINAL').files[0].id;
ok(must(api('doc.file', t.rec, { Doc_ID: fish.Doc_ID, File_ID: fid }), 'owner opens').name === 'f.pdf', 'the candidate owner opens the criminal record');
bad(api('doc.file', t.rec2, { Doc_ID: fish.Doc_ID, File_ID: fid }), /حساس/, 'another recruiter on the team cannot');
ok(must(api('doc.file', t.rm, { Doc_ID: fish.Doc_ID, File_ID: fid }), 'manager').name === 'f.pdf', 'recruitment manager can');

// =============== retention & deletion ===============
must(api('cand.move', t.rec, { Application_ID: a2.Application_ID, to: 'REJECTED', reasonCode: 'NOT_QUALIFIED' }), 'reject a2');
fresh(); ctx.update_('APPLICATIONS', a2.Application_ID, { Stage_At: '2025-01-01T10:00:00' }, 'x');
let D = must(api('privacy.due', t.hr, {}), 'due');
ok(D.rows.length === 1 && D.rows[0].Person_ID === a2.Person_ID && !D.enabled, 'closed 6+ months ago → due; the live candidate is not');
fresh(); ok(ctx.retentionDaily_().purged === 0 && ctx.get_('PERSONS', a2.Person_ID).Status === 'Active', 'deletion off → nothing deleted');
bad(api('privacy.purge', t.hr, { Person_ID: a1.Person_ID, reason: 'تجربة الحذف' }), /طلب شغال/, 'a live candidate cannot be deleted');
// candidate with a CV
fresh(); const cvId = ctx.saveCv_(a2.Person_ID, { bytes: [1, 2, 3], mime: 'application/pdf', name: 'cv.pdf' }).id; ctx.update_('PERSONS', a2.Person_ID, { CV_File_ID: cvId, CV_File_Name: 'cv.pdf' }, 'x');
const R = must(api('dsr.save', t.hr, { Person_ID: a2.Person_ID, Kind: 'DELETE', Channel: 'EMAIL', Details: 'طلبت حذف بياناتها' }), 'deletion request');
ok(/^DSR-\d{4}-\d{4}$/.test(R.Request_ID) && R.Due_Date === ctx.addDaysYmd_(ctx.today_(), 30), 'request numbered with a due date');
const X = must(api('privacy.export', t.hr, { Person_ID: a2.Person_ID }), 'export');
ok(/منى سعيد حسن/.test(X.html) && /01022223333/.test(X.html) && /الموافقات/.test(X.html), 'access export has the data and consents');
bad(api('privacy.purge', t.hr, { Person_ID: a2.Person_ID, reason: 'x' }), /سبب/, 'reason required');
const PG = must(api('privacy.purge', t.hr, { Person_ID: a2.Person_ID, reason: 'بناءً على طلبها', Request_ID: R.Request_ID }), 'purge');
fresh(); const p2 = ctx.get_('PERSONS', a2.Person_ID), ap2 = ctx.get_('APPLICATIONS', a2.Application_ID);
ok(p2.Status === 'Purged' && !p2.Mobile && !p2.Email && !p2.CV_File_ID && /محذوف/.test(p2.Full_Name) && !p2.Governorate && !p2.Gender && !p2.Education && ap2.Source, 'personal fields cleared (v0.34: governorate, gender, education too), statistics kept');
ok(ap2.Stage === 'REJECTED' && ap2.Source === 'CAREER_PAGE' && PG.files === 1, 'application kept for statistics; CV trashed');
ok(ctx.get_('DATA_REQUESTS', R.Request_ID).Status === 'DONE', 'request closed by the deletion');
ok(must(api('privacy.find', t.hr, { q: '01022223333' }), 'find').length === 0 && must(api('privacy.find', t.hr, { q: 'كريم' }), 'find2').length === 1, 'search finds live people only by their data');
// DSR pool withdrawal
const R2 = must(api('dsr.save', t.hr, { Person_ID: m.person.Person_ID, Kind: 'POOL_WITHDRAW', Channel: 'PHONE' }), 'pool withdraw request');
bad(api('dsr.close', t.hr, { Identity_Method: 'REG_EMAIL', Request_ID: R2.Request_ID, Status: 'DONE' }), /اكتب/, 'outcome required');
must(api('dsr.close', t.hr, { Identity_Method: 'REG_EMAIL', Request_ID: R2.Request_ID, Status: 'DONE', Outcome: 'اتشال من القاعدة' }), 'close');
fresh(); ok(ctx.get_('PERSONS', m.person.Person_ID).Pool_Consent === 'N', 'pool consent withdrawn by the request');
ok(must(api('dsr.list', t.hr, {}), 'list').length === 2, 'request register');
// automatic deletion when switched on
must(api('cand.move', t.rec, { Application_ID: m.application.Application_ID, to: 'WITHDRAWN', reasonCode: 'PERSONAL' }), 'withdraw kareem');
fresh(); ctx.update_('APPLICATIONS', m.application.Application_ID, { Stage_At: '2025-01-01T10:00:00' }, 'x');
must(api('privacy.save', t.sec, { cfg: { RETENTION_ENABLED: 'Y' } }), 'sector manager enables deletion');
fresh(); const RD0 = ctx.retentionDaily_();
fresh(); ok(RD0.purged === 0 && RD0.testData >= 1 && ctx.get_('PERSONS', m.person.Person_ID).Status === 'Active', 'v0.38: before go-live (test data) the due candidates are only listed');
fresh(); ctx.update_('CONFIG', 'GOLIVE_AT', { Config_Value: ctx.nowIso_() }, 'x');
fresh(); const RD = ctx.retentionDaily_();
fresh(); ok(RD.purged === 1 && ctx.get_('PERSONS', m.person.Person_ID).Status === 'Purged', 'daily job deletes the due candidate');
ok(ctx.get_('PERSONS', a1.Person_ID).Status === 'Active', 'live candidate untouched');
ok(ctx.addMonthsYmd_('2026-01-31', 1) === '2026-02-28' && ctx.addMonthsYmd_('2026-11-15', 3) === '2027-02-15', 'month arithmetic');

console.log('\nPhase 15 (privacy): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
