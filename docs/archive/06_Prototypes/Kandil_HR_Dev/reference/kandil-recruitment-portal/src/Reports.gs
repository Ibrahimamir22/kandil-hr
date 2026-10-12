/**
 * Reports.gs — v0.22.0: operational reports (blueprint CHG-39, RPT-001).
 * Six reports — requests, vacancies, candidates, ads, offers, new joiners — with filters (dates, sector, location,
 * status) and export to Excel. Each report shows only what the user's own screens already show:
 *   requests → the recruitment view (same as «كل الطلبات»); vacancies → vacancyVisibility_;
 *   candidates / ads / offers / joiners → vacancies with full candidate access (vacancyAccess_ = FULL).
 * No contact details or national IDs in any report; offer amounts only for the pay roles.
 */

var REPORT_TYPES_ = ['REQUESTS', 'VACANCIES', 'CANDIDATES', 'ADS', 'OFFERS', 'JOINERS'];
var REPORT_MAX_ROWS_ = 5000;
var REQ_ST_AR_ = { DRAFT: 'مسودة', IN_APPROVAL: 'عند المديرين', HR_REVIEW: 'مراجعة الموارد البشرية', PENDING_CEO: 'عند الرئيس التنفيذي',
  PENDING_BOARD: 'عند مجلس الإدارة', APPROVED: 'معتمد', RETURNED: 'رجع للتعديل', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };
var AD_ST_AR_ = { DRAFT: 'مسودة', READY: 'جاهز للنشر', PUBLISHED: 'منشور', PAUSED: 'متوقف مؤقتاً', CLOSED: 'مقفول' };
var JOIN_ST_AR_ = { PENDING: 'مستني الاستلام', JOINED: 'استلم العمل', DID_NOT_JOIN: 'ماستلمش' };
var PRIORITY_AR_ = { NORMAL: 'عادي', IMPORTANT: 'مهم', CRITICAL: 'حرج' };

/** The recruitment view: HR, recruitment, CEO, board, viewers (consultants get it through their read rights). */
function reportRoles_() {
  return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.HR_STAFF, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR, ROLE.RECRUITER,
    ROLE.CEO, ROLE.BOARD, ROLE.VIEWER];
}

/** unit id → { id, name } of its sector (walks up the tree; '' above sector level). */
function sectorMap_() {
  var units = {}, out = {};
  all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u; });
  Object.keys(units).forEach(function (id) {
    var u = units[id], seen = {};
    while (u && u.Unit_Type !== 'SECTOR' && u.Parent_Org_Unit_ID && !seen[u.Org_Unit_ID]) { seen[u.Org_Unit_ID] = 1; u = units[u.Parent_Org_Unit_ID]; }
    out[id] = u && u.Unit_Type === 'SECTOR' ? { id: u.Org_Unit_ID, name: u.Name_AR } : { id: '', name: '' };
  });
  return out;
}

/** p = { type, from, to, sector, location, status, export } */
function reportRun_(ctx, p) {
  var type = str_(p.type).toUpperCase();
  if (REPORT_TYPES_.indexOf(type) < 0) throw userError_('تقرير غير معروف.');
  var from = str_(p.from), to = str_(p.to);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw userError_('التاريخ غير صحيح.');
  if (from && to && from > to) throw userError_('تاريخ البداية بعد تاريخ النهاية.');
  var env = { ctx: ctx, sectors: sectorMap_(), names: userNames_(), vacs: {}, access: {} };
  var R = REPORT_BUILDERS_[type](env);

  var all = R.rows, statusCount = {};
  var rows = all.filter(function (r) {
    var d = str_(r._date).slice(0, 10);
    if (from && (!d || d < from)) return false;
    if (to && (!d || d > to)) return false;
    if (str_(p.sector) && r._sector !== str_(p.sector)) return false;
    if (str_(p.location) && (r._locs || [r._loc]).indexOf(str_(p.location)) < 0) return false;
    return true;
  });
  rows.forEach(function (r) { statusCount[r._status] = (statusCount[r._status] || 0) + 1; });   // counts before the status filter
  if (str_(p.status)) rows = rows.filter(function (r) { return r._status === str_(p.status); });
  rows.sort(function (a, b) { return str_(a._date) < str_(b._date) ? 1 : str_(a._date) > str_(b._date) ? -1 : 0; });
  var truncated = rows.length > REPORT_MAX_ROWS_;
  if (truncated) rows = rows.slice(0, REPORT_MAX_ROWS_);

  if (p.export) {
    if (ctx.readOnly) throw userError_('الحساب ده للعرض فقط — التصدير مش متاح.');
    audit_(ctx, { entityType: 'REPORT', entityId: type, action: 'EXPORT',
      newValue: rows.length + ' rows · ' + JSON.stringify({ from: from, to: to, sector: str_(p.sector), location: str_(p.location), status: str_(p.status) }) });
  }

  var secSeen = {}, sectors = [];
  all_('ORG_UNITS').forEach(function (u) {
    if (u.Unit_Type === 'SECTOR' && u.Status === 'Active' && !secSeen[u.Org_Unit_ID]) { secSeen[u.Org_Unit_ID] = 1; sectors.push({ id: u.Org_Unit_ID, name: u.Name_AR }); }
  });
  return {
    type: type, dateLabel: R.dateLabel, columns: R.columns,
    rows: rows.map(function (r) { var o = {}; R.columns.forEach(function (c) { o[c.k] = r[c.k] === undefined || r[c.k] === null ? '' : r[c.k]; }); o._status = r._status; o._link = r._link || ''; return o; }),
    statuses: Object.keys(statusCount).sort().map(function (s) { return { name: s, n: statusCount[s] }; }),
    total: rows.length, truncated: truncated, max: REPORT_MAX_ROWS_,
    sectors: sectors.sort(function (a, b) { return a.name < b.name ? -1 : 1; }),
    locations: all_('LOCATIONS').filter(function (l) { return l.Status !== 'Inactive'; }).map(function (l) { return { id: l.Location_ID, name: l.Name_AR }; }),
    canExport: !ctx.readOnly
  };
}

/* ---------------- helpers shared by the builders ---------------- */

function repVac_(env, id) {
  if (env.vacs[id] === undefined) env.vacs[id] = findOne_('VACANCIES', { Vacancy_ID: id }) || null;
  return env.vacs[id];
}
/** Full candidate access to the vacancy (same rule as the candidate screens). */
function repFull_(env, id) {
  if (env.access[id] === undefined) { var v = repVac_(env, id); env.access[id] = !!v && vacancyAccess_(env.ctx, v) === 'FULL'; }
  return env.access[id];
}
/** Common columns for a row tied to a vacancy. */
function repVacCols_(env, r, v) {
  var t = v ? vacTitle_(v) : { ar: '' }, sec = v ? env.sectors[v.Org_Unit_ID] || { id: '', name: '' } : { id: '', name: '' };
  r.Vacancy_ID = v ? v.Vacancy_ID : '';
  r.job = t.ar; r.location = v ? locName_(v.Location_ID) : ''; r.sector = sec.name;
  r._sector = sec.id; r._loc = v ? v.Location_ID : '';
  return r;
}
function day_(iso) { return str_(iso).slice(0, 10); }
function repPeople_() { var m = {}; all_('PERSONS').forEach(function (x) { m[x.Person_ID] = x.Full_Name; }); return m; }

var REPORT_BUILDERS_ = {
  REQUESTS: function (env) {
    if (!isRecRole_(env.ctx)) throw userError_('التقرير ده لفريق الموارد البشرية والتوظيف والإدارة العليا.');
    var raw = {}, locs = {};
    where_('RECRUITMENT_REQUESTS', function (r) { return r.Version !== '0'; }).forEach(function (r) { raw[r.Request_ID] = r; });
    where_('REQUEST_LINES', function (l) { return l.Status !== 'Deleted'; }).forEach(function (l) { (locs[l.Request_ID] = locs[l.Request_ID] || []).push(l.Location_ID); });
    var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
    var rows = summarizeRequests_(Object.keys(raw).map(function (k) { return raw[k]; })).map(function (s) {
      var r = raw[s.Request_ID], sec = env.sectors[r.Org_Unit_ID] || { id: '', name: '' };
      return { Request_ID: s.Request_ID, status: REQ_ST_AR_[s.Status] || s.Status, job: s.jobTitle, unit: s.unitName, sector: sec.name,
        requester: s.requesterName, requested: s.requestedHC, approved: s.approvedHC, lines: s.locations,
        priority: PRIORITY_AR_[s.HR_Classification || s.Requested_Priority] || '', submitted: day_(s.Submitted_At), decided: day_(r.Decided_At),
        step: s.currentStep, waiting: s.waitingDays,
        _date: s.Submitted_At || s.Created_At, _status: REQ_ST_AR_[s.Status] || s.Status, _sector: sec.id, _locs: locs[s.Request_ID] || [], _link: 'req:' + s.Request_ID };
    });
    return { dateLabel: 'تاريخ الإرسال', rows: rows, columns: [
      { k: 'Request_ID', l: 'رقم الطلب' }, { k: 'status', l: 'الحالة' }, { k: 'job', l: 'الوظيفة' }, { k: 'unit', l: 'الوحدة' }, { k: 'sector', l: 'القطاع' },
      { k: 'requester', l: 'صاحب الطلب' }, { k: 'requested', l: 'العدد المطلوب', n: 1 }, { k: 'approved', l: 'العدد المعتمد', n: 1 }, { k: 'lines', l: 'عدد المواقع', n: 1 },
      { k: 'priority', l: 'الأولوية' }, { k: 'submitted', l: 'تاريخ الإرسال' }, { k: 'decided', l: 'تاريخ القرار' }, { k: 'step', l: 'عند مين دلوقتي' },
      { k: 'waiting', l: 'بقاله (يوم)', n: 1 }] };
  },

  VACANCIES: function (env) {
    var apps = {}; all_('APPLICATIONS').forEach(function (a) { apps[a.Vacancy_ID] = (apps[a.Vacancy_ID] || 0) + 1; });
    var rows = vacanciesList_(env.ctx, { view: 'all' }).rows.map(function (v) {
      var sec = env.sectors[v.Org_Unit_ID] || { id: '', name: '' };
      return { Vacancy_ID: v.Vacancy_ID, Request_ID: v.Request_ID, status: v.statusName, job: v.jobTitle, unit: v.unitName, sector: sec.name,
        location: v.locationName, required: num_(v.Required_HC, 0), joined: num_(v.Joined_HC, 0), remaining: v.remaining, lead: v.leadName,
        started: day_(v.Recruitment_Start_Date), due: day_(v.Required_By_Date), age: v.ageDays === undefined ? '' : v.ageDays,
        applicants: apps[v.Vacancy_ID] || 0, closed: day_(v.Closed_At),
        _date: v.Recruitment_Start_Date || v.Created_At, _status: v.statusName, _sector: sec.id, _loc: v.Location_ID, _link: 'vac:' + v.Vacancy_ID };
    });
    return { dateLabel: 'بداية التوظيف', rows: rows, columns: [
      { k: 'Vacancy_ID', l: 'رقم الشاغر' }, { k: 'Request_ID', l: 'رقم الطلب' }, { k: 'status', l: 'الحالة' }, { k: 'job', l: 'الوظيفة' }, { k: 'unit', l: 'الوحدة' },
      { k: 'sector', l: 'القطاع' }, { k: 'location', l: 'الموقع' }, { k: 'required', l: 'المطلوب', n: 1 }, { k: 'joined', l: 'استلموا', n: 1 },
      { k: 'remaining', l: 'الباقي', n: 1 }, { k: 'lead', l: 'مسؤول التوظيف' }, { k: 'started', l: 'بداية التوظيف' }, { k: 'due', l: 'مطلوب قبل' },
      { k: 'age', l: 'عمره (يوم)', n: 1 }, { k: 'applicants', l: 'المتقدمين', n: 1 }, { k: 'closed', l: 'اتقفل' }] };
  },

  CANDIDATES: function (env) {
    var people = repPeople_(), srcs = sources_();
    var rows = [];
    all_('APPLICATIONS').forEach(function (a) {
      if (!repFull_(env, a.Vacancy_ID)) return;
      var stage = STAGE_AR_[a.Stage] || a.Stage;
      rows.push(repVacCols_(env, { Application_ID: a.Application_ID, name: people[a.Person_ID] || '', source: srcs[a.Source] || a.Source,
        stage: stage, applied: day_(a.Applied_At), stageAt: day_(a.Stage_At), owner: env.names[a.Owner_User_ID] || '', internal: a.Is_Internal === 'Y' ? 'نعم' : '',
        _date: a.Applied_At, _status: stage, _link: 'app:' + a.Application_ID }, repVac_(env, a.Vacancy_ID)));
    });
    return { dateLabel: 'تاريخ التقديم', rows: rows, columns: [
      { k: 'Application_ID', l: 'رقم الطلب' }, { k: 'name', l: 'المرشح' }, { k: 'Vacancy_ID', l: 'الشاغر' }, { k: 'job', l: 'الوظيفة' }, { k: 'location', l: 'الموقع' },
      { k: 'sector', l: 'القطاع' }, { k: 'source', l: 'المصدر' }, { k: 'stage', l: 'المرحلة' }, { k: 'applied', l: 'تاريخ التقديم' },
      { k: 'stageAt', l: 'آخر تغيير' }, { k: 'owner', l: 'المسؤول' }, { k: 'internal', l: 'موظف حالي' }] };
  },

  ADS: function (env) {
    var srcs = sources_(), apps = {};
    all_('APPLICATIONS').forEach(function (a) { if (a.Ad_ID) apps[a.Ad_ID] = (apps[a.Ad_ID] || 0) + 1; });
    var rows = [];
    all_('ADVERTISEMENTS').forEach(function (ad) {
      if (!repFull_(env, ad.Vacancy_ID)) return;
      var st = AD_ST_AR_[ad.Status] || ad.Status;
      rows.push(repVacCols_(env, { Ad_ID: ad.Ad_ID, platform: srcs[ad.Source_Code] || ad.Source_Code, campaign: ad.Campaign, status: st,
        published: day_(ad.Published_At), closes: day_(ad.Closes_On), applicants: apps[ad.Ad_ID] || 0, cost: ad.Cost ? num_(ad.Cost, '') : '',
        _date: ad.Published_At || ad.Created_At, _status: st, _link: 'vac:' + ad.Vacancy_ID }, repVac_(env, ad.Vacancy_ID)));
    });
    return { dateLabel: 'تاريخ النشر', rows: rows, columns: [
      { k: 'Ad_ID', l: 'رقم الإعلان' }, { k: 'Vacancy_ID', l: 'الشاغر' }, { k: 'job', l: 'الوظيفة' }, { k: 'location', l: 'الموقع' }, { k: 'sector', l: 'القطاع' },
      { k: 'platform', l: 'المنصة' }, { k: 'campaign', l: 'الحملة' }, { k: 'status', l: 'الحالة' }, { k: 'published', l: 'اتنشر' },
      { k: 'closes', l: 'بيقفل' }, { k: 'applicants', l: 'المتقدمين منه', n: 1 }, { k: 'cost', l: 'التكلفة', n: 1 }] };
  },

  OFFERS: function (env) {
    var people = repPeople_(), pay = hasAnyRole_(env.ctx, payViewRoles_()), rows = [];
    all_('OFFERS').forEach(function (o) {
      if (o.Status === 'SUPERSEDED' || !repFull_(env, o.Vacancy_ID)) return;
      var st = OFFER_ST_AR_[o.Status] || o.Status, r = { Offer_ID: o.Offer_No || o.Offer_ID, name: people[o.Person_ID] || '', status: st, version: o.Version,
        created: day_(o.Created_At), presented: day_(o.Presented_At), responded: day_(o.Responded_At), validUntil: day_(o.Valid_Until),
        declined: OFFER_DECLINE_AR_[o.Decline_Reason] || '', joining: day_(o.Joining_Date),
        _date: o.Created_At, _status: st, _link: 'app:' + o.Application_ID };
      if (pay) { r.pkg = o.Fixed_Package ? num_(o.Fixed_Package, '') : ''; r.agreed = num_(o.Final_Accepted || o.Agreed_Amount, '') ; }
      rows.push(repVacCols_(env, r, repVac_(env, o.Vacancy_ID)));
    });
    var cols = [{ k: 'Offer_ID', l: 'رقم العرض' }, { k: 'name', l: 'المرشح' }, { k: 'job', l: 'الوظيفة' }, { k: 'location', l: 'الموقع' }, { k: 'sector', l: 'القطاع' },
      { k: 'status', l: 'الحالة' }, { k: 'version', l: 'النسخة' }, { k: 'created', l: 'اتعمل' }, { k: 'presented', l: 'اتقدم' }, { k: 'responded', l: 'الرد' },
      { k: 'validUntil', l: 'صالح لحد' }, { k: 'declined', l: 'سبب الرفض' }, { k: 'joining', l: 'ميعاد الاستلام' }];
    if (pay) cols.push({ k: 'pkg', l: 'الباكدج الثابت', n: 1 }, { k: 'agreed', l: 'المتفق عليه', n: 1 });
    return { dateLabel: 'تاريخ العرض', rows: rows, columns: cols };
  },

  JOINERS: function (env) {
    var people = repPeople_(), docs = {}, day = today_(), rows = [];
    all_('CANDIDATE_DOCS').forEach(function (d) { (docs[d.Joining_ID] = docs[d.Joining_ID] || []).push(d); });
    all_('JOININGS').forEach(function (j) {
      if (!repFull_(env, j.Vacancy_ID)) return;
      var S = docSummary_(docs[j.Joining_ID] || [], day), st = JOIN_ST_AR_[j.Status] || j.Status;
      rows.push(repVacCols_(env, { Joining_ID: j.Joining_ID, name: people[j.Person_ID] || '', status: st, planned: day_(j.Planned_Date),
        joined: day_(j.Joined_Date), employee: j.Employee_ID, docs: S.done + ' / ' + S.required, deferred: S.deferred, overdue: S.overdue,
        dnj: DNJ_REASONS_[j.DNJ_Reason] || '',
        _date: j.Joined_Date || j.Planned_Date || j.Created_At, _status: st, _link: 'app:' + j.Application_ID }, repVac_(env, j.Vacancy_ID)));
    });
    return { dateLabel: 'تاريخ الاستلام', rows: rows, columns: [
      { k: 'Joining_ID', l: 'رقم الاستلام' }, { k: 'name', l: 'الموظف الجديد' }, { k: 'job', l: 'الوظيفة' }, { k: 'location', l: 'الموقع' }, { k: 'sector', l: 'القطاع' },
      { k: 'status', l: 'الحالة' }, { k: 'planned', l: 'الميعاد المتفق' }, { k: 'joined', l: 'استلم يوم' }, { k: 'employee', l: 'كود الموظف' },
      { k: 'docs', l: 'المسوغات' }, { k: 'deferred', l: 'مؤجل', n: 1 }, { k: 'overdue', l: 'متأخر', n: 1 }, { k: 'dnj', l: 'سبب عدم الاستلام' }] };
  }
};

/* ---------------- process map (v0.22.0, blueprint CHG-39) ---------------- */

/**
 * What the process map shows besides its fixed steps: the timing rules as they are set now, and — for the
 * recruitment view only — how many items sit at each step today (counts only, no names).
 */
function processMap_(ctx) {
  var num = function (k, d) { return num_(cfg_(k, d), d); };
  var cfg = {
    APPROVAL_REMIND_DAYS: num('APPROVAL_REMIND_DAYS', 3), APPROVAL_ESCALATE_DAYS: num('APPROVAL_ESCALATE_DAYS', 7),
    APPROVAL_EXPIRE_DAYS: num('APPROVAL_EXPIRE_DAYS', 30), INTERVIEW_CONFIRM_HOURS: num('INTERVIEW_CONFIRM_HOURS', 24),
    EVAL_SLA_HOURS: num('EVAL_SLA_HOURS', 24), OFFER_VALID_DAYS: num('OFFER_VALID_DAYS', 7), DOC_LINK_DAYS: num('DOC_LINK_DAYS', 30),
    PAYROLL_CUTOFF_DAY: num('PAYROLL_CUTOFF_DAY', 25), PAYROLL_ALERT_DAYS: num('PAYROLL_ALERT_DAYS', 7),
    INSURANCE_SUBMIT_DAYS: num('INSURANCE_SUBMIT_DAYS', 7), NHV_DAYS: str_(cfg_('NHV_DAYS', '7,30')), NHV_LINK_DAYS: num('NHV_LINK_DAYS', 14),
    PROBATION_DAYS: probDays_(), PROB_CHECKPOINTS: probCheckpoints_(), PROB_DECISION_DAY: probDecisionDay_(), MEDICAL_ADD_DAYS: num('MEDICAL_ADD_DAYS', 14)
  };
  if (!isRecRole_(ctx)) return { cfg: cfg, counts: null };
  var day = today_(), n = function (t, f) { return where_(t, f).length; };
  var early = ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED'];
  var ivDone = ['COMPLETED', 'EVALUATED', 'MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'RESCHEDULED', 'NO_SHOW', 'MANAGER_NO_SHOW', 'CANCELLED', 'WAIVED'];
  return { cfg: cfg, counts: {
    approve: n('RECRUITMENT_REQUESTS', function (r) { return r.Status === 'IN_APPROVAL' || r.Status === 'PENDING_CEO' || r.Status === 'PENDING_BOARD'; }),
    hr: n('RECRUITMENT_REQUESTS', function (r) { return r.Status === 'HR_REVIEW'; }),
    pcr: n('POSITION_CHANGE_REQUESTS', function (r) { return PCR_OPEN_.indexOf(r.Status) >= 0; }),
    vac: n('VACANCIES', function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; }),
    src: n('ADVERTISEMENTS', function (a) { return a.Status === 'PUBLISHED'; }),
    apply: n('APPLICATIONS', function (a) { return early.indexOf(a.Stage) >= 0; }),
    transfer: n('TRANSFER_REQUESTS', function (t) { return t.Status === 'PENDING' || t.Status === 'APPROVED'; }),
    iv: n('INTERVIEWS', function (i) { return ivDone.indexOf(i.Status) < 0 && str_(i.Date) >= day; }),
    select: n('APPLICATIONS', function (a) { return a.Stage === 'INTERVIEW'; }),
    offer: n('OFFERS', function (o) { return OFFER_LIVE_.indexOf(o.Status) >= 0; }),
    join: n('JOININGS', function (j) { return j.Status === 'PENDING'; }),
    onb: n('ONBOARDINGS', function (o) { return o.Status === 'ACTIVE'; }),
    ins: n('INSURANCE_CASES', function (c) { return c.Status === 'TO_SUBMIT' || c.Status === 'SUBMITTED'; }),
    prob: n('PROBATIONS', function (p) { return p.Status === 'ACTIVE' || p.Status === 'PENDING_DECISION'; }),
    med: n('MEDICAL_CASES', function (c) { return c.Status === 'TO_ADD'; })
  } };
}
