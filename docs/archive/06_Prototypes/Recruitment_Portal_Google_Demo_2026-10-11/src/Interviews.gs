/**
 * Interviews.gs — Phase 4A (v0.11.0): interviews (blueprint 11, decisions INT-001…INT-010).
 *
 *   • Plan: every vacancy has interview rounds (VACANCIES.Plan_JSON; default INTERVIEW_DEFAULT_PLAN):
 *     name, type (HR / MANAGER / SENIOR / OTHER) and Required / Conditional / Optional.
 *   • Chain: PROPOSED → MANAGER_CONFIRMED → CANDIDATE_PENDING (invited) → CONFIRMED → CHECKED_IN → STARTED
 *     → COMPLETED → EVALUATED. The candidate cannot be invited before the lead interviewer confirms.
 *     Exceptions: MANAGER_DECLINED, CANDIDATE_DECLINED, RESCHEDULED, NO_SHOW, MANAGER_NO_SHOW, CANCELLED;
 *     WAIVED (a round not held, by authority with a reason); controlled ad-hoc interview (reason + actor).
 *   • Evidence: check-in starts the waiting time; arrival, screen opened, first note, start, end and each
 *     evaluation are recorded as EVENTS (Entity_Type INTERVIEW). Reports state facts, never conclusions.
 *   • Workspace: candidate summary (no salary / contact unless full access), CV, JD of the vacancy, the
 *     round's competencies with questions from the library, the HR standard questions (INTERVIEW_QUESTIONS).
 *   • Evaluation: requirements (Met / Not met / Needs verification, with evidence) → competencies (1–5 against
 *     the required level) → questions (mandatory must be asked) → recommendation. Independent: nobody sees
 *     others' evaluations of a candidate while they still owe their own. A revision is a new version with a reason.
 *   • Comparison: live per candidate; incomplete evaluations show as x/y, conflicting recommendations as a
 *     conflict — never averaged. Readiness: not ready / ready for decision / deferred / rejected / withdrawn.
 */

var INT_TYPES_ = ['HR', 'MANAGER', 'SENIOR', 'OTHER'];
var INT_REQ_ = ['REQUIRED', 'CONDITIONAL', 'OPTIONAL'];
var INT_MODES_ = ['IN_PERSON', 'PHONE', 'VIDEO'];
var PANEL_ROLES_ = ['LEAD', 'TECHNICAL', 'HR', 'OBSERVER', 'DECIDER'];
var INT_LIVE_ = ['PROPOSED', 'MANAGER_CONFIRMED', 'CANDIDATE_PENDING', 'CONFIRMED', 'CHECKED_IN', 'STARTED'];
var INT_DONE_ = ['COMPLETED', 'EVALUATED'];
var INT_MISSED_ = ['MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'NO_SHOW', 'MANAGER_NO_SHOW', 'CANCELLED', 'RESCHEDULED'];
var EVAL_RECS_ = ['STRONG_PROCEED', 'PROCEED', 'HOLD', 'DO_NOT_PROCEED'];
var EVAL_REQ_ST_ = ['MET', 'NOT_MET', 'VERIFY'];
var INT_TYPE_AR_ = { HR: 'موارد بشرية', MANAGER: 'المدير المباشر (فنية)', SENIOR: 'الإدارة العليا (نهائية)', OTHER: 'أخرى' };
var IV_ST_AR_ = { PROPOSED: 'مستنية تأكيد المدير', MANAGER_CONFIRMED: 'المدير أكّد — ابعت الدعوة', CANDIDATE_PENDING: 'مستنية رد المرشح',
  CONFIRMED: 'متأكدة', CHECKED_IN: 'المرشح وصل', STARTED: 'شغالة', COMPLETED: 'خلصت', EVALUATED: 'اتقيّمت',
  MANAGER_DECLINED: 'المدير اعتذر', CANDIDATE_DECLINED: 'المرشح اعتذر', RESCHEDULED: 'اتأجلت', NO_SHOW: 'المرشح ماحضرش',
  MANAGER_NO_SHOW: 'المقابِل ماحضرش', CANCELLED: 'اتلغت', WAIVED: 'اتلغت الجولة بقرار' };

/* ---------------- small helpers ---------------- */

/** Milliseconds of a local 'yyyy-MM-ddTHH:mm[:ss]' (both sides read the same way, so differences are exact). */
function isoMs_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str_(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
}
function minutesBetween_(a, b) {
  var x = isoMs_(a), y = isoMs_(b);
  return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 60000);
}
function ivStart_(iv) { return iv.Date + 'T' + (iv.Time || '00:00') + ':00'; }
function tomorrow_() { return Utilities.formatDate(new Date(Date.now() + 86400000), APP.TZ, 'yyyy-MM-dd'); }
/** The next working day after today (skips the weekly days off). */
function nextWorkDay_() {
  for (var i = 1; i <= 7; i++) {
    var d = Utilities.formatDate(new Date(Date.now() + i * 86400000), APP.TZ, 'yyyy-MM-dd');
    if (!isWeekend_(d)) return d;
  }
  return tomorrow_();
}

function intManageRoles_() { return candAllRoles_(); }                       // waive a round, edit the HR question bank
function iqEditRoles_() { return templateEditRoles_(); }

function ivGet_(id) {
  var iv = findOne_('INTERVIEWS', { Interview_ID: str_(id) });
  if (!iv) throw userError_('المقابلة غير موجودة.');
  return iv;
}
function panelOf_(ivId) { return find_('INTERVIEW_PANEL', { Interview_ID: ivId, Status: 'Active' }); }
function evaluatorsOf_(panel) { return panel.filter(function (p) { return p.Role !== 'OBSERVER'; }); }
/** Latest submitted evaluation per evaluator. */
function currentEvals_(evals) {
  var by = {};
  evals.forEach(function (e) {
    if (e.Status !== 'SUBMITTED') return;
    if (!by[e.Evaluator_ID] || num_(e.Version, 0) > num_(by[e.Evaluator_ID].Version, 0)) by[e.Evaluator_ID] = e;
  });
  return Object.keys(by).map(function (k) { return by[k]; });
}
function evalData_(e) { try { var d = JSON.parse(e.Data_JSON || '{}'); return d && typeof d === 'object' ? d : {}; } catch (x) { return {}; } }

/* ---------------- plan ---------------- */

/** The rounds in INTERVIEW_DEFAULT_PLAN (raw). */
function configPlan_() {
  var list = [];
  try { list = JSON.parse(cfg_('INTERVIEW_DEFAULT_PLAN', '[]')); } catch (e) { list = []; }
  if (!Array.isArray(list) || !list.length) list = [
    { name: 'مقابلة الموارد البشرية', type: 'HR', req: 'REQUIRED' },
    { name: 'مقابلة فنية مع المدير المباشر', type: 'MANAGER', req: 'REQUIRED' },
    { name: 'مقابلة نهائية مع الإدارة العليا', type: 'SENIOR', req: 'OPTIONAL' }];
  return list;
}

/**
 * Plan a vacancy starts with: the job's round template, else its family's, else the settings default — plus a practical
 * test right after the HR interview when the job description has one (v0.12.0).
 */
function defaultPlan_(v) {
  var tpl = v ? templateFor_(v) : null, list;
  if (tpl) list = jsonArr_(tpl.Rounds_JSON);
  else {
    list = configPlan_().slice();
    if (v && !list.some(function (r) { return isAssessType_(r.type); }) && jdPracticalTest_(v.Job_Code)) {
      var at = 0; list.forEach(function (r, i) { if (r.type === 'HR' && !at) at = i + 1; });
      list.splice(at || 1, 0, { name: 'اختبار عملي', type: 'PRACTICAL', req: 'REQUIRED' });
    }
  }
  return list.map(function (r, i) { return cleanRound_(r, 'R' + (i + 1)); });
}

function planOf_(v) {
  var list = null;
  try { list = JSON.parse(v.Plan_JSON || 'null'); } catch (e) { list = null; }
  return Array.isArray(list) && list.length ? list : defaultPlan_(v);
}
function roundOf_(v, roundId) { return planOf_(v).filter(function (r) { return r.id === str_(roundId); })[0] || null; }

/** p = { Vacancy_ID, rounds?: [{ id?, name, type, req }] } — read, or save when rounds are sent. */
function vacPlan_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  var acc = vacancyAccess_(ctx, v);
  if (!acc) throw userError_('مالكش صلاحية على الشاغر ده.');
  if (p.rounds === undefined) return { rounds: planOf_(v), custom: !!v.Plan_JSON, canEdit: acc === 'FULL' };
  requireVacancyFull_(ctx, v);
  var cur = planOf_(v), used = {};
  find_('INTERVIEWS', { Vacancy_ID: v.Vacancy_ID }).forEach(function (iv) { used[iv.Round_ID] = 1; });
  var maxN = 0; cur.forEach(function (r) { maxN = Math.max(maxN, num_(String(r.id).slice(1), 0)); });
  var seen = {};
  var rounds = (Array.isArray(p.rounds) ? p.rounds : []).map(function (r) {
    var name = str_(r.name).replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 3) throw userError_('اكتب اسم كل جولة.');
    var type = str_(r.type), req = str_(r.req);
    if (roundTypes_().indexOf(type) < 0) throw userError_('اختار نوع الجولة.');
    if (INT_REQ_.indexOf(req) < 0) throw userError_('حدد الجولة إجبارية ولا اختيارية.');
    var id = str_(r.id);
    if (id && !cur.some(function (x) { return x.id === id; })) id = '';
    if (id && used[id] && isAssessType_(type) !== isAssessType_((cur.filter(function (x) { return x.id === id; })[0] || {}).type))
      throw userError_('الجولة «' + name + '» عليها مواعيد — مينفعش تتحول من مقابلة لاختبار أو العكس.');
    if (!id) id = 'R' + (++maxN);
    if (seen[id]) throw userError_('جولة متكررة.');
    seen[id] = 1;
    return cleanRound_({ name: name, type: type, req: req, reconfirm: r.reconfirm, safety: r.safety === undefined ? undefined : (str_(r.safety) === 'Y' ? 'Y' : 'N') }, id);
  });
  if (!rounds.length) throw userError_('لازم جولة واحدة على الأقل.');
  if (rounds.length > 6) throw userError_('أقصى حاجة 6 جولات.');
  cur.forEach(function (r) { if (used[r.id] && !seen[r.id]) throw userError_('الجولة «' + r.name + '» عليها مقابلات — مينفعش تتشال.'); });
  var res;
  withLock_(function () { res = update_('VACANCIES', v.Vacancy_ID, { Plan_JSON: JSON.stringify(rounds) }, ctx.user.User_ID); });
  auditDiff_(ctx, 'VACANCY', v.Vacancy_ID, { Plan_JSON: v.Plan_JSON || JSON.stringify(cur) }, { Plan_JSON: res.after.Plan_JSON }, 'خطة المقابلات');
  return { rounds: rounds, custom: true, canEdit: true };
}

/* ---------------- requirements, competencies and questions (the interview guide) ---------------- */

/** Critical requirements of the vacancy, from its hiring request: education, experience, essential skills. */
function reqsFor_(v) {
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID }) || {};
  var out = [];
  if (str_(req.Education) || str_(req.Specialization)) out.push({ k: 'EDU', label: 'المؤهل: ' + [str_(req.Education), str_(req.Specialization)].filter(String).join(' — ') });
  if (str_(req.Experience_Years)) out.push({ k: 'EXP', label: 'الخبرة: ' + str_(req.Experience_Years) + ' سنة' + (str_(req.Experience_Context) ? ' — ' + str_(req.Experience_Context) : '') });
  if (req.Request_ID) find_('REQUEST_SKILLS', { Request_ID: req.Request_ID }).forEach(function (s) {
    if (s.Status !== 'Active' || s.Importance !== 'ESSENTIAL' || !str_(s.Skill)) return;
    out.push({ k: 'SK:' + s.Skill_ID, label: 'مهارة أساسية: ' + str_(s.Skill) });
  });
  return out;
}

/** Which competency groups a round looks at (falls back to all when the JD has none of them). */
function groupFits_(type, group) {
  if (type === 'HR') return group === 'CORE';
  if (type === 'MANAGER') return group !== 'CORE' && group !== 'LEAD';
  if (type === 'SENIOR') return group === 'LEAD' || group === 'CORE';
  return true;
}

function guideFor_(iv, v) {
  if (iv.Kind === 'ASSESSMENT') return assessGuide_(iv, v);
  var job = findOne_('JOBS', { Job_Code: v.Job_Code }) || {};
  var d = jdApproved_(v.Job_Code) || jdDraft_(v.Job_Code);
  var comps = [];
  if (d) {
    var lib = compMap_(), jl = str_(d.Career_Level) || 'JL2', jlIdx = JL_CODES_.indexOf(jl);
    var qs = {};
    find_('COMP_QUESTIONS', { Status: 'Active' }, { sort: 'Seq' }).forEach(function (q) {
      if (JL_CODES_.indexOf(q.From_Level || 'JL1') > jlIdx) return;
      (qs[q.Comp_Code] = qs[q.Comp_Code] || []).push(q);
    });
    var all = jdView_(d, lib).comps.map(function (c) {
      var L = lib[c.code] || {};
      return { code: c.code, name: c.name, group: c.group, groupName: c.groupName, level: c.level, levelName: c.levelName, behaviour: c.behaviour,
        anchors: [L.Level_1 || '', L.Level_2 || '', L.Level_3 || '', L.Level_4 || ''],
        questions: (qs[c.code] || []).map(function (q, i) { return { id: 'C:' + c.code + ':' + (i + 1), q: q.Question, strong: q.Strong, weak: q.Weak }; }) };
    });
    comps = all.filter(function (c) { return groupFits_(iv.Round_Type, c.group); });
    if (!comps.length) comps = all;
  }
  var std = find_('INTERVIEW_QUESTIONS', { Status: 'Active' }).filter(function (q) {
    return (q.Round_Type === iv.Round_Type || q.Round_Type === 'ALL') && (!q.Family || q.Family === job.Job_Family);
  }).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); })
    .map(function (q) { return { id: q.Question_ID, q: q.Text_AR, en: q.Text_EN, kind: q.Kind }; });
  return { comps: comps, std: std, reqs: reqsFor_(v), reqsRequired: iv.Round_Type === 'HR' || iv.Round_Type === 'MANAGER',
    jd: d ? { Version: d.Version, Status: d.Status } : null };
}

/* ---------------- HR standard interview questions (question bank) ---------------- */

function defaultInterviewQuestions_() {
  return [
    ['HR', 'MANDATORY', 'إيه اللي شدّك للوظيفة دي وللشغل في قنديل؟', 'What attracted you to this job and to working at Kandil?'],
    ['HR', 'MANDATORY', 'ليه عايز تسيب شغلك الحالي (أو سبت شغلك الأخير)؟', 'Why do you want to leave your current job (or why did you leave your last one)?'],
    ['HR', 'MANDATORY', 'المرتب المتوقع إيه، وإيه اللي داخل فيه (بدلات، مواصلات، حوافز)؟', 'What is your expected salary, and what does it include (allowances, transport, incentives)?'],
    ['HR', 'MANDATORY', 'تقدر تبدأ إمتى؟ وفترة الإخطار عندك قد إيه؟', 'When can you start, and what is your notice period?'],
    ['HR', 'MANDATORY', 'ساكن فين، وهتوصل لمكان الشغل إزاي ومحتاج قد إيه في الطريق؟', 'Where do you live, and how will you get to the workplace and how long will it take?'],
    ['HR', 'MANDATORY', 'مواعيد الشغل والورديات والإجازة الأسبوعية مناسبة لك؟', 'Do the working hours, shifts and weekly day off suit you?'],
    ['HR', 'SUGGESTED', 'فين شايف نفسك بعد 3 سنين؟', 'Where do you see yourself in three years?'],
    ['HR', 'SUGGESTED', 'احكيلي عن موقف اختلفت فيه مع مديرك أو زميلك واتصرفت إزاي.', 'Tell me about a disagreement with your manager or a colleague and how you handled it.'],
    ['MANAGER', 'MANDATORY', 'احكيلي عن أقرب شغل عملته لمهام الوظيفة دي: كنت مسؤول عن إيه بالظبط وإيه النتيجة؟', 'Walk me through the work closest to this job: what exactly were you responsible for, and what was the result?'],
    ['SENIOR', 'SUGGESTED', 'إيه أكبر مسؤولية أو قرار اتحملته في شغلك، وكان تأثيره إيه؟', 'What is the biggest responsibility or decision you have carried, and what was its impact?']
  ];
}

function seedInterviewQuestions_() {
  if (all_('INTERVIEW_QUESTIONS').length) return;
  var q = defaultInterviewQuestions_(), ids = nextIds_('INT_QUESTION', q.length);
  insertMany_('INTERVIEW_QUESTIONS', q.map(function (x, i) {
    return { Question_ID: ids[i], Round_Type: x[0], Family: '', Kind: x[1], Text_AR: x[2], Text_EN: x[3], Sort_Order: String((i + 1) * 10), Status: 'Active' };
  }), 'SYSTEM');
}

function iqList_(ctx) {
  return { canEdit: hasAnyRole_(ctx, iqEditRoles_()), families: jobFamilies_(), types: INT_TYPE_AR_,
    rows: all_('INTERVIEW_QUESTIONS').slice().sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); }) };
}

/** p = { Question_ID?, Round_Type, Family, Kind, Text_AR, Text_EN, Status } */
function iqSave_(ctx, p) {
  var id = str_(p.Question_ID), cur = id ? findOne_('INTERVIEW_QUESTIONS', { Question_ID: id }) : null;
  if (id && !cur) throw userError_('السؤال غير موجود.');
  var ar = str_(p.Text_AR).replace(/\s+/g, ' ');
  if (ar.length < 8) throw userError_('اكتب السؤال بالعربي.');
  var type = str_(p.Round_Type);
  if (type !== 'ALL' && INT_TYPES_.indexOf(type) < 0) throw userError_('اختار الجولة اللي السؤال بيظهر فيها.');
  var fam = str_(p.Family);
  if (fam && !jobFamilies_()[fam]) throw userError_('العائلة الوظيفية غير معروفة.');
  var f = { Round_Type: type, Family: fam, Kind: str_(p.Kind) === 'MANDATORY' ? 'MANDATORY' : 'SUGGESTED', Text_AR: ar.slice(0, 400),
    Text_EN: str_(p.Text_EN).slice(0, 400), Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  var out;
  withLock_(function () {
    if (cur) { var r = update_('INTERVIEW_QUESTIONS', id, f, ctx.user.User_ID); auditDiff_(ctx, 'INT_QUESTION', id, r.before, r.after, ''); out = r.after; }
    else {
      f.Question_ID = nextId_('INT_QUESTION'); f.Sort_Order = String((all_('INTERVIEW_QUESTIONS').length + 1) * 10);
      out = insert_('INTERVIEW_QUESTIONS', f, ctx.user.User_ID);
      audit_(ctx, { entityType: 'INT_QUESTION', entityId: out.Question_ID, action: 'CREATE' });
    }
  });
  return out;
}

/* ---------------- access ---------------- */

/** Who may do what on an interview. Panel members reach it even without access to the vacancy. */
function ivAccess_(ctx, iv) {
  var v = findOne_('VACANCIES', { Vacancy_ID: iv.Vacancy_ID });
  var a = findOne_('APPLICATIONS', { Application_ID: iv.Application_ID }) || {};
  var acc = vacancyAccess_(ctx, v);
  if (acc === 'SHORTLIST' && MGR_STAGES_.indexOf(a.Stage) < 0) acc = '';
  var me = ctx.user.User_ID;
  var mine = find_('INTERVIEW_PANEL', { Interview_ID: iv.Interview_ID, User_ID: me, Status: 'Active' })[0] || null;
  if (!acc && !mine) throw userError_('مالكش صلاحية على المقابلة دي.');
  return { v: v, app: a, full: acc === 'FULL', mgr: acc === 'SHORTLIST', panel: mine, lead: iv.Lead_User_ID === me };
}

/** The user still owes an evaluation on this application → others' evaluations stay hidden from him. */
function owesEval_(userId, appId) {
  return find_('INTERVIEWS', { Application_ID: appId }).some(function (iv) {
    if (INT_LIVE_.concat(['COMPLETED']).indexOf(iv.Status) < 0) return false;
    var p = find_('INTERVIEW_PANEL', { Interview_ID: iv.Interview_ID, User_ID: userId, Status: 'Active' })[0];
    if (!p || p.Role === 'OBSERVER') return false;
    return !find_('EVALUATIONS', { Interview_ID: iv.Interview_ID, Evaluator_ID: userId, Status: 'SUBMITTED' }).length;
  });
}

function evalView_(e, names) {
  return { Evaluation_ID: e.Evaluation_ID, Interview_ID: e.Interview_ID, Evaluator_ID: e.Evaluator_ID, evaluator: names[e.Evaluator_ID] || e.Evaluator_ID,
    Panel_Role: e.Panel_Role, Version: e.Version, Status: e.Status, Recommendation: e.Recommendation, Strengths: e.Strengths, Concerns: e.Concerns,
    Summary: e.Summary, data: evalData_(e), Started_At: e.Started_At, Submitted_At: e.Submitted_At, Late: e.Late === 'Y', Revision_Reason: e.Revision_Reason };
}

/* ---------------- people for the panel ---------------- */

function sectorHeadUsers_(unitId) {
  var anc = unitAncestors_(unitId);
  for (var i = 0; i < anc.length; i++) {
    if (anc[i].Unit_Type !== 'SECTOR' || !anc[i].Head_Position_ID) continue;
    var us = find_('USERS', { Position_ID: anc[i].Head_Position_ID, Status: 'Active' }).map(function (u) { return u.User_ID; });
    if (us.length) return us;
  }
  return [];
}

/** p = { Vacancy_ID, Round_ID } → active users + a suggested panel for the round. */
function intPeople_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  requireVacancyFull_(ctx, v);
  var users = find_('USERS', { Status: 'Active' }).map(function (u) {
    var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null;
    var job = pos ? get_('JOBS', pos.Job_Code) : null;
    return { id: u.User_ID, name: u.Full_Name_AR, title: pos ? (pos.Position_Title || (job ? job.Job_Title_AR : '')) : '' };
  }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  var r = roundOf_(v, p.Round_ID) || { type: 'OTHER' };
  var me = ctx.user.User_ID, sug = [];
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID }) || {};
  var mgr = managerUsersOf_(v.Position_ID)[0] || req.Requester_User_ID || '';
  if (r.type === 'HR') sug.push({ User_ID: me, Role: 'LEAD' });
  else if (r.type === 'MANAGER') { if (mgr) sug.push({ User_ID: mgr, Role: 'LEAD' }); }
  else if (r.type === 'SENIOR') { var s = sectorHeadUsers_(v.Org_Unit_ID)[0] || mgr; if (s) sug.push({ User_ID: s, Role: 'LEAD' }); }
  if (!sug.length) sug.push({ User_ID: me, Role: 'LEAD' });
  if (r.type !== 'HR' && sug[0].User_ID !== me) sug.push({ User_ID: me, Role: 'HR' });
  return { users: users, suggest: sug, round: r };
}

/* ---------------- schedule ---------------- */

/** Validate the when / where part of a payload. */
function ivWhen_(p, adhoc) {
  var date = str_(p.Date), time = str_(p.Time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('حدد تاريخ المقابلة.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw userError_('حدد ساعة المقابلة.');
  if (!adhoc && date < today_()) throw userError_('تاريخ المقابلة لازم يكون النهارده أو بعد كده.');
  var dur = num_(p.Duration_Min, cfg_('INTERVIEW_DURATION_MIN', 45));
  if (dur < 10 || dur > 240) throw userError_('مدة المقابلة من 10 لـ 240 دقيقة.');
  var mode = str_(p.Mode) || 'IN_PERSON';
  if (INT_MODES_.indexOf(mode) < 0) throw userError_('اختار نوع المقابلة.');
  var loc = str_(p.Location_ID), link = str_(p.Meeting_Link);
  if (mode === 'IN_PERSON') {
    if (!loc || !findOne_('LOCATIONS', { Location_ID: loc })) throw userError_('اختار مكان المقابلة.');
  } else loc = '';
  if (mode === 'VIDEO' && !/^https?:\/\/\S+$/.test(link)) throw userError_('حط لينك الاجتماع (Meet / Zoom / Teams).');
  return { Date: date, Time: time, Duration_Min: String(dur), Mode: mode, Location_ID: loc, Place: str_(p.Place).slice(0, 120), Meeting_Link: mode === 'VIDEO' ? link.slice(0, 300) : '' };
}

/** Validate a panel: [{ User_ID, Role }] → exactly one LEAD, active users, at least one evaluator. */
function ivPanel_(list) {
  var seen = {}, lead = 0;
  var out = (Array.isArray(list) ? list : []).filter(function (x) { return str_(x.User_ID); }).map(function (x) {
    var u = findOne_('USERS', { User_ID: str_(x.User_ID) });
    if (!u || u.Status !== 'Active') throw userError_('عضو في اللجنة مش مستخدم نشط على البوابة.');
    if (seen[u.User_ID]) throw userError_(u.Full_Name_AR + ' متكرر في اللجنة.');
    seen[u.User_ID] = 1;
    var role = str_(x.Role) || 'TECHNICAL';
    if (PANEL_ROLES_.indexOf(role) < 0) throw userError_('دور غير معروف في اللجنة.');
    if (role === 'LEAD') lead++;
    return { User_ID: u.User_ID, Role: role };
  });
  if (!out.length) throw userError_('حدد مين هيعمل المقابلة.');
  if (out.length > 6) throw userError_('أقصى حاجة 6 في اللجنة.');
  if (lead !== 1) throw userError_('اختار مسؤول واحد عن المقابلة (المقابِل الرئيسي).');
  return out;
}

function ivLine_(iv) {
  var place = iv.Mode === 'PHONE' ? 'تليفون' : iv.Mode === 'VIDEO' ? 'أونلاين' : (locName_(iv.Location_ID) + (iv.Place ? ' — ' + iv.Place : ''));
  return iv.Date + ' ' + iv.Time + ' · ' + place;
}
function ivPlaceText_(iv, lang) {
  if (iv.Mode === 'PHONE') return lang === 'en' ? 'Phone call' : 'مكالمة تليفون';
  if (iv.Mode === 'VIDEO') return iv.Meeting_Link;
  var l = findOne_('LOCATIONS', { Location_ID: iv.Location_ID }) || {};
  return [lang === 'en' && l.Name_EN ? l.Name_EN : l.Name_AR, l.Address, iv.Place].filter(function (x) { return str_(x); }).join(' — ');
}

/**
 * Schedule an interview. p = { Application_ID, Round_ID, Date, Time, Duration_Min, Mode, Location_ID, Place, Meeting_Link,
 *   panel: [{ User_ID, Role }], Notes, adhoc: 'Y', reason }
 */
function intCreate_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, v = L.vac;
  if (['SHORTLISTED', 'INTERVIEW'].indexOf(a.Stage) < 0) throw userError_('المقابلات للمرشحين اللي في القائمة المختصرة أو مرحلة المقابلات.');
  if (VAC_OPEN_.indexOf(v.Status) < 0 || vacPaused_(v.Status)) throw userError_('الشاغر مش شغال حالياً.');
  var round = roundOf_(v, p.Round_ID);
  if (!round) throw userError_('اختار الجولة.');
  var adhoc = str_(p.adhoc) === 'Y', reason = str_(p.reason);
  var mine = find_('INTERVIEWS', { Application_ID: a.Application_ID, Round_ID: round.id });
  if (mine.some(function (x) { return INT_LIVE_.indexOf(x.Status) >= 0; })) throw userError_('فيه مقابلة متحددة للجولة دي بالفعل — أجّلها أو الغيها الأول.');
  if (mine.some(function (x) { return x.Status === 'WAIVED'; })) throw userError_('الجولة دي اتلغت للمرشح ده بقرار.');
  // another session of a held round needs a reason — except an assessment whose result was "needs retest"
  var doneList = mine.filter(function (x) { return INT_DONE_.indexOf(x.Status) >= 0; });
  var lastDone = doneList[doneList.length - 1];
  var retest = lastDone && lastDone.Kind === 'ASSESSMENT' && currentEvals_(find_('EVALUATIONS', { Interview_ID: lastDone.Interview_ID })).some(function (e) { return e.Recommendation === 'RETEST'; });
  var again = doneList.length > 0 && !retest;
  if ((adhoc || again) && reason.length < 5) throw userError_(adhoc ? 'اكتب سبب المقابلة الفورية من غير تأكيد مسبق.' : 'الجولة دي اتعملت قبل كده — اكتب سبب المقابلة الإضافية.');
  var w = ivWhen_(p, adhoc), panel = ivPanel_(p.panel);
  var me = ctx.user.User_ID, lead = panel.filter(function (x) { return x.Role === 'LEAD'; })[0].User_ID;
  var now = nowIso_(), selfLead = lead === me;
  var status = adhoc ? 'CONFIRMED' : selfLead ? 'MANAGER_CONFIRMED' : 'PROPOSED';
  var iv;
  withLock_(function () {
    var row = { Interview_ID: nextId_('INTERVIEW'), Application_ID: a.Application_ID, Person_ID: a.Person_ID, Vacancy_ID: v.Vacancy_ID,
      Round_ID: round.id, Round_Name: round.name, Round_Type: round.type, Kind: isAssessType_(round.type) ? 'ASSESSMENT' : 'INTERVIEW', Status: status, Organizer_ID: me, Lead_User_ID: lead,
      Safety_Required: round.safety === 'Y' ? 'Y' : '', Safety_JSON: '', Reconfirm_Required: round.reconfirm === 'Y' ? 'Y' : '', Reconfirmed_At: '', Reminded_2H_At: '', Cand_Reminded_At: '',
      Manager_Confirmed_By: selfLead && !adhoc ? me : '', Manager_Confirmed_At: selfLead && !adhoc ? now : '', Invited_At: '', Candidate_Confirmed_At: adhoc ? now : '',
      Checked_In_At: '', Started_At: '', Completed_At: '', Evaluated_At: '', Is_Adhoc: adhoc ? 'Y' : '', Adhoc_Reason: adhoc || again ? reason.slice(0, 300) : '',
      Exception_Code: '', Exception_Note: '', Rescheduled_From: str_(p._from), Rescheduled_To: '', Notes: str_(p.Notes).slice(0, 500), Reminded_At: '' };
    for (var k in w) row[k] = w[k];
    freezePlan_(v, me);
    iv = insert_('INTERVIEWS', row, me);
    var ids = nextIds_('PANEL', panel.length);
    insertMany_('INTERVIEW_PANEL', panel.map(function (x, i) {
      return { Panel_ID: ids[i], Interview_ID: iv.Interview_ID, User_ID: x.User_ID, Role: x.Role, Status: 'Active',
        Confirmed_At: x.User_ID === me ? now : '', Declined_At: '', Decline_Note: '', Opened_At: '', Removed_Reason: '', Eval_Reminded_At: '' };
    }), me);
    if (a.Stage === 'SHORTLISTED') {
      update_('APPLICATIONS', a.Application_ID, { Stage: 'INTERVIEW', Stage_At: now }, me);
      activity_(me, a, 'STAGE', { Stage_From: 'SHORTLISTED', Stage_To: 'INTERVIEW', Note: 'أول مقابلة اتحددت' });
    }
    activity_(me, a, 'SYSTEM', { Note: (adhoc ? 'مقابلة فورية: ' : 'اتحددت مقابلة: ') + round.name + ' — ' + ivLine_(iv) + (adhoc ? ' (السبب: ' + reason + ')' : '') });
  });
  event_(ctx, 'INTERVIEW', iv.Interview_ID, adhoc ? 'ADHOC' : 'CREATED', adhoc || again ? reason : '', { lead: lead });
  if (selfLead && !adhoc) event_(ctx, 'INTERVIEW', iv.Interview_ID, 'CONFIRMED', '');
  audit_(ctx, { entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: adhoc ? 'ADHOC' : 'CREATE', newValue: a.Application_ID + ' · ' + round.id, reason: reason });
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {}, t = vacTitle_(v).ar;
  var line = per.Full_Name + ' — ' + t + ' — ' + round.name + ' — ' + ivLine_(iv);
  if (!selfLead) notify_([lead], adhoc ? 'مقابلة فورية معاك دلوقتي' : iv.Kind === 'ASSESSMENT' ? 'اختبار محتاج تأكيدك' : 'مقابلة محتاجة تأكيدك', line + (adhoc ? '' : ' · أكّد أو اعتذر من «المقابلات».'), 'INTERVIEW', iv.Interview_ID, !adhoc);
  var others = panel.filter(function (x) { return x.User_ID !== lead && x.User_ID !== me; }).map(function (x) { return x.User_ID; });
  if (others.length) notify_(others, 'اتضفت للجنة مقابلة', line, 'INTERVIEW', iv.Interview_ID, false);
  return { interview: iv };
}

/* ---------------- the chain ---------------- */

/**
 * p = { Interview_ID, action, note, channel, Template_Code }
 *   CONFIRM | DECLINE (panel) · INVITED | CAND_CONFIRM | CAND_DECLINE · CHECKIN · START · COMPLETE
 *   NO_SHOW | MANAGER_NO_SHOW | CANCEL
 */
function intAction_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv), me = ctx.user.User_ID;
  var action = str_(p.action), note = str_(p.note).slice(0, 500), now = nowIso_(), today = today_();
  var a = A.app, st = iv.Status, patch = {}, ev = action, panelPatch = null, notifyIds = [], nTitle = '', act = null, closePatch = null;
  var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {}, t = vacTitle_(A.v).ar;
  var line = per.Full_Name + ' — ' + t + ' — ' + iv.Round_Name + ' — ' + ivLine_(iv);
  function need(list, msg) { if (list.indexOf(st) < 0) throw userError_(msg || ('الخطوة دي مش متاحة والمقابلة «' + (IV_ST_AR_[st] || st) + '».')); }
  function team() { if (!A.full) throw userError_('الخطوة دي لفريق التوظيف.'); }
  function needNote(n) { if (note.length < (n || 3)) throw userError_('اكتب السبب.'); }
  var panel = panelOf_(iv.Interview_ID);
  var panelIds = panel.map(function (x) { return x.User_ID; });
  switch (action) {
    case 'CONFIRM':
      if (!A.panel) throw userError_('التأكيد لأعضاء اللجنة.');
      need(INT_LIVE_.slice(0, 4).concat(['CHECKED_IN']));
      if (A.panel.Confirmed_At) throw userError_('أكّدت قبل كده.');
      panelPatch = { Confirmed_At: now, Declined_At: '', Decline_Note: '' };
      if (A.lead && st === 'PROPOSED') { patch = { Status: 'MANAGER_CONFIRMED', Manager_Confirmed_By: me, Manager_Confirmed_At: now }; notifyIds = [iv.Organizer_ID]; nTitle = 'المقابِل أكّد — ابعت الدعوة للمرشح'; }
      else ev = 'PANEL_CONFIRMED';
      break;
    case 'DECLINE':
      if (!A.panel) throw userError_('الاعتذار لأعضاء اللجنة.');
      need(INT_LIVE_.slice(0, 4));
      needNote();
      panelPatch = { Declined_At: now, Decline_Note: note, Confirmed_At: '' };
      notifyIds = [iv.Organizer_ID];
      if (A.lead) { patch = { Status: 'MANAGER_DECLINED', Exception_Code: 'MANAGER_DECLINED', Exception_Note: note }; nTitle = 'المقابِل اعتذر عن المقابلة — حدد معاد تاني'; }
      else { ev = 'PANEL_DECLINED'; nTitle = 'عضو في اللجنة اعتذر عن المقابلة'; }
      break;
    case 'INVITED':
      team();
      if (st === 'PROPOSED') throw userError_('مينفعش تدعو المرشح قبل ما المقابِل يأكّد المعاد.');
      need(['MANAGER_CONFIRMED', 'CANDIDATE_PENDING']);
      var ch = ['WHATSAPP', 'EMAIL', 'CALL', 'MESSAGE'].indexOf(str_(p.channel)) >= 0 ? str_(p.channel) : 'WHATSAPP';
      patch = { Status: 'CANDIDATE_PENDING', Invited_At: now };
      act = { type: ch === 'CALL' ? 'CALL' : ch, fields: { Outcome: ch === 'CALL' ? 'REACHED' : '', Template_Code: str_(p.Template_Code).slice(0, 40),
        Note: 'دعوة مقابلة: ' + iv.Round_Name + ' — ' + ivLine_(iv) } };
      break;
    case 'CAND_CONFIRM':
      team(); need(['CANDIDATE_PENDING'], 'سجّل إن الدعوة اتبعتت الأول.');
      patch = { Status: 'CONFIRMED', Candidate_Confirmed_At: now };
      break;
    case 'CAND_DECLINE':
      team(); need(['CANDIDATE_PENDING', 'CONFIRMED']); needNote();
      patch = { Status: 'CANDIDATE_DECLINED', Exception_Code: 'CANDIDATE_DECLINED', Exception_Note: note };
      notifyIds = panelIds; nTitle = 'المرشح اعتذر عن المقابلة';
      break;
    case 'CHECKIN':
      if (!A.full && !A.panel) throw userError_('مالكش صلاحية.');
      need(['CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED'], 'المقابلة لسه مااتأكدتش.');
      if (iv.Date > today) throw userError_('معاد المقابلة لسه ماجاش (' + iv.Date + ').');
      patch = { Status: 'CHECKED_IN', Checked_In_At: now };
      notifyIds = panelIds.concat([iv.Organizer_ID]).filter(function (u) { return u !== me; }); nTitle = 'المرشح وصل ومستنيك';
      break;
    case 'RECONFIRM':
      team(); need(['CONFIRMED']);
      if (iv.Reconfirmed_At) throw userError_('المرشح أكّد تاني قبل كده.');
      patch = { Reconfirmed_At: now };
      act = { type: 'CALL', fields: { Outcome: 'REACHED', Note: 'المرشح أكّد الحضور تاني: ' + iv.Round_Name + ' — ' + ivLine_(iv) } };
      break;
    case 'START':
      if (!A.full && !A.panel) throw userError_('مالكش صلاحية.');
      if (iv.Safety_Required === 'Y') {
        var sf = p.safety || {};
        if (!SAFETY_ITEMS_.every(function (x) { return str_(sf[x[0]]) === 'Y'; })) throw userError_('أكّد بنود السلامة قبل بداية الاختبار.');
        patch.Safety_JSON = JSON.stringify({ items: SAFETY_ITEMS_.map(function (x) { return x[0]; }), by: me, at: now });
      }
      need(iv.Mode === 'IN_PERSON' ? ['CHECKED_IN'] : ['CHECKED_IN', 'CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED'], iv.Mode === 'IN_PERSON' ? 'سجّل وصول المرشح الأول.' : null);
      patch.Status = 'STARTED'; patch.Started_At = now;
      if (!iv.Checked_In_At) patch.Checked_In_At = now;
      break;
    case 'COMPLETE':
      if (!A.full && !A.panel) throw userError_('مالكش صلاحية.');
      need(['STARTED', 'CHECKED_IN']);
      patch = { Status: 'COMPLETED', Completed_At: now };
      if (!iv.Started_At) patch.Started_At = now;
      break;
    case 'NO_SHOW':
      team(); need(['CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED']);
      if (ivStart_(iv) > now) throw userError_('معاد المقابلة لسه ماجاش.');
      patch = { Status: 'NO_SHOW', Exception_Code: 'NO_SHOW', Exception_Note: note };
      notifyIds = panelIds; nTitle = 'المرشح ماحضرش المقابلة';
      break;
    case 'MANAGER_NO_SHOW':
      team(); need(['CHECKED_IN']); needNote();
      patch = { Status: 'MANAGER_NO_SHOW', Exception_Code: 'MANAGER_NO_SHOW', Exception_Note: note };
      notifyIds = [iv.Organizer_ID].concat(find_('USER_ROLES', {}).filter(function (r) { return r.Role_Code === ROLE.REC_MANAGER && isEffective_(r.Effective_From, r.Effective_To); })
        .map(function (r) { return r.User_ID; })).filter(function (u) { return u !== me; });
      nTitle = 'المقابِل ماحضرش والمرشح كان موجود';
      break;
    case 'CANCEL':
      team(); need(INT_LIVE_); needNote();
      patch = { Status: 'CANCELLED', Exception_Code: 'CANCELLED', Exception_Note: note };
      notifyIds = panelIds.filter(function (u) { return u !== me; }); nTitle = 'المقابلة اتلغت';
      break;
    default: throw userError_('إجراء غير معروف.');
  }
  var res;
  withLock_(function () {
    if (Object.keys(patch).length) res = update_('INTERVIEWS', iv.Interview_ID, patch, me);
    if (panelPatch) update_('INTERVIEW_PANEL', A.panel.Panel_ID, panelPatch, me);
    if (act) activity_(me, a, act.type, act.fields);
    if (patch.Status && ['CANDIDATE_DECLINED', 'NO_SHOW', 'MANAGER_NO_SHOW', 'CANCELLED', 'MANAGER_DECLINED'].indexOf(patch.Status) >= 0)
      activity_(me, a, 'SYSTEM', { Note: 'المقابلة (' + iv.Round_Name + ' — ' + iv.Date + '): ' + IV_ST_AR_[patch.Status] + (note ? ' — ' + note : '') });
    if (patch.Status === 'COMPLETED') res = maybeEvaluated_(me, res.after);
  });
  event_(ctx, 'INTERVIEW', iv.Interview_ID, ev, note);
  audit_(ctx, { entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: ev, oldValue: st, newValue: patch.Status || st, reason: note });
  if (notifyIds.length) notify_(notifyIds.filter(function (u) { return u && u !== me; }), nTitle, line + (note ? ' · ' + note : ''), 'INTERVIEW', iv.Interview_ID, false);
  return { interview: res ? res.after : ivGet_(iv.Interview_ID) };
}

/** COMPLETED → EVALUATED once every evaluator on the panel has submitted. Runs inside a lock. */
function maybeEvaluated_(actor, iv) {
  if (iv.Status !== 'COMPLETED') return { after: iv };
  var ev = evaluatorsOf_(panelOf_(iv.Interview_ID));
  var done = currentEvals_(find_('EVALUATIONS', { Interview_ID: iv.Interview_ID })).map(function (e) { return e.Evaluator_ID; });
  if (!ev.length || !ev.every(function (p) { return done.indexOf(p.User_ID) >= 0; })) return { after: iv };
  return update_('INTERVIEWS', iv.Interview_ID, { Status: 'EVALUATED', Evaluated_At: nowIso_() }, actor);
}

/** p = { Interview_ID, Date, Time, …, panel?, reason } — a new interview replaces this one; the lead confirms again. */
function intReschedule_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv);
  if (!A.full) throw userError_('التأجيل لفريق التوظيف.');
  if (INT_LIVE_.concat(['MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'NO_SHOW', 'MANAGER_NO_SHOW']).indexOf(iv.Status) < 0 || iv.Rescheduled_To)
    throw userError_('المقابلة دي مش ممكن تتأجل.');
  if (['CHECKED_IN', 'STARTED'].indexOf(iv.Status) >= 0) throw userError_('المقابلة بدأت — سجّل اللي حصل الأول.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب التأجيل.');
  var panel = p.panel ? p.panel : panelOf_(iv.Interview_ID).map(function (x) { return { User_ID: x.User_ID, Role: x.Role }; });
  var wasLive = INT_LIVE_.indexOf(iv.Status) >= 0;
  if (wasLive) withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Status: 'RESCHEDULED', Exception_Code: 'RESCHEDULED', Exception_Note: reason }, ctx.user.User_ID); });
  var r;
  try {
    r = intCreate_(ctx, { Application_ID: iv.Application_ID, Round_ID: iv.Round_ID, Date: p.Date, Time: p.Time, Duration_Min: p.Duration_Min || iv.Duration_Min,
      Mode: p.Mode || iv.Mode, Location_ID: p.Location_ID !== undefined ? p.Location_ID : iv.Location_ID, Place: p.Place !== undefined ? p.Place : iv.Place,
      Meeting_Link: p.Meeting_Link !== undefined ? p.Meeting_Link : iv.Meeting_Link, panel: panel, Notes: p.Notes !== undefined ? p.Notes : iv.Notes, _from: iv.Interview_ID });
  } catch (e) {
    if (wasLive) withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Status: iv.Status, Exception_Code: iv.Exception_Code, Exception_Note: iv.Exception_Note }, ctx.user.User_ID); });
    throw e;
  }
  withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Rescheduled_To: r.interview.Interview_ID }, ctx.user.User_ID); });
  event_(ctx, 'INTERVIEW', iv.Interview_ID, 'RESCHEDULED', reason, { to: r.interview.Interview_ID });
  return r;
}

/** p = { Interview_ID, panel: [{ User_ID, Role }], reason } — change the panel of a live interview. */
function intPanelSet_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv);
  if (!A.full) throw userError_('تعديل اللجنة لفريق التوظيف.');
  if (INT_LIVE_.indexOf(iv.Status) < 0) throw userError_('اللجنة بتتعدل قبل ما المقابلة تخلص بس.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب تغيير اللجنة.');
  var panel = ivPanel_(p.panel), me = ctx.user.User_ID, now = nowIso_();
  var cur = panelOf_(iv.Interview_ID), byU = {};
  cur.forEach(function (x) { byU[x.User_ID] = x; });
  var newLead = panel.filter(function (x) { return x.Role === 'LEAD'; })[0].User_ID;
  var added = [], removed = [];
  withLock_(function () {
    cur.forEach(function (x) {
      if (!panel.some(function (y) { return y.User_ID === x.User_ID; })) {
        if (find_('EVALUATIONS', { Interview_ID: iv.Interview_ID, Evaluator_ID: x.User_ID }).length) throw userError_(userNames_()[x.User_ID] + ' بدأ تقييمه — مينفعش يتشال.');
        update_('INTERVIEW_PANEL', x.Panel_ID, { Status: 'Removed', Removed_Reason: reason }, me); removed.push(x.User_ID);
      }
    });
    panel.forEach(function (y) {
      var x = byU[y.User_ID];
      if (x) { if (x.Role !== y.Role) update_('INTERVIEW_PANEL', x.Panel_ID, { Role: y.Role }, me); }
      else {
        insert_('INTERVIEW_PANEL', { Panel_ID: nextId_('PANEL'), Interview_ID: iv.Interview_ID, User_ID: y.User_ID, Role: y.Role, Status: 'Active',
          Confirmed_At: y.User_ID === me ? now : '', Declined_At: '', Decline_Note: '', Opened_At: '', Removed_Reason: '', Eval_Reminded_At: '' }, me);
        added.push(y.User_ID);
      }
    });
    var patch = { Lead_User_ID: newLead };
    if (newLead !== iv.Lead_User_ID && ['PROPOSED', 'MANAGER_CONFIRMED'].indexOf(iv.Status) >= 0) {
      var self = newLead === me;
      patch.Status = self ? 'MANAGER_CONFIRMED' : 'PROPOSED';
      patch.Manager_Confirmed_By = self ? me : ''; patch.Manager_Confirmed_At = self ? now : '';
    }
    update_('INTERVIEWS', iv.Interview_ID, patch, me);
  });
  event_(ctx, 'INTERVIEW', iv.Interview_ID, 'PANEL_CHANGED', reason, { added: added, removed: removed, lead: newLead });
  audit_(ctx, { entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: 'PANEL', newValue: panel.map(function (x) { return x.User_ID + ':' + x.Role; }).join(','), reason: reason });
  var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
  var line = per.Full_Name + ' — ' + iv.Round_Name + ' — ' + ivLine_(iv);
  if (newLead !== iv.Lead_User_ID && newLead !== me) notify_([newLead], 'مقابلة محتاجة تأكيدك', line, 'INTERVIEW', iv.Interview_ID, true);
  added = added.filter(function (u) { return u !== newLead && u !== me; });
  if (added.length) notify_(added, 'اتضفت للجنة مقابلة', line, 'INTERVIEW', iv.Interview_ID, false);
  if (removed.length) notify_(removed, 'اتشلت من لجنة مقابلة', line + ' · ' + reason, 'INTERVIEW', iv.Interview_ID, false);
  return { interview: ivGet_(iv.Interview_ID) };
}

/** p = { Application_ID, Round_ID, reason } — skip a round for this candidate (authority + reason). */
function intWaive_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, v = L.vac;
  var round = roundOf_(v, p.Round_ID);
  if (!round) throw userError_('اختار الجولة.');
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب إلغاء الجولة للمرشح ده.');
  if (['SHORTLISTED', 'INTERVIEW'].indexOf(a.Stage) < 0) throw userError_('المرشح مش في مرحلة المقابلات.');
  var list = find_('INTERVIEWS', { Application_ID: a.Application_ID, Round_ID: round.id });
  if (list.some(function (x) { return INT_LIVE_.concat(INT_DONE_, ['WAIVED']).indexOf(x.Status) >= 0; })) throw userError_('الجولة دي عليها مقابلة متحددة أو اتعملت.');
  var iv;
  withLock_(function () {
    freezePlan_(v, ctx.user.User_ID);
    iv = insert_('INTERVIEWS', { Interview_ID: nextId_('INTERVIEW'), Application_ID: a.Application_ID, Person_ID: a.Person_ID, Vacancy_ID: v.Vacancy_ID,
      Round_ID: round.id, Round_Name: round.name, Round_Type: round.type, Kind: isAssessType_(round.type) ? 'ASSESSMENT' : 'INTERVIEW', Mode: '', Date: today_(), Time: '', Duration_Min: '', Location_ID: '',
      Place: '', Meeting_Link: '', Status: 'WAIVED', Organizer_ID: ctx.user.User_ID, Lead_User_ID: '', Manager_Confirmed_By: '', Manager_Confirmed_At: '', Invited_At: '',
      Candidate_Confirmed_At: '', Checked_In_At: '', Started_At: '', Completed_At: '', Evaluated_At: '', Is_Adhoc: '', Adhoc_Reason: '', Exception_Code: 'WAIVED',
      Exception_Note: reason, Rescheduled_From: '', Rescheduled_To: '', Notes: '', Reminded_At: '' }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: 'اتلغت جولة «' + round.name + '» للمرشح ده: ' + reason });
  });
  event_(ctx, 'INTERVIEW', iv.Interview_ID, 'WAIVED', reason);
  audit_(ctx, { entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: 'WAIVE', newValue: a.Application_ID + ' · ' + round.id, reason: reason });
  return { interview: iv };
}

/** Cancel the live interviews of an application that closed (rejected / withdrawn / transferred). Runs inside a lock. */
function cancelLiveInterviews_(actorId, appId, why) {
  var out = [];
  find_('INTERVIEWS', { Application_ID: appId }).forEach(function (iv) {
    if (INT_LIVE_.indexOf(iv.Status) < 0) return;
    update_('INTERVIEWS', iv.Interview_ID, { Status: 'CANCELLED', Exception_Code: 'CANCELLED', Exception_Note: why }, actorId);
    out.push(iv);
  });
  return out;
}
/** After the lock: tell the panels. */
function tellCancelled_(ivs, why) {
  ivs.forEach(function (iv) {
    var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
    notify_(panelOf_(iv.Interview_ID).map(function (x) { return x.User_ID; }), 'المقابلة اتلغت', per.Full_Name + ' — ' + iv.Round_Name + ' — ' + ivLine_(iv) + ' · ' + why,
      'INTERVIEW', iv.Interview_ID, false);
  });
}

/* ---------------- detail & workspace ---------------- */

function ivEvidence_(iv, events) {
  var out = [], first = null;
  if (iv.Checked_In_At) {
    events.forEach(function (e) {
      if (['OPENED', 'START', 'STARTED', 'FIRST_NOTE', 'EVAL_STARTED'].indexOf(e.Event) < 0 || e.Created_At < iv.Checked_In_At) return;
      if (!first || e.Created_At < first.Created_At) first = e;
    });
    var startAt = iv.Started_At && (!first || iv.Started_At < first.Created_At) ? iv.Started_At : first ? first.Created_At : '';
    if (startAt) out.push({ k: 'WAIT', min: minutesBetween_(iv.Checked_In_At, startAt), text: 'المرشح استنى ' + minutesBetween_(iv.Checked_In_At, startAt) + ' دقيقة من وصوله لحد أول نشاط مسجّل من اللجنة' });
    else if (INT_LIVE_.indexOf(iv.Status) >= 0) out.push({ k: 'WAITING', min: minutesBetween_(iv.Checked_In_At, nowIso_()), text: 'المرشح مستني من ' + minutesBetween_(iv.Checked_In_At, nowIso_()) + ' دقيقة — لسه مفيش نشاط من اللجنة' });
    var late = minutesBetween_(ivStart_(iv), iv.Checked_In_At);
    if (late !== null && late > 10) out.push({ k: 'LATE', min: late, text: 'المرشح وصل بعد المعاد بـ ' + late + ' دقيقة' });
  }
  if (iv.Started_At && iv.Completed_At) out.push({ k: 'DURATION', min: minutesBetween_(iv.Started_At, iv.Completed_At), text: 'مدة المقابلة ' + minutesBetween_(iv.Started_At, iv.Completed_At) + ' دقيقة' });
  return out;
}

/** p = { Interview_ID, open: 'Y' } — interview detail; open = the workspace was opened (evidence). */
function intGet_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv), me = ctx.user.User_ID;
  if (str_(p.open) === 'Y' && A.panel) {
    // evidence: the first time a panel member opens the screen, and his first open after the candidate checked in
    var firstOpen = !A.panel.Opened_At;
    var afterIn = !!iv.Checked_In_At && ['CHECKED_IN', 'STARTED'].indexOf(iv.Status) >= 0 && !eventsFor_('INTERVIEW', iv.Interview_ID)
      .some(function (e) { return e.Event === 'OPENED' && e.Actor_ID === me && e.Created_At >= iv.Checked_In_At; });
    if (firstOpen) { withLock_(function () { update_('INTERVIEW_PANEL', A.panel.Panel_ID, { Opened_At: nowIso_() }, me); }); A.panel.Opened_At = nowIso_(); }
    if (firstOpen || afterIn) event_(ctx, 'INTERVIEW', iv.Interview_ID, 'OPENED', '');
  }
  var names = userNames_(), v = A.v, a = A.app;
  var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
  var panel = panelOf_(iv.Interview_ID), evals = find_('EVALUATIONS', { Interview_ID: iv.Interview_ID });
  var cur = currentEvals_(evals), submittedBy = {};
  cur.forEach(function (e) { submittedBy[e.Evaluator_ID] = e; });
  var events = eventsFor_('INTERVIEW', iv.Interview_ID);
  var owes = owesEval_(me, iv.Application_ID);
  var t = vacTitle_(v);
  var evaluator = A.panel && A.panel.Role !== 'OBSERVER';
  var myEvals = evals.filter(function (e) { return e.Evaluator_ID === me; }).sort(function (x, y) { return num_(y.Version, 0) - num_(x.Version, 0); });
  var myDraft = myEvals.filter(function (e) { return e.Status === 'DRAFT'; })[0] || null, mySub = submittedBy[me] || null;
  var can = [];
  var st = iv.Status, live = INT_LIVE_.indexOf(st) >= 0;
  if (A.panel && INT_LIVE_.slice(0, 4).concat(['CHECKED_IN']).indexOf(st) >= 0 && !A.panel.Confirmed_At) can.push('CONFIRM');
  if (A.panel && INT_LIVE_.slice(0, 4).indexOf(st) >= 0) can.push('DECLINE');
  if (A.full) {
    if (['MANAGER_CONFIRMED', 'CANDIDATE_PENDING'].indexOf(st) >= 0) can.push('INVITED');
    if (st === 'CANDIDATE_PENDING') can.push('CAND_CONFIRM');
    if (['CANDIDATE_PENDING', 'CONFIRMED'].indexOf(st) >= 0) can.push('CAND_DECLINE');
    if (['CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED'].indexOf(st) >= 0 && ivStart_(iv) <= nowIso_()) can.push('NO_SHOW');
    if (st === 'CHECKED_IN') can.push('MANAGER_NO_SHOW');
    if (st === 'CONFIRMED' && iv.Reconfirm_Required === 'Y' && !iv.Reconfirmed_At) can.push('RECONFIRM');
    if (live) can.push('CANCEL', 'PANEL');
    if ((live && ['CHECKED_IN', 'STARTED'].indexOf(st) < 0 || ['MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'NO_SHOW', 'MANAGER_NO_SHOW'].indexOf(st) >= 0) && !iv.Rescheduled_To) can.push('RESCHEDULE');
  }
  if ((A.full || A.panel) && ['CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED'].indexOf(st) >= 0 && iv.Date <= today_()) can.push('CHECKIN');
  if ((A.full || A.panel) && (st === 'CHECKED_IN' || (iv.Mode !== 'IN_PERSON' && ['CONFIRMED', 'CANDIDATE_PENDING', 'MANAGER_CONFIRMED'].indexOf(st) >= 0))) can.push('START');
  if ((A.full || A.panel) && ['STARTED', 'CHECKED_IN'].indexOf(st) >= 0) can.push('COMPLETE');
  if (evaluator && ['CHECKED_IN', 'STARTED', 'COMPLETED', 'EVALUATED'].indexOf(st) >= 0 && !mySub && !myDraft) can.push('EVALUATE');
  if (evaluator && myDraft) can.push('EVALUATE');
  if (evaluator && mySub && !myDraft) can.push('REVISE');
  var seeAll = !owes && (A.full || A.mgr || !!A.panel);
  var out = {
    interview: iv, statusName: IV_ST_AR_[st] || st, line: ivLine_(iv), locationName: locName_(iv.Location_ID), place: ivPlaceText_(iv, 'ar'),
    organizerName: names[iv.Organizer_ID] || '', leadName: names[iv.Lead_User_ID] || '',
    candidate: personView_(per, A.full ? 'FULL' : 'SHORTLIST'), Application_ID: iv.Application_ID, appStage: a.Stage,
    vacancy: { Vacancy_ID: v.Vacancy_ID, jobTitle: t.ar, jobTitleEn: t.en, locationName: locName_(v.Location_ID), Job_Code: v.Job_Code },
    access: { full: A.full, mgr: A.mgr, panel: A.panel ? A.panel.Role : '', lead: A.lead, evaluator: !!evaluator },
    panel: panel.map(function (x) {
      return { User_ID: x.User_ID, name: names[x.User_ID] || x.User_ID, Role: x.Role, Confirmed_At: x.Confirmed_At, Declined_At: x.Declined_At, Decline_Note: x.Decline_Note,
        Opened_At: x.Opened_At, evaluates: x.Role !== 'OBSERVER', submitted: !!submittedBy[x.User_ID], late: !!(submittedBy[x.User_ID] && submittedBy[x.User_ID].Late === 'Y'),
        started: evals.some(function (e) { return e.Evaluator_ID === x.User_ID; }) };
    }),
    events: events.map(function (e) { return { Event: e.Event, at: e.Created_At, actorName: e.actorName, Comment: e.Comment }; }),
    evidence: ivEvidence_(iv, events), can: can,
    evaluations: seeAll ? cur.map(function (e) { return evalView_(e, names); }) : [],
    hiddenEvals: !seeAll && cur.length ? cur.length : 0,
    myEval: myDraft ? evalView_(myDraft, names) : mySub ? evalView_(mySub, names) : null,
    answers: answersView_(a), rescheduledFrom: iv.Rescheduled_From, rescheduledTo: iv.Rescheduled_To,
    kind: iv.Kind || 'INTERVIEW', typeName: iv.Kind === 'ASSESSMENT' ? (ASSESS_TYPE_AR_[iv.Round_Type] || '') : (INT_TYPE_AR_[iv.Round_Type] || ''),
    safety: iv.Safety_Required === 'Y' ? { items: SAFETY_ITEMS_.map(function (x) { return { k: x[0], t: x[1] }; }), done: !!iv.Safety_JSON } : null,
    reconfirm: iv.Reconfirm_Required === 'Y' ? { done: iv.Reconfirmed_At } : null
  };
  if (A.full || A.panel || A.mgr) {
    out.guide = guideFor_(iv, v);
    var d = jdApproved_(v.Job_Code);
    out.jd = d ? jdView_(d) : null;
    if (out.jd) out.jd.approvedByName = names[d.Approved_By] || '';
    out.others = find_('INTERVIEWS', { Application_ID: iv.Application_ID }).filter(function (x) { return x.Interview_ID !== iv.Interview_ID; })
      .sort(function (x, y) { return x.Interview_ID < y.Interview_ID ? -1 : 1; }).map(function (x) {
        var ev = seeAll ? currentEvals_(find_('EVALUATIONS', { Interview_ID: x.Interview_ID })).map(function (e) { return { evaluator: names[e.Evaluator_ID] || '', Recommendation: e.Recommendation, Summary: e.Summary }; }) : [];
        return { Interview_ID: x.Interview_ID, Round_Name: x.Round_Name, Status: x.Status, statusName: IV_ST_AR_[x.Status] || x.Status, Date: x.Date, Time: x.Time, evals: ev };
      });
  }
  return out;
}

/* ---------------- evaluations ---------------- */

/** Clean an evaluation payload against the guide. */
function evalClean_(p, guide) {
  var comps = {}, okC = {}; guide.comps.forEach(function (c) { okC[c.code] = c; });
  (Array.isArray(p.comps) ? p.comps : []).forEach(function (x) {
    var c = str_(x.c); if (!okC[c]) return;
    var r = str_(x.r);
    if (r !== '' && !/^[1-5]$/.test(r)) throw userError_('التقييم من 1 لـ 5.');
    comps[c] = { c: c, r: r, n: str_(x.n).slice(0, 600) };
  });
  var okR = {}; guide.reqs.forEach(function (r) { okR[r.k] = r; });
  var reqs = (Array.isArray(p.reqs) ? p.reqs : []).filter(function (x) { return okR[str_(x.k)]; }).map(function (x) {
    var s = str_(x.s);
    if (s && EVAL_REQ_ST_.indexOf(s) < 0) throw userError_('حالة متطلب غير معروفة.');
    return { k: str_(x.k), s: s, e: str_(x.e).slice(0, 400) };
  });
  var okQ = {}; guide.std.forEach(function (q) { okQ[q.id] = q; }); guide.comps.forEach(function (c) { c.questions.forEach(function (q) { okQ[q.id] = q; }); });
  var qs = (Array.isArray(p.qs) ? p.qs : []).filter(function (x) { return okQ[str_(x.id)]; }).map(function (x) {
    return { id: str_(x.id), asked: str_(x.asked) === 'Y' ? 'Y' : '', n: str_(x.n).slice(0, 600) };
  });
  var added = (Array.isArray(p.added) ? p.added : []).filter(function (x) { return str_(x.q); }).slice(0, 10).map(function (x) {
    return { q: str_(x.q).slice(0, 300), n: str_(x.n).slice(0, 600) };
  });
  return { comps: Object.keys(comps).map(function (k) { return comps[k]; }), reqs: reqs, qs: qs, added: added };
}

function evalValidate_(data, f, guide) {
  if (EVAL_RECS_.indexOf(f.Recommendation) < 0) throw userError_('اختار التوصية النهائية.');
  if (str_(f.Summary).length < 10) throw userError_('اكتب ملخص رأيك في المرشح.');
  var rated = data.comps.filter(function (c) { return c.r; });
  if (guide.comps.length && !rated.length) throw userError_('قيّم كفاءة واحدة على الأقل.');
  rated.forEach(function (c) {
    if ((c.r === '1' || c.r === '5') && c.n.length < 5) {
      var g = guide.comps.filter(function (x) { return x.code === c.c; })[0];
      throw userError_('اكتب الدليل اللي خلاك تدي «' + (g ? g.name : c.c) + '» تقييم ' + c.r + '.');
    }
  });
  var byK = {}; data.reqs.forEach(function (r) { byK[r.k] = r; });
  guide.reqs.forEach(function (r) {
    var x = byK[r.k];
    if (guide.reqsRequired && (!x || !x.s)) throw userError_('حدد حالة «' + r.label + '».');
    if (x && x.s && x.e.length < 3) throw userError_('اكتب الدليل على «' + r.label + '».');
  });
  var byQ = {}; data.qs.forEach(function (q) { byQ[q.id] = q; });
  guide.std.forEach(function (q) {
    if (q.kind === 'MANDATORY' && !(byQ[q.id] && byQ[q.id].asked === 'Y')) throw userError_('السؤال الإجباري لسه ماتسألش: «' + q.q + '».');
  });
}

/**
 * Save (or submit) my evaluation of an interview.
 * p = { Interview_ID, comps:[{c,r,n}], reqs:[{k,s,e}], qs:[{id,asked,n}], added:[{q,n}], Recommendation, Strengths, Concerns, Summary, submit:'Y' }
 */
function evalSave_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv), me = ctx.user.User_ID;
  if (!A.panel || A.panel.Role === 'OBSERVER') throw userError_('التقييم لأعضاء اللجنة اللي بيقيّموا بس.');
  if (['CHECKED_IN', 'STARTED', 'COMPLETED', 'EVALUATED'].indexOf(iv.Status) < 0) throw userError_('التقييم بيبدأ بعد وصول المرشح.');
  var submit = str_(p.submit) === 'Y';
  if (submit && ['STARTED', 'COMPLETED', 'EVALUATED'].indexOf(iv.Status) < 0) throw userError_('ابدأ المقابلة الأول قبل ما تسلّم التقييم.');
  if (submit) noRelationCheck_(ctx, p, 'EVALUATION ' + iv.Interview_ID, iv.Application_ID);   // v0.38.0 (CHG-81): before anything else
  var mine = find_('EVALUATIONS', { Interview_ID: iv.Interview_ID, Evaluator_ID: me });
  var draft = mine.filter(function (e) { return e.Status === 'DRAFT'; })[0] || null;
  var sub = currentEvals_(mine)[0] || null;
  if (!draft && sub) throw userError_('سلّمت تقييمك قبل كده — لو محتاج تعدّله استخدم «تعديل التقييم» واكتب السبب.');
  var guide = guideFor_(iv, A.v), data, f;
  if (iv.Kind === 'ASSESSMENT') {
    var checked = evidenceCheck_(p.files);                                          // validate uploads before anything is saved
    data = assessClean_(p, guide, draft ? evalData_(draft) : {}, []);
    if ((data.files.length + checked.length) > 6) throw userError_('أقصى حاجة 6 ملفات دليل.');
    if (checked.length) data.files = data.files.concat(evidenceSave_(iv.Interview_ID, checked));   // Drive upload outside the lock
    f = { Recommendation: ASSESS_RESULTS_.indexOf(str_(p.Result)) >= 0 ? str_(p.Result) : '', Strengths: '', Concerns: '',
      Summary: str_(p.Summary).slice(0, 1500), Data_JSON: JSON.stringify(data) };
    if (submit) assessValidate_(data, f, guide);
  } else {
    data = evalClean_(p, guide);
    f = { Recommendation: EVAL_RECS_.indexOf(str_(p.Recommendation)) >= 0 ? str_(p.Recommendation) : '', Strengths: str_(p.Strengths).slice(0, 1000),
      Concerns: str_(p.Concerns).slice(0, 1000), Summary: str_(p.Summary).slice(0, 1500), Data_JSON: JSON.stringify(data) };
    if (submit) evalValidate_(data, f, guide);
  }
  var now = nowIso_(), firstNote = !find_('EVALUATIONS', { Interview_ID: iv.Interview_ID }).length;
  var res, after = null, done = false, created = !draft;
  withLock_(function () {
    if (!draft) {
      draft = insert_('EVALUATIONS', { Evaluation_ID: nextId_('EVALUATION'), Interview_ID: iv.Interview_ID, Application_ID: iv.Application_ID, Evaluator_ID: me,
        Panel_Role: A.panel.Role, Version: '1', Status: 'DRAFT', Data_JSON: '{}', Recommendation: '', Strengths: '', Concerns: '', Summary: '',
        Started_At: now, Submitted_At: '', Late: '', Revision_Reason: '' }, me);
    }
    if (submit) {
      var ref = iv.Completed_At || now, hours = (workMinutesBetween_(ref, now) || 0) / 60;      // weekly days off do not count
      f.Status = 'SUBMITTED'; f.Submitted_At = now; f.Late = hours > cfg_('EVAL_SLA_HOURS', 24) ? 'Y' : '';
      mine.forEach(function (e) { if (e.Status === 'SUBMITTED') update_('EVALUATIONS', e.Evaluation_ID, { Status: 'SUPERSEDED' }, me); });
    }
    res = update_('EVALUATIONS', draft.Evaluation_ID, f, me);
    if (submit) {
      var cur = findOne_('INTERVIEWS', { Interview_ID: iv.Interview_ID });
      if (cur.Status === 'STARTED') cur = update_('INTERVIEWS', iv.Interview_ID, { Status: 'COMPLETED', Completed_At: now }, me).after;
      after = maybeEvaluated_(me, cur).after;
      done = after.Status === 'EVALUATED' && cur.Status !== 'EVALUATED';
    }
  });
  if (firstNote) event_(ctx, 'INTERVIEW', iv.Interview_ID, 'FIRST_NOTE', '');
  if (created) event_(ctx, 'INTERVIEW', iv.Interview_ID, 'EVAL_STARTED', '');
  if (submit) {
    event_(ctx, 'INTERVIEW', iv.Interview_ID, num_(res.after.Version, 1) > 1 ? 'EVAL_REVISED' : 'EVAL_SUBMITTED', res.after.Recommendation);
    audit_(ctx, { entityType: 'EVALUATION', entityId: res.after.Evaluation_ID, action: 'SUBMIT', newValue: res.after.Recommendation + ' v' + res.after.Version, reason: res.after.Revision_Reason });
    var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
    var to = [iv.Organizer_ID];
    var aa = findOne_('APPLICATIONS', { Application_ID: iv.Application_ID }) || {};
    if (aa.Owner_User_ID) to.push(aa.Owner_User_ID);
    var isA = iv.Kind === 'ASSESSMENT';
    notify_(to.filter(function (u) { return u !== me; }), isA ? (res.after.Recommendation === 'FAIL' ? 'نتيجة اختبار: راسب — محتاج قرار' : 'اتسجلت نتيجة اختبار') : done ? 'كل تقييمات المقابلة اتسلّمت' : 'اتسلّم تقييم مقابلة',
      per.Full_Name + ' — ' + iv.Round_Name + ' — ' + (isA ? (ASSESS_RES_AR_[res.after.Recommendation] || '') + ' — ' : '') + (userNames_()[me] || ''), 'INTERVIEW', iv.Interview_ID, false);
  }
  return { evaluation: evalView_(res.after, userNames_()), interview: after || ivGet_(iv.Interview_ID) };
}

/** p = { Interview_ID, reason } — reopen my submitted evaluation as a new version (the old one stays). */
function evalRevise_(ctx, p) {
  var iv = ivGet_(p.Interview_ID), A = ivAccess_(ctx, iv), me = ctx.user.User_ID;
  if (!A.panel || A.panel.Role === 'OBSERVER') throw userError_('التقييم لأعضاء اللجنة اللي بيقيّموا بس.');
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب تعديل التقييم.');
  var mine = find_('EVALUATIONS', { Interview_ID: iv.Interview_ID, Evaluator_ID: me });
  if (mine.some(function (e) { return e.Status === 'DRAFT'; })) throw userError_('عندك تعديل مفتوح بالفعل.');
  var sub = currentEvals_(mine)[0];
  if (!sub) throw userError_('لسه ماسلّمتش تقييم.');
  var e;
  withLock_(function () {
    e = insert_('EVALUATIONS', { Evaluation_ID: nextId_('EVALUATION'), Interview_ID: iv.Interview_ID, Application_ID: iv.Application_ID, Evaluator_ID: me,
      Panel_Role: sub.Panel_Role, Version: String(num_(sub.Version, 1) + 1), Status: 'DRAFT', Data_JSON: sub.Data_JSON, Recommendation: sub.Recommendation,
      Strengths: sub.Strengths, Concerns: sub.Concerns, Summary: sub.Summary, Started_At: nowIso_(), Submitted_At: '', Late: '', Revision_Reason: reason.slice(0, 300) }, me);
  });
  audit_(ctx, { entityType: 'EVALUATION', entityId: e.Evaluation_ID, action: 'REVISE', oldValue: sub.Evaluation_ID, reason: reason });
  return { evaluation: evalView_(e, userNames_()) };
}

/* ---------------- readiness & comparison ---------------- */

/** Interviews of a vacancy, indexed. */
function ivIndex_(vacancyId) {
  var ivs = find_('INTERVIEWS', { Vacancy_ID: vacancyId });
  var byApp = {}, panelBy = {}, evalsBy = {};
  ivs.forEach(function (iv) { (byApp[iv.Application_ID] = byApp[iv.Application_ID] || []).push(iv); });
  var ids = {}; ivs.forEach(function (iv) { ids[iv.Interview_ID] = 1; });
  find_('INTERVIEW_PANEL', { Status: 'Active' }).forEach(function (x) { if (ids[x.Interview_ID]) (panelBy[x.Interview_ID] = panelBy[x.Interview_ID] || []).push(x); });
  find_('EVALUATIONS', {}).forEach(function (e) { if (ids[e.Interview_ID]) (evalsBy[e.Interview_ID] = evalsBy[e.Interview_ID] || []).push(e); });
  return { byApp: byApp, panelBy: panelBy, evalsBy: evalsBy };
}

/** Per round status of one application + readiness. */
function readiness_(a, plan, X) {
  var ivs = (X.byApp[a.Application_ID] || []).slice().sort(function (x, y) { return x.Interview_ID < y.Interview_ID ? -1 : 1; });
  var expected = 0, submitted = 0, recs = [], tests = [], next = null, any = false;
  var rounds = plan.map(function (r) {
    var isA = isAssessType_(r.type);
    var list = ivs.filter(function (iv) { return iv.Round_ID === r.id; });
    var live = list.filter(function (iv) { return INT_LIVE_.indexOf(iv.Status) >= 0; })[0];
    var done = list.filter(function (iv) { return INT_DONE_.indexOf(iv.Status) >= 0; });
    var waived = list.filter(function (iv) { return iv.Status === 'WAIVED'; })[0];
    var last = list[list.length - 1];
    var st = live ? 'SCHEDULED' : done.length ? 'DONE' : waived ? 'WAIVED' : last ? 'MISSED' : 'NONE';
    var rExp = 0, rSub = 0, result = '', score = '';
    // the latest held session counts for the round (an assessment can be repeated after "needs retest")
    var counted = isA && done.length ? [done[done.length - 1]] : done;
    counted.concat(live ? [live] : []).forEach(function (iv) {
      any = true;
      var ev = evaluatorsOf_(X.panelBy[iv.Interview_ID] || []);
      var cur = currentEvals_(X.evalsBy[iv.Interview_ID] || []);
      if (INT_DONE_.indexOf(iv.Status) >= 0 || ['STARTED', 'CHECKED_IN'].indexOf(iv.Status) >= 0) { rExp += ev.length; rSub += cur.length; }
      if (!isA) cur.forEach(function (e) { recs.push({ rec: e.Recommendation, by: e.Evaluator_ID, round: r.name }); });
      else if (INT_DONE_.indexOf(iv.Status) >= 0 && cur.length) {
        var rs = cur.map(function (e) { return e.Recommendation; });
        result = rs.indexOf('FAIL') >= 0 ? 'FAIL' : rs.indexOf('RETEST') >= 0 ? 'RETEST' : 'PASS';
        score = cur.map(function (e) { return evalData_(e).score; }).filter(String)[0] || '';
      }
    });
    if (isA && result) tests.push({ round: r.name, result: result, score: score });
    if (isA && result === 'RETEST' && !live) st = 'RETEST';
    expected += rExp; submitted += rSub;
    if (live && (!next || ivStart_(live) < ivStart_(next))) next = live;
    return { id: r.id, name: r.name, type: r.type, req: r.req, kind: isA ? 'ASSESSMENT' : 'INTERVIEW', result: result, score: score, status: st,
      live: live ? { Interview_ID: live.Interview_ID, Status: live.Status, Date: live.Date, Time: live.Time } : null,
      done: done.length, evals: rExp ? rSub + '/' + rExp : '', last: last ? { Interview_ID: last.Interview_ID, Status: last.Status } : null };
  });
  var pos = recs.some(function (x) { return x.rec === 'STRONG_PROCEED' || x.rec === 'PROCEED'; });
  var neg = recs.some(function (x) { return x.rec === 'DO_NOT_PROCEED'; });
  var code;
  if (a.Stage === 'REJECTED' || a.Stage === 'WITHDRAWN') code = a.Stage;
  else if (a.Stage === 'ON_HOLD') code = 'DEFERRED';
  else {
    var reqOk = rounds.every(function (r) { return r.req !== 'REQUIRED' || r.status === 'WAIVED' || (r.status === 'DONE' && (!r.evals || r.evals.split('/')[0] === r.evals.split('/')[1])); });
    var pending = rounds.some(function (r) { return r.status === 'SCHEDULED'; }) || submitted < expected;
    code = any && reqOk && !pending ? 'READY' : 'NOT_READY';
  }
  return { code: code, rounds: rounds, evals: { submitted: submitted, expected: expected }, conflict: pos && neg, recs: recs, tests: tests,
    failed: tests.some(function (x) { return x.result === 'FAIL'; }),
    next: next ? { Interview_ID: next.Interview_ID, Status: next.Status, Date: next.Date, Time: next.Time, Round_Name: next.Round_Name } : null };
}

/** p = { Application_ID } — the interviews card of the candidate page. */
function appInterviews_(ctx, a, v, access) {
  var X = ivIndex_(v.Vacancy_ID), plan = planOf_(v), names = userNames_(), me = ctx.user.User_ID;
  var R = readiness_(a, plan, X);
  var hide = owesEval_(me, a.Application_ID);
  var list = (X.byApp[a.Application_ID] || []).slice().sort(function (x, y) { return x.Interview_ID < y.Interview_ID ? -1 : 1; }).map(function (iv) {
    var pn = X.panelBy[iv.Interview_ID] || [], cur = currentEvals_(X.evalsBy[iv.Interview_ID] || []);
    return { Interview_ID: iv.Interview_ID, Round_ID: iv.Round_ID, Round_Name: iv.Round_Name, Status: iv.Status, statusName: IV_ST_AR_[iv.Status] || iv.Status,
      Date: iv.Date, Time: iv.Time, Mode: iv.Mode, line: iv.Status === 'WAIVED' ? '' : ivLine_(iv), Is_Adhoc: iv.Is_Adhoc, note: iv.Exception_Note,
      panel: pn.map(function (x) { return (names[x.User_ID] || x.User_ID) + (x.Role === 'LEAD' ? ' (مسؤول)' : ''); }).join('، '),
      evals: evaluatorsOf_(pn).length ? cur.length + '/' + evaluatorsOf_(pn).length : '', Kind: iv.Kind || 'INTERVIEW',
      recs: hide ? [] : cur.map(function (e) { return { by: names[e.Evaluator_ID] || '', rec: e.Recommendation, score: iv.Kind === 'ASSESSMENT' ? evalData_(e).score || '' : '' }; }) };
  });
  if (hide) R.rounds.forEach(function (r) { r.result = ''; r.score = ''; });
  return { plan: plan, readiness: { code: R.code, conflict: hide ? false : R.conflict, failed: hide ? false : R.failed, evals: R.evals, next: R.next }, rounds: R.rounds, list: list,
    hidden: hide, canSchedule: access === 'FULL' && ['SHORTLISTED', 'INTERVIEW'].indexOf(a.Stage) >= 0, canWaive: hasAnyRole_(ctx, intManageRoles_()) && access === 'FULL' };
}

/** p = { Vacancy_ID } — live comparison of the candidates in the interview process. */
function intCompare_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  var acc = vacancyAccess_(ctx, v);
  if (!acc) throw userError_('مالكش صلاحية على الشاغر ده.');
  var X = ivIndex_(v.Vacancy_ID), plan = planOf_(v), names = userNames_(), me = ctx.user.User_ID;
  var d = jdApproved_(v.Job_Code) || jdDraft_(v.Job_Code);
  var comps = d ? jdView_(d).comps.map(function (c) { return { code: c.code, name: c.name, level: c.level, group: c.group }; }) : [];
  var reqs = reqsFor_(v);
  var apps = find_('APPLICATIONS', { Vacancy_ID: v.Vacancy_ID }).filter(function (a) {
    if (a.Stage === 'INTERVIEW') return true;
    return (X.byApp[a.Application_ID] || []).length && ['SHORTLISTED', 'ON_HOLD'].indexOf(a.Stage) >= 0;
  });
  if (acc === 'SHORTLIST') apps = apps.filter(function (a) { return MGR_STAGES_.indexOf(a.Stage) >= 0; });
  var rows = apps.map(function (a) {
    var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
    var R = readiness_(a, plan, X), hide = owesEval_(me, a.Application_ID);
    var row = { Application_ID: a.Application_ID, Stage: a.Stage, name: per.Full_Name, education: per.Education, specialization: per.Specialization,
      experience: per.Experience_Years, currentTitle: per.Current_Title, currentEmployer: per.Current_Employer, notice: per.Notice_Period,
      expected: acc === 'FULL' ? per.Expected_Salary : undefined, isInternal: a.Is_Internal,
      readiness: R.code, evals: R.evals, rounds: R.rounds.map(function (r) { return { name: r.name, status: r.status, evals: r.evals, req: r.req, kind: r.kind }; }), hidden: hide };
    if (hide) return row;
    row.conflict = R.conflict;
    row.tests = R.tests; row.failed = R.failed;
    row.recs = R.recs.map(function (x) { return { rec: x.rec, by: names[x.by] || '', round: x.round }; });
    var sum = {}, rq = {};
    (X.byApp[a.Application_ID] || []).forEach(function (iv) {
      currentEvals_(X.evalsBy[iv.Interview_ID] || []).forEach(function (e) {
        var dd = evalData_(e);
        (dd.comps || []).forEach(function (c) { if (!c.r) return; var s = sum[c.c] = sum[c.c] || { t: 0, n: 0, min: 5, max: 1 }; s.t += Number(c.r); s.n++; s.min = Math.min(s.min, Number(c.r)); s.max = Math.max(s.max, Number(c.r)); });
        (dd.reqs || []).forEach(function (x) { if (!x.s) return; var q = rq[x.k] = rq[x.k] || { MET: 0, NOT_MET: 0, VERIFY: 0 }; q[x.s]++; });
      });
    });
    row.comps = {}; Object.keys(sum).forEach(function (k) { var s = sum[k]; row.comps[k] = { avg: Math.round(s.t / s.n * 10) / 10, n: s.n, spread: s.max - s.min }; });
    row.reqs = {}; Object.keys(rq).forEach(function (k) { var q = rq[k]; row.reqs[k] = q.NOT_MET ? 'NOT_MET' : q.VERIFY ? 'VERIFY' : 'MET'; });
    return row;
  });
  var order = { READY: 0, NOT_READY: 1, DEFERRED: 2 };
  rows.sort(function (x, y) { return (order[x.readiness] || 3) - (order[y.readiness] || 3); });
  var t = vacTitle_(v);
  return { vacancy: { Vacancy_ID: v.Vacancy_ID, jobTitle: t.ar, locationName: locName_(v.Location_ID), Required_HC: v.Required_HC, Joined_HC: v.Joined_HC },
    plan: plan, comps: comps, reqs: reqs, rows: rows, access: acc };
}

/* ---------------- my interviews & tasks ---------------- */

/** p = { tab: 'mine' | 'team', from, to } */
function intList_(ctx, p) {
  var me = ctx.user.User_ID, today = today_(), names = userNames_();
  var tab = str_(p.tab) === 'team' ? 'team' : 'mine';
  var mineP = {}; find_('INTERVIEW_PANEL', { User_ID: me, Status: 'Active' }).forEach(function (x) { mineP[x.Interview_ID] = x; });
  var team = myTeamVacancies_(ctx), all = candAll_(ctx);
  var from = str_(p.from) || (tab === 'team' ? addDaysIso_(-7).slice(0, 10) : addDaysIso_(-30).slice(0, 10)), to = str_(p.to) || '9999-12-31';
  var rows = find_('INTERVIEWS', {}).filter(function (iv) {
    if (iv.Status === 'WAIVED') return false;
    if (tab === 'mine') return !!mineP[iv.Interview_ID] && (iv.Date >= from || INT_LIVE_.concat(['COMPLETED']).indexOf(iv.Status) >= 0);
    return (all || team[iv.Vacancy_ID] || iv.Organizer_ID === me) && iv.Date >= from && iv.Date <= to;
  });
  var vt = {};
  return rows.map(function (iv) {
    var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
    if (!vt[iv.Vacancy_ID]) { var v = findOne_('VACANCIES', { Vacancy_ID: iv.Vacancy_ID }) || {}; vt[iv.Vacancy_ID] = v.Vacancy_ID ? vacTitle_(v).ar + ' — ' + locName_(v.Location_ID) : iv.Vacancy_ID; }
    var pm = mineP[iv.Interview_ID], need = '';
    if (pm) {
      if (!pm.Confirmed_At && !pm.Declined_At && INT_LIVE_.slice(0, 4).indexOf(iv.Status) >= 0) need = iv.Lead_User_ID === me && iv.Status === 'PROPOSED' ? 'CONFIRM' : 'ATTEND';
      if (pm.Role !== 'OBSERVER' && ['STARTED', 'COMPLETED'].indexOf(iv.Status) >= 0 && !find_('EVALUATIONS', { Interview_ID: iv.Interview_ID, Evaluator_ID: me, Status: 'SUBMITTED' }).length) need = 'EVALUATE';
    }
    if (iv.Status === 'CHECKED_IN') need = need || 'WAITING';
    if (tab === 'team' && !need) {
      if (iv.Status === 'MANAGER_CONFIRMED') need = 'INVITE';
      else if (iv.Status === 'CANDIDATE_PENDING') need = 'CAND';
      else if (iv.Status === 'CONFIRMED' && iv.Reconfirm_Required === 'Y' && !iv.Reconfirmed_At && iv.Date <= nextWorkDay_()) need = 'RECONFIRM';
      else if (['MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'NO_SHOW'].indexOf(iv.Status) >= 0 && !iv.Rescheduled_To) need = 'RESCHEDULE';
    }
    return { Interview_ID: iv.Interview_ID, Application_ID: iv.Application_ID, name: per.Full_Name, job: vt[iv.Vacancy_ID], Round_Name: iv.Round_Name,
      Date: iv.Date, Time: iv.Time, Mode: iv.Mode, place: iv.Mode === 'IN_PERSON' ? locName_(iv.Location_ID) + (iv.Place ? ' — ' + iv.Place : '') : iv.Mode === 'PHONE' ? 'تليفون' : 'أونلاين',
      Status: iv.Status, statusName: IV_ST_AR_[iv.Status] || iv.Status, myRole: pm ? pm.Role : '', lead: names[iv.Lead_User_ID] || '', need: need, Kind: iv.Kind || 'INTERVIEW',
      today: iv.Date === today, past: iv.Date < today, waitMin: iv.Status === 'CHECKED_IN' ? minutesBetween_(iv.Checked_In_At, nowIso_()) : null };
  }).sort(function (x, y) {
    var nx = x.need ? 0 : 1, ny = y.need ? 0 : 1;
    if (nx !== ny) return nx - ny;
    var kx = x.Date + x.Time, ky = y.Date + y.Time;
    if (!x.past && !y.past) return kx < ky ? -1 : 1;
    return kx < ky ? 1 : -1;
  });
}

/** Counters for the home page. */
function intTodo_(ctx) {
  var me = ctx.user.User_ID, today = today_();
  var t = { confirm: 0, evaluate: 0, today: 0, waiting: 0, invite: 0, cand: 0, reschedule: 0, panel: 0, reconfirm: 0 };
  var nwd = nextWorkDay_();
  var mineP = {}; find_('INTERVIEW_PANEL', { User_ID: me, Status: 'Active' }).forEach(function (x) { mineP[x.Interview_ID] = x; });
  var team = hasAnyRole_(ctx, candWorkRoles_()) ? myTeamVacancies_(ctx) : {};
  var mySubs = {}; find_('EVALUATIONS', { Evaluator_ID: me, Status: 'SUBMITTED' }).forEach(function (e) { mySubs[e.Interview_ID] = 1; });
  find_('INTERVIEWS', {}).forEach(function (iv) {
    var pm = mineP[iv.Interview_ID], live = INT_LIVE_.indexOf(iv.Status) >= 0;
    if (pm) {
      if (live || iv.Status === 'COMPLETED') t.panel++;
      if (iv.Status === 'PROPOSED' && iv.Lead_User_ID === me) t.confirm++;
      if (pm.Role !== 'OBSERVER' && ['STARTED', 'COMPLETED'].indexOf(iv.Status) >= 0 && !mySubs[iv.Interview_ID]) t.evaluate++;
      if (live && iv.Date === today) t.today++;
    }
    var mineTeam = iv.Organizer_ID === me || !!team[iv.Vacancy_ID];
    if (iv.Status === 'CHECKED_IN' && (pm || mineTeam)) t.waiting++;
    if (mineTeam) {
      if (iv.Status === 'MANAGER_CONFIRMED') t.invite++;
      if (iv.Status === 'CANDIDATE_PENDING') t.cand++;
      if (['MANAGER_DECLINED', 'CANDIDATE_DECLINED', 'NO_SHOW'].indexOf(iv.Status) >= 0 && !iv.Rescheduled_To) t.reschedule++;
      if (iv.Status === 'CONFIRMED' && iv.Reconfirm_Required === 'Y' && !iv.Reconfirmed_At && iv.Date <= nwd) t.reconfirm++;
    }
  });
  return t;
}

/* ---------------- daily: reminders, evaluation SLA ---------------- */

function interviewSla_() {
  // v0.35.0: one lock for the whole pass (the notifications and stamps are written together at the end), and only
  // interviews of the last 30 days — the old ones were reminded about long ago
  return withLock_(interviewSlaRun_);
}
function interviewSlaRun_() {
  var today = today_(), tomorrow = nextWorkDay_(), now = nowIso_(), out = { confirm: 0, tomorrow: 0, evals: 0, escalated: 0, unrecorded: 0 };
  var since = addDaysYmd_(today, -30);
  var slaH = cfg_('EVAL_SLA_HOURS', 24), confH = cfg_('INTERVIEW_CONFIRM_HOURS', 24);
  var recMgrs = find_('USER_ROLES', {}).filter(function (r) { return r.Role_Code === ROLE.REC_MANAGER && isEffective_(r.Effective_From, r.Effective_To); }).map(function (r) { return r.User_ID; });
  find_('INTERVIEWS', {}).forEach(function (iv) {
    if (str_(iv.Date) < since && str_(iv.Completed_At || iv.Started_At || iv.Created_At).slice(0, 10) < since) return;
    var per = null;
    function line() { per = per || findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {}; return per.Full_Name + ' — ' + iv.Round_Name + ' — ' + ivLine_(iv); }
    var reminded = str_(iv.Reminded_At).slice(0, 10) === today;
    if (iv.Status === 'PROPOSED' && !reminded && (workMinutesBetween_(iv.Created_At, now) || 0) >= confH * 60) {
      notify_([iv.Lead_User_ID], 'تذكير: مقابلة لسه مستنية تأكيدك', line(), 'INTERVIEW', iv.Interview_ID, false);
      notify_([iv.Organizer_ID], 'المقابِل لسه مأكدش المقابلة', line(), 'INTERVIEW', iv.Interview_ID, false);
      withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Reminded_At: now }, 'SYSTEM'); });
      out.confirm++;
    } else if (iv.Date > today && iv.Date <= tomorrow && ['MANAGER_CONFIRMED', 'CANDIDATE_PENDING', 'CONFIRMED'].indexOf(iv.Status) >= 0 && !reminded) {
      if (iv.Status !== 'MANAGER_CONFIRMED' && candidateReminder_(iv)) out.candidate = (out.candidate || 0) + 1;
      if (iv.Status === 'CONFIRMED' && iv.Reconfirm_Required === 'Y' && !iv.Reconfirmed_At) {
        notify_([iv.Organizer_ID], 'كلّم المرشح وأكّد حضوره تاني', line() + ' · الجولة دي محتاجة تأكيد يوم قبلها.', 'INTERVIEW', iv.Interview_ID, false);
        out.reconfirm = (out.reconfirm || 0) + 1;
      }
      notify_(panelOf_(iv.Interview_ID).map(function (x) { return x.User_ID; }), iv.Date === tomorrow_() ? 'تذكير: عندك مقابلة بكرة' : 'تذكير: عندك مقابلة يوم ' + iv.Date, line(), 'INTERVIEW', iv.Interview_ID, true);   // v0.39.0 (INT-003): by e-mail too
      if (iv.Status !== 'CONFIRMED') notify_([iv.Organizer_ID], 'المرشح لسه مأكدش مقابلة ' + iv.Date, line(), 'INTERVIEW', iv.Interview_ID, false);
      withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Reminded_At: now }, 'SYSTEM'); });
      out.tomorrow++;
    } else if (iv.Date < today && iv.Date >= addDaysIso_(-7).slice(0, 10) && ['MANAGER_CONFIRMED', 'CANDIDATE_PENDING', 'CONFIRMED', 'PROPOSED'].indexOf(iv.Status) >= 0 && !reminded) {
      notify_([iv.Organizer_ID], 'سجّل اللي حصل في المقابلة', line() + ' · المعاد فات ولسه مفيش تسجيل وصول أو غياب.', 'INTERVIEW', iv.Interview_ID, false);
      withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Reminded_At: now }, 'SYSTEM'); });
      out.unrecorded++;
    }
    if (['COMPLETED', 'STARTED'].indexOf(iv.Status) >= 0) {
      var ref = iv.Completed_At || iv.Started_At, hrs = (workMinutesBetween_(ref, now) || 0) / 60;
      if (hrs < slaH) return;
      var subs = {}; currentEvals_(find_('EVALUATIONS', { Interview_ID: iv.Interview_ID })).forEach(function (e) { subs[e.Evaluator_ID] = 1; });
      evaluatorsOf_(panelOf_(iv.Interview_ID)).forEach(function (pm) {
        if (subs[pm.User_ID] || str_(pm.Eval_Reminded_At).slice(0, 10) === today) return;
        var esc = hrs >= slaH * 2 && !pm.Eval_Escalated_At, patch = { Eval_Reminded_At: now };
        notify_([pm.User_ID], 'تذكير: تقييم مقابلة متأخر', line(), 'INTERVIEW', iv.Interview_ID, false);
        if (esc) {
          notify_([iv.Organizer_ID].concat(recMgrs), 'تقييم مقابلة متأخر أكتر من ' + Math.round(slaH * 2) + ' ساعة',
            line() + ' · المقيّم: ' + (userNames_()[pm.User_ID] || pm.User_ID), 'INTERVIEW', iv.Interview_ID, false);
          patch.Eval_Escalated_At = now;
          out.escalated++;
        }
        withLock_(function () { update_('INTERVIEW_PANEL', pm.Panel_ID, patch, 'SYSTEM'); });
        out.evals++;
      });
    }
  });
  return out;
}
