// Job descriptions: library import, JD import, approve (one / all), versions, request keeps JD version, interview kit, access.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tOwner = login('owner@test.com');
must(api('import.commit', tOwner, { reason: 'init', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') }), 'structure');
fresh();
const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const ACC = P['محاسب عام'].Job_Code, MGR = P['مدير الحسابات'];
function user(email, name, pos, roles) {
  const u = must(api('users.save', tOwner, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email);
  if (roles) must(api('users.setRoles', tOwner, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles');
  return u.User_ID;
}
user('acc@t.com', 'مدير الحسابات', MGR.Position_ID); user('staff@t.com', 'أخصائي', '', ['HR_STAFF']); user('hr@t.com', 'مدير HR', '', ['HR_MANAGER']);
const t = { acc: login('acc@t.com'), staff: login('staff@t.com'), hr: login('hr@t.com') };

// ---- library
const lib = { kind: 'library',
  comps: [
    { code: 'C01', group: 'CORE', name: 'النزاهة والمسؤولية', levels: ['l1', 'l2', 'l3', 'l4'], req: [2, 2, 2, 3, 3, 4, 4] },
    { code: 'LD01', group: 'LEAD', name: 'قيادة الفريق', levels: ['a', 'b', 'c', 'd'], req: [0, 0, 1, 2, 2, 3, 4] },
    { code: 'PR02', group: 'PRD', name: 'إتقان الحرفة', levels: ['w', 'x', 'y', 'z'], req: [1, 2, 3, 3, 3, 3, 3] }],
  questions: [{ code: 'C01', seq: 1, q: 'احكي عن غلطة', strong: 'اعترف', weak: 'برر', from: 'JL1' },
              { code: 'C01', seq: 2, q: 'سؤال مديرين', strong: 's', weak: 'w', from: 'JL6' }],
  tests: [{ code: 'PR02', name: 'اختبار الحرفة', how: 'تنفيذ قطعة', duration: 'ساعة', pass: 'مطابق', owner: 'المشرف' }] };
ok(!api('jd.import', t.staff, lib).ok, 'staff cannot import');
let r = must(api('jd.import', t.hr, lib), 'library preview');
ok(r.comps === 3 && r.questions === 2 && r.tests === 1 && !r.committed, 'library preview counts');
fresh(); ok(ctx.all_('COMPETENCIES').length === 0, 'preview writes nothing');
must(api('jd.import', t.hr, Object.assign({ commit: true }, lib)), 'library commit');
r = must(api('jd.import', t.hr, Object.assign({ commit: true }, lib)), 'library re-import');
fresh(); ok(ctx.all_('COMPETENCIES').length === 3 && ctx.find_('COMP_QUESTIONS', { Status: 'Active' }).length === 2, 'idempotent library (questions replaced)');
ok(!api('jd.import', t.hr, { kind: 'library', comps: [{ code: 'bad', group: 'X', name: '' }] }).ok, 'bad comp rejected');
r = must(api('comp.list', t.acc), 'comp list'); ok(r.comps.length === 3 && r.comps[1].req[3] >= 0, 'comp list');

// ---- JD import
const jd = { code: ACC, title: 'محاسب عام', level: 'JL3', purpose: 'تسجيل القيود بدقة وفي موعدها', resp: ['يسجل القيود', 'يطابق الحسابات', 'يجهز التقارير'],
  kpis: [['دقة القيود', 'الأخطاء ÷ القيود', 'شهري']], auth: [['تسوية فروق صغيرة', 'يوصي']], comps: [{ c: 'C01', l: 2, m: '' }, { c: 'LD01', l: 1, m: '' }, { c: 'PR02', l: 3, m: '' }],
  edu: 'بكالوريوس تجارة', exp: 'سنتان', test: 'تسوية حساب بنكي' };
r = must(api('jd.import', t.hr, { kind: 'jds', jds: [jd, { code: 'NOPE-1', title: 'x', purpose: 'p', resp: ['a'] }, Object.assign({}, jd, { code: MGR.Job_Code, comps: [{ c: 'ZZ9', l: 1 }] })] }), 'jd preview');
ok(r.total === 3 && r.valid === 1 && r.errors.length === 2 && r.errors.some(e => /المكتبة/.test(e.msg)), 'jd preview errors');
r = must(api('jd.import', t.hr, { kind: 'jds', jds: [jd], commit: true, reason: 'مسودة 0.1' }), 'jd commit');
fresh(); let d = ctx.find_('JOB_DESCRIPTIONS', { Job_Code: ACC })[0];
ok(d.Status === 'Draft' && d.Version === '1' && JSON.parse(d.Responsibilities).length === 3 && d.Career_Level === 'JL3', 'draft v1 saved');
r = must(api('jd.list', t.staff, {}), 'list'); ok(r.counts.draft === 1 && r.counts.none >= 2 && !r.canApprove && r.canEdit, 'list counts + flags');
ok(!api('jd.list', t.acc, {}).ok, 'manager cannot list');

// ---- manager sees nothing before approval; staff sees draft
r = must(api('jd.get', t.acc, { Job_Code: ACC }), 'manager get'); ok(!r.approved && !r.draft && !r.canEdit, 'manager sees no draft');
r = must(api('jd.get', t.staff, { Job_Code: ACC }), 'staff get'); ok(r.draft && r.draft.comps.length === 3 && r.draft.comps[2].behaviour === 'y', 'draft view with behaviours');
ok(!api('jd.approve', t.staff, { Job_Code: ACC }).ok, 'staff cannot approve');
r = must(api('jd.approve', t.hr, { all: 'Y', reason: 'اعتماد مبدئي' }), 'approve all'); ok(r.approved === 1, 'approved 1');
fresh(); ok(ctx.get_('JOBS', ACC).Current_JD_Version === '1' && ctx.get_('JOBS', ACC).Job_Level === 'JL3', 'job points at v1 + level');
r = must(api('jd.get', t.acc, { Job_Code: ACC }), 'manager get 2'); ok(r.approved && r.approved.Version === '1', 'manager sees approved');

// ---- kit: questions filtered by level, practical test from the JD for PR02
r = must(api('jd.kit', t.acc, { Job_Code: ACC }), 'kit');
const c01 = r.comps.find(c => c.code === 'C01'), pr = r.comps.find(c => c.code === 'PR02');
ok(c01.questions.length === 1 && pr.test && pr.test.name === 'تسوية حساب بنكي', 'kit questions by level + JD test');

// ---- request keeps JD version; new version supersedes
r = must(api('req.positions', t.acc, {}), 'positions'); ok(r.rows.find(x => x.Job_Code === ACC).jd === '1', 'position carries approved jd version');
const req = must(api('req.submit', t.acc, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في إقفال الشهر', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1 }] }), 'request');
fresh(); ok(ctx.get_('RECRUITMENT_REQUESTS', req.Request_ID).JD_Version === '1', 'request stores JD v1');
r = api('jd.save', t.staff, { Job_Code: ACC, Purpose: 'قصير', resp: ['a', 'b', 'c'] }); ok(!r.ok && /الغرض/.test(r.error), 'purpose required');
r = api('jd.save', t.staff, { Job_Code: ACC, Purpose: 'تسجيل القيود بدقة وفي موعدها', resp: ['a'] }); ok(!r.ok && /3 مسؤوليات/.test(r.error), 'min responsibilities');
r = must(api('jd.save', t.staff, { Job_Code: ACC, Purpose: 'تسجيل القيود بدقة وفي موعدها وإقفال الشهر', resp: ['يسجل', 'يطابق', 'يقفل الشهر'], comps: [{ code: 'C01', level: 9 }, { code: 'C01', level: 2 }], Change_Reason: 'إضافة الإقفال' }), 'save v2');
ok(r.Version === '2', 'new version 2');
fresh(); d = ctx.find_('JOB_DESCRIPTIONS', { Job_Code: ACC, Version: '2' })[0]; ok(JSON.parse(d.Competencies_JSON).length === 1 && JSON.parse(d.Competencies_JSON)[0].l === 4, 'comps de-duplicated and clamped');
must(api('jd.save', t.staff, { Job_Code: ACC, Purpose: 'تسجيل القيود بدقة وفي موعدها وإقفال الشهر', resp: ['يسجل', 'يطابق', 'يقفل الشهر', 'رابع'] }), 'edit draft again');
fresh(); ok(ctx.find_('JOB_DESCRIPTIONS', { Job_Code: ACC }).length === 2, 'draft edited in place');
must(api('jd.approve', t.hr, { Job_Code: ACC }), 'approve v2');
fresh(); ok(ctx.find_('JOB_DESCRIPTIONS', { Job_Code: ACC, Version: '1' })[0].Status === 'Superseded' && ctx.get_('JOBS', ACC).Current_JD_Version === '2', 'v1 superseded');
ok(ctx.get_('RECRUITMENT_REQUESTS', req.Request_ID).JD_Version === '1', 'old request keeps v1');
r = must(api('jd.get', t.acc, { Job_Code: ACC, Version: '1' }), 'old version readable'); ok(r.picked && r.picked.Version === '1', 'picked old version');
r = must(api('jd.get', t.staff, { Job_Code: ACC }), 'versions'); ok(r.versions.length === 2 && r.versions[0].Version === '2', 'version history');
// discard
must(api('jd.save', t.staff, { Job_Code: ACC, Purpose: 'تسجيل القيود بدقة وفي موعدها وإقفال الشهر', resp: ['1', '2', '3'] }), 'draft v3');
must(api('jd.discard', t.staff, { Job_Code: ACC }), 'discard');
r = must(api('jd.get', t.staff, { Job_Code: ACC }), 'after discard'); ok(!r.draft && r.approved.Version === '2', 'discard keeps approved');
ok(!api('jd.approve', t.hr, { Job_Code: ACC }).ok, 'nothing to approve');

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
