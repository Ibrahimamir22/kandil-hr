/**
 * Referrals.gs — Phase 3B-2 (v0.9.0): employee referrals, recruitment agencies, application owner, source history.
 *
 * Attribution (blueprint 8, decision CHG-40/9):
 *   • Every application keeps its own Source; Original_Source = the source of the person's first application ever.
 *   • A referral links an application to the employee who referred the candidate. When the application's source is
 *     a referral source it is the PRIMARY referral; on any other source it is recorded as INFLUENCING.
 *     First referral wins: a second employee cannot claim the same candidate on the same vacancy.
 *   • Bonus eligibility is a status kept here (the portal makes no payment): PENDING until hire + probation (later
 *     phases), REVIEW when HR must decide (candidate already known, influencing referral), NOT_ELIGIBLE, ELIGIBLE, PAID.
 *   • Agencies have terms (fee, guarantee, replacement, ownership days). An agency submission snapshots the terms and
 *     owns the candidate until Ownership_Until; another agency cannot submit him meanwhile.
 *   • Attribution (source, agency, referral) locks once the outcome is known (rejected / withdrawn, later hired)
 *     and can no longer be changed.
 *   • Owner_User_ID: the one recruiter answerable for an application (defaults to the vacancy's lead).
 */

var BONUS_STATUSES_ = ['PENDING', 'REVIEW', 'ELIGIBLE', 'NOT_ELIGIBLE', 'PAID'];
var FEE_TYPES_ = ['PERCENT_ANNUAL', 'MONTHS_SALARY', 'FIXED', 'NONE'];

function sourceKind_(code) {
  var s = findOne_('RECRUITMENT_SOURCES', { Source_Code: str_(code) });
  return s ? s.Kind : '';
}
function isReferralSource_(code) { return sourceKind_(code) === 'REFERRAL'; }
function isAgencySource_(code) { return sourceKind_(code) === 'AGENCY'; }

/** Source of the person's first application (before this one is created). */
function originalSourceFor_(personId, fallback) {
  var first = find_('APPLICATIONS', { Person_ID: personId }, { sort: 'Applied_At' })[0];
  return first ? (first.Original_Source || first.Source) : str_(fallback);
}

/** Default owner of a new application: the actor when he is on the vacancy team, otherwise the lead recruiter. */
function defaultOwner_(actorId, v) {
  if (actorId && find_('VACANCY_RECRUITERS', { Vacancy_ID: v.Vacancy_ID, User_ID: actorId, Active: 'Y' }).length) return actorId;
  return v.Lead_Recruiter_ID || '';
}

/* ---------------- agencies ---------------- */

function agenciesList_() {
  return find_('AGENCIES', {}).sort(function (a, b) { return a.Name_AR < b.Name_AR ? -1 : 1; });
}

/** p = { Agency_ID?, Name_AR, Name_EN, Contact_Name, Phone, Email, Fee_Type, Fee_Value, Guarantee_Days, Replacement_Terms, Ownership_Days, Contract_URL, Notes, Status } */
function agencySave_(ctx, p) {
  var id = str_(p.Agency_ID);
  var cur = id ? findOne_('AGENCIES', { Agency_ID: id }) : null;
  if (id && !cur) throw userError_('المكتب غير موجود.');
  var name = str_(p.Name_AR).replace(/\s+/g, ' ');
  if (name.length < 2) throw userError_('اكتب اسم المكتب.');
  if (find_('AGENCIES', {}).some(function (a) { return a.Agency_ID !== id && norm_(a.Name_AR) === norm_(name); })) throw userError_('في مكتب بنفس الاسم.');
  var feeType = str_(p.Fee_Type) || 'NONE';
  if (FEE_TYPES_.indexOf(feeType) < 0) throw userError_('اختار طريقة حساب الأتعاب.');
  var feeVal = latinDigits_(p.Fee_Value).replace(/[,\s]/g, '');
  if (feeType !== 'NONE' && !/^\d+(\.\d{1,2})?$/.test(feeVal)) throw userError_('اكتب قيمة الأتعاب رقم.');
  if (feeType === 'PERCENT_ANNUAL' && Number(feeVal) > 100) throw userError_('النسبة لازم تكون من 0 لـ 100.');
  function days(v, label) {
    var d = latinDigits_(v).trim();
    if (d === '') return '';
    if (!/^\d{1,4}$/.test(d)) throw userError_(label + ' لازم يكون عدد أيام.');
    return d;
  }
  var email = str_(p.Email).toLowerCase();
  if (email && !validEmail_(email)) throw userError_('الإيميل غير صحيح.');
  var url = str_(p.Contract_URL);
  if (url && !/^https?:\/\//i.test(url)) throw userError_('لينك العقد لازم يبدأ بـ http.');
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  var fields = { Name_AR: name, Name_EN: str_(p.Name_EN), Contact_Name: str_(p.Contact_Name).slice(0, 80), Phone: latinDigits_(p.Phone).trim().slice(0, 30),
    Email: email, Fee_Type: feeType, Fee_Value: feeType === 'NONE' ? '' : feeVal, Guarantee_Days: days(p.Guarantee_Days, 'فترة الضمان'),
    Replacement_Terms: str_(p.Replacement_Terms).slice(0, 500), Ownership_Days: days(p.Ownership_Days, 'مدة ملكية المرشح') || '90',
    Contract_URL: url, Notes: str_(p.Notes).slice(0, 1000), Status: status };
  return withLock_(function () {
    if (!cur) {
      fields.Agency_ID = nextId_('AGENCY');
      var row = insert_('AGENCIES', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'AGENCY', entityId: row.Agency_ID, action: 'CREATE', newValue: name });
      return row;
    }
    var res = update_('AGENCIES', cur.Agency_ID, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'AGENCY', cur.Agency_ID, res.before, res.after, str_(p.reason));
    return res.after;
  });
}

/** Terms snapshot for an agency submission. */
function agencyAttach_(agencyId) {
  var ag = findOne_('AGENCIES', { Agency_ID: str_(agencyId) });
  if (!ag || ag.Status !== 'Active') throw userError_('اختار مكتب التوظيف.');
  var terms = { name: ag.Name_AR, feeType: ag.Fee_Type, feeValue: ag.Fee_Value, guaranteeDays: ag.Guarantee_Days,
    replacement: ag.Replacement_Terms, ownershipDays: ag.Ownership_Days, at: today_() };
  return { Agency_ID: ag.Agency_ID, Agency_Terms_JSON: JSON.stringify(terms),
    Ownership_Until: addDaysYmd_(today_(), num_(ag.Ownership_Days, 90)) };
}

function addDaysYmd_(ymd, n) {
  var d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) + n * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/** An agency that still owns the person (latest valid ownership), excluding one application. */
function agencyOwnership_(personId, excludeAppId) {
  var today = today_(), best = null;
  find_('APPLICATIONS', { Person_ID: personId }).forEach(function (a) {
    if (a.Application_ID === excludeAppId || !a.Agency_ID || !a.Ownership_Until || a.Ownership_Until < today) return;
    if (!best || a.Ownership_Until > best.until) best = { agencyId: a.Agency_ID, until: a.Ownership_Until, appId: a.Application_ID };
  });
  if (best) best.name = (findOne_('AGENCIES', { Agency_ID: best.agencyId }) || {}).Name_AR || best.agencyId;
  return best;
}

/* ---------------- referrals ---------------- */

function activeReferral_(appId) {
  return find_('REFERRALS', { Application_ID: appId, Status: 'Active' })[0] || null;
}

/** Recruiters pick the referring employee: active employees only (code, name, job). p = { q } */
function empSearchLite_(ctx, p) {
  var q = norm_(latinDigits_(p.q));
  if (q.length < 2) return [];
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var status = 'Active';
  if (str_(p.exited) === 'Y') {
    if (!hasAnyRole_(ctx, restrictionRoles_())) throw userError_('مالكش صلاحية.');
    status = 'Exited';
  }
  return find_('EMPLOYEES', { Status: status }).filter(function (e) {
    return norm_(e.Full_Name).indexOf(q) >= 0 || norm_(e.Employee_ID) === q;
  }).slice(0, 20).map(function (e) {
    var pos = e.Position_ID ? findOne_('POSITIONS', { Position_ID: e.Position_ID }) : null;
    return { id: e.Employee_ID, name: e.Full_Name, job: pos ? (pos.Position_Title || jobs[pos.Job_Code] || '') : '' };
  });
}

/**
 * Create the referral record for an application (no lock taken here; callers hold it or not).
 * d = { Employee_ID, Employee_Name, Relationship } — returns the row.
 */
function referralRecord_(actorId, app, d) {
  var c = referralCheck_(app, d, null);
  var emp = c.emp, empId = c.empId, name = c.name, rel = c.rel, per = c.per;
  var primary = isReferralSource_(app.Source);
  var status = 'PENDING', note = '';
  var prior = cfg_('REFERRAL_PRIOR_DAYS', 180), since = addDaysYmd_(today_(), -prior);
  var known = find_('APPLICATIONS', { Person_ID: app.Person_ID }).filter(function (x) {
    return x.Application_ID !== app.Application_ID && x.Applied_At.slice(0, 10) >= since && x.Applied_At < app.Applied_At;
  })[0];
  if (per.Is_Employee === 'Y') { status = 'NOT_ELIGIBLE'; note = 'مرشح داخلي (موظف حالي)'; }
  else if (!primary) { status = 'REVIEW'; note = 'ترشيح مؤثّر — المرشح جه من مصدر تاني'; }
  else if (known) { status = 'REVIEW'; note = 'المرشح كان متقدم قبل كده (' + known.Application_ID + ') خلال آخر ' + prior + ' يوم'; }
  return insert_('REFERRALS', { Referral_ID: nextId_('REFERRAL'), Application_ID: app.Application_ID, Person_ID: app.Person_ID,
    Vacancy_ID: app.Vacancy_ID, Employee_ID: emp ? emp.Employee_ID : '', Employee_Name: name, Relationship: rel,
    Kind: primary ? 'PRIMARY' : 'INFLUENCING', Bonus_Status: status, Bonus_Note: note, Bonus_By: '', Bonus_At: '', Locked_At: '',
    Status: 'Active', Void_Reason: '' }, actorId);
}

/**
 * Validate a referral before anything is saved. app = { Application_ID, Person_ID, Vacancy_ID } (Person_ID '' for a new person);
 * person = the person's fields when he is not saved yet.
 */
function referralCheck_(app, d, person) {
  var empId = latinDigits_(d.Employee_ID).trim();
  var name = str_(d.Employee_Name).replace(/\s+/g, ' ');
  var emp = empId ? findOne_('EMPLOYEES', { Employee_ID: empId }) : null;
  var haveMaster = find_('EMPLOYEES', {}).length > 0;
  if (empId && !emp) throw userError_('كود الموظف اللي رشّح مش موجود في سجل الموظفين.');
  if (emp && emp.Status !== 'Active') throw userError_('الموظف ده مش على رأس العمل — الترشيح لموظف حالي بس.');
  if (!emp && haveMaster) throw userError_('اختار الموظف اللي رشّح من سجل الموظفين.');
  if (emp) name = emp.Full_Name;
  if (name.length < 3) throw userError_('اكتب اسم الموظف اللي رشّح.');
  var rel = str_(d.Relationship).slice(0, 60);
  if (cfg_('REFERRAL_RELATIONSHIP_REQUIRED', false) && !rel) throw userError_('اكتب صلة الموظف بالمرشح.');
  var per = person || (app.Person_ID ? findOne_('PERSONS', { Person_ID: app.Person_ID }) : null) || {};
  if (emp && per.Is_Employee === 'Y' && per.Employee_ID === emp.Employee_ID) throw userError_('الموظف مايقدرش يرشّح نفسه.');
  // first referral wins: another employee's referral of the same person on the same vacancy
  var other = app.Person_ID ? find_('REFERRALS', { Person_ID: app.Person_ID, Vacancy_ID: app.Vacancy_ID, Status: 'Active' })
    .filter(function (r) { return r.Application_ID !== app.Application_ID && (r.Employee_ID || r.Employee_Name) !== (empId || name); })[0] : null;
  if (other) throw userError_('المرشح ده رشّحه ' + other.Employee_Name + ' يوم ' + other.Created_At.slice(0, 10) + ' على نفس الشاغر — أول ترشيح هو اللي بيتحسب.');
  return { emp: emp, empId: empId, name: name, rel: rel, per: per };
}

/** p = { Application_ID, Employee_ID, Employee_Name, Relationship, reason } — record or replace the referral. */
function referralSet_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (a.Source_Locked_At) throw userError_('نتيجة المرشح اتعرفت — الترشيح والمصدر مقفولين ومينفعش يتغيروا.');
  var cur = activeReferral_(a.Application_ID);
  var reason = str_(p.reason);
  if (cur && reason.length < 3) throw userError_('اكتب سبب تغيير الموظف اللي رشّح.');
  var row;
  withLock_(function () {
    row = referralRecord_(ctx.user.User_ID, a, p);      // validates first; the old record is voided only once the new one stands
    if (cur) update_('REFERRALS', cur.Referral_ID, { Status: 'Voided', Void_Reason: reason }, ctx.user.User_ID);
    update_('APPLICATIONS', a.Application_ID, { Referrer_Name: row.Employee_Name, Referrer_Employee_ID: row.Employee_ID }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: (cur ? 'الترشيح اتغير من ' + cur.Employee_Name + ' لـ ' : 'ترشيح من الموظف ') + row.Employee_Name +
      (row.Employee_ID ? ' (' + row.Employee_ID + ')' : '') + (row.Kind === 'INFLUENCING' ? ' — ترشيح مؤثّر' : '') + (reason ? ' — ' + reason : '') });
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: cur ? 'REFERRAL_CHANGED' : 'REFERRAL_SET',
    oldValue: cur ? cur.Employee_Name : '', newValue: row.Employee_Name, reason: reason });
  return row;
}

/** p = { Application_ID, Source, Sub_Source, Agency_ID, reason } — change where the candidate came from (before the outcome). */
function appSourceSet_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (a.Source_Locked_At) throw userError_('نتيجة المرشح اتعرفت — المصدر مقفول ومينفعش يتغير.');
  var srcs = sources_(), src = str_(p.Source);
  if (!srcs[src]) throw userError_('اختار المصدر.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب تغيير المصدر.');
  var patch = { Source: src, Sub_Source: str_(p.Sub_Source).slice(0, 60) };
  if (isAgencySource_(src)) {
    var ag = agencyAttach_(p.Agency_ID);
    var own = agencyOwnership_(a.Person_ID, a.Application_ID);
    if (own && own.agencyId !== ag.Agency_ID) throw userError_('المرشح ده ملك ' + own.name + ' لحد ' + own.until + ' — مكتب تاني مايقدرش يقدّمه.');
    if (a.Agency_ID === ag.Agency_ID) { delete ag.Agency_Terms_JSON; delete ag.Ownership_Until; }
    for (var k in ag) patch[k] = ag[k];
  } else { patch.Agency_ID = ''; patch.Agency_Terms_JSON = ''; patch.Ownership_Until = ''; }
  if (patch.Source === a.Source && patch.Sub_Source === a.Sub_Source && str_(patch.Agency_ID) === a.Agency_ID) throw userError_('مفيش تغيير.');
  var ref = activeReferral_(a.Application_ID), res;
  withLock_(function () {
    res = update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID);
    // the referral follows the source: primary on a referral source, influencing otherwise
    if (ref) update_('REFERRALS', ref.Referral_ID, { Kind: isReferralSource_(src) ? 'PRIMARY' : 'INFLUENCING' }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: 'المصدر اتغير من ' + (srcs[a.Source] || a.Source) + ' لـ ' + srcs[src] +
      (patch.Agency_ID ? ' (' + (findOne_('AGENCIES', { Agency_ID: patch.Agency_ID }) || {}).Name_AR + ')' : '') + ' — ' + reason });
  });
  auditDiff_(ctx, 'APPLICATION', a.Application_ID, res.before, res.after, reason);
  return res.after;
}

/** p = { Application_ID, Owner_User_ID, reason } — the owner, the lead or a recruitment manager hands the application over. */
function appOwnerSet_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, v = L.vac;
  var me = ctx.user.User_ID;
  if (!candAll_(ctx) && a.Owner_User_ID !== me && v.Lead_Recruiter_ID !== me) throw userError_('تسليم المرشح لمسؤوله الحالي أو المسؤول الأول عن الشاغر أو مدير التوظيف.');
  var to = str_(p.Owner_User_ID);
  if (!find_('VACANCY_RECRUITERS', { Vacancy_ID: v.Vacancy_ID, User_ID: to, Active: 'Y' }).length) throw userError_('المسؤول لازم يكون من فريق الشاغر.');
  if (to === a.Owner_User_ID) throw userError_('هو المسؤول بالفعل.');
  var names = userNames_();
  withLock_(function () {
    update_('APPLICATIONS', a.Application_ID, { Owner_User_ID: to }, me);
    activity_(me, a, 'SYSTEM', { Note: 'المسؤول عن المرشح بقى ' + (names[to] || to) + (a.Owner_User_ID ? ' بدل ' + (names[a.Owner_User_ID] || a.Owner_User_ID) : '') +
      (str_(p.reason) ? ' — ' + str_(p.reason) : '') });
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: 'OWNER', oldValue: a.Owner_User_ID, newValue: to, reason: str_(p.reason) });
  if (to !== me) {
    var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
    notify_([to], 'اتسلمت مرشح', per.Full_Name + ' — ' + vacTitle_(v).ar, 'APPLICATION', a.Application_ID, false);
  }
  return { Owner_User_ID: to, ownerName: names[to] || to };
}

/** Outcome known (rejected / withdrawn; later hired): source, agency and referral can no longer change. */
function lockAttribution_(actorId, app) {
  var at = nowIso_();
  var ref = activeReferral_(app.Application_ID);
  if (ref && !ref.Locked_At) update_('REFERRALS', ref.Referral_ID, { Locked_At: at }, actorId);
  return at;
}

/** Applications without an owner (or owned by someone who left the team) go to the vacancy lead. */
function reassignOwners_(actorId, vacancyId) {
  var v = findOne_('VACANCIES', { Vacancy_ID: vacancyId });
  if (!v || !v.Lead_Recruiter_ID) return 0;
  var team = {}; find_('VACANCY_RECRUITERS', { Vacancy_ID: vacancyId, Active: 'Y' }).forEach(function (r) { team[r.User_ID] = 1; });
  var n = 0;
  find_('APPLICATIONS', { Vacancy_ID: vacancyId }).forEach(function (a) {
    if (STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) < 0 || (a.Owner_User_ID && team[a.Owner_User_ID])) return;
    update_('APPLICATIONS', a.Application_ID, { Owner_User_ID: v.Lead_Recruiter_ID }, actorId);
    n++;
  });
  return n;
}

/* ---------------- referrals register (bonus follow-up) ---------------- */

/** p = { status } → referrals with candidate, vacancy and stage. */
function referralsList_(ctx, p) {
  p = p || {};
  var names = userNames_();
  var rows = find_('REFERRALS', { Status: 'Active' }).filter(function (r) { return !str_(p.status) || r.Bonus_Status === p.status; })
    .sort(function (a, b) { return a.Referral_ID < b.Referral_ID ? 1 : -1; });
  var counts = {}; BONUS_STATUSES_.forEach(function (s) { counts[s] = 0; });
  find_('REFERRALS', { Status: 'Active' }).forEach(function (r) { counts[r.Bonus_Status] = (counts[r.Bonus_Status] || 0) + 1; });
  return {
    counts: counts, canDecide: hasAnyRole_(ctx, HR_ADMIN_ROLES),
    rows: rows.map(function (r) {
      var a = findOne_('APPLICATIONS', { Application_ID: r.Application_ID }) || {};
      var per = findOne_('PERSONS', { Person_ID: r.Person_ID }) || {};
      var v = findOne_('VACANCIES', { Vacancy_ID: r.Vacancy_ID });
      return { Referral_ID: r.Referral_ID, Application_ID: r.Application_ID, candidate: per.Full_Name || '', Stage: a.Stage || '',
        job: v ? vacTitle_(v).ar + ' — ' + locName_(v.Location_ID) : r.Vacancy_ID, Employee_ID: r.Employee_ID, Employee_Name: r.Employee_Name,
        Relationship: r.Relationship, Kind: r.Kind, Bonus_Status: r.Bonus_Status, Bonus_Note: r.Bonus_Note, at: r.Created_At,
        bonusBy: names[r.Bonus_By] || '', Bonus_At: r.Bonus_At, locked: !!r.Locked_At };
    })
  };
}

/** p = { Referral_ID, Bonus_Status, note } — HR records the bonus decision (no payment happens in the portal). */
function referralBonus_(ctx, p) {
  var r = findOne_('REFERRALS', { Referral_ID: p.Referral_ID });
  if (!r || r.Status !== 'Active') throw userError_('الترشيح غير موجود.');
  var st = str_(p.Bonus_Status);
  if (BONUS_STATUSES_.indexOf(st) < 0) throw userError_('اختار حالة المكافأة.');
  if (st === r.Bonus_Status) throw userError_('مفيش تغيير.');
  var note = str_(p.note);
  if (note.length < 3) throw userError_('اكتب السبب أو تفاصيل الصرف.');
  var res;
  withLock_(function () { res = update_('REFERRALS', r.Referral_ID, { Bonus_Status: st, Bonus_Note: note, Bonus_By: ctx.user.User_ID, Bonus_At: nowIso_() }, ctx.user.User_ID); });
  auditDiff_(ctx, 'REFERRAL', r.Referral_ID, res.before, res.after, note);
  return res.after;
}

/* ---------------- one-time migration ---------------- */

/** v0.9.0: owners, original sources, locks and referral records for applications that existed before. */
function migrate090_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATE_090') === 'done') return;
  var apps = all_('APPLICATIONS');
  if (!apps.length) { props.setProperty('MIGRATE_090', 'done'); return; }
  var first = {};
  apps.slice().sort(function (a, b) { return a.Applied_At < b.Applied_At ? -1 : 1; }).forEach(function (a) { if (!first[a.Person_ID]) first[a.Person_ID] = a.Source; });
  var vac = {}; all_('VACANCIES').forEach(function (v) { vac[v.Vacancy_ID] = v; });
  withLock_(function () {
    apps.forEach(function (a) {
      var patch = {};
      if (!a.Original_Source) patch.Original_Source = first[a.Person_ID] || a.Source;
      if (!a.Owner_User_ID && vac[a.Vacancy_ID] && vac[a.Vacancy_ID].Lead_Recruiter_ID) patch.Owner_User_ID = vac[a.Vacancy_ID].Lead_Recruiter_ID;
      if (!a.Source_Locked_At && (a.Stage === 'REJECTED' || a.Stage === 'WITHDRAWN')) patch.Source_Locked_At = a.Stage_At || nowIso_();
      if (Object.keys(patch).length) update_('APPLICATIONS', a.Application_ID, patch, 'SYSTEM');
      if (a.Referrer_Name && !find_('REFERRALS', { Application_ID: a.Application_ID }).length) {
        insert_('REFERRALS', { Referral_ID: nextId_('REFERRAL'), Application_ID: a.Application_ID, Person_ID: a.Person_ID, Vacancy_ID: a.Vacancy_ID,
          Employee_ID: a.Referrer_Employee_ID, Employee_Name: a.Referrer_Name, Relationship: '', Kind: isReferralSource_(a.Source) ? 'PRIMARY' : 'INFLUENCING',
          Bonus_Status: 'REVIEW', Bonus_Note: 'ترشيح اتسجل قبل 0.9.0 — محتاج مراجعة', Bonus_By: '', Bonus_At: '',
          Locked_At: patch.Source_Locked_At || a.Source_Locked_At || '', Status: 'Active', Void_Reason: '' }, 'SYSTEM');
      }
    });
  });
  props.setProperty('MIGRATE_090', 'done');
}
