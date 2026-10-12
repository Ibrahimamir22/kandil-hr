/**
 * Kpi.gs — v0.26.0: recruitment KPIs, computed from the portal's own records (nothing typed by hand).
 *
 * Views (p.view):
 *   MINE     — v0.27.0: the signed-in user's own cards (recruiter / recruitment lead / HR site) and his service row — open to everyone.
 *   PROCESS  — the whole recruitment process: speed, quality, efficiency, candidate experience, compliance.
 *   TEAM     — one scorecard per recruiter on the vacancies he leads, the candidates and tasks given to him.
 *   SITE     — one card per HR site specialist: joining documents, onboarding tasks, insurance, medical, new-hire voice.
 *   MANAGERS — service levels of managers, approvers and interview panels (for information; not in the recruiters' score).
 * Each KPI: value, target (KPI_TARGETS), direction, cases (n), status (green ≥ target, amber within 10 %, red beyond),
 * and a 1–5 score on the annual appraisal scale. Fewer than KPI_MIN_CASES cases → "not enough data", left out of the score.
 * Filters: period (month / 3 months / year / from–to), sector, location, job class (from the grade: KPI_JOB_CLASS).
 */

var KPI_CLASS_ = { LABOR: 'عمالة', TECH: 'فنيين', ADMIN: 'إداريين', LEAD: 'قيادات' };
var KPI_DEF_TARGETS_ = {
  APPROVAL_DAYS: 5, TTF_ON_TIME: 80, TTH_DAYS: 21, START_DAYS: 14, AGING: 10,
  PROB_PASS: 85, EARLY_LEAVE: 10, QOH: 3.5, JOIN_RATE: 90, LEAVE_30: 3, LEAVE_180: 15, LEAVE_365: 20,
  OFFER_ACCEPT: 85, IV_PER_OFFER: 4, REFERRAL_SHARE: 20,
  FIRST_CONTACT: 90, CLOSE_MSG: 100, NHV_AVG: 4, NO_SHOW: 15,
  DOCS_COMPLETE: 90, INS_ON_TIME: 100, MED_ON_TIME: 100, HC_OVER: 0,
  TASKS_ON_TIME: 90, SCREEN_PASS: 40, ASSIGN_DAYS: 1, OFFER_APPROVE_ON_TIME: 90,
  ONB_ON_TIME: 90, NHV_FOLLOW: 100, GOALS_WEEK1: 90,
  MGR_APPROVAL_DAYS: 2, MGR_ESCALATED: 10, EVAL_ON_TIME: 90, PROB_REVIEW_ON_TIME: 90, MGR_SAT: 4
};
/** [code, name, unit, direction (+1 higher is better / −1 lower is better)] */
var KPI_META_ = {
  APPROVAL_DAYS: ['مدة اعتماد الطلب', 'يوم', -1], TTF_ON_TIME: ['شواغر اتشغلت في ميعادها', '%', 1], TTH_DAYS: ['مدة التعيين (من التقديم لقبول العرض)', 'يوم', -1],
  START_DAYS: ['مدة الاستلام (من قبول العرض لأول يوم)', 'يوم', -1], AGING: ['شواغر متأخرة (فوق 60 يوم أو فات ميعادها)', '%', -1],
  PROB_PASS: ['نسبة التثبيت', '%', 1], EARLY_LEAVE: ['الترك خلال 90 يوم', '%', -1], LEAVE_30: ['الترك خلال 30 يوم', '%', -1],
  LEAVE_180: ['الترك خلال 180 يوم', '%', -1], LEAVE_365: ['الترك خلال سنة', '%', -1], QOH: ['جودة التعيين (متوسط التقييم النهائي)', 'من 5', 1],
  JOIN_RATE: ['نسبة الاستلام بعد قبول العرض', '%', 1], OFFER_ACCEPT: ['نسبة قبول العروض', '%', 1], IV_PER_OFFER: ['مقابلات لكل عرض', 'مقابلة', -1],
  COST_PER_HIRE: ['تكلفة التعيين (اشتراكات ÷ تعيينات)', 'ج.م', 0], REFERRAL_SHARE: ['تعيينات من ترشيح موظفين', '%', 1],
  FIRST_CONTACT: ['أول تواصل خلال 3 أيام', '%', 1], CLOSE_MSG: ['المرشحين المقفولين اللي وصلهم رد', '%', 1], NHV_AVG: ['رضا الموظف الجديد', 'من 5', 1],
  NO_SHOW: ['غياب المرشحين عن المقابلات', '%', -1], DOCS_COMPLETE: ['المسوغات كاملة قبل الاستلام', '%', 1], INS_ON_TIME: ['التأمينات اتقدمت في ميعادها', '%', 1],
  MED_ON_TIME: ['التأمين الطبي في ميعاده', '%', 1], HC_OVER: ['تعيينات فوق العدد المعتمد', 'عرض', -1],
  TASKS_ON_TIME: ['المهام المسندة مش متأخرة', '%', 1], SCREEN_PASS: ['جودة الفرز (اتقبلوا بعد المقابلة)', '%', 1], ASSIGN_DAYS: ['سرعة توزيع الشواغر', 'يوم', -1],
  OFFER_APPROVE_ON_TIME: ['موافقات العروض خلال يوم', '%', 1], ONB_ON_TIME: ['مهام التهيئة في ميعادها', '%', 1], NHV_FOLLOW: ['متابعة التقييم المنخفض خلال 3 أيام', '%', 1],
  GOALS_WEEK1: ['أهداف فترة الاختبار في أول أسبوع', '%', 1], MGR_APPROVAL_DAYS: ['مدة الاعتماد', 'يوم', -1], MGR_ESCALATED: ['اعتمادات اتصعّدت', '%', -1],
  EVAL_ON_TIME: ['تقييم المقابلة خلال 24 ساعة', '%', 1], PROB_REVIEW_ON_TIME: ['متابعات فترة الاختبار في ميعادها', '%', 1], MGR_SAT: ['رضا المدير عن التعيين', 'من 5', 1]
};
var KPI_GROUPS_ = [['SPEED', 'السرعة', ['APPROVAL_DAYS', 'TTF_ON_TIME', 'TTH_DAYS', 'START_DAYS', 'AGING']],
  ['QUALITY', 'الجودة', ['PROB_PASS', 'LEAVE_30', 'EARLY_LEAVE', 'LEAVE_180', 'LEAVE_365', 'QOH', 'JOIN_RATE', 'MGR_SAT']],
  ['EFFICIENCY', 'الكفاءة والتكلفة', ['OFFER_ACCEPT', 'IV_PER_OFFER', 'COST_PER_HIRE', 'REFERRAL_SHARE']],
  ['EXPERIENCE', 'تجربة المرشح والموظف الجديد', ['FIRST_CONTACT', 'CLOSE_MSG', 'NHV_AVG', 'NO_SHOW']],
  ['COMPLIANCE', 'الالتزام', ['DOCS_COMPLETE', 'INS_ON_TIME', 'MED_ON_TIME', 'HC_OVER']]];
var KPI_W_RECRUITER_ = { TTF_ON_TIME: 25, PROB_PASS: 25, TASKS_ON_TIME: 15, FIRST_CONTACT: 10, SCREEN_PASS: 10, OFFER_ACCEPT: 10, CLOSE_MSG: 5 };
var KPI_W_SITE_ = { ONB_ON_TIME: 25, DOCS_COMPLETE: 20, INS_ON_TIME: 20, MED_ON_TIME: 15, NHV_FOLLOW: 10, GOALS_WEEK1: 10 };
var KPI_W_LEAD_ = { TTF_ON_TIME: 25, PROB_PASS: 25, AGING: 15, ASSIGN_DAYS: 10, OFFER_APPROVE_ON_TIME: 10, COST_PER_HIRE: 0, MGR_SAT: 5, EARLY_LEAVE: 10 };

function kpiRoles_() { return reportRoles_(); }
function kpiAllRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR, ROLE.CEO, ROLE.BOARD]; }
function kpiJson_(key, dflt) { try { var v = JSON.parse(str_(cfg_(key, '')) || 'null'); return v && typeof v === 'object' ? v : dflt; } catch (e) { return dflt; } }
function kpiTargets_() { var t = kpiJson_('KPI_TARGETS', {}), out = {}; Object.keys(KPI_DEF_TARGETS_).forEach(function (k) { out[k] = t[k] !== undefined ? num_(t[k], KPI_DEF_TARGETS_[k]) : KPI_DEF_TARGETS_[k]; }); return out; }
function kpiTtf_() { var t = kpiJson_('KPI_TTF_TARGETS', {}); return { LABOR: num_(t.LABOR, 21), TECH: num_(t.TECH, 30), ADMIN: num_(t.ADMIN, 45), LEAD: num_(t.LEAD, 60) }; }
function kpiWeights_(key, dflt) { var w = kpiJson_(key, null); return w || dflt; }

/** Job class of a job: KPI_JOB_CLASS {grade: class} first, else by the grade number (≤4 labour, 5–6 technical, 7–8 admin, 9+ leaders). */
function kpiClassOf_(jobCode, cache) {
  if (cache[jobCode] !== undefined) return cache[jobCode];
  var j = jobCode ? get_('JOBS', jobCode) : null, g = j ? str_(j.Grade_Code) : '', map = cache.__map || (cache.__map = kpiJson_('KPI_JOB_CLASS', {}));
  var c = map[g] && KPI_CLASS_[map[g]] ? map[g] : '';
  if (!c) { var n = parseInt(g, 10); c = isNaN(n) ? 'ADMIN' : n <= 4 ? 'LABOR' : n <= 6 ? 'TECH' : n <= 8 ? 'ADMIN' : 'LEAD'; }
  return (cache[jobCode] = c);
}

/* ---------------- period and filters ---------------- */

function kpiPeriod_(p) {
  var t = today_(), per = str_(p.period) || 'month', from, to = t;
  if (per === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(str_(p.from)) && /^\d{4}-\d{2}-\d{2}$/.test(str_(p.to))) { from = str_(p.from); to = str_(p.to); }
  else if (per === '3m') from = addDaysYmd_(t, -90);
  else if (per === 'year') from = t.slice(0, 4) + '-01-01';
  else { per = 'month'; from = t.slice(0, 8) + '01'; }
  if (from > to) throw userError_('بداية الفترة بعد نهايتها.');
  return { period: per, from: from, to: to };
}
function kpiIn_(d, P) { var x = str_(d).slice(0, 10); return !!x && x >= P.from && x <= P.to; }
function kpiDays_(a, b) { a = str_(a).slice(0, 10); b = str_(b).slice(0, 10); return a && b ? daysBetween_(a, b) : null; }
/** A duration for an average: dates out of order (a data slip) are left out rather than pull the average below zero. */
function kpiDur_(a, b) { var d = kpiDays_(a, b); return d === null || d < 0 ? null : d; }

/** The filter on a vacancy: sector, location, job class. */
function kpiVacFilter_(p) {
  var sec = sectorMap_(), cache = {}, s = str_(p.sector), l = str_(p.location), c = str_(p.cls);
  return function (v) {
    if (!v) return !s && !l && !c;
    if (s && (sec[v.Org_Unit_ID] || {}).id !== s) return false;
    if (l && v.Location_ID !== l) return false;
    if (c && kpiClassOf_(v.Job_Code, cache) !== c) return false;
    return true;
  };
}

/* ---------------- one KPI ---------------- */

function kpiMake_(code, value, n, T, cases) {
  var m = KPI_META_[code], target = T[code], min = num_(cfg_('KPI_MIN_CASES', 3), 3);
  var out = { code: code, name: m[0], unit: m[1], dir: m[2], value: value === null || isNaN(value) ? null : Math.round(value * 10) / 10, n: n,
    target: target === undefined ? null : target, status: 'NA', score: null, cases: (cases || []).slice(0, 60) };
  if (out.value === null || n < min || !m[2] || out.target === null) { if (n < min && out.value !== null) out.status = 'FEW'; return out; }
  var ratio;
  if (m[2] > 0) ratio = out.target ? out.value / out.target : (out.value > 0 ? 2 : 1);
  else ratio = out.value === 0 ? 2 : out.target === 0 ? 0 : out.target / out.value;
  out.status = ratio >= 1 ? 'OK' : ratio >= 0.9 ? 'WARN' : 'BAD';
  out.score = ratio >= 1.2 ? 5 : ratio >= 1.05 ? 4 : ratio >= 0.95 ? 3 : ratio >= 0.8 ? 2 : 1;
  return out;
}
function kpiPct_(ok, n) { return n ? ok / n * 100 : null; }
function kpiAvg_(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
/** Weighted score of a card (only KPIs that have a score). */
function kpiCardScore_(kpis, w) {
  var sum = 0, ws = 0;
  kpis.forEach(function (k) { var x = num_(w[k.code], 0); if (x && k.score !== null) { sum += k.score * x; ws += x; } });
  return ws ? Math.round(sum / ws * 10) / 10 : null;
}

/* ---------------- the data, once per call ---------------- */

function kpiData_() {
  var D = { vac: {}, apps: {}, offersByApp: {}, accByVac: {}, joinByApp: {}, prob: {}, revByProb: {}, names: userNames_() };
  all_('VACANCIES').forEach(function (v) { D.vac[v.Vacancy_ID] = v; });
  all_('APPLICATIONS').forEach(function (a) { D.apps[a.Application_ID] = a; });
  all_('OFFERS').forEach(function (o) { (D.offersByApp[o.Application_ID] = D.offersByApp[o.Application_ID] || []).push(o); });
  Object.keys(D.offersByApp).forEach(function (k) {
    D.offersByApp[k].forEach(function (o) {
      if (o.Status === 'ACCEPTED') { var cur = D.accByVac[o.Vacancy_ID]; if (!cur || o.Responded_At < cur.Responded_At) D.accByVac[o.Vacancy_ID] = o; }
    });
  });
  D.join = {}; all_('JOININGS').forEach(function (j) { D.joinByApp[j.Application_ID] = j; D.join[j.Joining_ID] = j; });
  all_('PROBATIONS').forEach(function (p) { D.prob[p.Probation_ID] = p; });
  all_('PROB_REVIEWS').forEach(function (r) { (D.revByProb[r.Probation_ID] = D.revByProb[r.Probation_ID] || {})[r.Kind] = r; });
  D.probByJoin = {}; all_('PROBATIONS').forEach(function (p) { if (p.Joining_ID) D.probByJoin[p.Joining_ID] = p; });
  D.firstAct = {};
  all_('ACTIVITIES').forEach(function (a) {
    if (a.Status === 'Voided' || !a.Created_By || a.Created_By === 'PUBLIC' || a.Created_By === 'SYSTEM') return;
    var cur = D.firstAct[a.Application_ID]; if (!cur || a.Created_At < cur) D.firstAct[a.Application_ID] = a.Created_At;
  });
  return D;
}
function kpiAccepted_(D, appId) { return (D.offersByApp[appId] || []).filter(function (o) { return o.Status === 'ACCEPTED'; })[0] || null; }
function kpiCase_(D, appId, extra) {
  var a = D.apps[appId] || {}, per = a.Person_ID ? get_('PERSONS', a.Person_ID) : null, v = D.vac[a.Vacancy_ID] || {};
  var j = v.Job_Code ? get_('JOBS', v.Job_Code) : null;
  return { id: appId, name: per ? per.Full_Name : '', job: j ? j.Job_Title_AR : '', note: extra || '' };
}

/* ---------------- KPIs on a set of vacancies (the process, or one recruiter) ---------------- */

/** vf(v) = vacancy in scope; who = '' (everyone) or a recruiter's User_ID. */
function kpiSet_(D, P, T, vf, who) {
  var out = {}, t = today_(), ttf = kpiTtf_(), cache = {};
  var inVac = function (vid) { var v = D.vac[vid]; return !!v && vf(v) && (!who || v.Lead_Recruiter_ID === who); };
  var apps = Object.keys(D.apps).map(function (k) { return D.apps[k]; }).filter(function (a) { return inVac(a.Vacancy_ID); });

  // speed
  if (!who) {
    var rq = where_('RECRUITMENT_REQUESTS', function (r) { return (r.Status === 'APPROVED' || r.Status === 'CLOSED') && kpiIn_(r.Decided_At, P) && r.Submitted_At; }), d1 = [];
    rq.forEach(function (r) { var d = kpiDur_(r.Submitted_At, r.Decided_At); if (d !== null) d1.push(d); });
    out.APPROVAL_DAYS = kpiMake_('APPROVAL_DAYS', kpiAvg_(d1), d1.length, T, rq.map(function (r) { return { id: r.Request_ID, name: r.Request_ID, note: kpiDays_(r.Submitted_At, r.Decided_At) + ' يوم' }; }));
  }
  var filled = Object.keys(D.accByVac).filter(function (vid) { return inVac(vid) && kpiIn_(D.accByVac[vid].Responded_At, P); });
  var onTime = 0, fc = [];
  filled.forEach(function (vid) {
    var v = D.vac[vid], o = D.accByVac[vid], d = kpiDays_(v.Recruitment_Start_Date || v.Created_At, o.Responded_At), lim = ttf[kpiClassOf_(v.Job_Code, cache)];
    if (d !== null && d <= lim) onTime++;
    fc.push({ id: vid, name: vid, note: d + ' يوم (الهدف ' + lim + ')' });
  });
  out.TTF_ON_TIME = kpiMake_('TTF_ON_TIME', kpiPct_(onTime, filled.length), filled.length, T, fc);
  var acc = apps.map(function (a) { return { a: a, o: kpiAccepted_(D, a.Application_ID) }; }).filter(function (x) { return x.o && kpiIn_(x.o.Responded_At, P); });
  var d3 = acc.map(function (x) { return kpiDur_(x.a.Applied_At || x.a.Created_At, x.o.Responded_At); }).filter(function (d) { return d !== null; });
  out.TTH_DAYS = kpiMake_('TTH_DAYS', kpiAvg_(d3), d3.length, T, acc.map(function (x) { return kpiCase_(D, x.a.Application_ID, kpiDays_(x.a.Applied_At || x.a.Created_At, x.o.Responded_At) + ' يوم'); }));
  var joined = apps.map(function (a) { return D.joinByApp[a.Application_ID]; }).filter(function (j) { return j && j.Status === 'JOINED' && kpiIn_(j.Joined_Date, P); });
  var d4 = [];
  joined.forEach(function (j) { var o = j.Offer_ID ? get_('OFFERS', j.Offer_ID) : kpiAccepted_(D, j.Application_ID); var d = o ? kpiDur_(o.Responded_At, j.Joined_Date) : null; if (d !== null) d4.push(d); });
  out.START_DAYS = kpiMake_('START_DAYS', kpiAvg_(d4), d4.length, T);
  var open = Object.keys(D.vac).map(function (k) { return D.vac[k]; }).filter(function (v) { return inVac(v.Vacancy_ID) && VAC_OPEN_.indexOf(v.Status) >= 0; });
  var aged = open.filter(function (v) { var d = kpiDays_(v.Recruitment_Start_Date || v.Created_At, t); return d > 60 || (v.Required_By_Date && v.Required_By_Date < t); });
  out.AGING = kpiMake_('AGING', kpiPct_(aged.length, open.length), open.length, T, aged.map(function (v) { return { id: v.Vacancy_ID, name: v.Vacancy_ID, note: 'مفتوح من ' + str_(v.Recruitment_Start_Date || v.Created_At).slice(0, 10) }; }));

  // quality
  var probs = Object.keys(D.prob).map(function (k) { return D.prob[k]; }).filter(function (p) {
    var j = p.Joining_ID ? D.join[p.Joining_ID] : null;
    return j ? inVac(j.Vacancy_ID) : (!who && vf === kpiAll_);
  });
  var dec = probs.filter(function (p) { return (p.Status === 'CONFIRMED' || p.Status === 'TERMINATED') && kpiIn_(p.Decision_At, P); });
  out.PROB_PASS = kpiMake_('PROB_PASS', kpiPct_(dec.filter(function (p) { return p.Status === 'CONFIRMED'; }).length, dec.length), dec.length, T,
    dec.map(function (p) { return { id: p.Probation_ID, name: p.Full_Name, note: p.Status === 'CONFIRMED' ? 'اتثبت' : 'عدم تثبيت' }; }));
  var early = joined.filter(function (j) {
    var e = j.Employee_ID ? get_('EMPLOYEES', j.Employee_ID) : null, p = D.probByJoin[j.Joining_ID];
    return (e && e.Exit_Date && kpiDays_(j.Joined_Date, e.Exit_Date) <= 90) || (p && (p.Status === 'TERMINATED' || (p.Status === 'ENDED' && e && e.Exit_Date)));
  });
  out.EARLY_LEAVE = kpiMake_('EARLY_LEAVE', kpiPct_(early.length, joined.length), joined.length, T, early.map(function (j) { return kpiCase_(D, j.Application_ID, 'ساب خلال 90 يوم'); }));
  // v0.41.0 (CHG-86): leaving within 30 / 180 / 365 days — of the people whose 30 / 180 / 365th day fell in the period,
  // how many had already left (a cohort that has not reached the day yet is not counted)
  var everJoined = apps.map(function (a) { return D.joinByApp[a.Application_ID]; }).filter(function (j) { return j && j.Status === 'JOINED' && /^\d{4}-\d{2}-\d{2}/.test(str_(j.Joined_Date)); });
  [30, 180, 365].forEach(function (n) {
    var cohort = everJoined.filter(function (j) { var end = addDaysYmd_(str_(j.Joined_Date).slice(0, 10), n); return end <= t && kpiIn_(end, P); });
    var left = cohort.filter(function (j) { var e = j.Employee_ID ? get_('EMPLOYEES', j.Employee_ID) : null; var d = e && e.Exit_Date ? kpiDays_(j.Joined_Date, e.Exit_Date) : null; return d !== null && d <= n; });
    out['LEAVE_' + n] = kpiMake_('LEAVE_' + n, kpiPct_(left.length, cohort.length), cohort.length, T, left.map(function (j) {
      var e = get_('EMPLOYEES', j.Employee_ID); return kpiCase_(D, j.Application_ID, 'ساب بعد ' + kpiDays_(j.Joined_Date, e.Exit_Date) + ' يوم'); }));
  });
  var fins = probs.map(function (p) { return (D.revByProb[p.Probation_ID] || {}).FINAL; }).filter(function (r) { return r && r.Status === 'DONE' && kpiIn_(r.Done_At, P); });
  out.QOH = kpiMake_('QOH', kpiAvg_(fins.map(function (r) { return num_(r.Weighted, 0); })), fins.length, T);
  var closedJ = apps.map(function (a) { return D.joinByApp[a.Application_ID]; }).filter(function (j) { return j && (j.Status === 'JOINED' || j.Status === 'DID_NOT_JOIN') && kpiIn_(j.Closed_At || j.Joined_Date, P); });
  out.JOIN_RATE = kpiMake_('JOIN_RATE', kpiPct_(closedJ.filter(function (j) { return j.Status === 'JOINED'; }).length, closedJ.length), closedJ.length, T,
    closedJ.filter(function (j) { return j.Status !== 'JOINED'; }).map(function (j) { return kpiCase_(D, j.Application_ID, 'ماستلمش'); }));
  var sats = probs.map(function (p) { return (D.revByProb[p.Probation_ID] || {}).MGR_SAT; }).filter(function (r) { return r && r.Status === 'DONE' && kpiIn_(r.Done_At, P); });
  out.MGR_SAT = kpiMake_('MGR_SAT', kpiAvg_(sats.map(function (r) { return num_(r.Overall, 0); })), sats.length, T);

  // efficiency
  var resp = [];
  apps.forEach(function (a) { (D.offersByApp[a.Application_ID] || []).forEach(function (o) { if ((o.Status === 'ACCEPTED' || o.Status === 'DECLINED') && kpiIn_(o.Responded_At, P)) resp.push(o); }); });
  out.OFFER_ACCEPT = kpiMake_('OFFER_ACCEPT', kpiPct_(resp.filter(function (o) { return o.Status === 'ACCEPTED'; }).length, resp.length), resp.length, T,
    resp.filter(function (o) { return o.Status === 'DECLINED'; }).map(function (o) { return kpiCase_(D, o.Application_ID, 'رفض العرض'); }));
  var ivDone = where_('INTERVIEWS', function (i) { return inVac(i.Vacancy_ID) && ['COMPLETED', 'EVALUATED'].indexOf(i.Status) >= 0 && kpiIn_(i.Completed_At || i.Date, P); }).length;
  var presented = 0; apps.forEach(function (a) { (D.offersByApp[a.Application_ID] || []).forEach(function (o) { if (kpiIn_(o.Presented_At, P)) presented++; }); });
  out.IV_PER_OFFER = kpiMake_('IV_PER_OFFER', presented ? ivDone / presented : null, presented, T);
  if (!who) {
    var cost = where_('SOURCE_SUBSCRIPTIONS', function (s) { return kpiIn_(s.Start_Date, P); }).reduce(function (s, x) { return s + num_(x.Cost, 0); }, 0);
    out.COST_PER_HIRE = kpiMake_('COST_PER_HIRE', joined.length ? cost / joined.length : null, joined.length, T);
  }
  var refApps = {}; all_('REFERRALS').forEach(function (r) { if (r.Status !== 'Voided') refApps[r.Application_ID] = 1; });
  out.REFERRAL_SHARE = kpiMake_('REFERRAL_SHARE', kpiPct_(joined.filter(function (j) { return refApps[j.Application_ID] || (D.apps[j.Application_ID] || {}).Source === 'REFERRAL'; }).length, joined.length), joined.length, T);

  // candidate experience
  var newApps = apps.filter(function (a) { return kpiIn_(a.Applied_At || a.Created_At, P); }), fast = 0, slow = [];
  newApps.forEach(function (a) {
    var f = D.firstAct[a.Application_ID] || (a.Stage !== 'NEW' ? a.Stage_At : ''), d = f ? kpiDays_(a.Applied_At || a.Created_At, f) : kpiDays_(a.Applied_At || a.Created_At, t);
    if (f && d <= 3) fast++; else if (d > 3) slow.push(kpiCase_(D, a.Application_ID, f ? d + ' يوم' : 'لسه محدش كلمه'));
  });
  out.FIRST_CONTACT = kpiMake_('FIRST_CONTACT', kpiPct_(fast, newApps.length), newApps.length, T, slow);
  var closed = apps.filter(function (a) { return a.Stage === 'REJECTED' && kpiIn_(a.Stage_At, P); });
  var noMsg = closed.filter(function (a) { return !a.Reject_Msg_Status || a.Reject_Msg_Status === 'PENDING'; });
  out.CLOSE_MSG = kpiMake_('CLOSE_MSG', kpiPct_(closed.length - noMsg.length, closed.length), closed.length, T, noMsg.map(function (a) { return kpiCase_(D, a.Application_ID, 'ماوصلوش رد'); }));
  if (!who) {
    var jIds = {}; joined.forEach(function (j) { jIds[j.Joining_ID] = 1; });
    var nhv = where_('NHV_SURVEYS', function (s) { return s.Status === 'ANSWERED' && kpiIn_(s.Answered_At, P) && (vf === kpiAll_ || jIds[s.Joining_ID] || kpiJoinInScope_(s.Joining_ID, inVac)); });
    out.NHV_AVG = kpiMake_('NHV_AVG', nhv.length >= surveyMin_() ? kpiAvg_(nhv.map(function (s) { return num_(s.Avg_Score, 0); })) : null, nhv.length, T);   // v0.38.0: hidden below 5 answers
  }
  var ivs = where_('INTERVIEWS', function (i) { return inVac(i.Vacancy_ID) && kpiIn_(i.Date, P) && i.Date <= t && ['CANCELLED', 'WAIVED', 'RESCHEDULED'].indexOf(i.Status) < 0; });
  var ns = ivs.filter(function (i) { return i.Status === 'NO_SHOW'; });
  out.NO_SHOW = kpiMake_('NO_SHOW', kpiPct_(ns.length, ivs.length), ivs.length, T, ns.map(function (i) { return kpiCase_(D, i.Application_ID, 'ماحضرش ' + i.Date); }));

  // compliance
  var docsOk = joined.filter(function (j) { return j.Receipt_At && str_(j.Receipt_At).slice(0, 10) <= j.Joined_Date; });
  out.DOCS_COMPLETE = kpiMake_('DOCS_COMPLETE', kpiPct_(docsOk.length, joined.length), joined.length, T,
    joined.filter(function (j) { return docsOk.indexOf(j) < 0; }).map(function (j) { return kpiCase_(D, j.Application_ID, 'استلم والمسوغات ناقصة'); }));
  if (!who) {
    var jset = {}; joined.forEach(function (j) { jset[j.Joining_ID] = 1; });
    var ins = where_('INSURANCE_CASES', function (c) { return c.Due_Date && kpiIn_(c.Due_Date, P) && c.Due_Date <= t && c.Status !== 'NOT_INSURED' && (vf === kpiAll_ || kpiJoinInScope_(c.Joining_ID, inVac)); });
    var insLate = ins.filter(function (c) { return !c.Submitted_At || c.Submitted_At > c.Due_Date; });
    out.INS_ON_TIME = kpiMake_('INS_ON_TIME', kpiPct_(ins.length - insLate.length, ins.length), ins.length, T, insLate.map(function (c) { return { id: c.Case_ID, name: c.Full_Name, note: 'كان قبل ' + c.Due_Date }; }));
    var med = where_('MEDICAL_CASES', function (c) { return c.Due_Date && kpiIn_(c.Due_Date, P) && c.Due_Date <= t && c.Status !== 'NOT_ELIGIBLE' && (vf === kpiAll_ || kpiProbInScope_(D, c.Probation_ID, inVac)); });
    var medLate = med.filter(function (c) { return !c.Added_On || c.Added_On > c.Due_Date; });
    out.MED_ON_TIME = kpiMake_('MED_ON_TIME', kpiPct_(med.length - medLate.length, med.length), med.length, T, medLate.map(function (c) { return { id: c.Case_ID, name: c.Full_Name, note: 'كان قبل ' + c.Due_Date }; }));
  }
  var offs = []; apps.forEach(function (a) { (D.offersByApp[a.Application_ID] || []).forEach(function (o) { if (kpiIn_(o.Submitted_At || o.Created_At, P)) offs.push(o); }); });
  var over = offs.filter(function (o) { return str_(o.HC_Override) === 'Y'; });
  out.HC_OVER = kpiMake_('HC_OVER', over.length, Math.max(offs.length, num_(cfg_('KPI_MIN_CASES', 3), 3)), T, over.map(function (o) { return kpiCase_(D, o.Application_ID, 'فوق العدد'); }));
  return out;
}
function kpiAll_() { return true; }
function kpiJoinInScope_(joinId, inVac) { var j = joinId ? findOne_('JOININGS', { Joining_ID: joinId }) : null; return !!(j && inVac(j.Vacancy_ID)); }
function kpiProbInScope_(D, probId, inVac) { var p = D.prob[probId]; return !!(p && p.Joining_ID && kpiJoinInScope_(p.Joining_ID, inVac)); }

/* ---------------- recruiter-only KPIs ---------------- */

function kpiRecruiter_(D, P, T, vf, u) {
  var k = kpiSet_(D, P, T, vf, u), t = today_();
  var mine = Object.keys(D.apps).map(function (x) { return D.apps[x]; }).filter(function (a) { return a.Next_Action_Owner === u && a.Next_Action_Date && ['REJECTED', 'WITHDRAWN', 'JOINED'].indexOf(a.Stage) < 0; });
  var late = mine.filter(function (a) { return a.Next_Action_Date < t; });
  k.TASKS_ON_TIME = kpiMake_('TASKS_ON_TIME', kpiPct_(mine.length - late.length, mine.length), mine.length, T, late.map(function (a) { return kpiCase_(D, a.Application_ID, 'كان ' + a.Next_Action_Date); }));
  var ivApps = {};
  where_('INTERVIEWS', function (i) { var v = D.vac[i.Vacancy_ID]; return v && v.Lead_Recruiter_ID === u && vf(v) && ['COMPLETED', 'EVALUATED'].indexOf(i.Status) >= 0 && kpiIn_(i.Completed_At || i.Date, P); })
    .forEach(function (i) { ivApps[i.Application_ID] = 1; });
  var ids = Object.keys(ivApps), passed = ids.filter(function (id) { var a = D.apps[id]; return a && ['OFFER', 'ACCEPTED', 'JOINED'].indexOf(a.Stage) >= 0 || where_('SELECTIONS', function (s) { return s.Application_ID === id && s.Status === 'Current' && s.Decision === 'SELECTED'; }).length; });
  k.SCREEN_PASS = kpiMake_('SCREEN_PASS', kpiPct_(passed.length, ids.length), ids.length, T);
  var vacs = Object.keys(D.vac).map(function (x) { return D.vac[x]; }).filter(function (v) { return v.Lead_Recruiter_ID === u && vf(v); });
  var openV = vacs.filter(function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; });
  var active = Object.keys(D.apps).filter(function (x) { var a = D.apps[x], v = D.vac[a.Vacancy_ID]; return v && v.Lead_Recruiter_ID === u && vf(v) && ['REJECTED', 'WITHDRAWN', 'JOINED'].indexOf(a.Stage) < 0; }).length;
  var w = kpiWeights_('KPI_WEIGHTS_RECRUITER', KPI_W_RECRUITER_), list = Object.keys(w).map(function (c) { return k[c]; }).filter(Boolean);
  return { user: u, name: D.names[u] || u, kpis: list, score: kpiCardScore_(list, w), weights: w, workload: { open: openV.length, active: active, all: vacs.length } };
}

/* ---------------- HR site specialist ---------------- */

function kpiSite_(D, P, T, u) {
  var t = today_(), locs = {};
  all_('LOCATIONS').forEach(function (l) { if (l.HR_Site_User_ID === u) locs[l.Location_ID] = 1; });
  var inLoc = function (vid) { var v = D.vac[vid]; return !!v && !!locs[v.Location_ID]; };
  var k = {};
  var tasks = where_('ONB_TASKS', function (x) { return x.Owner_User_ID === u && x.Due_Date && kpiIn_(x.Due_Date, P) && x.Due_Date <= t && x.Status !== 'CANCELLED'; });
  var tl = tasks.filter(function (x) { return x.Status !== 'DONE' && x.Status !== 'SKIPPED' || (x.Done_At && str_(x.Done_At).slice(0, 10) > x.Due_Date); });
  k.ONB_ON_TIME = kpiMake_('ONB_ON_TIME', kpiPct_(tasks.length - tl.length, tasks.length), tasks.length, T, tl.map(function (x) { return { id: x.Task_ID, name: x.Title, note: 'كانت ' + x.Due_Date }; }));
  var joined = where_('JOININGS', function (j) { return j.Status === 'JOINED' && kpiIn_(j.Joined_Date, P) && inLoc(j.Vacancy_ID); });
  var ok = joined.filter(function (j) { return j.Receipt_At && str_(j.Receipt_At).slice(0, 10) <= j.Joined_Date; });
  k.DOCS_COMPLETE = kpiMake_('DOCS_COMPLETE', kpiPct_(ok.length, joined.length), joined.length, T);
  var ins = where_('INSURANCE_CASES', function (c) { return !!locs[c.Location_ID] && c.Due_Date && kpiIn_(c.Due_Date, P) && c.Due_Date <= t && c.Status !== 'NOT_INSURED'; });
  var il = ins.filter(function (c) { return !c.Submitted_At || c.Submitted_At > c.Due_Date; });
  k.INS_ON_TIME = kpiMake_('INS_ON_TIME', kpiPct_(ins.length - il.length, ins.length), ins.length, T, il.map(function (c) { return { id: c.Case_ID, name: c.Full_Name, note: 'كان قبل ' + c.Due_Date }; }));
  var med = where_('MEDICAL_CASES', function (c) { return (c.Owner_User_ID === u || locs[c.Location_ID]) && c.Due_Date && kpiIn_(c.Due_Date, P) && c.Due_Date <= t && c.Status !== 'NOT_ELIGIBLE'; });
  var ml = med.filter(function (c) { return !c.Added_On || c.Added_On > c.Due_Date; });
  k.MED_ON_TIME = kpiMake_('MED_ON_TIME', kpiPct_(med.length - ml.length, med.length), med.length, T);
  var alert = num_(cfg_('NHV_ALERT_SCORE', 2), 2), lows = where_('NHV_SURVEYS', function (s) { return s.Status === 'ANSWERED' && kpiIn_(s.Answered_At, P) && num_(s.Min_Score, 5) <= alert && nhvSiteOf_(s) === u; });
  var fol = lows.filter(function (s) { return s.Reviewed_At && kpiDays_(s.Answered_At, s.Reviewed_At) <= 3; });
  k.NHV_FOLLOW = kpiMake_('NHV_FOLLOW', kpiPct_(fol.length, lows.length), lows.length, T);
  var probs = Object.keys(D.prob).map(function (x) { return D.prob[x]; }).filter(function (p) { return p.HR_Site_User_ID === u && kpiIn_(p.Start_Date, P) && addDaysYmd_(p.Start_Date, 7) <= t; });
  var g = probs.filter(function (p) { return p.Goals_Set_At && str_(p.Goals_Set_At).slice(0, 10) <= addDaysYmd_(p.Start_Date, 7); });
  k.GOALS_WEEK1 = kpiMake_('GOALS_WEEK1', kpiPct_(g.length, probs.length), probs.length, T);
  var w = kpiWeights_('KPI_WEIGHTS_SITE', KPI_W_SITE_), list = Object.keys(w).map(function (c) { return k[c]; }).filter(Boolean);
  return { user: u, name: D.names[u] || u, kpis: list, score: kpiCardScore_(list, w), weights: w, workload: { locations: Object.keys(locs).length, joined: joined.length } };
}

/* ---------------- managers, approvers, panels (information) ---------------- */

function kpiManagers_(D, P, T, onlyUser) {
  var rows = {}, t = today_();
  var R = function (u) { return rows[u] = rows[u] || { user: u, name: D.names[u] || u, appr: [], esc: 0, evals: 0, evalLate: 0, rev: 0, revLate: 0, onb: 0, onbLate: 0 }; };
  where_('APPROVAL_INSTANCES', function (a) { return a.Decision_By && a.Decision_At && kpiIn_(a.Decision_At, P) && (a.Status === 'APPROVED' || a.Status === 'REJECTED' || a.Status === 'RETURNED'); })
    .forEach(function (a) { var r = R(a.Decision_By), d = kpiDur_(a.Activated_At || a.Created_At, a.Decision_At); if (d !== null) r.appr.push(d); if (a.Escalated_At) r.esc++; });
  where_('EVALUATIONS', function (e) { return e.Status === 'SUBMITTED' && kpiIn_(e.Submitted_At, P); })
    .forEach(function (e) { var r = R(e.Evaluator_ID); r.evals++; if (e.Late === 'Y') r.evalLate++; });
  where_('PROB_REVIEWS', function (x) { return x.Status === 'DONE' && ['D30', 'D60', 'FINAL'].indexOf(x.Kind) >= 0 && kpiIn_(x.Done_At, P) && x.Done_By && x.Done_By !== 'PUBLIC'; })
    .forEach(function (x) { var r = R(x.Done_By); r.rev++; if (str_(x.Done_At).slice(0, 10) > x.Due_Date) r.revLate++; });
  where_('ONB_TASKS', function (x) { return x.Owner_User_ID && x.Due_Date && kpiIn_(x.Due_Date, P) && x.Due_Date <= t && ['MANAGER', 'SUPERVISOR'].indexOf(x.Owner_Role) >= 0; })
    .forEach(function (x) { var r = R(x.Owner_User_ID); r.onb++; if (x.Status !== 'DONE' && x.Status !== 'SKIPPED' || (x.Done_At && str_(x.Done_At).slice(0, 10) > x.Due_Date)) r.onbLate++; });
  return Object.keys(rows).filter(function (u) { return !onlyUser || u === onlyUser; }).map(function (u) {
    var r = rows[u], k = [];
    k.push(kpiMake_('MGR_APPROVAL_DAYS', kpiAvg_(r.appr), r.appr.length, T));
    k.push(kpiMake_('MGR_ESCALATED', kpiPct_(r.esc, r.appr.length), r.appr.length, T));
    k.push(kpiMake_('EVAL_ON_TIME', kpiPct_(r.evals - r.evalLate, r.evals), r.evals, T));
    k.push(kpiMake_('PROB_REVIEW_ON_TIME', kpiPct_(r.rev - r.revLate, r.rev), r.rev, T));
    k.push(kpiMake_('ONB_ON_TIME', kpiPct_(r.onb - r.onbLate, r.onb), r.onb, T));
    k.forEach(function (x) { delete x.cases; });
    return { user: u, name: r.name, kpis: k, n: r.appr.length + r.evals + r.rev + r.onb };
  }).sort(function (a, b) { return b.n - a.n; });
}

/* ---------------- entry point ---------------- */

/** p = { view: PROCESS | TEAM | SITE | MANAGERS | MINE, period, from, to, sector, location, cls } */
function kpiRun_(ctx, p) {
  var all = hasAnyRole_(ctx, kpiAllRoles_()) || probIsAdmin_(ctx), me = ctx.user.User_ID, view = str_(p.view) || 'PROCESS';
  var isRec = hasAnyRole_(ctx, [ROLE.RECRUITER]) && !all, canProcess = hasAnyRole_(ctx, kpiRoles_());
  var P = kpiPeriod_(p), T = kpiTargets_(), D = kpiData_(), vf = (str_(p.sector) || str_(p.location) || str_(p.cls)) ? kpiVacFilter_(p) : kpiAll_;
  var out = { view: view, period: P, targets: T, ttf: kpiTtf_(), classes: KPI_CLASS_, canAll: all, canProcess: canProcess,
    sectors: where_('ORG_UNITS', function (u) { return u.Unit_Type === 'SECTOR' && u.Status === 'Active' && u.Org_Version_ID === activeVersion_(); }).map(function (u) { return { id: u.Org_Unit_ID, name: u.Name_AR }; }),
    minCases: num_(cfg_('KPI_MIN_CASES', 3), 3) };
  if (view === 'PROCESS') {
    if (!canProcess) throw userError_('مؤشرات العملية لفريق الموارد البشرية والتوظيف والإدارة العليا.');
    var K = kpiSet_(D, P, T, vf, '');
    out.groups = KPI_GROUPS_.map(function (g) { return { code: g[0], name: g[1], kpis: g[2].map(function (c) { return K[c]; }).filter(Boolean) }; });
    if (!all) out.groups.forEach(function (g) { g.kpis.forEach(function (k) { k.cases = []; }); });
  } else if (view === 'MINE') {
    // v0.27.0 — every signed-in user sees his own evaluation: each scorecard that applies to the work given to him
    out.cards = []; out.lead = null;
    var leads = Object.keys(D.vac).some(function (x) { return D.vac[x].Lead_Recruiter_ID === me; });
    if (hasAnyRole_(ctx, [ROLE.RECRUITER]) || leads) { var rc = kpiRecruiter_(D, P, T, vf, me); rc.kind = 'RECRUITER'; out.cards.push(rc); }
    if (hasAnyRole_(ctx, [ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR])) { var lc = kpiLead_(D, P, T, vf); lc.kind = 'LEAD'; lc.user = me; lc.name = D.names[me] || me; out.cards.push(lc); }
    if (all_('LOCATIONS').some(function (l) { return l.HR_Site_User_ID === me; })) { var sc = kpiSite_(D, P, T, me); sc.kind = 'SITE'; out.cards.push(sc); }
    out.rows = kpiManagers_(D, P, T, me);
  } else if (view === 'TEAM') {
    var recs = isRec ? [me] : kpiRecruiters_();
    if (!all && !isRec) throw userError_('بطاقات فريق التوظيف لمديرين التوظيف والموارد البشرية.');
    out.cards = recs.map(function (u) { return kpiRecruiter_(D, P, T, vf, u); });
    out.lead = all ? kpiLead_(D, P, T, vf) : null;
  } else if (view === 'SITE') {
    if (!all) throw userError_('بطاقات أخصائيي الموارد البشرية بالمواقع لمديرين الموارد البشرية.');
    var sites = {}; all_('LOCATIONS').forEach(function (l) { if (l.HR_Site_User_ID) sites[l.HR_Site_User_ID] = 1; });
    out.cards = Object.keys(sites).map(function (u) { return kpiSite_(D, P, T, u); });
  } else if (view === 'MANAGERS') {
    out.rows = kpiManagers_(D, P, T, all ? '' : me);
  } else throw userError_('عرض غير معروف.');
  if (ctx.readOnly || !all) {
    // view-only or own card: cases keep names only for HR / recruitment leads
    (out.cards || []).forEach(function (c) { if (c.user !== me && !all) c.kpis.forEach(function (k) { k.cases = []; }); });
  }
  return out;
}
function kpiRecruiters_() {
  var ids = {};
  all_('VACANCIES').forEach(function (v) { if (v.Lead_Recruiter_ID) ids[v.Lead_Recruiter_ID] = 1; });
  roleHolders_(ROLE.RECRUITER).forEach(function (u) { ids[u] = 1; });
  return Object.keys(ids);
}
/** The recruitment lead's card: the team's results plus allocation and offer approvals. */
function kpiLead_(D, P, T, vf) {
  var k = kpiSet_(D, P, T, vf, ''), t = today_();
  var first = {}; all_('VACANCY_RECRUITERS').forEach(function (r) { if (r.Role === 'LEAD' && (!first[r.Vacancy_ID] || r.Created_At < first[r.Vacancy_ID])) first[r.Vacancy_ID] = r.Created_At; });
  var as = Object.keys(D.vac).map(function (x) { return D.vac[x]; }).filter(function (v) { return vf(v) && kpiIn_(v.Created_At, P) && first[v.Vacancy_ID]; })
    .map(function (v) { return kpiDur_(v.Created_At, first[v.Vacancy_ID]); }).filter(function (d) { return d !== null; });
  k.ASSIGN_DAYS = kpiMake_('ASSIGN_DAYS', kpiAvg_(as), as.length, T);
  var ap = where_('OFFERS', function (o) { return o.Approved_At && o.Submitted_At && kpiIn_(o.Approved_At, P) && vf(D.vac[o.Vacancy_ID]); });
  k.OFFER_APPROVE_ON_TIME = kpiMake_('OFFER_APPROVE_ON_TIME', kpiPct_(ap.filter(function (o) { return kpiDays_(o.Submitted_At, o.Approved_At) <= 1; }).length, ap.length), ap.length, T);
  var w = kpiWeights_('KPI_WEIGHTS_LEAD', KPI_W_LEAD_), list = Object.keys(w).map(function (c) { return k[c]; }).filter(Boolean);
  list.forEach(function (x) { x.cases = []; });
  return { kpis: list, score: kpiCardScore_(list, w), weights: w };
}

/* ---------------- monthly summary e-mail ---------------- */

function kpiMonthly_() {
  if (!cfg_('KPI_MONTHLY_EMAIL', true)) return { skipped: true };
  var t = today_(), key = 'KPI_MONTHLY_' + t.slice(0, 7);
  if (t.slice(8, 10) !== '01' || sprop_(key) === 'Y') return { skipped: true };
  var prevEnd = addDaysYmd_(t, -1), P = { period: 'custom', from: prevEnd.slice(0, 8) + '01', to: prevEnd };
  var K = kpiSet_(kpiData_(), P, kpiTargets_(), kpiAll_, '');
  var lines = KPI_GROUPS_.map(function (g) {
    return '<b>' + g[1] + '</b><br>' + g[2].map(function (c) { var k = K[c]; if (!k) return ''; return '· ' + k.name + ': ' + (k.value === null ? '—' : k.value + ' ' + k.unit) + (k.target !== null ? ' (الهدف ' + k.target + ')' : '') + (k.status === 'BAD' ? ' ⚠' : ''); }).filter(Boolean).join('<br>');
  }).join('<br><br>');
  var to = roleHolders_(ROLE.REC_MANAGER).concat(roleHolders_(ROLE.HR_MANAGER)).concat(roleHolders_(ROLE.HR_SECTOR));
  notify_(to, 'مؤشرات التوظيف — ' + P.from.slice(0, 7), 'ملخص الشهر اللي فات في شاشة «مؤشرات الأداء».', 'KPI', '', false);
  to.forEach(function (u) {
    try {
      var usr = get_('USERS', u); if (!usr || usr.Status !== 'Active' || !usr.Email || !mailOk_('DIGEST')) return;
      sendMail_({ to: usr.Email, name: 'Kandil Recruitment Portal', subject: 'مؤشرات التوظيف — ' + P.from.slice(0, 7),
        htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' + lines + '<br><br>التفاصيل في شاشة «مؤشرات الأداء» في البوابة.</div>' });
      mailSent_();
    } catch (e) { console.warn('kpi mail: ' + e); }
  });
  PropertiesService.getScriptProperties().setProperty(key, 'Y');
  return { sent: to.length };
}

/* ---------------- settings screen (v0.27.0) ---------------- */

function kpiEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }
function kpiProcessCodes_() { var o = []; KPI_GROUPS_.forEach(function (g) { o = o.concat(g[2]); }); return o; }
/** The KPIs each scorecard can carry (weight 0 = shown for information, not in the score). */
function kpiCardCodes_() {
  var pc = kpiProcessCodes_();
  return { RECRUITER: pc.concat(['TASKS_ON_TIME', 'SCREEN_PASS']), SITE: Object.keys(KPI_W_SITE_), LEAD: pc.concat(['ASSIGN_DAYS', 'OFFER_APPROVE_ON_TIME']) };
}
var KPI_W_KEYS_ = { RECRUITER: ['KPI_WEIGHTS_RECRUITER', KPI_W_RECRUITER_], SITE: ['KPI_WEIGHTS_SITE', KPI_W_SITE_], LEAD: ['KPI_WEIGHTS_LEAD', KPI_W_LEAD_] };

/** p = { op: 'get' } → everything the settings tab shows; p = { op: 'save', targets, ttf, jobClass, weights, minCases, monthly, reason }. */
function kpiSettings_(ctx, p) {
  if (str_(p.op) === 'save') return kpiSettingsSave_(ctx, p);
  if (!hasAnyRole_(ctx, kpiRoles_()) && !probIsAdmin_(ctx)) throw userError_('إعدادات المؤشرات لفريق الموارد البشرية والتوظيف.');
  var meta = {}, codes = Object.keys(KPI_DEF_TARGETS_);
  Object.keys(KPI_META_).forEach(function (c) { meta[c] = { name: KPI_META_[c][0], unit: KPI_META_[c][1], dir: KPI_META_[c][2] }; });
  var w = {}; Object.keys(KPI_W_KEYS_).forEach(function (k) { w[k] = kpiWeights_(KPI_W_KEYS_[k][0], KPI_W_KEYS_[k][1]); });
  return {
    canEdit: hasAnyRole_(ctx, kpiEditRoles_()) && !ctx.readOnly,
    meta: meta, codes: codes, defaults: KPI_DEF_TARGETS_, targets: kpiTargets_(), groups: KPI_GROUPS_.map(function (g) { return { code: g[0], name: g[1], kpis: g[2] }; }),
    extra: ['TASKS_ON_TIME', 'SCREEN_PASS', 'ASSIGN_DAYS', 'OFFER_APPROVE_ON_TIME', 'ONB_ON_TIME', 'NHV_FOLLOW', 'GOALS_WEEK1', 'MGR_APPROVAL_DAYS', 'MGR_ESCALATED', 'EVAL_ON_TIME', 'PROB_REVIEW_ON_TIME'],
    classes: KPI_CLASS_, ttf: kpiTtf_(), jobClass: kpiJson_('KPI_JOB_CLASS', {}),
    grades: all_('GRADES').filter(function (g) { return g.Status !== 'Inactive'; }).sort(function (a, b) { return num_(a.Level_Order, 0) - num_(b.Level_Order, 0); })
      .map(function (g) { var n = parseInt(g.Grade_Code, 10); return { code: str_(g.Grade_Code), name: str_(g.Grade_Name), auto: isNaN(n) ? 'ADMIN' : n <= 4 ? 'LABOR' : n <= 6 ? 'TECH' : n <= 8 ? 'ADMIN' : 'LEAD' }; }),
    weights: w, cardCodes: kpiCardCodes_(), defWeights: { RECRUITER: KPI_W_RECRUITER_, SITE: KPI_W_SITE_, LEAD: KPI_W_LEAD_ },
    minCases: num_(cfg_('KPI_MIN_CASES', 3), 3), monthly: !!cfg_('KPI_MONTHLY_EMAIL', true)
  };
}

function kpiSettingsSave_(ctx, p) {
  if (ctx.readOnly || !hasAnyRole_(ctx, kpiEditRoles_())) throw userError_('تعديل إعدادات المؤشرات لمالك النظام ومدير قطاع ومدير الموارد البشرية.');
  var reason = requireReason_(p), rows = {};
  // targets: keep only the ones that differ from the defaults
  var tIn = p.targets || {}, tOut = {};
  Object.keys(tIn).forEach(function (c) {
    if (!KPI_DEF_TARGETS_.hasOwnProperty(c)) throw userError_('مؤشر غير معروف: ' + c);
    var raw = str_(tIn[c]); if (raw === '') return;
    var n = Number(raw), unit = KPI_META_[c] ? KPI_META_[c][1] : '';
    if (isNaN(n) || n < 0) throw userError_('هدف «' + (KPI_META_[c] ? KPI_META_[c][0] : c) + '» لازم يكون رقم موجب.');
    if (unit === '%' && n > 100) throw userError_('هدف «' + KPI_META_[c][0] + '» نسبة — من 0 لـ 100.');
    if (unit === 'من 5' && n > 5) throw userError_('هدف «' + KPI_META_[c][0] + '» من 5.');
    if (n !== KPI_DEF_TARGETS_[c]) tOut[c] = n;
  });
  rows.KPI_TARGETS = JSON.stringify(tOut);
  var ttf = {};
  Object.keys(KPI_CLASS_).forEach(function (k) {
    var n = Number((p.ttf || {})[k]);
    if (!n || n < 1 || n > 365 || Math.round(n) !== n) throw userError_('مدة شغل الشاغر لـ«' + KPI_CLASS_[k] + '» لازم تكون عدد أيام من 1 لـ 365.');
    ttf[k] = n;
  });
  rows.KPI_TTF_TARGETS = JSON.stringify(ttf);
  var jc = {}, grades = {}; all_('GRADES').forEach(function (g) { grades[str_(g.Grade_Code)] = 1; });
  Object.keys(p.jobClass || {}).forEach(function (g) {
    var c = str_(p.jobClass[g]); if (!c) return;
    if (!grades[g]) throw userError_('درجة غير موجودة: ' + g);
    if (!KPI_CLASS_[c]) throw userError_('نوع وظيفة غير معروف: ' + c);
    jc[g] = c;
  });
  rows.KPI_JOB_CLASS = JSON.stringify(jc);
  var cc = kpiCardCodes_(), names = { RECRUITER: 'أخصائي التوظيف', SITE: 'أخصائي الموارد البشرية بالموقع', LEAD: 'مشرف ومدير التوظيف' };
  Object.keys(KPI_W_KEYS_).forEach(function (card) {
    var wIn = (p.weights || {})[card] || {}, wOut = {}, sum = 0;
    Object.keys(wIn).forEach(function (c) {
      var raw = str_(wIn[c]); if (raw === '') return;
      if (cc[card].indexOf(c) < 0) throw userError_('مؤشر مش متاح في بطاقة ' + names[card] + ': ' + c);
      var n = Number(raw);
      if (isNaN(n) || n < 0 || n > 100 || Math.round(n) !== n) throw userError_('الأوزان أرقام صحيحة من 0 لـ 100 (بطاقة ' + names[card] + ').');
      wOut[c] = n; sum += n;
    });
    if (!Object.keys(wOut).length) throw userError_('بطاقة ' + names[card] + ' لازم يكون فيها مؤشر واحد على الأقل.');
    if (sum !== 100) throw userError_('مجموع أوزان بطاقة ' + names[card] + ' لازم يكون 100 (دلوقتي ' + sum + ').');
    rows[KPI_W_KEYS_[card][0]] = JSON.stringify(wOut);
  });
  var mc = Number(p.minCases);
  if (!mc || mc < 1 || mc > 50 || Math.round(mc) !== mc) throw userError_('أقل عدد حالات لازم يكون من 1 لـ 50.');
  rows.KPI_MIN_CASES = String(mc);
  rows.KPI_MONTHLY_EMAIL = p.monthly ? 'Y' : 'N';
  var types = { KPI_MIN_CASES: 'NUMBER', KPI_MONTHLY_EMAIL: 'BOOL' }, changed = [];
  withLock_(function () {
    Object.keys(rows).forEach(function (k) {
      var c = get_('CONFIG', k), v = rows[k];
      if (!c) {   // an install from before v0.26.0 that never re-ran the setup
        insert_('CONFIG', { Config_Key: k, Config_Value: v, Value_Type: types[k] || 'JSON', Description: 'Recruitment KPIs — set from the KPI settings screen' }, ctx.user.User_ID);
        auditDiff_(ctx, 'CONFIG', k, {}, { Config_Value: v }, reason); changed.push(k); return;
      }
      if (str_(c.Config_Value) === v) return;
      var res = update_('CONFIG', k, { Config_Value: v }, ctx.user.User_ID);
      auditDiff_(ctx, 'CONFIG', k, res.before, res.after, reason); changed.push(k);
    });
  });
  return { changed: changed, settings: kpiSettings_(ctx, { op: 'get' }) };
}
