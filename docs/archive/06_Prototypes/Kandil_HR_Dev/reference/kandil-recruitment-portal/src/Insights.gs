/**
 * Insights.gs — v0.29.0, Phase 8 (Intelligence), first part. Three more views on the KPI screen, all computed from what the
 * portal already records (nothing typed by hand), with the same filters (period, sector, location, job class):
 *
 *   SOURCES — return on each recruitment source: the funnel from applying to confirmation after probation, the quality of
 *             the hires (final probation score), time to hire, and the cost — ad spend, the source's subscriptions spread
 *             over the period, agency fees (from each agency's terms and the accepted package) and referral bonuses
 *             (INSIGHT_REFERRAL_BONUS per eligible / paid referral, an estimate: the portal pays nothing) → cost per hire.
 *             Cohort: applications made in the period; costs incurred in the period.
 *   FLOW    — where the work waits: each step of the process (request approval by step, vacancy assignment, first contact,
 *             time in each pipeline stage, interview confirmation, evaluation, offer approval, candidate answer, joining)
 *             with the average / median / 90th-percentile days for what finished in the period, what is waiting now and
 *             what is overdue (over INSIGHT_STEP_DAYS), the slowest people where a person owns the step, and the oldest cases.
 *   CALIB   — interviewer calibration: how each evaluator scores against the rest of the same panel, how far his
 *             recommendation matches what happened to the candidate, and — for those hired — how his interview score
 *             lines up with the final probation score. Complements the interview analytics (score spread, lateness).
 *
 * Access: the HR and recruitment management and top management (kpiAllRoles_) and the HR team; the consultant reads.
 */

var INS_STEP_DEFAULT_ = { REQ_APPROVAL: 3, ASSIGN: 2, FIRST_CONTACT: 3, ST_NEW: 3, ST_CONTACTED: 5, ST_SCREENING: 5, ST_SHORTLISTED: 7,
  ST_INTERVIEW: 10, IV_CONFIRM: 2, EVAL: 1, OFFER_APPROVAL: 2, OFFER_RESPONSE: 5, JOINING: 21 };
var INS_STEP_NAMES_ = { REQ_APPROVAL: 'اعتماد طلب التوظيف', ASSIGN: 'توزيع الشاغر على مسؤول', FIRST_CONTACT: 'أول تواصل مع المتقدم',
  ST_NEW: 'مرحلة: جديد', ST_CONTACTED: 'مرحلة: اتواصلنا', ST_SCREENING: 'مرحلة: فرز', ST_SHORTLISTED: 'مرحلة: قائمة مختصرة', ST_INTERVIEW: 'مرحلة: مقابلات',
  IV_CONFIRM: 'تأكيد المقابِل لميعاد المقابلة', EVAL: 'تسليم تقييم المقابلة', OFFER_APPROVAL: 'اعتماد العرض', OFFER_RESPONSE: 'رد المرشح على العرض', JOINING: 'من قبول العرض للاستلام' };
var INS_REQ_STEP_ = { LINE: 'المديرين', MANAGER: 'المديرين', HR: 'الموارد البشرية', HC_EXC: 'استثناء العدد', CEO: 'الرئيس التنفيذي', BOARD: 'مجلس الإدارة' };

function insightRoles_() { return kpiAllRoles_().concat(HR_ALL_ROLES); }
function insStepDays_() { var t = kpiJson_('INSIGHT_STEP_DAYS', {}), o = {}; Object.keys(INS_STEP_DEFAULT_).forEach(function (k) { o[k] = t[k] !== undefined ? num_(t[k], INS_STEP_DEFAULT_[k]) : INS_STEP_DEFAULT_[k]; }); return o; }
function insR1_(x) { return x === null || x === undefined || isNaN(x) ? null : Math.round(x * 10) / 10; }
function insStats_(a) {
  if (!a.length) return { n: 0, avg: null, median: null, p90: null };
  var s = a.slice().sort(function (x, y) { return x - y; }), q = function (f) { return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))]; };
  return { n: s.length, avg: insR1_(kpiAvg_(s)), median: insR1_(q(0.5)), p90: insR1_(q(0.9)) };
}
/** Days between two stamps with a fraction (hours count), null when out of order or missing. */
function insDays_(a, b) {
  a = str_(a); b = str_(b); if (!a || !b) return null;
  var x = new Date(a.length <= 10 ? a + 'T00:00:00' : a).getTime(), y = new Date(b.length <= 10 ? b + 'T00:00:00' : b).getTime();
  if (isNaN(x) || isNaN(y) || y < x) return null;
  return (y - x) / 864e5;
}
function insAge_(a) { return insDays_(a, nowIso_()); }

/** p = { view: SOURCES | FLOW | CALIB, period, from, to, sector, location, cls } */
function insightsRun_(ctx, p) {
  if (!hasAnyRole_(ctx, insightRoles_())) throw userError_('التحليلات لإدارة الموارد البشرية والتوظيف والإدارة العليا.');
  var view = str_(p.view);
  var P = kpiPeriod_(p), D = kpiData_(), vf = (str_(p.sector) || str_(p.location) || str_(p.cls)) ? kpiVacFilter_(p) : kpiAll_;
  var out = { view: view, period: P, minCases: num_(cfg_('KPI_MIN_CASES', 3), 3), classes: KPI_CLASS_, ttf: kpiTtf_(),
    sectors: where_('ORG_UNITS', function (u) { return u.Unit_Type === 'SECTOR' && u.Status === 'Active' && u.Org_Version_ID === activeVersion_(); }).map(function (u) { return { id: u.Org_Unit_ID, name: u.Name_AR }; }) };
  if (view === 'SOURCES') out.sources = insSources_(D, P, vf);
  else if (view === 'FLOW') out.flow = insFlow_(D, P, vf);
  else if (view === 'CALIB') out.calib = insCalib_(D, P, vf);
  else if (view === 'FORECAST') out.forecast = insForecast_(D, p);
  else throw userError_('عرض غير معروف.');
  return out;
}

/* ---------------- SOURCES: return on each source ---------------- */

/** Agency fee estimate for one hire from the agency terms frozen on the application (else the agency's current terms). */
function insAgencyFee_(a, offer) {
  var t = {}; try { t = JSON.parse(a.Agency_Terms_JSON || '{}') || {}; } catch (e) { t = {}; }
  var ag = a.Agency_ID ? get_('AGENCIES', a.Agency_ID) : null;
  var type = t.feeType || (ag && ag.Fee_Type) || 'NONE', val = num_(t.feeValue !== undefined ? t.feeValue : ag && ag.Fee_Value, 0);
  var pkg = offer ? num_(offer.Final_Accepted || offer.Approved_Package || offer.Fixed_Package, 0) : 0;
  if (type === 'FIXED') return val;
  if (type === 'MONTHS_SALARY') return pkg * val;
  if (type === 'PERCENT_ANNUAL') return pkg * 12 * val / 100;
  return 0;
}

function insSources_(D, P, vf) {
  var names = sources_(), by = {}, bonus = num_(cfg_('INSIGHT_REFERRAL_BONUS', 0), 0);
  var R = function (k) { return by[k] = by[k] || { source: k, name: names[k] || k, applied: 0, shortlisted: 0, interviewed: 0, offered: 0, accepted: 0, joined: 0,
    confirmed: 0, notConfirmed: 0, quality: [], tth: [], cost: { ads: 0, subs: 0, agency: 0, referral: 0 }, hires: [] }; };
  var apps = Object.keys(D.apps).map(function (k) { return D.apps[k]; }).filter(function (a) {
    return kpiIn_(a.Applied_At, P) && vf(D.vac[a.Vacancy_ID]) && a.Close_Code !== 'TRANSFERRED' && a.Close_Code !== 'DUPLICATE';
  });
  var reached = reachedMap_(apps);
  apps.forEach(function (a) {
    var r = R(a.Source || 'OTHER'), m = reached[a.Application_ID] || {};
    r.applied++; if (m.SHORTLISTED) r.shortlisted++; if (m.INTERVIEW) r.interviewed++;
    var offers = D.offersByApp[a.Application_ID] || [], acc = kpiAccepted_(D, a.Application_ID);
    if (offers.some(function (o) { return ['PRESENTED', 'ACCEPTED', 'DECLINED', 'EXPIRED'].indexOf(o.Status) >= 0; })) r.offered++;
    if (acc) { r.accepted++; var t = insDays_(a.Applied_At, acc.Responded_At); if (t !== null) r.tth.push(t); }
    var j = D.joinByApp[a.Application_ID];
    if (j && j.Status === 'JOINED') {
      r.joined++;
      var pr = D.probByJoin[j.Joining_ID];
      if (pr && pr.Status === 'CONFIRMED') r.confirmed++;
      if (pr && pr.Status === 'TERMINATED') r.notConfirmed++;
      var fin = pr && (D.revByProb[pr.Probation_ID] || {}).FINAL;
      if (fin && fin.Status === 'DONE' && num_(fin.Weighted, 0) > 0) r.quality.push(num_(fin.Weighted, 0));
      if (a.Agency_ID) r.cost.agency += insAgencyFee_(a, acc);
      r.hires.push(kpiCase_(D, a.Application_ID, pr ? (pr.Status === 'CONFIRMED' ? 'اتثبت' : pr.Status === 'TERMINATED' ? 'ماتثبتش' : 'في فترة الاختبار') : ''));
    }
  });
  // costs incurred in the period
  all_('ADVERTISEMENTS').forEach(function (ad) {
    if (!kpiIn_(ad.Published_At, P) || (ad.Vacancy_ID && !vf(D.vac[ad.Vacancy_ID]))) return;
    R(ad.Source_Code || 'OTHER').cost.ads += num_(ad.Cost, 0);
  });
  var filtered = vf !== kpiAll_;
  if (!filtered) all_('SOURCE_SUBSCRIPTIONS').forEach(function (s) {       // a subscription serves every vacancy: only without a filter
    if (s.Status === 'Cancelled' || !s.Start_Date || !s.End_Date || !num_(s.Cost, 0)) return;
    var a = s.Start_Date > P.from ? s.Start_Date : P.from, b = s.End_Date < P.to ? s.End_Date : P.to;
    if (a > b) return;
    var len = daysBetween_(s.Start_Date, s.End_Date) + 1, part = daysBetween_(a, b) + 1;
    R(s.Source_Code || 'OTHER').cost.subs += num_(s.Cost, 0) * Math.min(1, part / Math.max(1, len));
  });
  if (bonus) all_('REFERRALS').forEach(function (rf) {
    if (rf.Status !== 'Active' || rf.Kind !== 'PRIMARY' || ['ELIGIBLE', 'PAID'].indexOf(rf.Bonus_Status) < 0 || !kpiIn_(rf.Bonus_At || rf.Created_At, P)) return;
    if (rf.Vacancy_ID && !vf(D.vac[rf.Vacancy_ID])) return;
    var a = D.apps[rf.Application_ID]; R((a && a.Source) || 'REFERRAL').cost.referral += bonus;
  });
  var rows = Object.keys(by).map(function (k) {
    var r = by[k], cost = r.cost.ads + r.cost.subs + r.cost.agency + r.cost.referral;
    return { source: r.source, name: r.name, applied: r.applied, shortlisted: r.shortlisted, interviewed: r.interviewed, offered: r.offered, accepted: r.accepted,
      joined: r.joined, confirmed: r.confirmed, notConfirmed: r.notConfirmed,
      hireRate: r.applied ? insR1_(r.joined / r.applied * 100) : null,
      confirmRate: r.confirmed + r.notConfirmed ? insR1_(r.confirmed / (r.confirmed + r.notConfirmed) * 100) : null,
      quality: insR1_(kpiAvg_(r.quality)), qualityN: r.quality.length, tth: insR1_(kpiAvg_(r.tth)), tthN: r.tth.length,
      cost: Math.round(cost), costParts: { ads: Math.round(r.cost.ads), subs: Math.round(r.cost.subs), agency: Math.round(r.cost.agency), referral: Math.round(r.cost.referral) },
      perHire: r.joined && cost ? Math.round(cost / r.joined) : null, perApp: r.applied && cost ? Math.round(cost / r.applied) : null, hires: r.hires.slice(0, 60) };
  }).filter(function (r) { return r.applied || r.cost; }).sort(function (a, b) { return b.joined - a.joined || b.applied - a.applied; });
  var tot = rows.reduce(function (t, r) { ['applied', 'shortlisted', 'interviewed', 'offered', 'accepted', 'joined', 'confirmed', 'notConfirmed', 'cost'].forEach(function (k) { t[k] += r[k]; }); return t; },
    { applied: 0, shortlisted: 0, interviewed: 0, offered: 0, accepted: 0, joined: 0, confirmed: 0, notConfirmed: 0, cost: 0 });
  tot.perHire = tot.joined && tot.cost ? Math.round(tot.cost / tot.joined) : null;
  tot.hireRate = tot.applied ? insR1_(tot.joined / tot.applied * 100) : null;
  // the best value: lowest cost per hire among sources with enough hires, and the best confirmation rate
  var min = num_(cfg_('KPI_MIN_CASES', 3), 3), enough = rows.filter(function (r) { return r.joined >= min; });
  var cheapest = enough.filter(function (r) { return r.perHire !== null; }).sort(function (a, b) { return a.perHire - b.perHire; })[0] || null;
  var steady = rows.filter(function (r) { return r.confirmed + r.notConfirmed >= min; }).sort(function (a, b) { return b.confirmRate - a.confirmRate; })[0] || null;
  return { rows: rows, total: tot, best: { cheapest: cheapest ? cheapest.source : '', steady: steady ? steady.source : '' }, filtered: filtered, referralBonus: bonus };
}

/* ---------------- FLOW: where the work waits ---------------- */

function insFlow_(D, P, vf) {
  var LIM = insStepDays_(), steps = {}, names = D.names, t = nowIso_();
  var S = function (code) { return steps[code] = steps[code] || { code: code, name: INS_STEP_NAMES_[code], target: LIM[code], done: [], waiting: [], people: {}, parts: {} }; };
  var person = function (s, u, d) { if (!u || d === null) return; var x = s.people[u] = s.people[u] || { user: u, name: names[u] || u, d: [] }; x.d.push(d); };
  var wait = function (s, id, label, since, extra) { var age = insAge_(since); if (age === null) return; s.waiting.push({ id: id, name: label, days: insR1_(age), note: extra || '' }); };
  var appName = function (a) { var per = a.Person_ID ? get_('PERSONS', a.Person_ID) : null; return per ? per.Full_Name : a.Application_ID; };
  var inVac = function (vid) { return vf(D.vac[vid]); };

  // 1. request approval, by step type (requests of vacancies in scope; without a filter every request)
  var reqUnit = {}; all_('RECRUITMENT_REQUESTS').forEach(function (r) { reqUnit[r.Request_ID] = r; });
  var reqIn = function (rid) {
    if (vf === kpiAll_) return true;
    var r = reqUnit[rid]; if (!r) return false;
    return vf({ Org_Unit_ID: r.Org_Unit_ID, Location_ID: (reqChildren_('REQUEST_LINES', rid)[0] || {}).Location_ID, Job_Code: r.Job_Code });
  };
  where_('APPROVAL_INSTANCES', function (a) { return a.Entity_Type === 'REQUEST'; }).forEach(function (a) {
    if (!reqIn(a.Entity_ID)) return;
    var s = S('REQ_APPROVAL'), part = s.parts[a.Step_Type] = s.parts[a.Step_Type] || { name: INS_REQ_STEP_[a.Step_Type] || a.Step_Type, done: [], waiting: 0 };
    if (a.Decision_At && kpiIn_(a.Decision_At, P) && ['APPROVED', 'REJECTED', 'RETURNED'].indexOf(a.Status) >= 0) {
      var d = insDays_(a.Activated_At || a.Created_At, a.Decision_At); if (d !== null) { s.done.push(d); part.done.push(d); person(s, a.Decision_By, d); }
    }
    if (a.Status === 'PENDING' && a.Activated_At) { part.waiting++; wait(s, a.Entity_ID, (reqUnit[a.Entity_ID] ? reqTitle_(reqUnit[a.Entity_ID]) : a.Entity_ID), a.Activated_At, a.Label); }
  });
  // 2. vacancy → its first lead recruiter
  var first = {}; all_('VACANCY_RECRUITERS').forEach(function (r) { if (r.Role === 'LEAD' && (!first[r.Vacancy_ID] || r.Created_At < first[r.Vacancy_ID])) first[r.Vacancy_ID] = r.Created_At; });
  Object.keys(D.vac).forEach(function (k) {
    var v = D.vac[k]; if (!vf(v)) return;
    var s = S('ASSIGN');
    if (first[k] && kpiIn_(first[k], P)) { var d = insDays_(v.Created_At, first[k]); if (d !== null) s.done.push(d); }
    if (!v.Lead_Recruiter_ID && VAC_OPEN_.indexOf(v.Status) >= 0) wait(s, k, vacTitle_(v).ar, v.Created_At);
  });
  // 3. first contact and 4. time in each pipeline stage (from the stage log)
  var log = {}; all_('ACTIVITIES').forEach(function (x) { if (x.Type === 'STAGE' && x.Status !== 'Voided') (log[x.Application_ID] = log[x.Application_ID] || []).push(x); });
  Object.keys(D.apps).forEach(function (k) {
    var a = D.apps[k]; if (!inVac(a.Vacancy_ID)) return;
    var fc = S('FIRST_CONTACT');
    if (D.firstAct[k] && kpiIn_(D.firstAct[k], P)) { var d0 = insDays_(a.Applied_At, D.firstAct[k]); if (d0 !== null) { fc.done.push(d0); person(fc, a.Owner_User_ID, d0); } }
    if (a.Stage === 'NEW' && !D.firstAct[k]) wait(fc, k, appName(a), a.Applied_At, (D.vac[a.Vacancy_ID] ? vacTitle_(D.vac[a.Vacancy_ID]).ar : ''));
    var L = (log[k] || []).sort(function (x, y) { return x.Created_At < y.Created_At ? -1 : 1; });
    var enter = { NEW: a.Applied_At }, prev = 'NEW';
    L.forEach(function (x) {
      var st = steps['ST_' + prev] || (INS_STEP_NAMES_['ST_' + prev] ? S('ST_' + prev) : null);
      if (st && enter[prev] && kpiIn_(x.Created_At, P)) { var d = insDays_(enter[prev], x.Created_At); if (d !== null) { st.done.push(d); person(st, a.Owner_User_ID, d); } }
      prev = x.Stage_To; enter[prev] = x.Created_At;
    });
    if (INS_STEP_NAMES_['ST_' + a.Stage]) wait(S('ST_' + a.Stage), k, appName(a), a.Stage_At || a.Applied_At, D.names[a.Owner_User_ID] || '');
  });
  // 5. interview confirmation and 6. evaluations
  all_('INTERVIEWS').forEach(function (iv) {
    if (iv.Kind === 'ASSESSMENT' || !inVac(iv.Vacancy_ID)) return;
    var s = S('IV_CONFIRM');
    if (iv.Manager_Confirmed_At && kpiIn_(iv.Manager_Confirmed_At, P)) { var d = insDays_(iv.Created_At, iv.Manager_Confirmed_At); if (d !== null) { s.done.push(d); person(s, iv.Manager_Confirmed_By || iv.Lead_User_ID, d); } }
    if (iv.Status === 'PROPOSED') wait(s, iv.Interview_ID, (D.apps[iv.Application_ID] ? appName(D.apps[iv.Application_ID]) : iv.Interview_ID), iv.Created_At, names[iv.Lead_User_ID] || '');
  });
  var ivById = {}; all_('INTERVIEWS').forEach(function (iv) { ivById[iv.Interview_ID] = iv; });
  var submitted = {};
  all_('EVALUATIONS').forEach(function (e) {
    var iv = ivById[e.Interview_ID]; if (!iv || iv.Kind === 'ASSESSMENT' || !inVac(iv.Vacancy_ID)) return;
    if (e.Status === 'SUBMITTED') submitted[e.Interview_ID + '|' + e.Evaluator_ID] = 1;
    if (e.Status !== 'SUBMITTED' || num_(e.Version, 1) > 1 || !kpiIn_(e.Submitted_At, P)) return;
    var s = S('EVAL'), d = insDays_(iv.Completed_At, e.Submitted_At); if (d !== null) { s.done.push(d); person(s, e.Evaluator_ID, d); }
  });
  all_('INTERVIEW_PANEL').forEach(function (pn) {
    var iv = ivById[pn.Interview_ID]; if (!iv || iv.Kind === 'ASSESSMENT' || !inVac(iv.Vacancy_ID) || !iv.Completed_At) return;
    if (pn.Role === 'OBSERVER' || pn.Status === 'REMOVED' || pn.Status === 'DECLINED' || submitted[pn.Interview_ID + '|' + pn.User_ID]) return;
    if (['COMPLETED', 'EVALUATED'].indexOf(iv.Status) < 0) return;
    wait(S('EVAL'), iv.Interview_ID, names[pn.User_ID] || pn.User_ID, iv.Completed_At, (D.apps[iv.Application_ID] ? appName(D.apps[iv.Application_ID]) : ''));
  });
  // 7. offer approval, 8. candidate answer, 9. joining
  all_('OFFERS').forEach(function (o) {
    if (!inVac(o.Vacancy_ID)) return;
    var who = D.apps[o.Application_ID] ? appName(D.apps[o.Application_ID]) : o.Offer_ID;
    var s = S('OFFER_APPROVAL');
    if (o.Approved_At && o.Submitted_At && kpiIn_(o.Approved_At, P)) { var d = insDays_(o.Submitted_At, o.Approved_At); if (d !== null) { s.done.push(d); person(s, o.Approver_ID, d); } }
    if (o.Status === 'PENDING_APPROVAL' && o.Submitted_At) wait(s, o.Offer_ID, who, o.Submitted_At, names[o.Approver_ID] || '');
    var r = S('OFFER_RESPONSE');
    if (o.Responded_At && o.Presented_At && kpiIn_(o.Responded_At, P)) { var d2 = insDays_(o.Presented_At, o.Responded_At); if (d2 !== null) r.done.push(d2); }
    if (o.Status === 'PRESENTED' && o.Presented_At) wait(r, o.Offer_ID, who, o.Presented_At, o.Valid_Until ? 'صالح لحد ' + o.Valid_Until : '');
  });
  all_('JOININGS').forEach(function (j) {
    if (!inVac(j.Vacancy_ID)) return;
    var s = S('JOINING'), acc = kpiAccepted_(D, j.Application_ID);
    if (j.Status === 'JOINED' && acc && kpiIn_(j.Joined_Date, P)) { var d = insDays_(String(acc.Responded_At).slice(0, 10), j.Joined_Date); if (d !== null) s.done.push(d); }
    if (j.Status === 'PENDING' && acc) wait(s, j.Joining_ID, (D.apps[j.Application_ID] ? appName(D.apps[j.Application_ID]) : j.Joining_ID), acc.Responded_At, j.Planned_Date ? 'الميعاد ' + j.Planned_Date : '');
  });

  var order = ['REQ_APPROVAL', 'ASSIGN', 'FIRST_CONTACT', 'ST_NEW', 'ST_CONTACTED', 'ST_SCREENING', 'ST_SHORTLISTED', 'ST_INTERVIEW', 'IV_CONFIRM', 'EVAL', 'OFFER_APPROVAL', 'OFFER_RESPONSE', 'JOINING'];
  var min = num_(cfg_('KPI_MIN_CASES', 3), 3);
  var list = order.map(function (c) {
    var s = S(c), st = insStats_(s.done), over = s.waiting.filter(function (w) { return w.days > s.target; });
    var people = Object.keys(s.people).map(function (u) { var x = s.people[u], ps = insStats_(x.d); return { user: u, name: x.name, n: ps.n, avg: ps.avg }; })
      .filter(function (x) { return x.n >= Math.min(min, 2); }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 8);
    return { code: c, name: s.name, target: s.target, n: st.n, avg: st.avg, median: st.median, p90: st.p90,
      waiting: s.waiting.length, overdue: over.length, status: st.n < min && !over.length ? 'FEW' : (st.avg !== null && st.avg > s.target * 1.5) || over.length >= 3 ? 'BAD' : (st.avg !== null && st.avg > s.target) || over.length ? 'WARN' : 'OK',
      parts: Object.keys(s.parts).map(function (k) { var x = s.parts[k], ps = insStats_(x.done); return { code: k, name: x.name, n: ps.n, avg: ps.avg, waiting: x.waiting }; }),
      people: people, oldest: s.waiting.sort(function (a, b) { return b.days - a.days; }).slice(0, 15) };
  });
  // the bottleneck: the step with the most overdue work, then the longest average against its target
  var worst = list.filter(function (s) { return s.overdue || (s.avg !== null && s.n >= min && s.avg > s.target); })
    .sort(function (a, b) { return b.overdue - a.overdue || (b.avg / b.target) - (a.avg / a.target); })[0] || null;
  return { steps: list, bottleneck: worst ? worst.code : '' };
}

/* ---------------- CALIB: interviewer calibration ---------------- */

/** An evaluator's score on one interview: the average of his competency ratings; without ratings (a job with no competencies
 *  in its JD) his recommendation on the same 1–5 scale — strong proceed 5, proceed 4, hold 3, do not proceed 2. */
var INS_REC_SCORE_ = { STRONG_PROCEED: 5, PROCEED: 4, HOLD: 3, DO_NOT_PROCEED: 2 };
function insEvalScore_(e) {
  var d = evalData_(e), a = (d.comps || []).map(function (c) { return num_(c.r, 0); }).filter(function (n) { return n >= 1 && n <= 5; });
  return a.length ? kpiAvg_(a) : INS_REC_SCORE_[e.Recommendation] || null;
}
function insCorr_(pairs) {
  if (pairs.length < 3) return null;
  var mx = kpiAvg_(pairs.map(function (p) { return p[0]; })), my = kpiAvg_(pairs.map(function (p) { return p[1]; })), sxy = 0, sxx = 0, syy = 0;
  pairs.forEach(function (p) { var dx = p[0] - mx, dy = p[1] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
  return sxx && syy ? Math.round(sxy / Math.sqrt(sxx * syy) * 100) / 100 : null;
}

function insCalib_(D, P, vf) {
  var names = D.names, ivs = {}, min = num_(cfg_('KPI_MIN_CASES', 3), 3);
  all_('INTERVIEWS').forEach(function (iv) { if (iv.Kind !== 'ASSESSMENT' && kpiIn_(iv.Date, P) && vf(D.vac[iv.Vacancy_ID])) ivs[iv.Interview_ID] = iv; });
  var byIv = {};
  all_('EVALUATIONS').forEach(function (e) { if (ivs[e.Interview_ID]) (byIv[e.Interview_ID] = byIv[e.Interview_ID] || []).push(e); });
  var rows = {}, R = function (u) { return rows[u] = rows[u] || { user: u, name: names[u] || u, scores: [], dev: [], agree: 0, decided: 0, pred: [], up: 0, down: 0 }; };
  var POS = ['STRONG_PROCEED', 'PROCEED'];
  var outcome = function (appId) {                      // true = went forward (offer / hired / selected), false = stopped, null = still open
    var a = D.apps[appId]; if (!a) return null;
    if (['OFFER', 'ACCEPTED', 'JOINED'].indexOf(a.Stage) >= 0 || (D.offersByApp[appId] || []).length) return true;
    if (a.Stage === 'REJECTED' || a.Stage === 'WITHDRAWN') return a.Stage === 'REJECTED' ? false : null;
    return null;
  };
  var probScore = function (appId) {
    var j = D.joinByApp[appId], pr = j ? D.probByJoin[j.Joining_ID] : null, fin = pr ? (D.revByProb[pr.Probation_ID] || {}).FINAL : null;
    return fin && fin.Status === 'DONE' && num_(fin.Weighted, 0) > 0 ? num_(fin.Weighted, 0) : null;
  };
  Object.keys(byIv).forEach(function (id) {
    var cur = currentEvals_(byIv[id]).map(function (e) { return { e: e, s: insEvalScore_(e) }; }).filter(function (x) { return x.s !== null; });
    var iv = ivs[id], out = outcome(iv.Application_ID), ps = probScore(iv.Application_ID);
    cur.forEach(function (x) {
      var r = R(x.e.Evaluator_ID); r.scores.push(x.s);
      var others = cur.filter(function (y) { return y !== x; });
      if (others.length) { var dv = x.s - kpiAvg_(others.map(function (y) { return y.s; })); r.dev.push(dv); if (dv >= 0.75) r.up++; if (dv <= -0.75) r.down++; }
      if (out !== null && x.e.Recommendation) { r.decided++; if ((POS.indexOf(x.e.Recommendation) >= 0) === out) r.agree++; }
      if (ps !== null) r.pred.push([x.s, ps]);
    });
  });
  var list = Object.keys(rows).map(function (u) {
    var r = rows[u], dev = kpiAvg_(r.dev), sd = r.scores.length > 1 ? Math.sqrt(kpiAvg_(r.scores.map(function (s) { var m = kpiAvg_(r.scores); return (s - m) * (s - m); }))) : null;
    var tilt = r.dev.length < min ? 'FEW' : dev >= 0.5 ? 'LENIENT' : dev <= -0.5 ? 'STRICT' : 'ALIGNED';
    return { user: u, name: r.name, n: r.scores.length, avg: insR1_(kpiAvg_(r.scores)), sd: sd === null ? null : Math.round(sd * 100) / 100,
      panels: r.dev.length, dev: dev === null ? null : Math.round(dev * 100) / 100, tilt: tilt, apart: r.up + r.down,
      agree: r.decided ? insR1_(r.agree / r.decided * 100) : null, decided: r.decided,
      predN: r.pred.length, pred: r.pred.length >= min ? insCorr_(r.pred) : null };
  }).sort(function (a, b) { return b.n - a.n; });
  // company: how well interview scores line up with the final probation score, over every hire with both
  var all = [];
  Object.keys(byIv).forEach(function (id) {
    var ps = probScore(ivs[id].Application_ID); if (ps === null) return;
    var sc = currentEvals_(byIv[id]).map(insEvalScore_).filter(function (s) { return s !== null; });
    if (sc.length) all.push([kpiAvg_(sc), ps]);
  });
  return { rows: list, company: { interviews: Object.keys(byIv).length, hires: all.length, pred: all.length >= min ? insCorr_(all) : null,
    lenient: list.filter(function (r) { return r.tilt === 'LENIENT'; }).length, strict: list.filter(function (r) { return r.tilt === 'STRICT'; }).length } };
}

/* ---------------- FORECAST: hiring need for the next quarter (v0.30.0) ---------------- */

/**
 * From the last 12 months, whatever the period filter says (sector / location / job class still apply):
 *   expected leavers next 3 months = leavers per month (over the months with history, up to 12) × 3, per sector and job class;
 *   + the open number still to fill on open vacancies; + approved positions empty with no vacancy (shown apart: a decision,
 *   not a forecast). Time to fill per job class = the median of «vacancy opened → joined» over the year, else its target.
 *   Confidence: LOW under 6 months of history or under 10 leavers, MEDIUM under 12 months, GOOD after.
 */
function insForecast_(D, p) {
  var t = today_(), from = addDaysYmd_(t, -365), sec = sectorMap_(), cache = {}, pos = {}, names = {};
  all_('POSITIONS').forEach(function (x) { pos[x.Position_ID] = x; });
  var s0 = str_(p.sector), l0 = str_(p.location), c0 = str_(p.cls);
  var keep = function (unit, loc, job) {
    if (s0 && (sec[unit] || {}).id !== s0) return false;
    if (l0 && loc !== l0) return false;
    if (c0 && kpiClassOf_(job, cache) !== c0) return false;
    return true;
  };
  var G = {}, R = function (kind, key, name) { var k = kind + '|' + key; return G[k] = G[k] || { kind: kind, key: key, name: name, active: 0, leavers: 0, open: 0, gap: 0 }; };
  var both = function (unit, job, f) {
    var s = sec[unit] || {}, c = kpiClassOf_(job, cache);
    f(R('SECTOR', s.id || '-', s.name || 'بدون قطاع')); f(R('CLASS', c, KPI_CLASS_[c] || c));
  };
  var first = '';
  all_('EMPLOYEES').forEach(function (e) {
    var ps = pos[e.Position_ID] || {}; if (!keep(ps.Org_Unit_ID, e.Location_ID || ps.Location_ID, ps.Job_Code)) return;
    if (e.Status === 'Active' && !(e.Exit_Date && e.Exit_Date < t)) both(ps.Org_Unit_ID, ps.Job_Code, function (r) { r.active++; });
    if (e.Exit_Date && e.Exit_Date >= from && e.Exit_Date <= t) {
      both(ps.Org_Unit_ID, ps.Job_Code, function (r) { r.leavers++; });
      if (!first || e.Exit_Date < first) first = e.Exit_Date;
    }
  });
  var openByPos = {};
  Object.keys(D.vac).forEach(function (k) {
    var v = D.vac[k]; if (VAC_OPEN_.indexOf(v.Status) < 0 || !keep(v.Org_Unit_ID, v.Location_ID, v.Job_Code)) return;
    var left = Math.max(0, num_(v.Required_HC, 0) - num_(v.Joined_HC, 0));
    openByPos[v.Position_ID] = (openByPos[v.Position_ID] || 0) + left;
    both(v.Org_Unit_ID, v.Job_Code, function (r) { r.open += left; });
  });
  Object.keys(pos).forEach(function (k) {
    var x = pos[k]; if (['Active', 'Frozen'].indexOf(x.Status) < 0 || x.Status === 'Frozen' || !keep(x.Org_Unit_ID, x.Location_ID, x.Job_Code)) return;
    var gap = num_(x.Structural_HC, 0) - num_(x.Occupied_HC, 0) - (openByPos[k] || 0);
    if (gap > 0) both(x.Org_Unit_ID, x.Job_Code, function (r) { r.gap += gap; });
  });
  // months of history: from the first leaver in the year (a month at least), up to 12
  var months = first ? Math.max(1, Math.min(12, Math.round(daysBetween_(first, t) / 30.4) || 1)) : 0;
  var totalLeavers = Object.keys(G).filter(function (k) { return G[k].kind === 'CLASS'; }).reduce(function (s, k) { return s + G[k].leavers; }, 0);
  var conf = !months || months < 6 || totalLeavers < 10 ? 'LOW' : months < 12 ? 'MEDIUM' : 'GOOD';
  var rows = Object.keys(G).map(function (k) {
    var r = G[k], perMonth = months ? r.leavers / months : 0, exp = Math.round(perMonth * 3 * 10) / 10;
    var avg = r.active + r.leavers / 2;
    return { kind: r.kind, key: r.key, name: r.name, active: r.active, leavers: r.leavers, turnover: avg ? insR1_(perMonth * 12 / avg * 100) : null,
      expected: exp, open: r.open, gap: r.gap, need: Math.ceil(exp + r.open) };
  });
  // time to fill per job class: vacancy opened → joined, over the year
  var ttf = {};
  all_('JOININGS').forEach(function (j) {
    if (j.Status !== 'JOINED' || !kpiIn_(j.Joined_Date, { from: from, to: t })) return;
    var v = D.vac[j.Vacancy_ID]; if (!v || !keep(v.Org_Unit_ID, v.Location_ID, v.Job_Code)) return;
    var d = kpiDur_(v.Recruitment_Start_Date || v.Created_At, j.Joined_Date); if (d === null) return;
    var c = kpiClassOf_(v.Job_Code, cache); (ttf[c] = ttf[c] || []).push(d);
  });
  var target = kpiTtf_(), min = num_(cfg_('KPI_MIN_CASES', 3), 3);
  var ttfRows = Object.keys(KPI_CLASS_).map(function (c) {
    var st = insStats_(ttf[c] || []);
    return { cls: c, name: KPI_CLASS_[c], n: st.n, median: st.n >= min ? st.median : null, target: target[c], use: st.n >= min ? st.median : target[c], from: st.n >= min ? 'HISTORY' : 'TARGET' };
  });
  var recs = kpiRecruiters_().filter(function (u) { var x = get_('USERS', u); return x && x.Status === 'Active'; });
  var need = rows.filter(function (r) { return r.kind === 'CLASS'; }).reduce(function (s, r) { return s + r.need; }, 0);
  return { months: months, leavers: totalLeavers, confidence: conf,
    bySector: rows.filter(function (r) { return r.kind === 'SECTOR'; }).sort(function (a, b) { return b.need - a.need; }),
    byClass: rows.filter(function (r) { return r.kind === 'CLASS'; }).sort(function (a, b) { return b.need - a.need; }),
    total: { need: need, expected: insR1_(rows.filter(function (r) { return r.kind === 'CLASS'; }).reduce(function (s, r) { return s + r.expected; }, 0)),
      open: rows.filter(function (r) { return r.kind === 'CLASS'; }).reduce(function (s, r) { return s + r.open; }, 0),
      gap: rows.filter(function (r) { return r.kind === 'CLASS'; }).reduce(function (s, r) { return s + r.gap; }, 0) },
    ttf: ttfRows, recruiters: recs.length, perRecruiter: recs.length ? insR1_(need / recs.length) : null };
}
