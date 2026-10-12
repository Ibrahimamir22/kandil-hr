/**
 * Demo.gs — v0.20.0: test data inside the live portal, then wipe the transactions.
 *
 *  - demo.seed (system owner, in stages so each call stays well under the 6-minute limit): demo users and employees
 *    on the real structure, then requests, candidates, interviews, offers, joinings / onboarding / insurance / surveys,
 *    transfers, data requests and notes — covering the states each screen handles. Everything goes through the real
 *    services, so the data is what the portal itself would produce. Demo people use @demo.invalid emails (never sent).
 *  - demo.as: the owner opens the portal as a demo user to try each role (marked session, audited, owner can return).
 *  - demo.wipe: the owner (typed phrase + reason + authenticator code when on) wipes EVERY transaction — real or demo —
 *    keeping the structure, jobs, locations, real users and roles, real employees, settings and templates. Before it,
 *    the spreadsheets are copied to a backup folder. Demo users / employees are removed, counters restart, headcount
 *    is recounted (or restored from the snapshot taken at seeding), uploaded files are moved to the trash.
 */

var DEMO_PHRASE_ = 'امسح الحركات';

/** Tables wiped by demo.wipe (transactions). Everything else is kept. */
var WIPE_TABLES_ = [
  'RECRUITMENT_REQUESTS', 'REQUEST_LINES', 'REQUEST_REPLACEMENTS', 'REQUEST_SKILLS', 'REQUEST_VERSIONS', 'APPROVAL_INSTANCES', 'EVENTS', 'NOTIFICATIONS',
  'VACANCIES', 'VACANCY_RECRUITERS', 'VACANCY_FILLS', 'PRIORITY_HISTORY', 'POSITION_CHANGE_REQUESTS', 'ADVERTISEMENTS', 'SOURCE_USAGE',
  'PERSONS', 'APPLICATIONS', 'ACTIVITIES', 'CONSENTS', 'REFERRALS', 'TALENT_POOL', 'IMPORT_BATCHES', 'INTERVIEWS', 'INTERVIEW_PANEL', 'EVALUATIONS',
  'SELECTIONS', 'REFERENCE_CHECKS', 'OFFERS', 'JOININGS', 'CANDIDATE_DOCS', 'PAYROLL_NOTICES', 'DOC_RECEIPTS', 'DATA_REQUESTS',
  'ONBOARDINGS', 'ONB_TASKS', 'INSURANCE_CASES', 'NHV_SURVEYS', 'TRANSFER_REQUESTS',
  'PROBATIONS', 'PROB_REVIEWS', 'PROB_NOTES', 'MEDICAL_CASES', 'ATT_ENROLL'
];
/** ID counters that restart after the wipe (their tables are empty). */
var WIPE_SEQS_ = ['REQUEST', 'REQ_LINE', 'REPLACEMENT', 'SKILL', 'REQ_VERSION', 'APPROVAL', 'EVENT', 'NOTIFICATION', 'VACANCY', 'VAC_RECRUITER', 'PRIORITY_HISTORY',
  'PCR', 'VAC_FILL', 'PERSON', 'APPLICATION', 'ACTIVITY', 'SOURCE_USAGE', 'AD', 'REFERRAL', 'POOL', 'BATCH', 'INTERVIEW', 'PANEL', 'EVALUATION', 'SELECTION',
  'REFERENCE', 'OFFER', 'JOINING', 'CAND_DOC', 'PAYROLL_NOTICE', 'DOC_RECEIPT', 'CONSENT', 'DATA_REQUEST', 'ONBOARDING', 'ONB_TASK', 'INS_CASE', 'NHV', 'TRANSFER', 'PROBATION', 'PROB_REVIEW', 'PROB_NOTE', 'MED_CASE', 'ATT_ENROLL'];
var DEMO_FOLDERS_ = ['CV_FOLDER_ID', 'EVIDENCE_FOLDER_ID', 'OFFER_FOLDER_ID', 'DOCS_FOLDER_ID'];
var DEMO_STAGES_ = [
  ['PEOPLE', 'مستخدمين وموظفين تجريبيين'], ['REQUESTS', 'طلبات التوظيف والاعتمادات والشواغر'], ['CANDIDATES', 'المرشحين في كل المراحل'],
  ['INTERVIEWS', 'المقابلات والتقييمات والاختيار'], ['OFFERS', 'العروض الوظيفية'], ['JOINING', 'الاستلام والمسوغات والتهيئة والتأمينات والاستبيان'],
  ['MORE', 'النقل الداخلي وطلبات البيانات والملاحظات']
];

function demoOwner_(ctx) {
  // v0.36.0 (CHG-77): a wipe approved under the two-person rule may be run by the HR Sector Manager
  var ok = realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) >= 0 || (ctx.dualApproved && realRoles_(ctx.user.User_ID).indexOf(ROLE.HR_SECTOR) >= 0);
  if (ctx.readOnly || str_(ctx.user.Is_Demo) === 'Y' || !ok) throw userError_('البيانات التجريبية لمالك النظام بس.');
  if (golive_()) throw userError_('البوابة في التشغيل الفعلي — البيانات التجريبية ومسح الحركات اتقفلوا نهائياً.');
}
function isDemoUser_(u) { return !!u && str_(u.Is_Demo) === 'Y'; }

/** Mail guard: addresses on the reserved .invalid domain (used by demo people) are never sent to, and nothing at all
 *  is sent while demo data is being made (real approvers would otherwise get emails about demo requests). */
var DEMO_MUTE_ = false;
function sendMail_(o) {
  var to = str_(o && o.to).toLowerCase();
  if (!to || DEMO_MUTE_ || /\.invalid$/.test(to)) {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('DEMO_MAIL_SKIPPED', String(num_(props.getProperty('DEMO_MAIL_SKIPPED'), 0) + 1));
    return false;
  }
  // Private review deployment: only the owner's inbox may receive mail.
  if (to !== normEmail_(OWNER_EMAIL) || o.cc || o.bcc) return false;
  MailApp.sendEmail(o);
  return true;
}

/* ---------------- status ---------------- */

function demoStatus_(ctx) {
  demoOwner_(ctx);
  var props = PropertiesService.getScriptProperties(), counts = {}, total = 0;
  WIPE_TABLES_.forEach(function (t) { var n = all_(t).length; counts[t] = n; total += n; });
  var done = {}; try { done = JSON.parse(props.getProperty('DEMO_STAGES') || '{}'); } catch (e) { done = {}; }
  var users = where_('USERS', function (u) { return isDemoUser_(u); }).map(function (u) {
    var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null, job = pos ? get_('JOBS', pos.Job_Code) : null;
    return { id: u.User_ID, name: u.Full_Name_AR, roles: realRoles_(u.User_ID).map(function (r) { return (get_('ROLES', r) || {}).Role_Name_AR || r; }),
      position: pos ? (pos.Position_Title || (job ? job.Job_Title_AR : '')) : '' };
  });
  return { counts: counts, total: total, stages: DEMO_STAGES_.map(function (s) { return { key: s[0], name: s[1], done: done[s[0]] || null }; }),
    users: users, employees: where_('EMPLOYEES', function (e) { return str_(e.Is_Demo) === 'Y'; }).length,
    seededAt: props.getProperty('DEMO_SEEDED_AT') || '', mailSkipped: num_(props.getProperty('DEMO_MAIL_SKIPPED'), 0),
    lastWipe: props.getProperty('DEMO_LAST_WIPE') || '', positions: where_('POSITIONS', function (p) { return p.Status !== 'Closed'; }).length,
    phrase: DEMO_PHRASE_, mfa: mfaOn_(ctx.user.User_ID), empMode: occFromEmployees_() };
}

/* ---------------- seeding ---------------- */

var DEMO_FIRST_ = ['أحمد', 'محمد', 'محمود', 'مصطفى', 'كريم', 'عمر', 'يوسف', 'خالد', 'طارق', 'هاني', 'شريف', 'إسلام', 'مينا', 'بيتر', 'منى', 'سارة', 'نورهان', 'دينا', 'ياسمين', 'هبة', 'مريم', 'رنا', 'إيمان', 'آية'];
var DEMO_LAST_ = ['عبد الله', 'السيد', 'حسن', 'إبراهيم', 'عبد الرحمن', 'فوزي', 'سليمان', 'شحاتة', 'جرجس', 'منصور', 'رمضان', 'عادل', 'نبيل', 'الشافعي', 'زكي', 'فهمي'];

function demoState_() { try { return JSON.parse(propGetBig_('DEMO_STATE') || '{}'); } catch (e) { return {}; } }
function demoSave_(st) { propPutBig_('DEMO_STATE', JSON.stringify(st)); }
function demoCtx_(userId) { var u = get_('USERS', userId); if (!u) throw new Error('demo user missing ' + userId); return { user: u, sessionId: 'DEMO' }; }
function demoName_(i) { return DEMO_FIRST_[i % DEMO_FIRST_.length] + ' ' + DEMO_LAST_[(i * 7 + 3) % DEMO_LAST_.length] + ' ' + DEMO_FIRST_[(i * 5 + 2) % 14]; }
function demoMobile_(i) { return '0100' + ('0000000' + (5550000 + i)).slice(-7); }
function daysAgo_(n) { return addDaysYmd_(today_(), -n); }

/** p = { stage } — runs one stage; returns { stage, created, warnings }. */
function demoSeed_(ctx, p) {
  demoOwner_(ctx);
  var stage = str_(p.stage), st = demoState_(), out = { stage: stage, created: {}, warnings: [] };
  var props = PropertiesService.getScriptProperties();
  var done = {}; try { done = JSON.parse(props.getProperty('DEMO_STAGES') || '{}'); } catch (e) { done = {}; }
  var order = DEMO_STAGES_.map(function (s) { return s[0]; }), idx = order.indexOf(stage);
  if (idx < 0) throw userError_('مرحلة غير معروفة.');
  if (done[stage]) throw userError_('المرحلة دي اتعملت قبل كده — امسح الحركات الأول لو عايز تعيدها.');
  for (var i = 0; i < idx; i++) if (!done[order[i]]) throw userError_('اعمل مرحلة «' + DEMO_STAGES_[i][1] + '» الأول.');
  var W = function (m, e) { out.warnings.push(m + (e ? ': ' + (e.message || e) : '')); };
  var C = function (k, n) { out.created[k] = (out.created[k] || 0) + (n === undefined ? 1 : n); };
  var fn = { PEOPLE: demoPeople_, REQUESTS: demoRequests_, CANDIDATES: demoCandidates_, INTERVIEWS: demoInterviews_, OFFERS: demoOffers_, JOINING: demoJoining_, MORE: demoMore_ }[stage];
  DEMO_MUTE_ = true;
  // v0.32.2: the whole stage under ONE lock — each save no longer re-takes the lock, flushes and re-reads the tables
  // (≈190 lock rounds per stage went past Apps Script's 6-minute limit on the live sheets)
  try { withLock_(function () { fn(ctx, st, W, C); }); } finally { DEMO_MUTE_ = false; }
  demoSave_(st);
  done[stage] = nowIso_();
  props.setProperty('DEMO_STAGES', JSON.stringify(done));
  if (!props.getProperty('DEMO_SEEDED_AT')) props.setProperty('DEMO_SEEDED_AT', nowIso_());
  audit_(ctx, { entityType: 'DEMO', entityId: stage, action: 'DEMO_SEED', newValue: JSON.stringify(out.created).slice(0, 300) });
  return out;
}

/* ---- stage 1: people ---- */
function demoPeople_(ctx, st, W, C) {
  var ver = activeVersion_();
  var units = where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === ver; });
  var positions = where_('POSITIONS', function (x) { return x.Status !== 'Closed' && x.Org_Version_ID === ver; });
  if (positions.length < 6) throw userError_('حمّل الهيكل الأول — البيانات التجريبية بتتعمل على الهيكل الحقيقي (محتاجين 6 وظايف على الأقل).');
  var taken = {}; where_('USERS', function (u) { return u.Status === 'Active' && u.Position_ID; }).forEach(function (u) { taken[u.Position_ID] = 1; });
  var byUnit = {}; positions.forEach(function (x) { (byUnit[x.Org_Unit_ID] = byUnit[x.Org_Unit_ID] || []).push(x); });
  // occupancy snapshot (restored by the wipe when headcount is not counted from employees)
  var snap = {}; positions.forEach(function (x) { snap[x.Position_ID] = str_(x.Occupied_HC); });
  propPutBig_('DEMO_OCC_SNAPSHOT', JSON.stringify(snap));     // v0.35.0: split in parts (one property holds 9 KB; 540 positions need more)
  // units with a free head position and at least one other position
  var cand = units.filter(function (u) {
    return u.Head_Position_ID && !taken[u.Head_Position_ID] && (byUnit[u.Org_Unit_ID] || []).some(function (x) { return x.Position_ID !== u.Head_Position_ID; });
  }).sort(function (a, b) { return (byUnit[b.Org_Unit_ID] || []).length - (byUnit[a.Org_Unit_ID] || []).length; }).slice(0, 4);
  if (!cand.length) throw userError_('مفيش وحدات مديرها من غير حساب على البوابة — البيانات التجريبية محتاجة وحدات تحط عليها مديرين تجريبيين.');
  var n = 0, mk = function (name, pos, roles, extra) {
    var u;
    withLock_(function () {
      u = insert_('USERS', Object.assign({ User_ID: nextId_('USER'), Email: 'demo.user' + (++n) + '.' + Date.now() % 100000 + '@demo.invalid', Full_Name_AR: name, Full_Name_EN: '',
        Employee_ID: '', Position_ID: pos || '', Mobile: '', Status: 'Active', Last_Login_At: '', Lang: '', Access_Expires_At: '', Nda_Accepted_At: '', Prefs_JSON: '', Is_Demo: 'Y' }, extra || {}), ctx.user.User_ID);
      if (roles && roles.length) {
        var ids = nextIds_('USER_ROLE', roles.length);
        insertMany_('USER_ROLES', roles.map(function (r, i) { return { User_Role_ID: ids[i], User_ID: u.User_ID, Role_Code: r, Scope_Type: 'ALL', Scope_Org_Unit_ID: '', Include_Children: '', Effective_From: today_(), Effective_To: '', Granted_By: ctx.user.User_ID }; }), ctx.user.User_ID);
      }
    });
    C('users'); return u.User_ID;
  };
  st.users = {};
  st.users.hr = mk('منى عادل (تجريبي)', '', [ROLE.HR_MANAGER]);
  st.users.site = mk('هبة منصور (تجريبي)', '', [ROLE.HR_STAFF]);
  st.users.rm = mk('طارق فهمي (تجريبي)', '', [ROLE.REC_MANAGER]);
  st.users.rec1 = mk('سارة نبيل (تجريبي)', '', [ROLE.RECRUITER]);
  st.users.rec2 = mk('علي رمضان (تجريبي)', '', [ROLE.RECRUITER]);
  if (!roleHolders_(ROLE.HR_SECTOR).length) st.users.sec = mk('شريف زكي (تجريبي)', '', [ROLE.HR_SECTOR]);
  if (!roleHolders_(ROLE.CEO).length) st.users.ceo = mk('خالد سليمان (تجريبي)', '', [ROLE.CEO]);
  st.units = [];
  cand.forEach(function (u, i) {
    var head = get_('POSITIONS', u.Head_Position_ID);
    var mid = mk(demoName_(40 + i) + ' (تجريبي)', head.Position_ID, []);
    st.units.push({ unit: u.Org_Unit_ID, head: head.Position_ID, mgr: mid, positions: (byUnit[u.Org_Unit_ID] || []).filter(function (x) { return x.Position_ID !== head.Position_ID; }).map(function (x) { return x.Position_ID; }) });
    // the parent unit's head, when free, becomes a demo manager too (so approval chains have people)
    var par = get_('ORG_UNITS', u.Parent_Org_Unit_ID);
    if (par && par.Head_Position_ID && !taken[par.Head_Position_ID] && !where_('USERS', function (x) { return x.Position_ID === par.Head_Position_ID && x.Status === 'Active'; }).length) {
      var ph = get_('POSITIONS', par.Head_Position_ID);
      mk(demoName_(50 + i) + ' (تجريبي)', ph.Position_ID, []);
    }
  });
  // demo employees: head positions + a spread of occupancy on the other positions
  var e = 0, mkEmp = function (posId, i) {
    var pos = get_('POSITIONS', posId); if (!pos) return null;
    var code = 'DEMO-' + ('000' + (++e)).slice(-4);
    withLock_(function () {
      var row = insert_('EMPLOYEES', { Employee_ID: code, Full_Name: demoName_(i) + ' (تجريبي)', Position_ID: posId, Location_ID: pos.Location_ID, Hire_Date: daysAgo_(400 + i * 13),
        Employment_Kind: 'PERMANENT', Job_Type: '', Status: 'Active', Exit_Date: '', Exit_Reason: '', Exit_Note: '', Source: 'DEMO', Notes: '', Is_Demo: 'Y' }, ctx.user.User_ID);
      empHistory_(ctx.user.User_ID, row, 'HIRE', { To_Position_ID: posId, To_Location_ID: pos.Location_ID, Event_Date: row.Hire_Date, Note: 'بيانات تجريبية' });
    });
    C('employees'); return code;
  };
  st.emps = [];
  var k = 0;
  st.units.forEach(function (u) {
    var me = mkEmp(u.head, k++); if (me) withLock_(function () { update_('USERS', u.mgr, { Employee_ID: me }, ctx.user.User_ID); });
    u.positions.forEach(function (posId, j) {
      var pos = get_('POSITIONS', posId), hc = num_(pos.Structural_HC, 1);
      var n2 = [Math.max(0, hc - 1), hc, hc + 1, 0][j % 4];        // short / full / over / empty
      n2 = Math.min(n2, 6);
      for (var q = 0; q < n2; q++) { var c = mkEmp(posId, k++); if (c) st.emps.push(c); }
    });
  });
  if (occFromEmployees_()) recountOccupied_(positions.map(function (x) { return x.Position_ID; }), ctx.user.User_ID);
  else W('العدد الفعلي في الهيكل مش بيتحسب من الموظفين (OCCUPIED_FROM_EMPLOYEES = N) — الموظفين التجريبيين مش هيغيّروا العدد في خريطة الهيكل');
}

/* ---- stage 2: requests, approvals, vacancies ---- */
function demoApproveAll_(reqId, W, stopAfter) {
  for (var g = 0; g < 12; g++) {
    var req = get_('RECRUITMENT_REQUESTS', reqId);
    if (!req || REQ_OPEN_.indexOf(req.Status) < 0) return req;
    if (stopAfter !== undefined && g >= stopAfter) return req;
    var step = currentStep_('REQUEST', reqId, req.Version);
    if (!step) return req;
    var who = eligibleUsers_(step.Authority, req.Requester_User_ID).filter(function (u) { return isDemoUser_(get_('USERS', u)) || realRoles_(u).indexOf(ROLE.OWNER) >= 0; })[0];
    if (!who) { W('طلب ' + reqId + ' وقف عند خطوة مالهاش معتمد تجريبي (' + step.Authority + ')'); return req; }
    requestAction_(demoCtx_(who), { Request_ID: reqId, action: 'APPROVE', comment: 'موافق (تجريبي)', hr: { HR_Classification: req.Requested_Priority || 'NORMAL', HR_Notes: '(تجريبي) مراجعة الموارد البشرية' } });
  }
  return get_('RECRUITMENT_REQUESTS', reqId);
}
function demoRequests_(ctx, st, W, C) {
  fresh_();
  var base = { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD', Requested_Priority: 'NORMAL' };
  var plans = [['APPROVED', 3, 'IMPORTANT'], ['APPROVED', 2, 'CRITICAL'], ['APPROVED', 1, 'NORMAL'], ['APPROVED', 2, 'NORMAL'], ['PENDING1', 1, 'NORMAL'], ['PENDING_HR', 1, 'IMPORTANT'],
    ['RETURNED', 1, 'NORMAL'], ['REJECTED', 1, 'NORMAL'], ['DRAFT', 1, 'NORMAL']];
  st.vacancies = []; st.requests = [];
  var pi = 0;
  plans.forEach(function (pl, i) {
    var u = st.units[i % st.units.length];
    var posId = u.positions[pi++ % u.positions.length];
    var pos = get_('POSITIONS', posId); if (!pos) return;
    var p = Object.assign({}, base, { Requested_Priority: pl[2], Priority_Reason: pl[2] === 'NORMAL' ? '' : '(تجريبي) خط إنتاج جديد بيبدأ الشهر الجاي', Justification: '(تجريبي) ضغط شغل وزيادة في الطلبات على القسم', Required_By_Date: addDaysYmd_(today_(), [10, 3, 30, 45, 20, 25, 15, 15, 30][i]), Exception_Justification: '(تجريبي) زيادة مؤقتة لحين مراجعة الهيكل',
      lines: [{ Position_ID: posId, Requested_HC: pl[1] }] });
    try {
      var mctx = demoCtx_(u.mgr), r;
      if (pl[0] === 'DRAFT') { r = requestSave_(mctx, p); C('requests'); st.requests.push(r.Request_ID); return; }
      r = requestSubmit_(mctx, p); C('requests'); st.requests.push(r.Request_ID);
      var id = r.Request_ID;
      if (pl[0] === 'APPROVED') {
        var fin = demoApproveAll_(id, W);
        if (fin && fin.Status === 'APPROVED') find_('VACANCIES', { Request_ID: id }).forEach(function (v) { st.vacancies.push(v.Vacancy_ID); C('vacancies'); });
      } else if (pl[0] === 'PENDING_HR') demoApproveAll_(id, W, 1);
      else if (pl[0] === 'RETURNED' || pl[0] === 'REJECTED') {
        var req = get_('RECRUITMENT_REQUESTS', id), step = currentStep_('REQUEST', id, req.Version);
        var who = step ? eligibleUsers_(step.Authority, req.Requester_User_ID).filter(function (x) { return isDemoUser_(get_('USERS', x)) || realRoles_(x).indexOf(ROLE.OWNER) >= 0; })[0] : '';
        if (who) requestAction_(demoCtx_(who), pl[0] === 'RETURNED' ? { Request_ID: id, action: 'RETURN', reasonCode: 'ADJUST_HC', comment: '(تجريبي) راجع العدد' } : { Request_ID: id, action: 'REJECT', reasonCode: 'NO_BUDGET', comment: '(تجريبي) مفيش ميزانية' });
      }
      // age: submitted some days ago, approvals waiting since then
      var age = [40, 25, 12, 6, 9, 4, 3, 2, 0][i];
      if (age) withLock_(function () {
        var t = addDaysIso_(-age);
        update_('RECRUITMENT_REQUESTS', id, { Submitted_At: t }, 'SYSTEM');
        find_('APPROVAL_INSTANCES', { Entity_ID: id }).forEach(function (a) { if (a.Status === 'PENDING') update_('APPROVAL_INSTANCES', a.Approval_ID, { Created_At: t }, 'SYSTEM'); });
      });
    } catch (e) { W('طلب توظيف (' + pl[0] + ')', e); }
  });
  // vacancies: assign recruiters, open, apply link on the first
  st.vacancies.forEach(function (vid, i) {
    try {
      vacancyAssign_(demoCtx_(st.users.rm), { Vacancy_ID: vid, Lead_Recruiter_ID: i % 2 ? st.users.rec2 : st.users.rec1, recruiters: [i % 2 ? st.users.rec1 : st.users.rec2], reason: 'تجريبي' });
      if (i < st.vacancies.length - 1) vacancyUpdate_(demoCtx_(st.users.rm), { Vacancy_ID: vid, action: 'OPEN' });
      if (i === 0) vacancyApplySettings_(demoCtx_(st.users.rec1), { Vacancy_ID: vid, Apply_Enabled: 'Y', Public_Summary: '(تجريبي) وظيفة للاختبار' });
    } catch (e) { W('شاغر ' + vid, e); }
  });
  // a new-position request (left pending — approving it would add a real position to the structure)
  try {
    var u0 = st.units[0], hp = get_('POSITIONS', u0.head);
    pcrSubmit_(demoCtx_(u0.mgr), { Org_Unit_ID: u0.unit, Proposed_Title: '(تجريبي) محلل بيانات', Number_Of_Positions: '1', Reports_To_Position_ID: u0.head, Location_ID: hp.Location_ID,
      Justification: '(تجريبي) تحليل بيانات الإنتاج والمبيعات', Responsibilities: 'تقارير شهرية', Qualifications: 'بكالوريوس' });
    C('newPositionRequests');
  } catch (e) { W('طلب وظيفة جديدة', e); }
}
function fresh_() { if (!LOCK_HELD_) REPO_.tables = {}; }   // v0.32.2: under the stage lock the tables in memory are already current

/* ---- stage 3: candidates ---- */
function demoCandidates_(ctx, st, W, C) {
  fresh_();
  st.apps = {}; st.persons = 0;
  var stages = ['NEW', 'NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED', 'SHORTLISTED', 'SHORTLISTED', 'SHORTLISTED', 'SHORTLISTED', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN', 'ON_HOLD'];
  var srcs = ['CAREER_PAGE', 'WUZZUF', 'LINKEDIN', 'WALK_IN', 'FACEBOOK', 'WHATSAPP', 'REFERRAL', 'AGENCY'];
  var live = st.vacancies.filter(function (v) { var x = get_('VACANCIES', v); return x && ['OPEN', 'PARTIALLY_FILLED'].indexOf(x.Status) >= 0; });
  // v0.29.0: published ads with a cost, so the source-return view has spend to divide (wiped with the demo data)
  try {
    var adSrc = [['FACEBOOK', 1500], ['LINKEDIN', 3000], ['WUZZUF', 2500]], ads = [];
    live.forEach(function (vid, vi) { adSrc.forEach(function (x, k) { if ((vi + k) % 3 !== 2) ads.push({ v: vid, src: x[0], cost: x[1] }); }); });
    var adIds = nextIds_('AD', ads.length), pub = addDaysYmd_(today_(), -3) + 'T10:00:00';
    insertMany_('ADVERTISEMENTS', ads.map(function (x, i) {
      return { Ad_ID: adIds[i], Vacancy_ID: x.v, Source_Code: x.src, Campaign: '(تجريبي)', Language: 'ar', Title: '(تجريبي) إعلان', Body: '(تجريبي)', Version: '1', Status: 'PUBLISHED',
        Published_At: pub, Closes_On: addDaysYmd_(today_(), 27), Post_URL: '', Cost: String(x.cost), Subscription_ID: '', Usage_ID: '', Copied_From: '', Posted_By: st.users.rec1, Status_Note: '' };
    }), st.users.rec1);
    C('ads', ads.length);
  } catch (e) { W('الإعلانات', e); }
  live.forEach(function (vid, vi) {
    var v = get_('VACANCIES', vid), rec = v.Lead_Recruiter_ID || st.users.rec1;
    st.apps[vid] = [];
    stages.forEach(function (stg, i) {
      var n = 100 + vi * 20 + i;
      try {
        var src = srcs[(i + vi) % srcs.length];
        var p = { Vacancy_ID: vid, Full_Name: demoName_(n), Mobile: demoMobile_(n), Email: 'demo.cand' + n + '@demo.invalid', Gender: i % 3 ? 'M' : 'F', Source: src === 'REFERRAL' || src === 'AGENCY' ? 'WALK_IN' : src,
          consent: 'Y', poolConsent: i % 4 === 0 ? 'Y' : '', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: String(1 + i % 9),
          Current_Salary: i % 2 ? String(6000 + i * 300) : '', Expected_Salary: i % 2 ? String(8000 + i * 400) : '' };
        var r = candCreate_(demoCtx_(rec), p), a = r.application.Application_ID;
        C('candidates'); st.persons++;
        // v0.38.0: the demo candidate «answers» the consent link (except a few left at the start, to show the gate)
        if (['NEW', 'CONTACTED'].indexOf(stg) < 0 || i % 2) withLock_(function () {
          var pv = str_(cfg_('PRIVACY_VERSION', '1'));
          update_('PERSONS', r.application.Person_ID, { Consent_Version: pv, Consent_At: nowIso_() }, 'PUBLIC');
          consentLog_('PUBLIC', { Person_ID: r.application.Person_ID, Application_ID: a, Kind: 'APPLY', Version: pv, Channel: 'LINK', Note: '(تجريبي)' });
        });
        var path = { NEW: [], CONTACTED: ['CONTACTED'], SCREENING: ['SCREENING'], SHORTLISTED: ['SHORTLISTED'], REJECTED: ['SCREENING', 'REJECTED'], WITHDRAWN: ['CONTACTED', 'WITHDRAWN'], ON_HOLD: ['ON_HOLD'] }[stg];
        path.forEach(function (to) {
          var mv = { Application_ID: a, to: to };
          if (to === 'REJECTED') { mv.reasonCode = 'NOT_QUALIFIED'; }
          if (to === 'WITHDRAWN') { mv.reasonCode = 'ACCEPTED_ELSEWHERE'; mv.note = '(تجريبي) لقى شغل تاني'; }
          if (to === 'ON_HOLD') mv.note = '(تجريبي) مستني رد مدير القسم';
          try { appMove_(demoCtx_(rec), mv); } catch (e2) { if (to === 'REJECTED' || to === 'WITHDRAWN') { mv.reasonCode = 'OTHER'; mv.note = mv.note || '(تجريبي)'; appMove_(demoCtx_(rec), mv); } else throw e2; }
        });
        if (stg === 'NEW' && i === 1) withLock_(function () { update_('APPLICATIONS', a, { Applied_At: addDaysIso_(-6), Stage_At: addDaysIso_(-6) }, 'SYSTEM'); });
        if (i === 2) appNext_(demoCtx_(rec), { Application_ID: a, Next_Action: '(تجريبي) كلّمه يأكد ميعاد المقابلة', Next_Action_Date: daysAgo_(2), Next_Action_Owner: rec });
        st.apps[vid].push({ a: a, stage: stg });
      } catch (e) { W('مرشح (' + stg + ')', e); }
    });
    // a duplicate (same mobile on another vacancy)
    if (vi === 1 && live[0]) try { candCreate_(demoCtx_(rec), { Vacancy_ID: vid, Full_Name: demoName_(100), Mobile: demoMobile_(100), Source: 'WALK_IN', consent: 'Y' }); C('duplicates'); } catch (e) { /* duplicate warning is expected on some setups */ }
  });
}

/* ---- stage 4: interviews, evaluations, selection ---- */
function demoInterviews_(ctx, st, W, C) {
  fresh_();
  st.selected = [];
  Object.keys(st.apps || {}).forEach(function (vid, vi) {
    var v = get_('VACANCIES', vid), rec = v.Lead_Recruiter_ID || st.users.rec1;
    var shorts = st.apps[vid].filter(function (x) { return x.stage === 'SHORTLISTED'; });
    shorts.forEach(function (x, i) {
      try {
        var later = i === 1;                                   // the others already happened (yesterday, recorded on the spot)
        var iv = intCreate_(demoCtx_(rec), { Application_ID: x.a, Round_ID: 'R1', Date: later ? addDaysYmd_(today_(), 2) : daysAgo_(1), Time: ['10:00', '11:30', '13:00', '14:30'][i % 4],
          Mode: i % 2 ? 'IN_PERSON' : 'PHONE', Location_ID: i % 2 ? v.Location_ID : '', panel: [{ User_ID: rec, Role: 'LEAD' }], adhoc: later ? '' : 'Y', reason: later ? '' : '(تجريبي) مقابلة متسجلة بعد ما اتعملت' }).interview;
        C('interviews');
        if (i === 1) return;                                   // upcoming, not started
        if (i === 3 && vi % 2) { intAction_(demoCtx_(rec), { Interview_ID: iv.Interview_ID, action: 'NO_SHOW', note: '(تجريبي) ماحضرش' }); C('noShows'); return; }
        if (iv.Mode === 'IN_PERSON') intAction_(demoCtx_(rec), { Interview_ID: iv.Interview_ID, action: 'CHECKIN' });
        intAction_(demoCtx_(rec), { Interview_ID: iv.Interview_ID, action: 'START' });
        if (i === 2) return;                                   // started, evaluation late
        try {
          var g = intGet_(demoCtx_(rec), { Interview_ID: iv.Interview_ID }).guide || {};
          evalSave_(demoCtx_(rec), { Interview_ID: iv.Interview_ID, comps: (g.comps || []).map(function (c) { return { c: c.code, r: String(3 + (i % 2)) }; }),
            reqs: (g.reqs || []).map(function (r) { return { k: r.k, s: 'MET', e: '(تجريبي) من المقابلة' }; }),
            qs: (g.std || []).filter(function (q) { return q.kind === 'MANDATORY'; }).map(function (q) { return { id: q.id, asked: 'Y' }; }),
            Recommendation: 'PROCEED', Summary: '(تجريبي) مناسب للوظيفة', submit: 'Y', noRelation: 'Y' });
          C('evaluations');
        } catch (e) { W('تقييم مقابلة', e); }
        selectionSave_(demoCtx_(rec), { Application_ID: x.a, Decision: i === 3 ? 'RESERVE' : 'SELECTED', Reason: '(تجريبي) أفضل مرشح', Override_Reason: '(تجريبي) التقييمات اتعملت شفهي', confirmOver: 'Y' });
        if (i !== 3) st.selected.push({ vid: vid, a: x.a });
        C('selections');
      } catch (e) { W('مقابلة', e); }
    });
  });
}

/* ---- stage 5: offers ---- */
function demoOffers_(ctx, st, W, C) {
  fresh_();
  st.accepted = [];
  var kinds = ['ACCEPT', 'ACCEPT', 'PRESENT', 'ACCEPT', 'DECLINE', 'PENDING', 'ACCEPT', 'PENDING', 'PENDING'];
  (st.selected || []).forEach(function (s, i) {
    var v = get_('VACANCIES', s.vid), rec = v.Lead_Recruiter_ID || st.users.rec1, kind = kinds[i % kinds.length];
    try {
      var jd = addDaysYmd_(today_(), [-12, -3, 10, 7, 20, 14, 5, 21, 25][i % 9]);
      var O = offerSave_(demoCtx_(rec), { Application_ID: s.a, Contract_Basis: i % 2 ? 'NET' : 'GROSS', Agreed_Amount: String(7000 + i * 750), Joining_Date: jd, Justification: '(تجريبي) المرتب حسب السوق لحين اعتماد هيكل الرواتب' }).offer;
      C('offers');
      if (kind === 'PENDING') { try { offerAction_(demoCtx_(rec), { Offer_ID: O.Offer_ID, action: 'SUBMIT', hcOverride: '(تجريبي)' }); } catch (e) { /* stays draft */ } return; }
      var R = offerAction_(demoCtx_(st.users.rm), { Offer_ID: O.Offer_ID, action: 'SUBMIT', hcOverride: '(تجريبي) محتاجين العدد ده' }); O = R.offer || R;
      for (var g = 0; g < 3 && O.Status === 'PENDING_APPROVAL'; g++) {
        var role = O.Required_Role, who = roleHolders_(role === 'CEO_BOARD' ? ROLE.CEO : role).filter(function (u) { return isDemoUser_(get_('USERS', u)) || realRoles_(u).indexOf(ROLE.OWNER) >= 0; })[0] || ctx.user.User_ID;
        O = (offerAction_(demoCtx_(who), { Offer_ID: O.Offer_ID, action: 'APPROVE', note: 'موافق (تجريبي)', noRelation: 'Y' }).offer) || O;
      }
      if (O.Status !== 'APPROVED') { W('عرض ' + O.Offer_ID + ' لسه ' + O.Status); return; }
      O = get_('OFFERS', O.Offer_ID) || O;
      if (netReviewNeeded_(O)) {                                   // v0.40.0: the payroll reviewer confirms the estimated net
        var nr = netReviewers_().filter(function (u) { return u !== O.Created_By && (isDemoUser_(get_('USERS', u)) || realRoles_(u).indexOf(ROLE.OWNER) >= 0); })[0];
        if (nr) offerAction_(demoCtx_(nr), { Offer_ID: O.Offer_ID, action: 'NET_REVIEW', note: '(تجريبي) اتراجع على حسبة المرتبات' });
      }
      O = offerAction_(demoCtx_(rec), { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }).offer;
      if (kind === 'PRESENT') return;
      if (kind === 'DECLINE') { offerAction_(demoCtx_(rec), { Offer_ID: O.Offer_ID, action: 'DECLINE', reason: 'COUNTEROFFER', note: '(تجريبي) شركته زودته' }); C('declined'); return; }
      offerAction_(demoCtx_(rec), { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: '(تجريبي) وقّع على النسخة المطبوعة' });
      st.accepted.push({ vid: s.vid, a: s.a, jd: jd }); C('accepted');
    } catch (e) { W('عرض وظيفي', e); }
  });
}

/* ---- stage 6: joining, documents, onboarding, insurance, survey, gift ---- */
function demoJoining_(ctx, st, W, C) {
  fresh_();
  var site = st.users.site;
  (st.vacancies || []).forEach(function (vid) {
    var v = get_('VACANCIES', vid); if (!v) return;
    var loc = get_('LOCATIONS', v.Location_ID);
    if (loc && !loc.HR_Site_User_ID) withLock_(function () { update_('LOCATIONS', loc.Location_ID, { HR_Site_User_ID: site }, ctx.user.User_ID); });
  });
  st.joinedEmps = [];
  (st.accepted || []).forEach(function (s, i) {
    var v = get_('VACANCIES', s.vid), rec = v.Lead_Recruiter_ID || st.users.rec1, rctx = demoCtx_(rec);
    if (i === 3) return;                                     // left for «did not join» below
    try {
      var j = joiningOf_(s.a); if (!j) { W('مفيش استلام للمرشح ' + s.a); return; }
      joiningAction_(rctx, { Joining_ID: j.Joining_ID, action: 'CONFIRM_DATE' }); C('onboardingPrograms');
      var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID });
      if (i === 2) {                                         // upcoming: some uploaded, one rejected
        docs.slice(0, 3).forEach(function (d, k) { withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Status: k === 2 ? 'REJECTED' : 'UPLOADED', Review_Note: k === 2 ? '(تجريبي) الصورة مش واضحة' : '' }, 'SYSTEM'); }); });
        return;
      }
      docs.forEach(function (d, k) { withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, k === 0 && i === 1 ? { Status: 'MISSING', Deferred: 'Y', Due_Date: daysAgo_(2), Defer_Reason: '(تجريبي) مستني الشهادة' } : { Status: d.Digital === 'Y' ? 'VERIFIED' : 'PENDING', Physical: 'RECEIVED', Physical_At: nowIso_() }, 'SYSTEM'); }); });
      var jd = s.jd <= today_() ? s.jd : today_();
      var code = 'DEMO-N' + ('00' + (i + 1)).slice(-3);
      withLock_(function () {                                // v0.34: no joining without a National ID — demo people get a test one
        var per = get_('PERSONS', j.Person_ID);
        if (per && !/^[23]\d{13}$/.test(str_(per.National_ID))) update_('PERSONS', j.Person_ID, { National_ID: '2950101010' + ('000' + (i + 1)).slice(-4) }, 'SYSTEM');
      });
      joiningAction_(i === 1 ? demoCtx_(st.users.rm) : rctx, { Joining_ID: j.Joining_ID, action: 'JOINED', date: jd, Employee_ID: code, override: i === 1 ? '(تجريبي) مستند مؤجل' : '' });
      withLock_(function () { var e = findOne_('EMPLOYEES', { Employee_ID: code }); if (e) update_('EMPLOYEES', code, { Is_Demo: 'Y' }, 'SYSTEM'); });
      st.joinedEmps.push(code); C('joined');
      var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === j.Joining_ID; })[0];
      if (o) {
        var tasks = find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }).sort(function (a, b) { return a.Due_Date < b.Due_Date ? -1 : 1; });
        tasks.slice(0, Math.floor(tasks.length / 2)).forEach(function (t) { try { onbTask_(demoCtx_(site), { Task_ID: t.Task_ID, action: 'DONE', ack: 'Y', note: '(تجريبي)' }); } catch (e) { /* owner may be another user */ } });
        if (i === 0) giftSave_(demoCtx_(site), { Onboarding_ID: o.Onboarding_ID, item: (welcomeGifts_()[0] || 'هدية ترحيب'), signed: 'Y' });
      }
      var c = findOne_('INSURANCE_CASES', { Joining_ID: j.Joining_ID });
      if (c && i === 0) { insAction_(demoCtx_(st.users.hr), { Case_ID: c.Case_ID, action: 'SUBMIT', ref: 'DEMO-REQ-1', office: c.Office || 'مكتب تأمينات (تجريبي)' }); insAction_(demoCtx_(st.users.hr), { Case_ID: c.Case_ID, action: 'REGISTER', number: '9900' + (1000 + i) }); }
      find_('NHV_SURVEYS', { Joining_ID: j.Joining_ID }).forEach(function (s2, k) {
        if (k > 0) return;
        withLock_(function () {
          var low = i === 1;
          update_('NHV_SURVEYS', s2.Survey_ID, { Status: 'ANSWERED', Answered_At: nowIso_(), Answers_JSON: JSON.stringify(low ? { Q1: 2, Q2: 3, Q3: 2, Q4: 4, Q5: 3 } : { Q1: 5, Q2: 4, Q3: 5, Q4: 4, Q5: 5 }),
            Comment: low ? '(تجريبي) الشغل مختلف عن الإعلان والمواعيد مش واضحة' : '(تجريبي) الاستقبال كان كويس', Min_Score: low ? '2' : '4', Avg_Score: low ? '2.8' : '4.6', Lang: 'ar' }, 'SYSTEM');
        });
        C('surveys');
      });
    } catch (e) { W('استلام', e); }
  });
  // a candidate who did not join
  var dnj = (st.accepted || [])[3];
  if (dnj) try { var j2 = joiningOf_(dnj.a); if (j2 && j2.Status === 'PENDING') { joiningAction_(demoCtx_(st.users.rec1), { Joining_ID: j2.Joining_ID, action: 'DNJ', reason: 'OTHER', note: '(تجريبي) غيّر رأيه' }); C('didNotJoin'); } } catch (e) { W('ماستلمش', e); }
}

/* ---- stage 7: transfers, data requests, notes ---- */
function demoMore_(ctx, st, W, C) {
  fresh_();
  var emps = (st.emps || []).filter(function (c) { var e = findOne_('EMPLOYEES', { Employee_ID: c }); return e && e.Status === 'Active'; });
  var plans = ['DONE', 'PENDING_NEW', 'PENDING_HR', 'REJECTED', 'APPROVED_LATER'];
  var used = {}, demoPos = {};
  (st.units || []).forEach(function (u) { u.positions.forEach(function (x) { demoPos[x] = 1; }); });
  plans.forEach(function (pl, i) {
    var code = emps[i * 2]; if (!code) return;
    var e = findOne_('EMPLOYEES', { Employee_ID: code }), from = get_('POSITIONS', e.Position_ID);
    var fromUnit = (st.units || []).filter(function (u) { return u.unit === from.Org_Unit_ID; })[0];
    var opener = fromUnit ? fromUnit.mgr : st.users.hr;
    try {
      fresh_();
      var ids = Object.keys(demoPos).filter(function (x) { return x !== e.Position_ID && trfRoom_(x).room > 0; })
        .sort(function (a, b) { return (used[a] || 0) - (used[b] || 0); });
      if (!ids.length) { W('نقل: مفيش وظيفة فيها مكان شاغر لـ ' + code); return; }
      var rm = trfRoom_(ids[0]), tg = { id: ids[0], vac: rm.free ? '' : (rm.vacancies[0] || {}).id || '' };
      used[tg.id] = (used[tg.id] || 0) + 1;
      var pv = trfPreview_(demoCtx_(st.users.hr), { Employee_ID: code, To_Position_ID: tg.id });
      var t = trfSubmit_(demoCtx_(opener), { Employee_ID: code, To_Position_ID: tg.id, Vacancy_ID: tg.vac, Effective_Date: pl === 'APPROVED_LATER' ? addDaysYmd_(today_(), 10) : today_(), Reason: '(تجريبي) احتياج في الإدارة الجديدة',
        New_Schedule: i === 0 ? '8 ص – 4 م' : '', Pay_Change: pv.flags.length ? 'Y' : '', Pay_Items: pv.flags.map(function (f) { return { item: f.ar, from: '—', to: '—' }; }), Pay_Note: '(تجريبي)' });
      C('transfers');
      var stopAt = { DONE: 9, PENDING_NEW: 0, PENDING_HR: 2, REJECTED: 0, APPROVED_LATER: 9 }[pl];
      for (var g = 0; g < 6; g++) {
        var cur = get_('TRANSFER_REQUESTS', t.id);
        if (cur.Status !== 'PENDING') break;
        var users = trfStepUsers_(cur.Current_Step, cur).filter(function (u) { return isDemoUser_(get_('USERS', u)) || realRoles_(u).indexOf(ROLE.OWNER) >= 0; });
        if (!users.length) { W('نقل ' + t.id + ' وقف عند ' + cur.Current_Step); break; }
        if (pl === 'REJECTED') { trfAction_(demoCtx_(users[0]), { Transfer_ID: t.id, action: 'REJECT', note: '(تجريبي) محتاجه في الإقفال' }); break; }
        if (g >= stopAt || (pl === 'PENDING_HR' && cur.Current_Step === 'HR')) break;
        trfAction_(demoCtx_(users[0]), { Transfer_ID: t.id, action: 'APPROVE', note: 'موافق (تجريبي)' });
      }
    } catch (e) { W('نقل داخلي (' + pl + ')', e); }
  });
  // personal-data requests
  try {
    var per = all_('PERSONS').filter(function (x) { return /demo\.invalid$/.test(x.Email); });
    if (per[0]) { dsrSave_(demoCtx_(st.users.hr), { Person_ID: per[0].Person_ID, Kind: 'ACCESS', Channel: 'EMAIL', Details: '(تجريبي) عايز نسخة من بياناته' }); C('dataRequests'); }
    if (per[1]) { dsrSave_(demoCtx_(st.users.hr), { Person_ID: per[1].Person_ID, Kind: 'CORRECT', Channel: 'PHONE', Details: '(تجريبي) رقم الموبايل اتغير' }); C('dataRequests'); }
  } catch (e) { W('طلبات البيانات', e); }
  // an exit (replacement suggestion for the manager)
  var ex = emps[emps.length - 1];
  if (ex) try { empExit_(demoCtx_(st.users.hr), { Employee_ID: ex, Last_Working_Date: addDaysYmd_(today_(), 14), reasonCode: (all_('REASON_MASTER').filter(function (r) { return r.Process === 'EMPLOYEE_EXIT' && r.Status !== 'Inactive'; })[0] || {}).Code || 'OTHER', note: '(تجريبي) استقالة' }); C('exits'); } catch (e) { W('نهاية خدمة', e); }
  // probations at different points of the 90 days (opened when the demo hires joined)
  try { demoProbations_(st, W, C); } catch (e) { W('فترة الاختبار', e); }
  // read some notifications so lists have both states
  withLock_(function () { all_('NOTIFICATIONS').forEach(function (n, k) { if (k % 3 === 0) update_('NOTIFICATIONS', n.Notification_ID, { Read_At: nowIso_() }, 'SYSTEM'); }); });
}

/** Moves a probation back so it started `ago` days ago (its reviews move with it). */
function demoProbShift_(p, ago) {
  var start = addDaysYmd_(today_(), -ago), cp = probCheckpoints_(), at = { D30: cp.D30, D60: cp.D60, FINAL: cp.FINAL, SELF: cp.FINAL, STAY: cp.D60 };
  withLock_(function () {
    update_('PROBATIONS', p.Probation_ID, { Start_Date: start, End_Date: probDayDate_(start, probDays_()), Decision_Due: probDayDate_(start, probDecisionDay_()), Is_Demo: 'Y' }, 'SYSTEM');
    probReviews_(p.Probation_ID).forEach(function (r) { if (at[r.Kind]) update_('PROB_REVIEWS', r.Review_ID, { Due_Date: probDayDate_(start, at[r.Kind]) }, 'SYSTEM'); });
  });
  fresh_();
  return get_('PROBATIONS', p.Probation_ID);
}
function demoProbations_(st, W, C) {
  fresh_();
  var list = all_('PROBATIONS').filter(function (p) { return p.Status === 'ACTIVE'; });
  // a few more from the demo employees, so every point of the period shows
  var has = {}; all_('PROBATIONS').forEach(function (p) { has[p.Employee_ID] = 1; });
  all_('EMPLOYEES').filter(function (e) { return e.Is_Demo === 'Y' && e.Status === 'Active' && !e.Exit_Date && !has[e.Employee_ID]; }).slice(0, Math.max(0, 5 - list.length)).forEach(function (e) {
    try { list.push(probCreate_(st.users.hr, { Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, Position_ID: e.Position_ID, Location_ID: e.Location_ID, Start_Date: today_(), Is_Demo: 'Y' })); }
    catch (eP) { W('فترة اختبار ' + e.Employee_ID, eP); }
  });
  if (!list.length) { W('فترة الاختبار: مفيش موظفين'); return; }
  var hr = demoCtx_(st.users.hr);
  var mgrCtx = function (p) { var u = p.Manager_User_ID && get_('USERS', p.Manager_User_ID); return u && isDemoUser_(u) ? demoCtx_(u.User_ID) : hr; };
  var goals = [{ t: '(تجريبي) يتقن إجراءات الشغل اليومية في القسم', m: 'يشتغل لوحده من غير مراجعة بعد الأسبوع الرابع', d: '' },
    { t: '(تجريبي) يحقق المعدل المطلوب للوظيفة', m: '90% من المعدل الشهري', d: '' }, { t: '(تجريبي) يلتزم بمعايير الجودة والسلامة', m: 'صفر مخالفات جسيمة', d: '' }];
  var sc = function (s) { var o = {}; PROB_ITEMS_.forEach(function (it, i) { o[it[0]] = { s: Math.max(1, Math.min(5, s + (i % 3 === 2 ? -1 : 0))), e: '(تجريبي) مثال من سجل الأداء' }; }); return o; };
  var plan = [12, 40, 55, 77, 79];
  list.slice(0, plan.length).forEach(function (p0, i) {
    try {
      var p = demoProbShift_(p0, plan[i]), m = mgrCtx(p), id = p.Probation_ID;
      probAction_(m, { Probation_ID: id, action: 'GOALS', goals: goals });
      if (i !== 0) probAction_(hr, { Probation_ID: id, action: 'ACK', channel: 'IN_PERSON' });
      probAction_(m, { Probation_ID: id, action: 'NOTE', kind: 'POS', date: addDaysYmd_(today_(), -3), text: '(تجريبي) خلّص الشغل المطلوب قبل الميعاد وساعد زميله', impact: '(تجريبي) القسم سلّم في الميعاد' });
      if (plan[i] >= 30) probAction_(m, { Probation_ID: id, action: 'REVIEW', kind: 'D30', overall: i === 2 ? 2 : 4, goals: goals.map(function () { return { st: i === 2 ? 'BEHIND' : 'ON', n: '' }; }), strengths: '(تجريبي) ملتزم ومتعاون', improve: '(تجريبي) السرعة في الإنجاز' });
      if (i === 1) probAction_(m, { Probation_ID: id, action: 'NOTE', kind: 'COR', date: addDaysYmd_(today_(), -6), text: '(تجريبي) اتأخر في تسليم التقرير الأسبوعي يومين', impact: '' });
      if (i === 2) probAction_(m, { Probation_ID: id, action: 'PIP_START', goals: [{ t: '(تجريبي) تسليم الشغل في ميعاده', m: 'كل التسليمات في ميعادها لمدة أسبوعين' }, { t: '(تجريبي) تقليل الأخطاء', m: 'خطأين بالكتير في الأسبوع' }],
        support: '(تجريبي) متابعة يومية مع المشرف وتدريب على الإجراءات', review: addDaysYmd_(today_(), 14) });
      if (plan[i] >= 75) {
        probAction_(m, { Probation_ID: id, action: 'REVIEW', kind: 'D60', overall: 4, goals: goals.map(function () { return { st: 'ON', n: '' }; }), strengths: '(تجريبي) اتحسن كتير', improve: '(تجريبي) الدقة' });
        var self = probReview_(id, 'SELF');
        withLock_(function () { update_('PROB_REVIEWS', self.Review_ID, { Status: 'DONE', Scores_JSON: JSON.stringify(sc(4)), Weighted: '4', Note: '(تجريبي) اتعلمت كتير', Done_By: 'PUBLIC', Done_At: nowIso_() }, 'PUBLIC'); });
        probAction_(m, { Probation_ID: id, action: 'FINAL', scores: sc(4), strengths: '(تجريبي) ملتزم ومتعاون', improve: '(تجريبي) السرعة' });
        probAction_(m, { Probation_ID: id, action: 'RECOMMEND', rec: 'CONFIRM', reason: '(تجريبي) حقق الأهداف' });
        if (i === 4) { probAction_(hr, { Probation_ID: id, action: 'DECIDE', decision: 'CONFIRMED', note: '(تجريبي) تثبيت حسب التوصية' }); C('medical'); }
      }
      C('probations');
    } catch (e) { W('فترة الاختبار ' + p0.Probation_ID, e); }
  });
}

/* ---------------- open the portal as a demo user ---------------- */

function demoAs_(ctx, p) {
  demoOwner_(ctx);
  var u = get_('USERS', str_(p.User_ID));
  if (!isDemoUser_(u) || u.Status !== 'Active') throw userError_('التجربة بصفة المستخدمين التجريبيين بس.');
  var res;
  withLock_(function () { res = openSession_(u, 'DEMO-AS:' + ctx.user.User_ID); });
  audit_(ctx, { entityType: 'USER', entityId: u.User_ID, action: 'DEMO_AS', newValue: u.Full_Name_AR });
  return { token: res.token, name: u.Full_Name_AR };
}

/* ---------------- wipe ---------------- */

function clearTable_(table) {
  flushPending_(table);          // row updates held back in this lock would otherwise come back after the clear
  var h = headersOf_(table), sh = h.sheet, last = sh.getLastRow();
  if (last > 1) {
    var blank = []; for (var i = 0; i < last - 1; i++) { var r = []; for (var j = 0; j < h.headers.length; j++) r.push(''); blank.push(r); }
    sh.getRange(2, 1, last - 1, h.headers.length).setValues(blank);
    markDirty_(table);
  }
  delete REPO_.tables[table];
  return Math.max(0, last - 1);
}
/** Keep only the rows keepFn accepts (rewrites the table). */
function filterTable_(table, keepFn) {
  var rows = all_(table), keep = rows.filter(keepFn);
  if (keep.length === rows.length) return 0;
  clearTable_(table);
  if (keep.length) appendRows_(table, keep.map(function (r) { var o = {}; for (var k in r) if (k !== '__row') o[k] = r[k]; return o; }), 'SYSTEM');
  delete REPO_.tables[table];
  return rows.length - keep.length;
}
function demoBackup_() {
  var props = PropertiesService.getScriptProperties(), stamp = nowIso_().replace('T', ' ').slice(0, 16), copies = 0, folder = null;
  try { folder = getOrCreateFolder_().createFolder('Backup — نسخة احتياطية قبل المسح ' + stamp); } catch (e) { folder = null; }
  Object.keys(SS_PROP).forEach(function (g) {
    var id = props.getProperty(SS_PROP[g]); if (!id) return;
    try { var f = DriveApp.getFileById(id); if (folder) f.makeCopy(SS_TITLES[g] + ' — ' + stamp, folder); else f.makeCopy(SS_TITLES[g] + ' — BACKUP ' + stamp); copies++; }
    catch (e) { console.warn('backup ' + g + ': ' + e); }
  });
  return { copies: copies, folder: folder ? folder.getUrl() : '' };
}
function demoTrashFolders_() {
  var props = PropertiesService.getScriptProperties(), n = 0;
  DEMO_FOLDERS_.forEach(function (k) {
    var id = props.getProperty(k); if (!id) return;
    try {
      var f = DriveApp.getFolderById(id);
      if (f.getFiles) { var it = f.getFiles(); while (it.hasNext()) { it.next().setTrashed(true); n++; } }
      if (f.getFolders) { var it2 = f.getFolders(); while (it2.hasNext()) { it2.next().setTrashed(true); n++; } }
    } catch (e) { console.warn('trash ' + k + ': ' + e); }
  });
  return n;
}

/** p = { phrase, reason, code } */
function demoWipe_(ctx, p) {
  demoOwner_(ctx);
  // v0.36.0 (CHG-77): one person asks, another approves — unless the owner is the only real administrator
  if (!ctx.dualApproved) {
    if (anotherAdmin_(ctx.user.User_ID)) throw userError_('مسح الحركات محتاج شخصين: حد من فريق الموارد البشرية يطلبه من «موافقات الشخصين»، وانت توافق وتنفّذ.');
    audit_(ctx, { entityType: 'DUAL', entityId: 'WIPE', action: 'WIPE_SOLE_ADMIN', reason: 'مفيش مسؤول تاني يطلب المسح' });
  }
  if (str_(p.phrase) !== DEMO_PHRASE_) throw userError_('اكتب «' + DEMO_PHRASE_ + '» بالظبط للتأكيد.');
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب المسح.');
  if (mfaOn_(ctx.user.User_ID)) {
    var m = mfaRow_(ctx.user.User_ID), code = latinDigits_(p.code).replace(/\s+/g, '');
    var stp = /^\d{6}$/.test(code) ? totpMatch_(mfaOpen_(ctx.user.User_ID, m.Secret_Enc), code, m.Last_Step) : 0;
    if (!stp) throw userError_('اكتب الكود اللي ظاهر في تطبيق Authenticator دلوقتي (6 أرقام).');
    withLock_(function () { update_('USER_MFA', ctx.user.User_ID, { Last_Step: String(stp) }, ctx.user.User_ID); });
  }
  var backup = demoBackup_(), out = { backup: backup, tables: {}, removed: {} };
  var demoUsers = where_('USERS', function (u) { return isDemoUser_(u); }).map(function (u) { return u.User_ID; });
  var demoEmps = where_('EMPLOYEES', function (e) { return str_(e.Is_Demo) === 'Y'; }).map(function (e) { return e.Employee_ID; });
  withLock_(function () {
    WIPE_TABLES_.forEach(function (t) { out.tables[t] = clearTable_(t); });
    var phGone = all_('PHOTOS').filter(function (r) { return str_(r.Photo_ID).indexOf('P:') === 0 || demoUsers.indexOf(str_(r.Photo_ID).slice(2)) >= 0; }).map(function (r) { return r.Photo_ID; });
    filterTable_('PHOTOS', function (r) { return str_(r.Photo_ID).indexOf('P:') !== 0 && demoUsers.indexOf(str_(r.Photo_ID).slice(2)) < 0; });   // v0.33.0: candidates' and demo users' photos
    try { var pc = tcCache_(); if (pc) pc.removeAll(['PHIDX'].concat(phGone.map(photoKey_))); } catch (e) {}    // v0.35.0: row index and cached copies
    out.removed.users = filterTable_('USERS', function (u) { return demoUsers.indexOf(u.User_ID) < 0; });
    out.removed.roles = filterTable_('USER_ROLES', function (r) { return demoUsers.indexOf(r.User_ID) < 0; });
    filterTable_('USER_MFA', function (r) { return demoUsers.indexOf(r.User_ID) < 0; });
    filterTable_('DELEGATIONS', function (d) { return demoUsers.indexOf(d.To_User_ID) < 0; });
    all_('SESSIONS').forEach(function (s) { if (demoUsers.indexOf(s.User_ID) >= 0 && !s.Revoked_At) update_('SESSIONS', s.Session_ID, { Revoked_At: nowIso_(), Revoked_By: ctx.user.User_ID }, ctx.user.User_ID); });
    out.removed.employees = filterTable_('EMPLOYEES', function (e) { return demoEmps.indexOf(e.Employee_ID) < 0; });
    filterTable_('EMPLOYEE_HISTORY', function (h) { return demoEmps.indexOf(h.Employee_ID) < 0; });   // real employees keep their whole record
    // a demo HR site specialist on a location goes away with the demo user
    all_('LOCATIONS').forEach(function (l) { if (demoUsers.indexOf(l.HR_Site_User_ID) >= 0) update_('LOCATIONS', l.Location_ID, { HR_Site_User_ID: '' }, ctx.user.User_ID); });
    all_('ID_SEQUENCES').forEach(function (s) { if (WIPE_SEQS_.indexOf(s.Entity) >= 0 && s.Last_Number !== '0') update_('ID_SEQUENCES', s.Entity, { Last_Number: '0', Year: '' }, 'SYSTEM'); });
  });
  // headcount
  var props = PropertiesService.getScriptProperties();
  if (occFromEmployees_()) recountOccupied_(all_('POSITIONS').map(function (x) { return x.Position_ID; }), ctx.user.User_ID);
  else {
    var snap = {}; try { snap = JSON.parse(propGetBig_('DEMO_OCC_SNAPSHOT') || '{}'); } catch (e) { snap = {}; }
    withLock_(function () { all_('POSITIONS').forEach(function (x) { if (snap[x.Position_ID] !== undefined && snap[x.Position_ID] !== str_(x.Occupied_HC)) update_('POSITIONS', x.Position_ID, { Occupied_HC: snap[x.Position_ID] }, 'SYSTEM'); }); });
  }
  out.files = demoTrashFolders_();
  ['DEMO_STAGES', 'DEMO_SEEDED_AT', 'DEMO_MAIL_SKIPPED'].forEach(function (k) { props.deleteProperty(k); });
  propDelBig_('DEMO_STATE'); propDelBig_('DEMO_OCC_SNAPSHOT');
  props.setProperty('DEMO_LAST_WIPE', nowIso_().replace('T', ' ').slice(0, 16) + ' — ' + ctx.user.Full_Name_AR);
  try { CacheService.getScriptCache().removeAll && CacheService.getScriptCache().removeAll([]); } catch (e) { /* sessions cache refreshes itself */ }
  audit_(ctx, { entityType: 'DEMO', entityId: 'WIPE', action: 'DEMO_WIPE', reason: reason, newValue: JSON.stringify({ rows: Object.keys(out.tables).reduce(function (s, k) { return s + out.tables[k]; }, 0), users: out.removed.users, employees: out.removed.employees, backup: backup.copies }) });
  return out;
}
