/**
 * Probation.gs — v0.25.0 (phase 7, stage 1): the probation period and medical insurance after confirmation.
 *
 * One probation per new hire, opened when he joins (or by HR for an employee already on the list).
 *   - One period only, at most 90 days (PROBATION_DAYS, never more) — no extension.
 *   - Goals (3–5) set by the direct manager in the first week and acknowledged by the employee (his private link, or in person).
 *   - Checkpoints (PROB_CHECKPOINTS, default 30, 60, 75): a short review on day 30 and 60, the final evaluation on day 75 —
 *     the same items as Kandil's annual appraisal: objectives (productivity, quality) and the four core values, 1–5 each with
 *     evidence. The employee rates himself first on his link (self-assessment).
 *   - A performance log during the period: dated notes (positive / corrective), shown to the employee on his link; a note is
 *     never edited, only voided with a reason.
 *   - An improvement plan (PIP) may start up to day 60, so it ends inside the 90 days.
 *   - The manager recommends; HR decides before day PROB_DECISION_DAY (80). Confirming: the HR team. Ending the employment:
 *     the HR sector manager only. The decision is told in a meeting, then a letter.
 *   - Reminders before each checkpoint and the decision (PROB_REMIND_DAYS), escalation when late (PROB_ESCALATE_DAYS).
 * Medical insurance (MEDICAL_CASES): opened on confirmation, to be added within MEDICAL_ADD_DAYS; HR team only.
 */

var PROB_ST_ = { ACTIVE: 'جارية', PENDING_DECISION: 'مستنية قرار الموارد البشرية', CONFIRMED: 'اتثبت', TERMINATED: 'انتهت — عدم تثبيت', ENDED: 'اتقفلت' };
var PROB_KIND_ = { D30: 'متابعة', D60: 'متابعة', FINAL: 'التقييم النهائي', SELF: 'التقييم الذاتي', STAY: 'مقابلة البقاء', MGR_SAT: 'رضا المدير عن التعيين' };
/** Kinds that are not the manager's own checkpoints. */
var PROB_SIDE_ = ['SELF', 'STAY', 'MGR_SAT'];
/** [code, name, group] — the annual appraisal items. */
var PROB_ITEMS_ = [['PROD', 'الإنتاجية', 'GOALS'], ['QUAL', 'الجودة', 'GOALS'], ['V1', 'التميز والمبادرة', 'VALUES'],
  ['V2', 'الالتزام والمسؤولية', 'VALUES'], ['V3', 'الانتماء والاحترام', 'VALUES'], ['V4', 'العمل الجماعي', 'VALUES']];
var PROB_SCALE_ = { 5: 'يتجاوز التوقعات بوضوح', 4: 'يتجاوز التوقعات في أغلب البنود', 3: 'يحقق المطلوب بالكامل', 2: 'يحقق جزء — محتاج تحسين محدد', 1: 'لا يحقق المطلوب' };
var MED_ST_ = { TO_ADD: 'لسه ماتضافش', ADDED: 'اتضاف', NOT_ELIGIBLE: 'مش هيتضاف' };

function probAdminRoles_() { return HR_ALL_ROLES.slice(); }
function probTerminateRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }
function medRoles_() { return HR_ALL_ROLES.slice(); }
function probIsAdmin_(ctx) { return hasAnyRole_(ctx, probAdminRoles_()); }

/* ---------------- settings ---------------- */

function probDays_() { return Math.max(30, Math.min(90, num_(cfg_('PROBATION_DAYS', 90), 90))); }
function probCheckpoints_() {
  var a = str_(cfg_('PROB_CHECKPOINTS', '30,60,75')).split(/[\s,]+/).map(Number).filter(function (n) { return n > 0; });
  var d = probDays_();
  if (a.length !== 3) a = [30, 60, 75];
  return { D30: Math.min(a[0], d), D60: Math.min(a[1], d), FINAL: Math.min(a[2], d) };
}
function probDecisionDay_() { return Math.min(probDays_(), Math.max(probCheckpoints_().FINAL, num_(cfg_('PROB_DECISION_DAY', 80), 80))); }
function probRemindDays_() { return str_(cfg_('PROB_REMIND_DAYS', '30,15,7')).split(/[\s,]+/).map(Number).filter(function (n) { return n > 0 && n <= 90; }); }
function probEscalateDays_() {
  var a = str_(cfg_('PROB_ESCALATE_DAYS', '3,7')).split(/[\s,]+/).map(Number).filter(function (n) { return n >= 0; });
  return [a[0] === undefined ? 3 : a[0], a[1] === undefined ? 7 : a[1]];
}
function probWeights_() {
  var w = null; try { w = JSON.parse(str_(cfg_('PROB_WEIGHTS', '')) || 'null'); } catch (e) { w = null; }
  var dflt = { PROD: 35, QUAL: 25, V1: 10, V2: 10, V3: 10, V4: 10 }, out = {}, sum = 0;
  PROB_ITEMS_.forEach(function (it) { var v = w && w[it[0]] !== undefined ? num_(w[it[0]], -1) : -1; out[it[0]] = v >= 0 ? v : dflt[it[0]]; sum += out[it[0]]; });
  return sum > 0 ? out : dflt;
}
function probPassAvg_() { return num_(cfg_('PROB_PASS_AVG', 3), 3); }
function probValueMin_() { return num_(cfg_('PROB_VALUE_MIN', 2), 2); }
/** Day N of the period (day one = the start date) → its date. */
function probDayDate_(start, n) { return addDaysYmd_(start, n - 1); }

/* ---------------- helpers ---------------- */

function probGet_(id) {
  var p = get_('PROBATIONS', str_(id));
  if (!p) throw userError_('فترة الاختبار غير موجودة.');
  return p;
}
function probJson_(s, dflt) { try { var v = JSON.parse(str_(s) || 'null'); return v === null ? dflt : v; } catch (e) { return dflt; } }
function probOpen_(p) { return p.Status === 'ACTIVE' || p.Status === 'PENDING_DECISION'; }
function probCanView_(ctx, p) {
  if (probIsAdmin_(ctx)) return true;
  var me = ctx.user.User_ID;
  if ([p.Manager_User_ID, p.Skip_User_ID, p.HR_Site_User_ID].indexOf(me) >= 0) return true;
  return !!(p.Org_Unit_ID && managedScope_(ctx.user).indexOf(p.Org_Unit_ID) >= 0);
}
/** The direct manager, his manager, and the HR team act on goals, notes and reviews. */
function probCanManage_(ctx, p) {
  if (ctx.readOnly) return false;
  if (probIsAdmin_(ctx)) return true;
  return [p.Manager_User_ID, p.Skip_User_ID].indexOf(ctx.user.User_ID) >= 0;
}
function probMustView_(ctx, p) { if (!probCanView_(ctx, p)) throw userError_('فترة الاختبار دي مش في نطاقك.'); }
function probMustManage_(ctx, p) {
  if (!probCanManage_(ctx, p)) throw userError_('ده للمدير المباشر ومديره وفريق الموارد البشرية.');
  if (!probOpen_(p)) throw userError_('فترة الاختبار اتقفلت.');
}
function probReviews_(id) { return find_('PROB_REVIEWS', { Probation_ID: id }); }
function probReview_(id, kind) { return probReviews_(id).filter(function (r) { return r.Kind === kind; })[0] || null; }
/**
 * v0.44.1 (CHG-92): the evaluator is a head of section (JL5) or higher — never a technician or a supervisor, whatever the
 * structure's reporting line says. Walk up from the position (reports-to, else the unit head, then the parent unit's head)
 * to the first eligible position whose holder has an active account; the skip-level reviewer the same way above him.
 */
var PROB_MIN_LEVEL_ = 5, PROB_NOT_EVALUATOR_ = /^(مشرف|فني|مساعد|عامل)/;
function probUp_(pid) {
  var p = pid ? get_('POSITIONS', pid) : null;
  if (!p) return '';
  if (p.Reports_To_Position_ID && p.Reports_To_Position_ID !== pid) return p.Reports_To_Position_ID;
  var u = get_('ORG_UNITS', p.Org_Unit_ID), g = 0;
  while (u && g++ < 15) {
    if (u.Head_Position_ID && u.Head_Position_ID !== pid) return u.Head_Position_ID;
    u = u.Parent_Org_Unit_ID ? get_('ORG_UNITS', u.Parent_Org_Unit_ID) : null;
  }
  return '';
}
function probEligible_(pid) {
  var p = get_('POSITIONS', pid);
  if (!p) return false;
  var job = get_('JOBS', p.Job_Code) || {}, m = /^JL(\d)$/.exec(jobLevel_(job));     // v0.44.2 (CHG-93): the grade's level when the job has none
  if (m) return Number(m[1]) >= PROB_MIN_LEVEL_;
  var title = str_(p.Position_Title) || str_(job.Job_Title_AR);
  if (PROB_NOT_EVALUATOR_.test(title)) return false;
  return where_('ORG_UNITS', function (u) { return u.Head_Position_ID === pid && u.Status !== 'Inactive'; }).length > 0;
}
/** { user, pos } — the first eligible position above `posId` with an active account, or empty. */
function probEvaluator_(posId) {
  var seen = {}, pid = probUp_(posId), g = 0;
  while (pid && !seen[pid] && g++ < 25) {
    seen[pid] = 1;
    if (probEligible_(pid)) {
      var us = find_('USERS', { Position_ID: pid, Status: 'Active' });
      if (us.length) return { user: us[0].User_ID, pos: pid };
    }
    pid = probUp_(pid);
  }
  return { user: '', pos: '' };
}
function probPeople_(posId, locId) {
  var mgr = '', skip = '';
  if (posId && get_('POSITIONS', posId)) {
    var ev = probEvaluator_(posId);
    mgr = ev.user;
    if (ev.pos) { skip = probEvaluator_(ev.pos).user; if (skip === mgr) skip = ''; }
  }
  var loc = locId ? get_('LOCATIONS', locId) : null;
  return { manager: mgr, skip: skip, hrSite: loc ? str_(loc.HR_Site_User_ID) : '' };
}
/** Weighted score (1–5, one decimal) and whether it passes the bar. */
function probScore_(scores) {
  var w = probWeights_(), sum = 0, wsum = 0, minV = 9;
  PROB_ITEMS_.forEach(function (it) {
    var s = num_(scores[it[0]] && scores[it[0]].s, 0);
    if (s) { sum += s * w[it[0]]; wsum += w[it[0]]; }
    if (it[2] === 'VALUES' && s) minV = Math.min(minV, s);
  });
  var avg = wsum ? Math.round(sum / wsum * 10) / 10 : 0;
  return { avg: avg, pass: avg >= probPassAvg_() && minV >= probValueMin_(), minValue: minV === 9 ? 0 : minV };
}

/** Probations opened before v0.26 get their stay interview (day 60) the first time they are looked at. */
function probEnsureStay_(p) {
  if (!probOpen_(p) || probReview_(p.Probation_ID, 'STAY')) return;
  withLock_(function () {
    insert_('PROB_REVIEWS', { Review_ID: nextId_('PROB_REVIEW'), Probation_ID: p.Probation_ID, Kind: 'STAY', Due_Date: probDayDate_(p.Start_Date, probCheckpoints_().D60), Status: 'OPEN', Scores_JSON: '',
      Goals_JSON: '', Overall: '', Weighted: '', Strengths: '', Improve: '', Note: '', Done_By: '', Done_At: '', Reminded_At: '', Esc_Level: '' }, 'SYSTEM');
  });
}

/* ---------------- opening ---------------- */

/** src = { Employee_ID, Joining_ID?, Person_ID?, Full_Name, Position_ID, Location_ID, Start_Date, Manager_User_ID? } */
function probCreate_(actor, src) {
  var start = str_(src.Start_Date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw userError_('تاريخ بداية فترة الاختبار غير صحيح.');
  if (src.Joining_ID && findOne_('PROBATIONS', { Joining_ID: src.Joining_ID })) return null;
  if (src.Employee_ID && where_('PROBATIONS', function (x) { return x.Employee_ID === src.Employee_ID && x.Status !== 'ENDED'; })[0])
    throw userError_('الموظف ده عنده فترة اختبار قبل كده — فترة الاختبار مرة واحدة بس.');
  var pos = src.Position_ID ? get_('POSITIONS', src.Position_ID) : null, people = probPeople_(src.Position_ID, src.Location_ID);
  var cp = probCheckpoints_(), days = probDays_(), p;
  withLock_(function () {
    p = insert_('PROBATIONS', { Probation_ID: nextId_('PROBATION'), Joining_ID: str_(src.Joining_ID), Employee_ID: str_(src.Employee_ID), Person_ID: str_(src.Person_ID),
      Full_Name: str_(src.Full_Name), Position_ID: str_(src.Position_ID), Org_Unit_ID: pos ? pos.Org_Unit_ID : '', Location_ID: str_(src.Location_ID),
      Start_Date: start, End_Date: probDayDate_(start, days), Decision_Due: probDayDate_(start, probDecisionDay_()),
      Manager_User_ID: str_(src.Manager_User_ID) || people.manager, Skip_User_ID: people.skip, HR_Site_User_ID: people.hrSite, Status: 'ACTIVE',
      Goals_JSON: '', Goals_Set_At: '', Goals_Set_By: '', Goals_Ack_At: '', Goals_Ack_Channel: '', Token_Hash: '', Token_Until: '', PIP_JSON: '',
      Recommendation: '', Rec_Reason: '', Rec_By: '', Rec_At: '', Decision: '', Decision_Note: '', Decision_By: '', Decision_At: '', Meeting_At: '',
      Letter_At: '', Close_Note: '', Reminders_JSON: '', Is_Demo: str_(src.Is_Demo) }, actor);
    var ids = nextIds_('PROB_REVIEW', 5);
    insertMany_('PROB_REVIEWS', [['D30', cp.D30], ['D60', cp.D60], ['FINAL', cp.FINAL], ['SELF', cp.FINAL], ['STAY', cp.D60]].map(function (k, i) {
      return { Review_ID: ids[i], Probation_ID: p.Probation_ID, Kind: k[0], Due_Date: probDayDate_(start, k[1]), Status: 'OPEN', Scores_JSON: '', Goals_JSON: '',
        Overall: '', Weighted: '', Strengths: '', Improve: '', Note: '', Done_By: '', Done_At: '', Reminded_At: '', Esc_Level: '' };
    }), actor);
  });
  // v0.44.1 (CHG-92): nobody at head-of-section level or above with an account → HR sets the evaluator
  if (!p.Manager_User_ID) notify_(roleHolders_(ROLE.HR_MANAGER).concat([people.hrSite]).filter(String), 'فترة اختبار من غير مقيّم — ' + p.Full_Name,
    'مفيش رئيس قسم أو أعلى عنده حساب على البوابة فوق مكانه في الهيكل. حدد المقيّم من «تغيير المدير».', 'PROBATION', p.Probation_ID, true);
  if (p.Manager_User_ID) notify_([p.Manager_User_ID], 'فترة اختبار بدأت — ' + p.Full_Name, 'حط أهداف فترة الاختبار (3 لـ 5 أهداف) في أول أسبوع واتفق عليها معاه. التقييم النهائي يوم ' + cp.FINAL + ' والقرار قبل يوم ' + probDecisionDay_() + '.', 'PROBATION', p.Probation_ID, true);
  return p;
}

/** Hook: the new hire joined → his probation opens (when PROBATION_ENABLED). */
function probOnJoined_(actor, j, vac, jd, empId, name) {
  if (!cfg_('PROBATION_ENABLED', true)) return null;
  return probCreate_(actor, { Joining_ID: j.Joining_ID, Employee_ID: str_(empId), Person_ID: j.Person_ID, Full_Name: name || '',
    Position_ID: vac ? vac.Position_ID : '', Location_ID: vac ? vac.Location_ID : '', Start_Date: jd, Is_Demo: str_(j.Is_Demo) });
}

/** HR: a probation for an employee already on the list (hired outside the portal). p = { Employee_ID, Start_Date, Manager_User_ID? } */
function probStart_(ctx, p) {
  if (!probIsAdmin_(ctx) || ctx.readOnly) throw userError_('بدء فترة اختبار لموظف حالي لفريق الموارد البشرية بس.');
  var e = get_('EMPLOYEES', str_(p.Employee_ID));
  if (!e || e.Status !== 'Active') throw userError_('الموظف غير موجود أو مش على رأس العمل.');
  var start = str_(p.Start_Date) || str_(e.Hire_Date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw userError_('اختار تاريخ بداية فترة الاختبار.');
  if (e.Hire_Date && start < str_(e.Hire_Date)) throw userError_('بداية فترة الاختبار مايبقاش قبل تاريخ التعيين (' + e.Hire_Date + ').');
  if (probDayDate_(start, probDays_()) < today_()) throw userError_('الـ ' + probDays_() + ' يوم من التاريخ ده خلصت بالفعل — مفيش فترة اختبار تتفتح.');
  if (p.Manager_User_ID && !get_('USERS', str_(p.Manager_User_ID))) throw userError_('المدير المباشر غير موجود.');
  var x = probCreate_(ctx.user.User_ID, { Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, Position_ID: e.Position_ID, Location_ID: e.Location_ID, Start_Date: start,
    Manager_User_ID: str_(p.Manager_User_ID), Is_Demo: str_(e.Is_Demo) });
  event_(ctx, 'PROBATION', x.Probation_ID, 'STARTED', start);
  return { id: x.Probation_ID };
}

/* ---------------- views ---------------- */

function probNext_(p, revs, t) {
  if (!probOpen_(p)) return null;
  if (!probJson_(p.Goals_JSON, []).length) return { k: 'GOALS', due: probDayDate_(p.Start_Date, 7), late: probDayDate_(p.Start_Date, 7) < t };
  var open = revs.filter(function (r) { return r.Status === 'OPEN' && PROB_SIDE_.indexOf(r.Kind) < 0; }).sort(function (a, b) { return a.Due_Date < b.Due_Date ? -1 : 1; })[0];
  if (open) return { k: open.Kind, due: open.Due_Date, late: open.Due_Date < t };
  if (!p.Recommendation) return { k: 'RECOMMEND', due: p.Decision_Due, late: p.Decision_Due < t };
  return { k: 'DECIDE', due: p.Decision_Due, late: p.Decision_Due < t };
}
function probRow_(p, names, t, units, jobs) {
  var revs = probReviews_(p.Probation_ID), pos = p.Position_ID ? get_('POSITIONS', p.Position_ID) : null;
  var job = pos ? (jobs[pos.Job_Code] || '') : '', fin = revs.filter(function (r) { return r.Kind === 'FINAL'; })[0];
  var low = revs.some(function (r) { return (r.Kind === 'D30' || r.Kind === 'D60') && r.Status === 'DONE' && num_(r.Overall, 5) <= 2; });
  var pip = probJson_(p.PIP_JSON, null), day = Math.max(0, Math.min(probDays_(), daysBetween_(p.Start_Date, t) + 1));
  return { id: p.Probation_ID, name: p.Full_Name, employeeId: p.Employee_ID, job: job, unit: units[p.Org_Unit_ID] || '', start: p.Start_Date, end: p.End_Date,
    decisionDue: p.Decision_Due, day: probOpen_(p) ? day : null, days: probDays_(), status: p.Status, statusName: PROB_ST_[p.Status] || p.Status,
    manager: names[p.Manager_User_ID] || '', goals: probJson_(p.Goals_JSON, []).length, ack: !!p.Goals_Ack_At, next: probNext_(p, revs, t),
    done: revs.filter(function (r) { return r.Status === 'DONE' && PROB_SIDE_.indexOf(r.Kind) < 0; }).map(function (r) { return r.Kind; }),
    score: fin && fin.Status === 'DONE' ? num_(fin.Weighted, 0) : null, low: low, pip: pip ? (pip.outcome || 'OPEN') : '', rec: p.Recommendation, decision: p.Decision,
    isDemo: p.Is_Demo === 'Y' };
}
function probLookups_() {
  var units = {}, jobs = {};
  all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  return { units: units, jobs: jobs };
}

/** p.tab = mine | active | closed | all */
function probList_(ctx, p) {
  var tab = str_(p.tab) || 'mine', t = today_(), names = userNames_(), L = probLookups_(), me = ctx.user.User_ID;
  var vis = all_('PROBATIONS').filter(function (x) { return probCanView_(ctx, x); });
  var rows = vis.filter(function (x) {
    if (tab === 'active') return probOpen_(x);
    if (tab === 'closed') return !probOpen_(x);
    if (tab === 'mine') return probOpen_(x) && probMine_(ctx, x, t);
    return true;
  }).map(function (x) { return probRow_(x, names, t, L.units, L.jobs); })
    .sort(function (a, b) { return ((a.next && a.next.due) || a.end) < ((b.next && b.next.due) || b.end) ? -1 : 1; });
  return { tab: tab, rows: rows, days: probDays_(), checkpoints: probCheckpoints_(), decisionDay: probDecisionDay_(),
    counts: { mine: vis.filter(function (x) { return probOpen_(x) && probMine_(ctx, x, t); }).length, active: vis.filter(probOpen_).length },
    canStart: probIsAdmin_(ctx) && !ctx.readOnly, enabled: !!cfg_('PROBATION_ENABLED', true), me: me };
}
/** Is there something for this user to do on it now? */
function probMine_(ctx, p, t) {
  if (ctx.readOnly || !probOpen_(p)) return false;
  var me = ctx.user.User_ID, n = probNext_(p, probReviews_(p.Probation_ID), t), mgr = p.Manager_User_ID === me;
  if (!n) return false;
  if (n.k === 'DECIDE') return p.Recommendation === 'TERMINATE' ? hasAnyRole_(ctx, probTerminateRoles_()) : probIsAdmin_(ctx);
  if (mgr) return n.k === 'GOALS' || n.k === 'RECOMMEND' || n.due <= addDaysYmd_(t, 7);
  return probIsAdmin_(ctx) && n.late;
}

function probDetail_(ctx, p) {
  var x = probGet_(p.Probation_ID);
  probMustView_(ctx, x);
  var names = userNames_(), t = today_(), L = probLookups_(), revs = probReviews_(x.Probation_ID);
  var out = probRow_(x, names, t, L.units, L.jobs);
  var loc = x.Location_ID ? get_('LOCATIONS', x.Location_ID) : null;
  out.location = loc ? loc.Name_AR : '';
  out.managerId = x.Manager_User_ID; out.skip = names[x.Skip_User_ID] || ''; out.hrSite = names[x.HR_Site_User_ID] || '';
  out.goalsList = probJson_(x.Goals_JSON, []); out.goalsSetAt = x.Goals_Set_At; out.goalsSetBy = names[x.Goals_Set_By] || '';
  out.ackAt = x.Goals_Ack_At; out.ackChannel = x.Goals_Ack_Channel; out.linkActive = !!(x.Token_Hash && x.Token_Until >= t);
  var hr = probIsAdmin_(ctx);
  probEnsureStay_(x);
  revs = probReviews_(x.Probation_ID);
  out.reviews = revs.filter(function (r) { return r.Kind !== 'STAY' || hr; }).map(function (r) {
    return { id: r.Review_ID, kind: r.Kind, due: r.Due_Date, status: r.Status, overall: r.Overall === '' ? null : num_(r.Overall, 0),
      weighted: r.Weighted === '' ? null : num_(r.Weighted, 0), scores: probJson_(r.Scores_JSON, {}), goals: probJson_(r.Goals_JSON, []),
      strengths: r.Strengths, improve: r.Improve, note: r.Note, by: r.Done_By === 'PUBLIC' ? x.Full_Name : (names[r.Done_By] || ''), at: r.Done_At,
      late: r.Status === 'OPEN' && r.Due_Date < t, open: r.Status === 'OPEN' && probReviewWindow_(x, r, t) };
  }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : (a.kind === 'SELF' ? -1 : 1); });
  out.notes = find_('PROB_NOTES', { Probation_ID: x.Probation_ID }).map(function (n) {
    return { id: n.Note_ID, kind: n.Kind, date: n.Event_Date, text: n.Text, impact: n.Impact, by: names[n.Created_By] || '', at: n.Created_At, status: n.Status,
      reply: n.Reply, replyAt: n.Reply_At, voidReason: n.Void_Reason, voidedBy: names[n.Voided_By] || '' };
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  out.pipPlan = probJson_(x.PIP_JSON, null);
  if (out.pipPlan) out.pipPlan.byName = names[out.pipPlan.by] || '';
  out.recReason = x.Rec_Reason; out.recBy = names[x.Rec_By] || ''; out.recAt = x.Rec_At;
  out.decisionNote = x.Decision_Note; out.decisionBy = names[x.Decision_By] || ''; out.decisionAt = x.Decision_At; out.meetingAt = x.Meeting_At; out.letterAt = x.Letter_At;
  out.closeNote = x.Close_Note;
  var fin = revs.filter(function (r) { return r.Kind === 'FINAL'; })[0];
  out.computed = fin && fin.Status === 'DONE' ? probScore_(probJson_(fin.Scores_JSON, {})) : null;
  out.items = PROB_ITEMS_.map(function (it) { return { code: it[0], name: it[1], group: it[2] }; });
  out.weights = probWeights_(); out.scale = PROB_SCALE_; out.passAvg = probPassAvg_(); out.valueMin = probValueMin_();
  out.pipLastDay = probDayDate_(x.Start_Date, 60);
  out.medical = hasAnyRole_(ctx, medRoles_()) ? (function () { var c = findOne_('MEDICAL_CASES', { Probation_ID: x.Probation_ID }); return c ? medView_(c, names, t) : null; })() : null;
  var manage = probCanManage_(ctx, x) && probOpen_(x);
  out.can = { manage: manage, admin: probIsAdmin_(ctx) && !ctx.readOnly,
    recommend: manage && !!(fin && fin.Status === 'DONE') && x.Status === 'ACTIVE',
    decide: !ctx.readOnly && probOpen_(x) && probIsAdmin_(ctx) && !!(fin && fin.Status === 'DONE'),
    terminate: !ctx.readOnly && hasAnyRole_(ctx, probTerminateRoles_()),
    stay: !ctx.readOnly && hr && probOpen_(x),
    mgrSat: !ctx.readOnly && x.Status === 'CONFIRMED' && (x.Manager_User_ID === ctx.user.User_ID || hr) && !!(probReview_(x.Probation_ID, 'MGR_SAT') || {}).Review_ID && probReview_(x.Probation_ID, 'MGR_SAT').Status === 'OPEN',
    after: !ctx.readOnly && probIsAdmin_(ctx) && (x.Status === 'CONFIRMED' || x.Status === 'TERMINATED') };
  return out;
}
/** A review can be filled from 7 days before its date (the final one from 10 days before) until the decision. */
function probReviewWindow_(p, r, t) {
  if (!probOpen_(p) || r.Status !== 'OPEN') return false;
  return t >= addDaysYmd_(r.Due_Date, r.Kind === 'FINAL' || r.Kind === 'SELF' ? -10 : -7);
}

/* ---------------- actions ---------------- */

function probCleanGoals_(goals) {
  if (!Array.isArray(goals)) throw userError_('اكتب الأهداف.');
  var g = goals.map(function (x) { return { t: str_(x && x.t).slice(0, 200), m: str_(x && x.m).slice(0, 200), d: str_(x && x.d).slice(0, 10) }; })
    .filter(function (x) { return x.t || x.m; });
  if (g.length < 3 || g.length > 5) throw userError_('أهداف فترة الاختبار من 3 لـ 5 أهداف.');
  g.forEach(function (x, i) {
    if (x.t.length < 5) throw userError_('اكتب الهدف رقم ' + (i + 1) + ' بوضوح.');
    if (x.m.length < 3) throw userError_('اكتب إزاي هيتقاس الهدف رقم ' + (i + 1) + '.');
    if (x.d && !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) throw userError_('تاريخ الهدف رقم ' + (i + 1) + ' غير صحيح.');
  });
  return g;
}
function probScoresIn_(sc, needEvidence) {
  var out = {};
  PROB_ITEMS_.forEach(function (it) {
    var r = (sc || {})[it[0]] || {}, s = Number(r.s);
    if (!(s >= 1 && s <= 5) || Math.round(s) !== s) throw userError_('قيّم «' + it[1] + '» من 1 لـ 5.');
    var e = str_(r.e).slice(0, 400);
    if (needEvidence && e.length < 5) throw userError_('اكتب مثال أو دليل لتقييم «' + it[1] + '».');
    out[it[0]] = { s: s, e: e };
  });
  return out;
}

/**
 * p = { Probation_ID, action, ... }
 *   GOALS {goals:[{t,m,d}], reason} · ACK {channel} · LINK · NOTE {kind, date, text, impact} · VOID_NOTE {Note_ID, reason}
 *   REVIEW {kind: D30|D60, overall, goals:[{st,n}], strengths, improve, note} · FINAL {scores:{CODE:{s,e}}, strengths, improve, note}
 *   PIP_START {goals:[{t,m}], support, review} · PIP_OUTCOME {outcome, note} · RECOMMEND {rec, reason}
 *   DECIDE {decision, note} · MEETING {date} · LETTER · END {reason} · MANAGER {User_ID, reason}
 */
function probAction_(ctx, p) {
  var x = probGet_(p.Probation_ID), act = str_(p.action), me = ctx.user.User_ID, t = today_(), patch = null, res, out = { ok: true };
  probMustView_(ctx, x);
  if (ctx.readOnly) throw userError_('العرض بس — مفيش تعديل.');

  if (act === 'GOALS') {
    probMustManage_(ctx, x);
    var g = probCleanGoals_(p.goals), had = probJson_(x.Goals_JSON, []).length;
    if (had && x.Goals_Ack_At && str_(p.reason).length < 5) throw userError_('الموظف أقر بالأهداف — اكتب سبب التعديل (وهيحتاج يقر تاني).');
    patch = { Goals_JSON: JSON.stringify(g), Goals_Set_At: nowIso_(), Goals_Set_By: me };
    if (had && x.Goals_Ack_At) { patch.Goals_Ack_At = ''; patch.Goals_Ack_Channel = ''; }
  } else if (act === 'ACK') {
    probMustManage_(ctx, x);
    if (!probJson_(x.Goals_JSON, []).length) throw userError_('حط الأهداف الأول.');
    if (x.Goals_Ack_At) throw userError_('الموظف أقر بالأهداف بالفعل.');
    patch = { Goals_Ack_At: nowIso_(), Goals_Ack_Channel: str_(p.channel) === 'PAPER' ? 'PAPER' : 'IN_PERSON' };
  } else if (act === 'LINK') {
    probMustManage_(ctx, x);
    var token = randomToken_(), until = addDaysYmd_(t, num_(cfg_('PROB_LINK_DAYS', 7), 7));   // v0.39.0 (CHG-82): 7 days, «send a new link» any time
    withLock_(function () { update_('PROBATIONS', x.Probation_ID, { Token_Hash: hash_('PROB:' + token), Token_Until: until }, me); });
    audit_(ctx, { entityType: 'PROBATION', entityId: x.Probation_ID, action: 'LINK', newValue: 'until ' + until });
    return { link: ScriptApp.getService().getUrl() + '?prob=' + token, until: until };
  } else if (act === 'NOTE') {
    probMustManage_(ctx, x);
    var kind = str_(p.kind) === 'COR' ? 'COR' : 'POS', date = str_(p.date) || t, text = str_(p.text);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > t || date < x.Start_Date) throw userError_('تاريخ الموقف لازم يكون جوه فترة الاختبار ومش في المستقبل.');
    if (text.length < 10) throw userError_('اكتب الموقف بالتفصيل: حصل إيه وإمتى.');
    withLock_(function () {
      insert_('PROB_NOTES', { Note_ID: nextId_('PROB_NOTE'), Probation_ID: x.Probation_ID, Kind: kind, Event_Date: date, Text: text.slice(0, 1000),
        Impact: str_(p.impact).slice(0, 400), Status: 'Active', Reply: '', Reply_At: '', Void_Reason: '', Voided_By: '', Voided_At: '' }, me);
    });
    event_(ctx, 'PROBATION', x.Probation_ID, 'NOTE', kind + ' ' + date);
    return out;
  } else if (act === 'VOID_NOTE') {
    var n = get_('PROB_NOTES', str_(p.Note_ID));
    if (!n || n.Probation_ID !== x.Probation_ID || n.Status !== 'Active') throw userError_('الملاحظة غير موجودة.');
    if (n.Created_By !== me && !probIsAdmin_(ctx)) throw userError_('إلغاء الملاحظة لكاتبها أو فريق الموارد البشرية.');
    if (str_(p.reason).length < 5) throw userError_('اكتب سبب إلغاء الملاحظة.');
    var rn;
    withLock_(function () { rn = update_('PROB_NOTES', n.Note_ID, { Status: 'Voided', Void_Reason: str_(p.reason).slice(0, 300), Voided_By: me, Voided_At: nowIso_() }, me); });
    auditDiff_(ctx, 'PROB_NOTE', n.Note_ID, rn.before, rn.after, str_(p.reason));
    return out;
  } else if (act === 'REVIEW') {
    probMustManage_(ctx, x);
    var kd = str_(p.kind); if (kd !== 'D30' && kd !== 'D60') throw userError_('نوع المتابعة غير معروف.');
    var r = probReview_(x.Probation_ID, kd);
    if (!r || r.Status !== 'OPEN') throw userError_('المتابعة دي اتسجلت قبل كده.');
    if (!probReviewWindow_(x, r, t)) throw userError_('المتابعة دي بتتفتح من ' + addDaysYmd_(r.Due_Date, -7) + '.');
    var goals = probJson_(x.Goals_JSON, []);
    if (!goals.length) throw userError_('حط أهداف فترة الاختبار الأول.');
    var ov = Number(p.overall);
    if (!(ov >= 1 && ov <= 5) || Math.round(ov) !== ov) throw userError_('اختار التقييم العام من 1 لـ 5.');
    var gp = goals.map(function (g0, i) {
      var q = (p.goals || [])[i] || {}, st = ['ON', 'BEHIND', 'DONE'].indexOf(str_(q.st)) >= 0 ? str_(q.st) : '';
      if (!st) throw userError_('حدد وضع الهدف رقم ' + (i + 1) + '.');
      return { st: st, n: str_(q.n).slice(0, 300) };
    });
    if (str_(p.strengths).length < 3 || str_(p.improve).length < 3) throw userError_('اكتب إيه اللي ماشي كويس وإيه اللي محتاج تحسين.');
    withLock_(function () {
      update_('PROB_REVIEWS', r.Review_ID, { Status: 'DONE', Overall: String(ov), Goals_JSON: JSON.stringify(gp), Strengths: str_(p.strengths).slice(0, 600),
        Improve: str_(p.improve).slice(0, 600), Note: str_(p.note).slice(0, 600), Done_By: me, Done_At: nowIso_() }, me);
    });
    event_(ctx, 'PROBATION', x.Probation_ID, 'REVIEW_' + kd, String(ov));
    if (ov <= 2) {
      var to = [x.HR_Site_User_ID].concat(roleHolders_(ROLE.HR_MANAGER));
      notify_(to, 'تقييم منخفض في فترة الاختبار — ' + x.Full_Name, 'متابعة يوم ' + (kd === 'D30' ? probCheckpoints_().D30 : probCheckpoints_().D60) + ': ' + ov + ' من 5. اتكلم مع المدير عن خطة تحسين الأداء (لازم تبدأ بحد أقصى يوم 60).', 'PROBATION', x.Probation_ID, false);
    }
    return out;
  } else if (act === 'FINAL') {
    probMustManage_(ctx, x);
    var fr = probReview_(x.Probation_ID, 'FINAL'), sr = probReview_(x.Probation_ID, 'SELF');
    if (!fr || fr.Status !== 'OPEN') throw userError_('التقييم النهائي اتسجل قبل كده.');
    if (!probReviewWindow_(x, fr, t)) throw userError_('التقييم النهائي بيتفتح من ' + addDaysYmd_(fr.Due_Date, -10) + '.');
    if (sr && sr.Status === 'OPEN' && t < fr.Due_Date) throw userError_('الموظف بيقيّم نفسه الأول — استنى تقييمه الذاتي أو لحد ' + fr.Due_Date + '.');
    var sc = probScoresIn_(p.scores, true), w = probScore_(sc);
    if (str_(p.strengths).length < 3 || str_(p.improve).length < 3) throw userError_('اكتب نقاط القوة ونقاط التحسين.');
    withLock_(function () {
      update_('PROB_REVIEWS', fr.Review_ID, { Status: 'DONE', Scores_JSON: JSON.stringify(sc), Weighted: String(w.avg), Overall: String(Math.round(w.avg)),
        Strengths: str_(p.strengths).slice(0, 800), Improve: str_(p.improve).slice(0, 800), Note: str_(p.note).slice(0, 800), Done_By: me, Done_At: nowIso_() }, me);
      if (sr && sr.Status === 'OPEN') update_('PROB_REVIEWS', sr.Review_ID, { Status: 'SKIPPED', Note: 'اتقفل مع التقييم النهائي' }, me);
    });
    event_(ctx, 'PROBATION', x.Probation_ID, 'FINAL', w.avg + (w.pass ? ' pass' : ' below'));
    out.computed = w;
    return out;
  } else if (act === 'STAY') {
    if (!probIsAdmin_(ctx) || !probOpen_(x)) throw userError_('مقابلة البقاء لفريق الموارد البشرية وفترة الاختبار مفتوحة.');
    probEnsureStay_(x);
    var st = probReview_(x.Probation_ID, 'STAY');
    if (!st || st.Status !== 'OPEN') throw userError_('مقابلة البقاء اتسجلت قبل كده.');
    if (t < addDaysYmd_(st.Due_Date, -10)) throw userError_('مقابلة البقاء بتتعمل قرب يوم 60 (من ' + addDaysYmd_(st.Due_Date, -10) + ').');
    var sup = Number(p.support), stay = Number(p.stay), risk = str_(p.risk);
    if (!(sup >= 1 && sup <= 5) || !(stay >= 1 && stay <= 5)) throw userError_('اختار تقييم دعم المدير ونية البقاء من 1 لـ 5.');
    if (['LOW', 'MED', 'HIGH'].indexOf(risk) < 0) throw userError_('حدد احتمال إنه يسيب الشغل.');
    if (str_(p.likes).length < 3 || str_(p.leave).length < 3) throw userError_('اكتب إجابة السؤالين.');
    withLock_(function () {
      update_('PROB_REVIEWS', st.Review_ID, { Status: 'DONE', Scores_JSON: JSON.stringify({ likes: str_(p.likes).slice(0, 600), leave: str_(p.leave).slice(0, 600), support: sup, stay: stay, risk: risk }),
        Overall: String(stay), Note: str_(p.note).slice(0, 600), Done_By: me, Done_At: nowIso_() }, me);
    });
    event_(ctx, 'PROBATION', x.Probation_ID, 'STAY', risk);
    if (risk === 'HIGH') notify_(roleHolders_(ROLE.HR_MANAGER).concat([x.HR_Site_User_ID]), 'احتمال كبير يسيب الشغل — ' + x.Full_Name, 'من مقابلة البقاء يوم 60. راجع الأسباب واتكلم مع مديره.', 'PROBATION', x.Probation_ID, true);
    return out;
  } else if (act === 'MGR_SAT') {
    var ms = probReview_(x.Probation_ID, 'MGR_SAT');
    if (!ms || ms.Status !== 'OPEN') throw userError_('الاستبيان ده مش مفتوح.');
    if (x.Manager_User_ID !== me && !probIsAdmin_(ctx)) throw userError_('الاستبيان للمدير المباشر.');
    var qs = [Number(p.fit), Number(p.service), Number(p.again)];
    if (qs.some(function (q) { return !(q >= 1 && q <= 5); })) throw userError_('جاوب على الأسئلة التلاتة من 1 لـ 5.');
    var avg = Math.round((qs[0] + qs[1] + qs[2]) / 3 * 10) / 10;
    withLock_(function () { update_('PROB_REVIEWS', ms.Review_ID, { Status: 'DONE', Scores_JSON: JSON.stringify({ fit: qs[0], service: qs[1], again: qs[2] }), Overall: String(avg), Weighted: String(avg), Note: str_(p.note).slice(0, 600), Done_By: me, Done_At: nowIso_() }, me); });
    return out;
  } else if (act === 'PIP_START') {
    probMustManage_(ctx, x);
    if (probJson_(x.PIP_JSON, null)) throw userError_('في خطة تحسين بالفعل.');
    if (t > probDayDate_(x.Start_Date, 60)) throw userError_('خطة التحسين لازم تبدأ بحد أقصى يوم 60 (' + probDayDate_(x.Start_Date, 60) + ') عشان تخلص جوه فترة الاختبار — ومفيش تمديد.');
    var pg = (p.goals || []).map(function (q) { return { t: str_(q && q.t).slice(0, 200), m: str_(q && q.m).slice(0, 200) }; }).filter(function (q) { return q.t; });
    if (pg.length < 2 || pg.length > 3) throw userError_('خطة التحسين فيها من 2 لـ 3 أهداف محددة.');
    pg.forEach(function (q, i) { if (q.t.length < 5 || q.m.length < 3) throw userError_('اكتب هدف التحسين رقم ' + (i + 1) + ' وإزاي هيتقاس.'); });
    if (str_(p.support).length < 10) throw userError_('اكتب الدعم اللي هيتقدم (تدريب، مرافقة، أدوات، وقت مع المدير).');
    var rv = str_(p.review);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rv) || rv < addDaysYmd_(t, 14) || rv > addDaysYmd_(t, 28)) throw userError_('ميعاد مراجعة الخطة من أسبوعين لـ 4 أسابيع من النهارده.');
    if (rv > addDaysYmd_(x.Decision_Due, -3)) throw userError_('ميعاد مراجعة الخطة لازم يكون قبل ميعاد القرار (' + x.Decision_Due + ') بـ 3 أيام على الأقل.');
    patch = { PIP_JSON: JSON.stringify({ goals: pg, support: str_(p.support).slice(0, 800), review: rv, start: t, by: me, outcome: '', note: '', at: '' }) };
  } else if (act === 'PIP_OUTCOME') {
    probMustManage_(ctx, x);
    var pip = probJson_(x.PIP_JSON, null);
    if (!pip) throw userError_('مفيش خطة تحسين.');
    if (pip.outcome) throw userError_('نتيجة الخطة اتسجلت.');
    var oc = str_(p.outcome);
    if (['PASSED', 'PARTIAL', 'FAILED'].indexOf(oc) < 0) throw userError_('اختار نتيجة الخطة.');
    if (t < addDaysYmd_(pip.review, -3)) throw userError_('النتيجة بتتسجل قرب ميعاد المراجعة (' + pip.review + ').');
    if (str_(p.note).length < 10) throw userError_('اكتب الدليل على النتيجة.');
    pip.outcome = oc; pip.note = str_(p.note).slice(0, 800); pip.at = nowIso_(); pip.outBy = me;
    patch = { PIP_JSON: JSON.stringify(pip) };
  } else if (act === 'RECOMMEND') {
    probMustManage_(ctx, x);
    if (x.Status !== 'ACTIVE') throw userError_('التوصية اتسجلت.');
    var f2 = probReview_(x.Probation_ID, 'FINAL');
    if (!f2 || f2.Status !== 'DONE') throw userError_('سجّل التقييم النهائي الأول.');
    var rec = str_(p.rec), why = str_(p.reason);
    if (['CONFIRM', 'TERMINATE'].indexOf(rec) < 0) throw userError_('اختار التوصية: تثبيت أو عدم تثبيت.');
    var cpu = probScore_(probJson_(f2.Scores_JSON, {}));
    if (why.length < 5) throw userError_('اكتب سبب التوصية.');
    if ((rec === 'CONFIRM') !== cpu.pass && why.length < 20) throw userError_('التوصية عكس نتيجة التقييم (' + cpu.avg + ') — اكتب السبب بالتفصيل.');
    var pp = probJson_(x.PIP_JSON, null);
    if (pp && !pp.outcome) throw userError_('سجّل نتيجة خطة التحسين الأول.');
    patch = { Recommendation: rec, Rec_Reason: why.slice(0, 800), Rec_By: me, Rec_At: nowIso_(), Status: 'PENDING_DECISION' };
    notify_(rec === 'TERMINATE' ? roleHolders_(ROLE.HR_SECTOR) : [x.HR_Site_User_ID].concat(roleHolders_(ROLE.HR_MANAGER)),
      'توصية فترة اختبار — ' + x.Full_Name, (rec === 'CONFIRM' ? 'تثبيت' : 'عدم تثبيت') + ' · التقييم ' + cpu.avg + ' من 5 · القرار قبل ' + x.Decision_Due + '.', 'PROBATION', x.Probation_ID, true);
  } else if (act === 'DECIDE') {
    if (!probIsAdmin_(ctx)) throw userError_('قرار فترة الاختبار لفريق الموارد البشرية.');
    if (!probOpen_(x)) throw userError_('القرار اتاخد بالفعل.');
    var f3 = probReview_(x.Probation_ID, 'FINAL');
    if (!f3 || f3.Status !== 'DONE') throw userError_('مفيش قرار من غير التقييم النهائي.');
    var dec = str_(p.decision), dn = str_(p.note);
    if (['CONFIRMED', 'TERMINATED'].indexOf(dec) < 0) throw userError_('اختار القرار.');
    if (dec === 'TERMINATED' && !hasAnyRole_(ctx, probTerminateRoles_())) throw userError_('قرار عدم التثبيت لمدير قطاع الموارد البشرية بس.');
    if (dec === 'TERMINATED' && dn.length < 20) throw userError_('اكتب أسباب عدم التثبيت بالتفصيل ومرتبطة بالتقييم.');
    if (dn.length < 3) throw userError_('اكتب ملاحظة القرار.');
    if (x.Recommendation && ((x.Recommendation === 'CONFIRM') !== (dec === 'CONFIRMED')) && dn.length < 20) throw userError_('القرار عكس توصية المدير — اكتب السبب بالتفصيل.');
    patch = { Status: dec, Decision: dec, Decision_Note: dn.slice(0, 1000), Decision_By: me, Decision_At: nowIso_() };
  } else if (act === 'MEETING') {
    if (!probIsAdmin_(ctx) || probOpen_(x)) throw userError_('اجتماع إبلاغ القرار بيتسجل بعد القرار.');
    var md = str_(p.date) || t;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(md) || md > t) throw userError_('تاريخ الاجتماع غير صحيح.');
    patch = { Meeting_At: md };
  } else if (act === 'LETTER') {
    if (!probIsAdmin_(ctx) || probOpen_(x)) throw userError_('الخطاب بيتطبع بعد القرار.');
    audit_(ctx, { entityType: 'PROBATION', entityId: x.Probation_ID, action: 'LETTER', newValue: x.Decision });
    if (!x.Letter_At) patch = { Letter_At: nowIso_() }; else return out;
  } else if (act === 'END') {
    if (!probIsAdmin_(ctx) || !probOpen_(x)) throw userError_('قفل فترة الاختبار لفريق الموارد البشرية وهي مفتوحة.');
    if (str_(p.reason).length < 5) throw userError_('اكتب السبب (مثلاً: استقال).');
    patch = { Status: 'ENDED', Close_Note: str_(p.reason).slice(0, 400), Token_Hash: '' };
  } else if (act === 'MANAGER') {
    if (!probIsAdmin_(ctx) || !probOpen_(x)) throw userError_('تغيير المدير المباشر لفريق الموارد البشرية.');
    var nu = get_('USERS', str_(p.User_ID));
    if (!nu || nu.Status !== 'Active') throw userError_('اختار المدير المباشر.');
    if (str_(p.reason).length < 3) throw userError_('اكتب السبب.');
    patch = { Manager_User_ID: nu.User_ID };
    notify_([nu.User_ID], 'بقيت مسؤول عن فترة اختبار — ' + x.Full_Name, 'السبب: ' + str_(p.reason).slice(0, 120), 'PROBATION', x.Probation_ID, true);
  } else throw userError_('عملية غير معروفة.');

  withLock_(function () { res = update_('PROBATIONS', x.Probation_ID, patch, me); });
  auditDiff_(ctx, 'PROBATION', x.Probation_ID, res.before, res.after, str_(p.reason || p.note));
  if (act === 'DECIDE') probAfterDecision_(ctx, res.after);
  if (act === 'GOALS' && probJson_(x.Goals_JSON, []).length === 0 && x.HR_Site_User_ID && x.HR_Site_User_ID !== me)
    notify_([x.HR_Site_User_ID], 'أهداف فترة الاختبار اتحطت — ' + x.Full_Name, 'ابعتله لينك فترة الاختبار يقر بالأهداف، أو سجّل إقراره لو اتفقوا وجهاً لوجه.', 'PROBATION', x.Probation_ID, false);
  return out;
}

function probAfterDecision_(ctx, x) {
  var me = ctx.user.User_ID;
  event_(ctx, 'PROBATION', x.Probation_ID, x.Decision, x.Decision_Note);
  var e = x.Employee_ID ? get_('EMPLOYEES', x.Employee_ID) : null;
  if (e) try { withLock_(function () { empHistory_(me, e, x.Decision === 'CONFIRMED' ? 'PROBATION_CONFIRMED' : 'PROBATION_TERMINATED', { Event_Date: today_(), Note: x.Decision_Note.slice(0, 200), Ref: x.Probation_ID }); }); } catch (eh) { console.warn('emp history: ' + eh); }
  if (x.Decision === 'CONFIRMED') {
    try { medOnConfirmed_(me, x); } catch (em) { console.warn('medical case: ' + em); }
    if (!probReview_(x.Probation_ID, 'MGR_SAT')) withLock_(function () {
      insert_('PROB_REVIEWS', { Review_ID: nextId_('PROB_REVIEW'), Probation_ID: x.Probation_ID, Kind: 'MGR_SAT', Due_Date: addDaysYmd_(today_(), 14), Status: 'OPEN', Scores_JSON: '', Goals_JSON: '',
        Overall: '', Weighted: '', Strengths: '', Improve: '', Note: '', Done_By: '', Done_At: '', Reminded_At: '', Esc_Level: '' }, me);
    });
    notify_([x.Manager_User_ID, x.HR_Site_User_ID], 'اتثبت — ' + x.Full_Name, 'بلّغه في اجتماع واطبع خطاب التثبيت. ملف التأمين الطبي اتفتح.', 'PROBATION', x.Probation_ID, true);
  } else {
    notify_([x.Manager_User_ID, x.HR_Site_User_ID].concat(roleHolders_(ROLE.HR_MANAGER)), 'قرار عدم تثبيت — ' + x.Full_Name,
      'بلّغه في اجتماع (المدير + الموارد البشرية) قبل ' + x.End_Date + '، اطبع الخطاب، وسجّل نهاية الخدمة من «الموظفين».', 'PROBATION', x.Probation_ID, true);
  }
}

/* ---------------- todo & daily ---------------- */

function probTodo_(ctx) {
  if (ctx.readOnly) return { mine: 0, decide: 0 };
  var t = today_(), mine = 0, decide = 0;
  all_('PROBATIONS').forEach(function (p) {
    if (!probOpen_(p) || !probCanView_(ctx, p)) return;
    if (p.Status === 'PENDING_DECISION' && (p.Recommendation === 'TERMINATE' ? hasAnyRole_(ctx, probTerminateRoles_()) : probIsAdmin_(ctx))) decide++;
    else if (probMine_(ctx, p, t)) mine++;
  });
  return { mine: mine, decide: decide, med: medTodo_(ctx) };
}

/** Daily: reminders before checkpoints and the decision, escalation when late, closes probations of employees who left. */
function probDaily_(weekend) {
  if (!cfg_('PROBATION_ENABLED', true)) return { skipped: true };
  var t = today_(), out = { reminded: 0, escalated: 0, ended: 0 }, esc = probEscalateDays_(), rem = probRemindDays_();
  var hrMgr = roleHolders_(ROLE.HR_MANAGER), hrSec = roleHolders_(ROLE.HR_SECTOR);
  all_('PROBATIONS').forEach(function (p) {
    if (!probOpen_(p)) return;
    var e = p.Employee_ID ? get_('EMPLOYEES', p.Employee_ID) : null;
    if (e && e.Status && e.Status !== 'Active') {
      withLock_(function () { update_('PROBATIONS', p.Probation_ID, { Status: 'ENDED', Close_Note: 'انتهت خدمته ' + str_(e.Exit_Date), Token_Hash: '' }, 'SYSTEM'); });
      out.ended++; return;
    }
    if (weekend) return;                                          // v0.40.0: the days off — closures only, no reminders
    var R = probJson_(p.Reminders_JSON, {}), changed = false;
    var mark = function (k) { if (R[k]) return false; R[k] = t; changed = true; return true; };
    // goals in the first week
    if (!probJson_(p.Goals_JSON, []).length && t >= probDayDate_(p.Start_Date, 5) && mark('goals')) {
      notify_([p.Manager_User_ID], 'أهداف فترة الاختبار لسه ماتحطتش — ' + p.Full_Name, 'حطها النهارده واتفق عليها معاه.', 'PROBATION', p.Probation_ID, true); out.reminded++;
    }
    // checkpoints
    probEnsureStay_(p);
    probReviews_(p.Probation_ID).forEach(function (r) {
      if (r.Status !== 'OPEN' || r.Kind === 'SELF' || r.Kind === 'MGR_SAT') return;
      var owner = r.Kind === 'STAY' ? [p.HR_Site_User_ID || ''].concat(p.HR_Site_User_ID ? [] : hrMgr) : [p.Manager_User_ID];
      var lateBy = daysBetween_(r.Due_Date, t), name = r.Kind === 'FINAL' ? 'التقييم النهائي' : r.Kind === 'STAY' ? 'مقابلة البقاء' : 'متابعة ' + r.Due_Date;
      if (lateBy >= -7 && lateBy < 0 && !r.Reminded_At) {
        withLock_(function () { update_('PROB_REVIEWS', r.Review_ID, { Reminded_At: nowIso_() }, 'SYSTEM'); });
        notify_(owner, name + ' قرب — ' + p.Full_Name, 'ميعادها ' + r.Due_Date + '.', 'PROBATION', p.Probation_ID, true); out.reminded++;
      }
      var lvl = num_(r.Esc_Level, 0);
      if (lateBy >= esc[0] && lvl < 1) {
        lvl = 1;
        withLock_(function () { update_('PROB_REVIEWS', r.Review_ID, { Esc_Level: '1' }, 'SYSTEM'); });
        notify_(r.Kind === 'STAY' ? owner.concat(hrMgr) : [p.Manager_User_ID, p.Skip_User_ID, p.HR_Site_User_ID], name + ' متأخر — ' + p.Full_Name, 'كان ميعاده ' + r.Due_Date + '. سجّله النهارده.', 'PROBATION', p.Probation_ID, true); out.escalated++;
      }
      if (lateBy >= esc[1] && lvl < 2) {
        withLock_(function () { update_('PROB_REVIEWS', r.Review_ID, { Esc_Level: '2' }, 'SYSTEM'); });
        notify_(hrSec.concat(hrMgr), name + ' متأخر ' + lateBy + ' يوم — ' + p.Full_Name, 'المدير المسؤول: ' + (userNames_()[p.Manager_User_ID] || '—') + '.', 'PROBATION', p.Probation_ID, true); out.escalated++;
      }
    });
    // the decision: reminders before, escalation after
    var left = daysBetween_(t, p.Decision_Due);
    rem.forEach(function (d) {
      if (left <= d && left > 0 && mark('dec' + d)) {
        notify_([p.Manager_User_ID, p.HR_Site_User_ID], 'قرار فترة الاختبار بعد ' + left + ' يوم — ' + p.Full_Name, 'آخر ميعاد للقرار ' + p.Decision_Due + ' (فترة الاختبار بتخلص ' + p.End_Date + ' ومفيش تمديد).', 'PROBATION', p.Probation_ID, false);
        out.reminded++;
      }
    });
    if (left < 0 && mark('decLate')) {
      notify_(hrMgr.concat(hrSec).concat([p.HR_Site_User_ID, p.Manager_User_ID]), 'قرار فترة الاختبار متأخر — ' + p.Full_Name, 'كان لازم قبل ' + p.Decision_Due + '. فترة الاختبار بتخلص ' + p.End_Date + ' ومفيش تمديد.', 'PROBATION', p.Probation_ID, true);
      out.escalated++;
    }
    if (t > p.End_Date && mark('ended')) {
      notify_(hrMgr.concat(hrSec), 'فترة الاختبار خلصت من غير قرار — ' + p.Full_Name, 'خلصت ' + p.End_Date + '. خد القرار فوراً وراجع الوضع القانوني مع المحامي.', 'PROBATION', p.Probation_ID, true);
      out.escalated++;
    }
    if (changed) withLock_(function () { update_('PROBATIONS', p.Probation_ID, { Reminders_JSON: JSON.stringify(R) }, 'SYSTEM'); });
  });
  if (!weekend) try { out.medical = medDaily_(); } catch (em) { console.error('medical daily: ' + (em.stack || em)); }
  return out;
}

/* ---------------- the employee's private page ---------------- */

function probByToken_(token) {
  var tk = str_(token);
  if (tk.length < 20) throw userError_('اللينك غير صحيح.');
  var p = findOne_('PROBATIONS', { Token_Hash: hash_('PROB:' + tk) });
  if (!p) throw userError_('اللينك ده مش شغال — كلّم الموارد البشرية.');
  if (p.Token_Until < today_()) throw userError_('اللينك ده انتهى — كلّم الموارد البشرية يبعتولك لينك جديد.');
  return p;
}
function probPublic_(p) {
  var t = today_(), self = probReview_(p.Probation_ID, 'SELF'), fin = probReview_(p.Probation_ID, 'FINAL'), pip = probJson_(p.PIP_JSON, null);
  var pos = p.Position_ID ? get_('POSITIONS', p.Position_ID) : null, job = pos ? get_('JOBS', pos.Job_Code) : null;
  return { name: str_(p.Full_Name).split(' ')[0], fullName: p.Full_Name, job: job ? job.Job_Title_AR : '', start: p.Start_Date, end: p.End_Date, status: p.Status,
    day: Math.max(1, Math.min(probDays_(), daysBetween_(p.Start_Date, t) + 1)), days: probDays_(), finalDue: fin ? fin.Due_Date : '',
    goals: probJson_(p.Goals_JSON, []), ackAt: p.Goals_Ack_At,
    notes: find_('PROB_NOTES', { Probation_ID: p.Probation_ID, Status: 'Active' }).map(function (n) {
      return { id: n.Note_ID, kind: n.Kind, date: n.Event_Date, text: n.Text, impact: n.Impact, reply: n.Reply };
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
    pip: pip ? { goals: pip.goals, support: pip.support, review: pip.review, outcome: pip.outcome } : null,
    self: self ? { status: self.Status, open: self.Status === 'OPEN' && probReviewWindow_(p, self, t) && !(fin && fin.Status === 'DONE'), opensOn: addDaysYmd_(self.Due_Date, -10), scores: probJson_(self.Scores_JSON, {}), comment: self.Note } : null,
    items: PROB_ITEMS_.map(function (it) { return { code: it[0], group: it[2] }; }),
    decided: p.Status === 'CONFIRMED' ? 'CONFIRMED' : '',
    reviews: probPublicReviews_(p) };
}
/** v0.27.0 — the employee sees his own evaluations once they are final: the day-30 / day-60 follow-ups when the manager saves them,
 *  the final evaluation (scores per item, strengths, improvements) only after HR's decision. Private notes stay out. */
function probPublicReviews_(p) {
  var out = [], cp = probCheckpoints_();
  probReviews_(p.Probation_ID).forEach(function (r) {
    if (r.Status !== 'DONE') return;
    if (r.Kind === 'D30' || r.Kind === 'D60') {
      out.push({ kind: r.Kind, day: r.Kind === 'D30' ? cp.D30 : cp.D60, at: str_(r.Done_At).slice(0, 10), overall: num_(r.Overall, 0),
        goals: probJson_(r.Goals_JSON, []).map(function (g) { return { st: g.st, n: g.n }; }), strengths: r.Strengths, improve: r.Improve });
    } else if (r.Kind === 'FINAL' && p.Decision) {
      var sc = probJson_(r.Scores_JSON, {}), items = {};
      Object.keys(sc).forEach(function (k) { items[k] = num_(sc[k] && sc[k].s, 0); });
      out.push({ kind: 'FINAL', at: str_(r.Done_At).slice(0, 10), weighted: num_(r.Weighted, 0), items: items, strengths: r.Strengths, improve: r.Improve, decision: p.Decision });
    }
  });
  var order = { D30: 1, D60: 2, FINAL: 3 };
  return out.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
}
function probInfo_(pl) { return probPublic_(probByToken_(pl.token)); }
/** pl = { token, action: ACK | SELF | REPLY, scores, comment, Note_ID, text, lang } */
function probSubmit_(pl) {
  var p = probByToken_(pl.token), act = str_(pl.action);
  if (!probOpen_(p)) throw userError_('فترة الاختبار اتقفلت.');
  if (act === 'ACK') {
    if (!probJson_(p.Goals_JSON, []).length) throw userError_('مديرك لسه ماحطش الأهداف.');
    if (!p.Goals_Ack_At) {
      withLock_(function () { update_('PROBATIONS', p.Probation_ID, { Goals_Ack_At: nowIso_(), Goals_Ack_Channel: 'LINK' }, 'PUBLIC'); });
      event_(null, 'PROBATION', p.Probation_ID, 'GOALS_ACK', 'LINK');
    }
  } else if (act === 'SELF') {
    var s = probReview_(p.Probation_ID, 'SELF'), fin = probReview_(p.Probation_ID, 'FINAL');
    if (!s || s.Status !== 'OPEN' || (fin && fin.Status === 'DONE')) throw userError_('التقييم الذاتي اتقفل.');
    if (!probReviewWindow_(p, s, today_())) throw userError_('التقييم الذاتي بيتفتح ' + addDaysYmd_(s.Due_Date, -10) + '.');
    var sc = {};
    PROB_ITEMS_.forEach(function (it) {
      var v = Number((pl.scores || {})[it[0]]);
      if (!(v >= 1 && v <= 5) || Math.round(v) !== v) throw userError_('قيّم نفسك في كل البنود.');
      sc[it[0]] = { s: v, e: '' };
    });
    withLock_(function () {
      update_('PROB_REVIEWS', s.Review_ID, { Status: 'DONE', Scores_JSON: JSON.stringify(sc), Weighted: String(probScore_(sc).avg), Note: str_(pl.comment).slice(0, 1500), Done_By: 'PUBLIC', Done_At: nowIso_() }, 'PUBLIC');
    });
    event_(null, 'PROBATION', p.Probation_ID, 'SELF', '');
    notify_([p.Manager_User_ID], 'التقييم الذاتي وصل — ' + p.Full_Name, 'دلوقتي تقدر تسجل التقييم النهائي.', 'PROBATION', p.Probation_ID, false);
  } else if (act === 'REPLY') {
    var n = get_('PROB_NOTES', str_(pl.Note_ID)), txt = str_(pl.text);
    if (!n || n.Probation_ID !== p.Probation_ID || n.Status !== 'Active') throw userError_('الملاحظة غير موجودة.');
    if (n.Reply) throw userError_('ردك على الملاحظة دي اتسجل قبل كده.');
    if (txt.length < 3) throw userError_('اكتب ردك.');
    withLock_(function () { update_('PROB_NOTES', n.Note_ID, { Reply: txt.slice(0, 1000), Reply_At: nowIso_() }, 'PUBLIC'); });
    notify_([n.Created_By], 'رد على ملاحظة فترة الاختبار — ' + p.Full_Name, txt.slice(0, 120), 'PROBATION', p.Probation_ID, false);
  } else throw userError_('عملية غير معروفة.');
  return probPublic_(get_('PROBATIONS', p.Probation_ID));
}

/* ================= medical insurance ================= */

function medProviders_() {
  var a = []; try { a = JSON.parse(str_(cfg_('MEDICAL_PROVIDERS', '[]')) || '[]'); } catch (e) { a = []; }
  return Array.isArray(a) ? a.map(str_).filter(Boolean) : [];
}
function medOnConfirmed_(actor, p) {
  if (findOne_('MEDICAL_CASES', { Probation_ID: p.Probation_ID })) return null;
  var t = today_(), c;
  withLock_(function () {
    c = insert_('MEDICAL_CASES', { Case_ID: nextId_('MED_CASE'), Probation_ID: p.Probation_ID, Employee_ID: p.Employee_ID, Full_Name: p.Full_Name, Location_ID: p.Location_ID,
      Owner_User_ID: p.HR_Site_User_ID, Opened_On: t, Due_Date: addDaysYmd_(t, num_(cfg_('MEDICAL_ADD_DAYS', 14), 14)), Status: 'TO_ADD', Provider: '', Card_No: '',
      Added_On: '', Dependents: '', Note: '', Reminded_At: '' }, actor);
  });
  return c;
}
function medView_(c, names, t) {
  var loc = c.Location_ID ? get_('LOCATIONS', c.Location_ID) : null;
  return { id: c.Case_ID, probationId: c.Probation_ID, name: c.Full_Name, employeeId: c.Employee_ID, location: loc ? loc.Name_AR : '', owner: names[c.Owner_User_ID] || '',
    opened: c.Opened_On, due: c.Due_Date, status: c.Status, statusName: MED_ST_[c.Status] || c.Status, provider: c.Provider, card: c.Card_No, added: c.Added_On,
    dependents: c.Dependents === '' ? null : num_(c.Dependents, 0), note: c.Note, late: c.Status === 'TO_ADD' && c.Due_Date < t };
}
/** p.tab = open | late | done | all */
function medList_(ctx, p) {
  var tab = str_(p.tab) || 'open', t = today_(), names = userNames_(), all = all_('MEDICAL_CASES');
  var rows = all.map(function (c) { return medView_(c, names, t); }).filter(function (c) {
    if (tab === 'open') return c.status === 'TO_ADD';
    if (tab === 'late') return c.late;
    if (tab === 'done') return c.status !== 'TO_ADD';
    return true;
  }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
  return { tab: tab, rows: rows, providers: medProviders_(), days: num_(cfg_('MEDICAL_ADD_DAYS', 14), 14), canEdit: !ctx.readOnly,
    counts: { open: all.filter(function (c) { return c.Status === 'TO_ADD'; }).length, late: all.filter(function (c) { return c.Status === 'TO_ADD' && c.Due_Date < t; }).length } };
}
/** p = { Case_ID, action: ADD {provider, card, date, dependents} | WAIVE {reason} | NOTE {note} | REOPEN {reason} } */
function medAction_(ctx, p) {
  var c = get_('MEDICAL_CASES', str_(p.Case_ID));
  if (!c) throw userError_('ملف التأمين الطبي غير موجود.');
  var act = str_(p.action), me = ctx.user.User_ID, t = today_(), patch;
  if (act === 'ADD') {
    if (c.Status !== 'TO_ADD') throw userError_('الملف مش مستني إضافة.');
    var date = str_(p.date) || t, card = latinDigits_(p.card).replace(/\s+/g, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > t) throw userError_('تاريخ الإضافة غير صحيح.');
    if (str_(p.provider).length < 2) throw userError_('اختار شركة التأمين الطبي.');
    if (!/^[A-Za-z0-9-]{3,30}$/.test(card)) throw userError_('اكتب رقم الكارت.');
    var dep = str_(p.dependents) === '' ? '' : String(Math.max(0, Math.min(10, Math.round(num_(p.dependents, 0)))));
    patch = { Status: 'ADDED', Provider: str_(p.provider).slice(0, 80), Card_No: card, Added_On: date, Dependents: dep };
  } else if (act === 'WAIVE') {
    if (c.Status !== 'TO_ADD') throw userError_('الملف مش مستني إضافة.');
    if (str_(p.reason).length < 5) throw userError_('اكتب السبب (مثلاً: عنده تأمين من جهة تانية ومش عايز يتضاف).');
    patch = { Status: 'NOT_ELIGIBLE', Note: str_(p.reason).slice(0, 300) };
  } else if (act === 'NOTE') {
    patch = { Note: str_(p.note).slice(0, 300) };
  } else if (act === 'REOPEN') {
    if (c.Status === 'TO_ADD') throw userError_('الملف مفتوح بالفعل.');
    if (!hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('الرجوع لمديرين الموارد البشرية بس.');
    if (str_(p.reason).length < 3) throw userError_('اكتب السبب.');
    patch = { Status: 'TO_ADD', Provider: '', Card_No: '', Added_On: '', Note: (c.Note ? c.Note + ' | ' : '') + 'رجوع: ' + str_(p.reason).slice(0, 120) };
  } else throw userError_('عملية غير معروفة.');
  var res;
  withLock_(function () { res = update_('MEDICAL_CASES', c.Case_ID, patch, me); });
  auditDiff_(ctx, 'MEDICAL', c.Case_ID, res.before, res.after, str_(p.reason));
  return medView_(res.after, userNames_(), t);
}
function medTodo_(ctx) {
  if (ctx.readOnly || !hasAnyRole_(ctx, medRoles_())) return 0;
  var t = today_();
  return where_('MEDICAL_CASES', function (c) { return c.Status === 'TO_ADD' && c.Due_Date < t; }).length;
}
function medDaily_() {
  var t = today_(), late = where_('MEDICAL_CASES', function (c) { return c.Status === 'TO_ADD' && c.Due_Date < t && !c.Reminded_At; });
  if (!late.length) return { late: 0 };
  withLock_(function () { late.forEach(function (c) { update_('MEDICAL_CASES', c.Case_ID, { Reminded_At: nowIso_() }, 'SYSTEM'); }); });
  notify_(roleHolders_(ROLE.HR_MANAGER).concat(late.map(function (c) { return c.Owner_User_ID; })), 'تأمين طبي متأخر (' + late.length + ')',
    late.slice(0, 4).map(function (c) { return c.Full_Name + ' — من ' + c.Opened_On; }).join(' · '), 'MEDICAL', '', false);
  return { late: late.length };
}
