/**
 * Offers.gs — Phase 5A (v0.13.0): selection decision, reference checks, salary structures and pay components,
 * offer authority, offers with versions / validity / salary trail, presenting and the candidate's answer.
 *
 * Rules (Blueprint §13):
 *   • Selection and the offer are separate steps: the first decides who, the second decides terms.
 *   • The fixed monthly package is calculated by the system from the components, never typed.
 *   • Authority comes from OFFER_AUTHORITY (table, not code): the offer routes to the lowest sufficient role,
 *     and the next role up when nobody holds it. Above the grade maximum needs a justification.
 *   • Versions are never overwritten: negotiation creates V2, V3 … and each keeps its own approval.
 *   • Every offer has Valid Until; it expires by itself (daily job); HR can extend it with a reason.
 *   • Over-hiring check before an offer goes out (joined + accepted + outstanding offers); HR override with reason.
 *   • No wage or payroll action, ever. Salary figures are visible to the recruitment team and approvers only.
 */

var SEL_DECISIONS_ = ['SELECTED', 'RESERVE', 'HOLD', 'MORE_INTERVIEW', 'REJECTED'];
var SEL_AR_ = { SELECTED: 'مختار', RESERVE: 'احتياطي', HOLD: 'القرار متأجل', MORE_INTERVIEW: 'محتاج مقابلة إضافية', REJECTED: 'مرفوض' };
var OFFER_LIVE_ = ['DRAFT', 'RETURNED', 'PENDING_APPROVAL', 'APPROVED', 'PRESENTED'];
var OFFER_OUT_ = ['PENDING_APPROVAL', 'APPROVED', 'PRESENTED'];          // counted against the vacancy's remaining HC
var OFFER_ST_AR_ = { DRAFT: 'مسودة', RETURNED: 'راجع للتعديل', PENDING_APPROVAL: 'مستني الموافقة', APPROVED: 'معتمد — لسه ماتقدمش',
  PRESENTED: 'اتقدم للمرشح', ACCEPTED: 'المرشح قبل', DECLINED: 'المرشح رفض', EXPIRED: 'انتهت صلاحيته', WITHDRAWN: 'اتسحب', SUPERSEDED: 'نسخة قديمة' };
var OFFER_DECLINE_ = ['SALARY', 'BENEFITS', 'COUNTEROFFER', 'ANOTHER_OFFER', 'LOCATION', 'WORKING_HOURS', 'JOB_SCOPE', 'JOINING_DATE', 'PERSONAL', 'NO_RESPONSE', 'OTHER'];
var OFFER_DECLINE_AR_ = { SALARY: 'المرتب', BENEFITS: 'المزايا', COUNTEROFFER: 'شركته زودت له', ANOTHER_OFFER: 'عرض تاني', LOCATION: 'مكان العمل',
  WORKING_HOURS: 'مواعيد العمل', JOB_SCOPE: 'طبيعة الوظيفة', JOINING_DATE: 'معاد الاستلام', PERSONAL: 'ظروف شخصية', NO_RESPONSE: 'مارد', OTHER: 'أخرى' };
var OFFER_VIA_ = ['EMAIL', 'PRINT', 'WHATSAPP', 'IN_PERSON'];
var COMP_KINDS_ = ['BASIC', 'FIXED', 'VARIABLE'];
var AUTH_POINTS_ = ['MIN', 'MID', 'MAX', 'ANY'];

/* ---------------- roles ---------------- */

/** Salary structures, pay components and the authority matrix: the HR Sector Manager's decision (and the owner). */
function payEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }
function payViewRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR]; }
function hcOverrideRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }
function offerExtendRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }

function authRows_() {
  return find_('OFFER_AUTHORITY', { Status: 'Active' }).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); });
}
function offerApproverRoles_() { return authRows_().map(function (r) { return r.Role_Code; }); }

/** Active users holding a role. */
function roleHolders_(role) {
  var act = {}; all_('USERS').forEach(function (u) { if (u.Status === 'Active') act[u.User_ID] = 1; });
  var out = {};
  where_('USER_ROLES', function (r) { return r.Role_Code === role && isEffective_(r.Effective_From, r.Effective_To); })
    .forEach(function (r) { if (act[r.User_ID]) out[r.User_ID] = 1; });
  return Object.keys(out);
}

/* ---------------- salary structures & components ---------------- */

function payComponents_() {
  return find_('PAY_COMPONENTS', {}).filter(function (c) { return c.Status === 'Active'; })
    .sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); });
}

/** The active salary structure of a grade (or null). */
function structureOf_(grade) {
  if (!str_(grade)) return null;
  return find_('SALARY_STRUCTURES', { Grade_Code: str_(grade), Status: 'Active' }).filter(function (s) { return !s.Effective_From || s.Effective_From <= today_(); })
    .sort(function (a, b) { return num_(b.Version, 0) - num_(a.Version, 0); })[0] || null;
}
function rangeOf_(s) { return s ? { min: num_(s.Min_Amount, 0), mid: num_(s.Mid_Amount, 0), max: num_(s.Max_Amount, 0), id: s.Structure_ID, version: s.Version } : null; }

function payAdmin_(ctx) {
  var grades = all_('GRADES').filter(function (g) { return g.Status === 'Active'; }).sort(function (a, b) { return num_(a.Level_Order, 0) - num_(b.Level_Order, 0); });
  var roleNames = {}; all_('ROLES').forEach(function (r) { roleNames[r.Role_Code] = r.Role_Name_AR; });
  return {
    canEdit: hasAnyRole_(ctx, payEditRoles_()),
    structures: grades.map(function (g) {
      var s = structureOf_(g.Grade_Code), hist = find_('SALARY_STRUCTURES', { Grade_Code: g.Grade_Code }).length;
      return { grade: g.Grade_Code, gradeName: g.Grade_Name, jobs: find_('JOBS', { Grade_Code: g.Grade_Code }).filter(function (j) { return j.Status !== 'Inactive'; }).length,
        current: s ? { Structure_ID: s.Structure_ID, Version: s.Version, Min: s.Min_Amount, Mid: s.Mid_Amount, Max: s.Max_Amount, From: s.Effective_From, Notes: s.Notes } : null, versions: hist };
    }),
    components: find_('PAY_COMPONENTS', {}).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); }),
    authority: find_('OFFER_AUTHORITY', {}).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); })
      .map(function (r) { r.roleName = roleNames[r.Role_Code] || r.Role_Code; r.holders = roleHolders_(r.Role_Code).length; return r; }),
    roles: Object.keys(roleNames).map(function (k) { return { code: k, name: roleNames[k] }; }),
    extra: payAdminExtra_()
  };
}

function money_(v, label, req) {
  var s = latinDigits_(v).replace(/[,\s]/g, '');
  if (s === '') { if (req) throw userError_('اكتب ' + label + '.'); return ''; }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw userError_(label + ': رقم بس.');
  return String(Number(s));
}

/** p = { rows: [{ grade, min, mid, max }], from, reason } — a new version for each grade that changed. */
function structuresSave_(ctx, p) {
  var reason = requireReason_(p), from = str_(p.from) || today_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw userError_('تاريخ السريان غلط.');
  var rows = (Array.isArray(p.rows) ? p.rows : []).map(function (r) {
    var g = str_(r.grade);
    if (!get_('GRADES', g)) throw userError_('درجة غير موجودة: ' + g);
    var mn = money_(r.min, 'الحد الأدنى للدرجة ' + g), md = money_(r.mid, 'المتوسط للدرجة ' + g), mx = money_(r.max, 'الحد الأقصى للدرجة ' + g);
    if (mn === '' && md === '' && mx === '') return null;
    if (mn === '' || mx === '') throw userError_('الدرجة ' + g + ': اكتب الحد الأدنى والأقصى.');
    if (md === '') md = String(Math.round((Number(mn) + Number(mx)) / 2));
    if (!(Number(mn) <= Number(md) && Number(md) <= Number(mx))) throw userError_('الدرجة ' + g + ': لازم الأدنى ≤ المتوسط ≤ الأقصى.');
    return { grade: g, min: mn, mid: md, max: mx };
  }).filter(Boolean);
  var changed = [];
  withLock_(function () {
    rows.forEach(function (r) {
      var cur = find_('SALARY_STRUCTURES', { Grade_Code: r.grade, Status: 'Active' });
      var same = cur.length === 1 && cur[0].Min_Amount === r.min && cur[0].Mid_Amount === r.mid && cur[0].Max_Amount === r.max && cur[0].Effective_From === from;
      if (same) return;
      var ver = find_('SALARY_STRUCTURES', { Grade_Code: r.grade }).reduce(function (m, s) { return Math.max(m, num_(s.Version, 0)); }, 0) + 1;
      cur.forEach(function (s) { update_('SALARY_STRUCTURES', s.Structure_ID, { Status: 'Superseded' }, ctx.user.User_ID); });
      var n = insert_('SALARY_STRUCTURES', { Structure_ID: nextId_('SALARY_STRUCTURE'), Grade_Code: r.grade, Version: String(ver), Min_Amount: r.min,
        Mid_Amount: r.mid, Max_Amount: r.max, Effective_From: from, Status: 'Active', Notes: reason }, ctx.user.User_ID);
      changed.push(n.Structure_ID);
      audit_(ctx, { entityType: 'SALARY_STRUCTURE', entityId: n.Structure_ID, action: 'NEW_VERSION', newValue: 'G' + r.grade + ' ' + r.min + '/' + r.mid + '/' + r.max, reason: reason });
    });
  });
  return { changed: changed.length };
}

/** p = { Component_Code?, Name_AR, Name_EN, Kind, Show_On_Offer, Sort_Order, Status } */
function componentSave_(ctx, p) {
  var code = str_(p.Component_Code).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  var isNew = !get_('PAY_COMPONENTS', code);
  if (!code) throw userError_('اكتب كود البند (حروف إنجليزي).');
  if (str_(p.Name_AR).length < 2) throw userError_('اكتب اسم البند.');
  if (COMP_KINDS_.indexOf(str_(p.Kind)) < 0) throw userError_('نوع البند غير معروف.');
  if (code === 'BASIC' && str_(p.Kind) !== 'BASIC') throw userError_('الأساسي نوعه «أساسي».');
  if (code !== 'BASIC' && str_(p.Kind) === 'BASIC') throw userError_('في بند أساسي واحد بس (BASIC).');
  var f = { Component_Code: code, Name_AR: str_(p.Name_AR).slice(0, 60), Name_EN: str_(p.Name_EN).slice(0, 60), Kind: str_(p.Kind),
    Show_On_Offer: str_(p.Show_On_Offer) === 'Y' ? 'Y' : 'N', Sort_Order: String(num_(p.Sort_Order, 50)), Status: str_(p.Status) === 'Inactive' && code !== 'BASIC' ? 'Inactive' : 'Active' };
  var res;
  withLock_(function () { res = isNew ? { after: insert_('PAY_COMPONENTS', f, ctx.user.User_ID), before: null } : update_('PAY_COMPONENTS', code, f, ctx.user.User_ID); });
  if (isNew) audit_(ctx, { entityType: 'PAY_COMPONENT', entityId: code, action: 'CREATE', newValue: f.Name_AR + ' (' + f.Kind + ')' });
  else auditDiff_(ctx, 'PAY_COMPONENT', code, res.before, res.after, str_(p.reason));
  return res.after;
}

/** p = { rows: [{ Authority_ID?, Role_Code, Limit_Point, Limit_Pct, Sort_Order, Status }], reason } — replaces the matrix. */
function authoritySave_(ctx, p) {
  var reason = requireReason_(p);
  var rows = (Array.isArray(p.rows) ? p.rows : []).map(function (r, i) {
    if (!get_('ROLES', str_(r.Role_Code))) throw userError_('دور غير معروف.');
    if (AUTH_POINTS_.indexOf(str_(r.Limit_Point)) < 0) throw userError_('الحد لازم يكون: الأدنى، المتوسط، الأقصى، أو مفتوح.');
    var pct = latinDigits_(r.Limit_Pct).trim() || '0';
    if (!/^-?\d{1,3}$/.test(pct)) throw userError_('نسبة الزيادة رقم صحيح.');
    return { Authority_ID: str_(r.Authority_ID), Role_Code: str_(r.Role_Code), Limit_Point: str_(r.Limit_Point), Limit_Pct: pct,
      Sort_Order: String((i + 1) * 10), Status: str_(r.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  });
  // v0.40.0 (CHG-84): the recruiter's own authority is the grade minimum exactly
  rows.forEach(function (r) { if (r.Status === 'Active' && r.Role_Code === ROLE.RECRUITER && (r.Limit_Point !== 'MIN' || r.Limit_Pct !== '0')) throw userError_('صلاحية أخصائي التوظيف هي الحد الأدنى للدرجة بالظبط (من غير نسبة زيادة).'); });
  if (!rows.some(function (r) { return r.Status === 'Active' && r.Limit_Point === 'ANY'; })) throw userError_('لازم دور واحد على الأقل صلاحيته «مفتوح» (فوق الأقصى بمبرر).');
  var seen = {};
  rows.forEach(function (r) { if (r.Status === 'Active') { if (seen[r.Role_Code]) throw userError_('الدور متكرر في المصفوفة.'); seen[r.Role_Code] = 1; } });
  withLock_(function () {
    var keep = {};
    rows.forEach(function (r) {
      if (r.Authority_ID && get_('OFFER_AUTHORITY', r.Authority_ID)) { update_('OFFER_AUTHORITY', r.Authority_ID, r, ctx.user.User_ID); keep[r.Authority_ID] = 1; }
      else { r.Authority_ID = nextId_('OFFER_AUTH'); insert_('OFFER_AUTHORITY', r, ctx.user.User_ID); keep[r.Authority_ID] = 1; }
    });
    all_('OFFER_AUTHORITY').forEach(function (x) { if (!keep[x.Authority_ID] && x.Status !== 'Inactive') update_('OFFER_AUTHORITY', x.Authority_ID, { Status: 'Inactive' }, ctx.user.User_ID); });
  });
  audit_(ctx, { entityType: 'OFFER_AUTHORITY', entityId: 'MATRIX', action: 'UPDATE', newValue: rows.map(function (r) { return r.Role_Code + ':' + r.Limit_Point + (r.Limit_Pct !== '0' ? r.Limit_Pct + '%' : ''); }).join(' | '), reason: reason });
  return { ok: true };
}

/* ---------------- authority ---------------- */

/** Limit of one authority row against a range (Infinity for ANY, null when the grade has no structure). */
function authLimit_(row, range) {
  if (row.Limit_Point === 'ANY') return Infinity;
  if (!range) return null;
  var base = { MIN: range.min, MID: range.mid, MAX: range.max }[row.Limit_Point];
  return Math.round(base * (1 + num_(row.Limit_Pct, 0) / 100));
}

/** { role, roleName, sort, aboveMax, noRange } — the lowest sufficient authority for a package. */
function requiredAuthority_(pkg, range) {
  var rows = authRows_(), names = {};
  all_('ROLES').forEach(function (r) { names[r.Role_Code] = r.Role_Name_AR; });
  var hit = rows.filter(function (r) { var l = authLimit_(r, range); return l !== null && l >= pkg; })[0] || rows[rows.length - 1];
  if (!hit) throw userError_('مصفوفة صلاحيات العروض فاضية — كلّم مدير قطاع الموارد البشرية.');
  return { role: hit.Role_Code, roleName: names[hit.Role_Code] || hit.Role_Code, sort: num_(hit.Sort_Order, 0),
    aboveMax: !range || pkg > range.max, noRange: !range };
}

/** Users who may approve at a required level: holders of that role or any role above it. Notified: the lowest level that has people. */
function offerApprovers_(required) {
  if (num_(required.sort, 0) === NO_INS_SORT_) {
    var h = roleHolders_(ROLE.CEO).concat(roleHolders_(ROLE.BOARD));
    return { eligible: h, notify: h };
  }
  var rows = authRows_().filter(function (r) { return num_(r.Sort_Order, 0) >= required.sort; });
  var all = {}, first = [];
  rows.forEach(function (r) {
    var h = roleHolders_(r.Role_Code);
    h.forEach(function (u) { all[u] = 1; });
    if (!first.length && h.length) first = h;
  });
  return { eligible: Object.keys(all), notify: first };
}

/** Highest authority sort the user holds (−1 = none). */
function myAuthSort_(ctx) {
  var mine = roleCodes_(ctx), best = -1;
  if (mine.indexOf(ROLE.CEO) >= 0 || mine.indexOf(ROLE.BOARD) >= 0) return NO_INS_SORT_;
  authRows_().forEach(function (r) { if (mine.indexOf(r.Role_Code) >= 0) best = Math.max(best, num_(r.Sort_Order, 0)); });
  return best;
}

/* ---------------- headcount ---------------- */

/** What is left on the vacancy after joined, accepted and outstanding offers (excluding one application). */
function vacancyRoom_(v, exceptAppId) {
  var accepted = find_('APPLICATIONS', { Vacancy_ID: v.Vacancy_ID, Stage: 'ACCEPTED' }).filter(function (a) { return a.Application_ID !== exceptAppId; }).length;
  var out = find_('OFFERS', { Vacancy_ID: v.Vacancy_ID }).filter(function (o) { return OFFER_OUT_.indexOf(o.Status) >= 0 && o.Application_ID !== exceptAppId; }).length;
  var req = num_(v.Required_HC, 0), joined = num_(v.Joined_HC, 0);
  return { required: req, joined: joined, accepted: accepted, outstanding: out, left: req - joined - accepted - out };
}

/* ---------------- selection ---------------- */

function currentSelection_(appId) {
  return find_('SELECTIONS', { Application_ID: appId, Status: 'Current' })[0] || null;
}

/** p = { Application_ID, Decision, Reason, Conditions, Override_Reason, reasonCode (REJECTED) } */
function selectionSave_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, false), a = L.app, v = L.vac;
  var dec = str_(p.Decision), reason = str_(p.Reason), ovr = str_(p.Override_Reason);
  if (SEL_DECISIONS_.indexOf(dec) < 0) throw userError_('اختار القرار.');
  if (['INTERVIEW', 'OFFER'].indexOf(a.Stage) < 0) throw userError_('قرار الاختيار بيتسجل لمرشح في مرحلة المقابلات.');
  if (reason.length < 3) throw userError_('اكتب سبب القرار.');
  if (dec === 'REJECTED' && L.access !== 'FULL') throw userError_('الرفض لفريق التوظيف — سجّل «القرار متأجل» واكتب رأيك.');
  var live = find_('OFFERS', { Application_ID: a.Application_ID }).filter(function (o) { return OFFER_LIVE_.indexOf(o.Status) >= 0; });
  if (dec !== 'SELECTED' && live.length) throw userError_('في عرض شغال للمرشح — اسحبه الأول من كارت «الاختيار والعرض».');
  var X = ivIndex_(v.Vacancy_ID), R = readiness_(a, planOf_(v), X);
  if (dec === 'SELECTED') {
    if (R.code !== 'READY' && ovr.length < 5) throw userError_('المرشح لسه مش «جاهز للقرار» (جولات أو تقييمات ناقصة) — اكتب مبرر الاختيار قبل اكتمالها.');
    if (R.failed && ovr.length < 5) throw userError_('المرشح راسب في اختبار — اكتب مبرر الاستثناء.');
    var room = vacancyRoom_(v, a.Application_ID);
    var selectedOthers = find_('SELECTIONS', { Vacancy_ID: v.Vacancy_ID, Status: 'Current', Decision: 'SELECTED' }).filter(function (s) { return s.Application_ID !== a.Application_ID; }).length;
    if (selectedOthers >= room.required - room.joined && !str_(p.confirmOver)) {
      return { needConfirm: true, message: 'الشاغر مطلوب له ' + room.required + ' (اتعيّن ' + room.joined + ') واخترت قبل كده ' + selectedOthers + ' — اختيار مرشح زيادة ممكن، بس العرض هيحتاج موافقة على تجاوز العدد.' };
    }
  }
  var names = userNames_();
  var snap = { readiness: R.code, evals: R.evals, conflict: R.conflict, failed: R.failed, tests: R.tests,
    recs: R.recs.map(function (x) { return { rec: x.rec, by: names[x.by] || x.by, round: x.round }; }), at: nowIso_() };
  if (dec === 'REJECTED') {
    appMove_(ctx, { Application_ID: a.Application_ID, to: 'REJECTED', reasonCode: str_(p.reasonCode), note: reason });
  }
  var res, from = a.Stage;
  withLock_(function () {
    find_('SELECTIONS', { Application_ID: a.Application_ID, Status: 'Current' }).forEach(function (s) { update_('SELECTIONS', s.Selection_ID, { Status: 'Superseded' }, ctx.user.User_ID); });
    res = insert_('SELECTIONS', { Selection_ID: nextId_('SELECTION'), Application_ID: a.Application_ID, Vacancy_ID: v.Vacancy_ID, Decision: dec, Reason: reason.slice(0, 600),
      Conditions: str_(p.Conditions).slice(0, 400), Snapshot_JSON: JSON.stringify(snap), Override_Reason: ovr.slice(0, 400), Decided_By: ctx.user.User_ID,
      Decided_At: nowIso_(), Status: 'Current' }, ctx.user.User_ID);
    var cur = findOne_('APPLICATIONS', { Application_ID: a.Application_ID });
    var to = dec === 'SELECTED' ? 'OFFER' : (cur.Stage === 'OFFER' ? 'INTERVIEW' : cur.Stage);
    if (to !== cur.Stage) {
      update_('APPLICATIONS', a.Application_ID, { Stage: to, Stage_At: nowIso_() }, ctx.user.User_ID);
      activity_(ctx.user.User_ID, cur, 'STAGE', { Stage_From: cur.Stage, Stage_To: to, Note: 'قرار الاختيار: ' + SEL_AR_[dec] });
    } else activity_(ctx.user.User_ID, cur, 'NOTE', { Note: 'قرار الاختيار: ' + SEL_AR_[dec] + ' — ' + reason });
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: 'SELECTION', oldValue: from, newValue: dec, reason: reason + (ovr ? ' | استثناء: ' + ovr : '') });
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {}, t = vacTitle_(v);
  var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: v.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; }).concat([a.Owner_User_ID, v.Lead_Recruiter_ID]);
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID });
  if (req) team.push(req.Requester_User_ID);
  notify_(team.filter(function (u) { return u && u !== ctx.user.User_ID; }), 'قرار اختيار: ' + SEL_AR_[dec] + ' — ' + t.ar, per.Full_Name + ' · ' + reason, 'APPLICATION', a.Application_ID, false);
  return { selection: res };
}

/* ---------------- reference checks ---------------- */

/** p = { Application_ID, Reference_ID?, Referee_Name, Referee_Company, Referee_Title, Referee_Mobile, Relationship, Consent, Result, Notes } */
function referenceSave_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  var f = { Referee_Name: str_(p.Referee_Name).slice(0, 80), Referee_Company: str_(p.Referee_Company).slice(0, 80), Referee_Title: str_(p.Referee_Title).slice(0, 80),
    Referee_Mobile: str_(p.Referee_Mobile).slice(0, 20), Relationship: str_(p.Relationship).slice(0, 60), Notes: str_(p.Notes).slice(0, 1000),
    Result: ['', 'POSITIVE', 'MIXED', 'NEGATIVE', 'NO_RESPONSE'].indexOf(str_(p.Result)) >= 0 ? str_(p.Result) : '' };
  if (f.Referee_Name.length < 3) throw userError_('اكتب اسم المرجع.');
  if (str_(p.Consent) !== 'Y') throw userError_('لازم موافقة المرشح على التواصل مع المرجع.');
  if (f.Result && f.Result !== 'NO_RESPONSE' && f.Notes.length < 5) throw userError_('اكتب اللي قاله المرجع.');
  var id = str_(p.Reference_ID), res;
  withLock_(function () {
    if (id) {
      var cur = findOne_('REFERENCE_CHECKS', { Reference_ID: id });
      if (!cur || cur.Application_ID !== a.Application_ID) throw userError_('المرجع غير موجود.');
      if (f.Result && !cur.Result) { f.Checked_By = ctx.user.User_ID; f.Checked_At = nowIso_(); }
      res = update_('REFERENCE_CHECKS', id, f, ctx.user.User_ID).after;
    } else {
      f.Reference_ID = nextId_('REFERENCE'); f.Application_ID = a.Application_ID; f.Person_ID = a.Person_ID; f.Consent = 'Y'; f.Status = 'Active';
      if (f.Result) { f.Checked_By = ctx.user.User_ID; f.Checked_At = nowIso_(); }
      res = insert_('REFERENCE_CHECKS', f, ctx.user.User_ID);
    }
    if (f.Result) activity_(ctx.user.User_ID, a, 'CALL', { Outcome: f.Result === 'NO_RESPONSE' ? 'NO_ANSWER' : 'REACHED', Note: 'مرجع (' + f.Referee_Name + '): ' + ({ POSITIVE: 'إيجابي', MIXED: 'متوسط', NEGATIVE: 'سلبي', NO_RESPONSE: 'مارد' }[f.Result]) + (f.Notes ? ' — ' + f.Notes : '') });
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: 'REFERENCE', newValue: f.Referee_Name + ' ' + f.Result });
  return res;
}

/* ---------------- offers: build & validate ---------------- */

function offerGet_(id) {
  var o = findOne_('OFFERS', { Offer_ID: str_(id) });
  if (!o) throw userError_('العرض غير موجود.');
  return o;
}
function offerAccess_(ctx, o) {
  var v = findOne_('VACANCIES', { Vacancy_ID: o.Vacancy_ID }), acc = vacancyAccess_(ctx, v);
  var approver = (o.Status === 'PENDING_APPROVAL' && offerApprovers_({ sort: num_(o.Required_Sort, 0) }).eligible.indexOf(ctx.user.User_ID) >= 0) ||
    (o.Status === 'APPROVED' && netReviewNeeded_(o) && netReviewer_(ctx));          // v0.40.0: the payroll reviewer sees the offer to check the net
  if (acc !== 'FULL' && !approver) throw userError_('مالكش صلاحية على العرض ده.');
  return { v: v, full: acc === 'FULL', approver: approver };
}

function vacancyGrade_(v) {
  var j = findOne_('JOBS', { Job_Code: v.Job_Code }) || {};
  return str_(j.Grade_Code);
}

/** Package inputs kept on an offer, for editing and new versions. */
var OFFER_INPUTS_ = ['Contract_Basis', 'Agreed_Amount', 'Other_Allowance', 'Representation', 'Job_Nature_Rate_ID', 'Job_Nature_Amount', 'extra', 'No_Insurance'];
/** A contract without social insurance needs the CEO, the Chairman or the Vice Chairman (owner decision, 2026-10-05). */
var NO_INS_SORT_ = 9999;
function noInsAuthority_() { return { role: 'CEO_BOARD', roleName: 'الرئيس التنفيذي أو رئيس / نائب مجلس الإدارة', sort: NO_INS_SORT_, aboveMax: false, noRange: false, special: true }; }

/* v0.50.0 (CHG-107): the working hours and the weekly rest agreed with the employee — on the offer, printed in the contract and the
   salary details. An offer saved before has the settings' defaults. */
var WEEKLY_RESTS_ = { FRI: 'الجمعة', SAT: 'السبت', FRI_SAT: 'الجمعة والسبت', ROSTER: 'يوم في الأسبوع حسب جدول الورديات' };
function workTermsOf_(o) {
  var h = num_(o && o.Work_Hours, 0) || num_(cfg_('WORK_HOURS_DEFAULT', 8), 8), r = str_(o && o.Weekly_Rest) || str_(cfg_('WEEKLY_REST_DEFAULT', 'FRI'));
  if (!WEEKLY_RESTS_[r]) r = 'FRI';
  return { hours: h, rest: r, restName: WEEKLY_RESTS_[r] };
}
function noInsBases_() { var a = []; try { a = JSON.parse(str_(cfg_('NO_INS_BASES', '[]')) || '[]'); } catch (e) { a = []; } return Array.isArray(a) ? a.map(str_).filter(String) : []; }

/** v0.38.0 (CHG-80): the signed «no-insurance acknowledgement», printed from the portal, uploaded back. p = { Offer_ID, files: [{name, mime, data}] } */
function offerNoInsUpload_(ctx, p) {
  var o = offerGet_(p.Offer_ID);
  loadApp_(ctx, o.Application_ID, true);
  if (ctx.readOnly) throw userError_('مالكش صلاحية.');
  if (o.No_Insurance !== 'Y') throw userError_('العرض ده بتأمينات — مفيش إقرار.');
  // v0.46.2 (CHG-100): the signed copy lives on the joining documents (it is one of them), so it is there after acceptance
  var j = o.Status === 'ACCEPTED' ? joiningOf_(o.Application_ID) : null, d = j && j.Status !== 'DID_NOT_JOIN' ? noInsAckDoc_(j.Joining_ID) : null;
  if (!d) throw userError_('الإقرار الموقّع بيترفع في مسوغات التعيين بعد ما المرشح يقبل العرض.');
  var f = (p.files || [])[0];
  if (!f) throw userError_('ارفع الإقرار الموقّع (PDF أو صورة).');
  docStore_(d, f, ctx.user.User_ID);
  audit_(ctx, { entityType: 'OFFER', entityId: o.Offer_ID, action: 'NO_INS_FORM', newValue: str_(f.name).slice(0, 80) });
  return { ok: true };
}

/** The «no-insurance acknowledgement» to print, sign and upload back (lawyer to confirm the wording). */
function offerNoInsForm_(ctx, p) {
  var o = offerGet_(p.Offer_ID), L = loadApp_(ctx, o.Application_ID, true);
  if (o.No_Insurance !== 'Y') throw userError_('العرض ده بتأمينات — مفيش إقرار.');
  var per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {}, ent = entityOfVacancy_(L.vac) || {};
  var e = escHtml_;
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:2;max-width:760px;margin:auto">' +
    '<h3 style="text-align:center">إقرار بالتعاقد من غير تأمينات اجتماعية</h3>' +
    '<p>أقر أنا / <b>' + e(per.Full_Name) + '</b>' + (per.National_ID ? ' — الرقم القومي <b dir="ltr">' + e(per.National_ID) + '</b>' : ' — الرقم القومي: ____________') +
    '، المرشح لوظيفة <b>' + e(vacTitle_(L.vac).ar) + '</b> لدى <b>' + e(ent.Name_AR || 'الشركة') + '</b>، بأنني اطلعت على أن التعاقد معي سيكون من غير اشتراك في التأمينات الاجتماعية، ' +
    'وذلك استناداً إلى: <b>' + e(o.No_Ins_Basis || '________________') + '</b>، وأن هذا تم بموافقتي بعد شرح أثره على حقوقي.</p>' +
    '<p>وأتعهد بإخطار الشركة فوراً بأي تغيير في هذا السند.</p>' +
    '<table style="width:100%;margin-top:40px"><tr><td>توقيع المقر: ____________</td><td>التاريخ: ____________</td></tr>' +
    '<tr><td style="padding-top:28px">عن الشركة (الموارد البشرية): ____________</td><td style="padding-top:28px">العرض: ' + e(o.Offer_No) + '</td></tr></table></div>';
  return { subject: 'إقرار عدم التأمين — ' + per.Full_Name, html: html };
}

/** Calculate the whole offer (package, deductions, range, authority) from its inputs. */
function offerCalc_(p, v) {
  var K = packageOf_(v, p), grade = K.profile.grade, range = rangeOf_(structureOf_(grade));
  var req = requiredAuthority_(K.full, range);
  if (K.noIns) { var sp = noInsAuthority_(); sp.aboveMax = req.aboveMax; sp.noRange = req.noRange; req = sp; }
  return { K: K, grade: grade, range: range, req: req };
}

/** p = offer inputs + Application_ID — live preview for the offer editor (nothing is saved). */
function offerPreview_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), C = offerCalc_(p, L.vac), K = C.K;
  var names = {}; find_('PAY_COMPONENTS', {}).forEach(function (c) { names[c.Component_Code] = c.Name_AR; });
  return { basis: K.basis, amount: K.amount, full: K.full, basic: K.basic, allowances: K.allowances, netAllowance: K.netAllowance, pay: K.pay, noTable: K.noTable,
    comps: K.comps.map(function (c) { return { c: c.c, a: c.a, n: c.n, name: names[c.c] || c.c }; }), range: C.range,
    required: C.req, mine: myAuthSort_(ctx) >= C.req.sort, room: vacancyRoom_(L.vac, L.app.Application_ID) };
}

function canIncentive_(ctx) { return hasAnyRole_(ctx, payEditRoles_()); }

/** p = { Application_ID, Offer_ID?, Contract_Basis, Agreed_Amount, Other_Allowance, Representation, Job_Nature_Rate_ID, Job_Nature_Amount, extra,
 *        Joining_Date, Valid_Until, Terms, Variable_Note, Justification, Incentive_Amount, Incentive_Terms } */
function offerSave_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, v = L.vac, me = ctx.user.User_ID;
  if (a.Stage !== 'OFFER') throw userError_('العرض بيتعمل لمرشح «مختار» — سجّل قرار الاختيار الأول.');
  var mine = find_('OFFERS', { Application_ID: a.Application_ID });
  var edit = str_(p.Offer_ID) ? offerGet_(p.Offer_ID) : null;
  if (edit && edit.Application_ID !== a.Application_ID) throw userError_('العرض غير موجود.');
  if (edit && ['DRAFT', 'RETURNED'].indexOf(edit.Status) < 0) throw userError_('العرض ده مش مسودة — للتعديل اعمل نسخة جديدة («تفاوض»).');
  if (!edit && mine.some(function (o) { return OFFER_LIVE_.indexOf(o.Status) >= 0; })) throw userError_('في عرض شغال للمرشح بالفعل.');
  if (edit) {
    var prevIn = {}; try { prevIn = JSON.parse(edit.Calc_JSON || '{}').inputs || {}; } catch (e) {}
    OFFER_INPUTS_.forEach(function (k) { if (p[k] === undefined) p[k] = prevIn[k]; });
    ['Joining_Date', 'Valid_Until', 'Terms', 'Variable_Note', 'Justification', 'Incentive_Amount', 'Incentive_Terms'].forEach(function (k) { if (p[k] === undefined) p[k] = edit[k]; });
  }
  var C = offerCalc_(p, v), K = C.K;
  // the incentive is the HR Sector Manager's decision only (a separate sheet, never in the offer letter)
  var inc = money_(p.Incentive_Amount, 'الحافز', false), incT = str_(p.Incentive_Terms).slice(0, 1500);
  var prevInc = edit ? str_(edit.Incentive_Amount) : '', prevIncT = edit ? str_(edit.Incentive_Terms) : '';
  if ((inc !== prevInc || incT !== prevIncT) && !canIncentive_(ctx)) throw userError_('الحافز بقرار مدير قطاع الموارد البشرية بس.');
  if (inc && incT.length < 5) throw userError_('اكتب شروط الحافز.');
  var valid = str_(p.Valid_Until) || addDaysYmd_(today_(), cfg_('OFFER_VALID_DAYS', 7));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valid) || valid < today_()) throw userError_('تاريخ صلاحية العرض لازم يكون النهارده أو بعده.');
  var join = str_(p.Joining_Date);
  if (join && !/^\d{4}-\d{2}-\d{2}$/.test(join)) throw userError_('تاريخ الاستلام غلط.');
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
  // v0.38.0 (CHG-80): a contract without social insurance names its legal basis
  var noInsBasis = K.noIns ? str_(p.No_Ins_Basis !== undefined ? p.No_Ins_Basis : edit ? edit.No_Ins_Basis : '') : '';
  if (K.noIns && noInsBases_().indexOf(noInsBasis) < 0) throw userError_('اختار السند القانوني للعقد من غير تأمينات.');
  var wt = workTermsOf_(edit), wh = p.Work_Hours !== undefined && str_(p.Work_Hours) !== '' ? num_(p.Work_Hours, NaN) : wt.hours, wr = p.Weekly_Rest !== undefined && str_(p.Weekly_Rest) ? str_(p.Weekly_Rest) : wt.rest;
  if (!(wh >= 1 && wh <= 12) || (wh * 2) % 1) throw userError_('ساعات العمل اليومية من 1 لـ 12 (ممكن نص ساعة).');
  if (!WEEKLY_RESTS_[wr]) throw userError_('اختار الراحة الأسبوعية.');
  var inputs = {}; OFFER_INPUTS_.forEach(function (k) { if (p[k] !== undefined && p[k] !== null) inputs[k] = p[k]; });
  var f = { Grade_Code: C.grade, Structure_ID: C.range ? C.range.id : '', Range_JSON: C.range ? JSON.stringify(C.range) : '', Components_JSON: JSON.stringify(K.comps),
    Basic: String(K.basic), Fixed_Package: String(K.full), Variable_Note: str_(p.Variable_Note).slice(0, 300), Joining_Date: join, Valid_Until: valid,
    Terms: str_(p.Terms).slice(0, 1000), Justification: str_(p.Justification).slice(0, 600), Required_Role: C.req.role, Required_Sort: String(C.req.sort),
    Current_Salary: str_(per.Current_Salary), Expected_Salary: str_(per.Expected_Salary),
    Contract_Basis: K.basis, Agreed_Amount: String(K.amount), Location_ID: v.Location_ID, Job_Nature_Rate_ID: K.rateId,
    Contrib_Wage: String(K.pay.contrib), Comprehensive_Wage: String(K.pay.comprehensive), Emp_Insurance: String(K.pay.insurance), Income_Tax: String(K.pay.tax),
    Net_Salary: String(K.pay.net), Company_Martyr: String(K.pay.martyr), No_Insurance: K.noIns ? 'Y' : '', No_Ins_Basis: noInsBasis, Incentive_Amount: inc, Incentive_Terms: inc ? incT : '',
    Work_Hours: String(wh), Weekly_Rest: wr,
    Calc_JSON: JSON.stringify({ inputs: inputs, zone: K.profile.zone, collar: K.profile.collar, rules: payRules_(), at: nowIso_() }) };
  var res;
  withLock_(function () {
    if (edit) res = update_('OFFERS', edit.Offer_ID, f, me).after;
    else {
      f.Offer_ID = nextId_('OFFER'); f.Offer_No = f.Offer_ID; f.Version = '1'; f.Application_ID = a.Application_ID; f.Vacancy_ID = v.Vacancy_ID; f.Person_ID = a.Person_ID;
      f.Status = 'DRAFT'; f.Initial_Proposed = f.Fixed_Package;
      res = insert_('OFFERS', f, me);
    }
  });
  event_(ctx, 'OFFER', res.Offer_ID, edit ? 'EDITED' : 'CREATED', '');
  return { offer: offerView_(ctx, res, true) };
}

/* ---------------- v0.40.0 (CHG-84): the payroll reviewer confirms the estimated net ---------------- */

/** PAYROLL_REVIEW_USERS: e-mails or user IDs (comma separated); empty = the HR managers. */
function netReviewers_() {
  if (!str_(cfg_('PAYROLL_REVIEW_USERS', '')).trim()) return roleUserIds_(HR_ADMIN_ROLES);
  return cfgUsers_('PAYROLL_REVIEW_USERS');
}
function netReviewer_(ctx) { return netReviewers_().indexOf(ctx.user.User_ID) >= 0; }
function netReviewNeeded_(o) { return cfg_('NET_REVIEW_REQUIRED', true) && num_(o.Net_Salary, 0) > 0 && !o.Net_Reviewed_At; }

/* ---------------- offers: actions ---------------- */

/**
 * p = { Offer_ID, action, note, via, reason, Valid_Until, hcOverride, files }
 *   SUBMIT · APPROVE · RETURN · PRESENT · ACCEPT · DECLINE · NEGOTIATE · WITHDRAW · EXTEND
 *   v0.40.0 (CHG-84): NET_REVIEW — the payroll reviewer confirms the estimated net before the offer is presented.
 */
function offerAction_(ctx, p) {
  var o = offerGet_(p.Offer_ID), A = offerAccess_(ctx, o), v = A.v, me = ctx.user.User_ID;
  var a = findOne_('APPLICATIONS', { Application_ID: o.Application_ID }), per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {};
  var act = str_(p.action), note = str_(p.note), patch = {}, ev = act, out = {}, t = vacTitle_(v);
  var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: v.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; }).concat([a.Owner_User_ID, v.Lead_Recruiter_ID, o.Created_By]);
  function need(sts) { if (sts.indexOf(o.Status) < 0) throw userError_('العملية دي مش متاحة والعرض «' + OFFER_ST_AR_[o.Status] + '».'); }
  function teamOnly() { if (!A.full) throw userError_('العملية دي لفريق التوظيف.'); }
  var line = per.Full_Name + ' — ' + t.ar + ' (' + o.Offer_No + ' v' + o.Version + ')';
  switch (act) {
    case 'SUBMIT':
      teamOnly(); need(['DRAFT', 'RETURNED']);
      var pkg = num_(o.Fixed_Package, 0);
      var req = requiredAuthority_(pkg, rangeOf_(structureOf_(o.Grade_Code)));          // re-check against today's structure
      if (o.No_Insurance === 'Y') { var sp2 = noInsAuthority_(); sp2.aboveMax = req.aboveMax; sp2.noRange = req.noRange; req = sp2; }
      if (req.aboveMax && str_(o.Justification).length < 10) throw userError_(req.noRange ? 'الدرجة مالهاش هيكل رواتب — اكتب مبرر المرتب (10 حروف على الأقل).' : 'المرتب فوق الحد الأقصى للدرجة — اكتب مبرر الاستثناء.');
      var room = vacancyRoom_(v, o.Application_ID);
      if (room.left <= 0) {
        if (!hasAnyRole_(ctx, hcOverrideRoles_())) throw userError_('الشاغر مافيهوش عدد متاح (اتعيّن ' + room.joined + '، قبلوا ' + room.accepted + '، عروض شغالة ' + room.outstanding + ' من ' + room.required + ') — محتاج موافقة مدير توظيف أو HR على التجاوز.');
        if (str_(p.hcOverride).length < 5) return { needOverride: true, room: room };
        patch.HC_Override = str_(p.hcOverride).slice(0, 300) + ' — ' + ctx.user.Full_Name_AR;
      }
      patch.Required_Role = req.role; patch.Required_Sort = String(req.sort); patch.Submitted_At = nowIso_(); patch.Returned_Note = '';
      if (myAuthSort_(ctx) >= req.sort) {
        patch.Status = 'APPROVED'; patch.Approver_ID = me; patch.Approved_At = nowIso_(); patch.Approved_Package = o.Fixed_Package; patch.Approval_Note = 'ضمن صلاحية اللي عمل العرض';
        ev = 'SELF_APPROVED';
      } else {
        patch.Status = 'PENDING_APPROVAL';
        var ap = offerApprovers_(req);
        if (!ap.notify.length) throw userError_('مفيش حد على البوابة عنده صلاحية «' + req.roleName + '» — كلّم مدير قطاع الموارد البشرية.');
        out.notify = ap.notify;
      }
      break;
    case 'APPROVE':
      need(['PENDING_APPROVAL']);
      if (!A.approver) throw userError_('العرض ده محتاج صلاحية أعلى من صلاحيتك.');
      if (o.Created_By === me && myAuthSort_(ctx) < num_(o.Required_Sort, 0)) throw userError_('مالكش صلاحية على العرض ده.');
      noRelationCheck_(ctx, p, 'OFFER ' + o.Offer_ID, o.Application_ID);              // v0.38.0 (CHG-81)
      patch = { Status: 'APPROVED', Approver_ID: me, Approved_At: nowIso_(), Approved_Package: o.Fixed_Package, Approval_Note: note.slice(0, 300) };
      break;
    case 'RETURN':
      need(['PENDING_APPROVAL']);
      if (!A.approver) throw userError_('مالكش صلاحية على العرض ده.');
      if (note.length < 5) throw userError_('اكتب المطلوب تعديله.');
      patch = { Status: 'RETURNED', Returned_Note: note.slice(0, 600) + ' — ' + ctx.user.Full_Name_AR };
      break;
    case 'NET_REVIEW':
      need(['APPROVED']);
      if (!netReviewer_(ctx)) throw userError_('مراجعة الصافي لمراجع المرتبات.');
      if (o.Created_By === me) throw userError_('إنت اللي عملت العرض — مراجعة الصافي لحد تاني.');
      if (o.Net_Reviewed_At) throw userError_('الصافي اتراجع بالفعل.');
      patch = { Net_Reviewed_By: me, Net_Reviewed_At: nowIso_(), Net_Review_Note: note.slice(0, 300) };
      break;
    case 'PRESENT':
      teamOnly(); need(['APPROVED']);
      var via = str_(p.via);
      if (OFFER_VIA_.indexOf(via) < 0) throw userError_('اختار إزاي اتقدم العرض.');
      if (netReviewNeeded_(o)) throw userError_('الصافي في العرض تقديري — لازم مراجع المرتبات يراجعه قبل تقديم العرض.');
      if (via === 'WHATSAPP') {
        var mob = str_(ctx.user.Mobile).replace(/\D/g, '');
        if (mob.length < 10) throw userError_('العرض بالواتساب يتبعت من موبايلك المسجّل على البوابة — سجّل رقمك في ملفك الأول.');
        patch.Presented_Mobile = mob;
      }
      if (o.Valid_Until < today_()) throw userError_('صلاحية العرض خلصت — مدّها الأول.');
      if (via === 'EMAIL') {
        if (!per.Email) throw userError_('المرشح مالوش إيميل.');
        if (!mailOk_('CANDIDATE')) throw userError_('حد الإيميلات النهارده خلص — قدّم العرض مطبوع أو واتساب.');
        var L2 = offerLetter_(o, v, per, per.Language === 'en' ? 'en' : 'ar');
        sendMail_({ to: per.Email, subject: L2.subject, name: L2.lang === 'en' ? 'Kandil Egypt Careers' : 'قنديل مصر — التوظيف', htmlBody: L2.html });
        mailSent_();
      }
      patch.Status = 'PRESENTED'; patch.Presented_At = nowIso_(); patch.Presented_Via = via;
      break;
    case 'ACCEPT':
      teamOnly(); need(['PRESENTED']);
      if (note.length < 3) throw userError_('اكتب إزاي المرشح أكّد القبول (مثال: وقّع على النسخة المطبوعة / رد على الإيميل).');
      patch = { Status: 'ACCEPTED', Responded_At: nowIso_(), Final_Accepted: o.Fixed_Package, Response_Note: note.slice(0, 400) };
      var files = evidenceCheck_(p.files);
      if (files.length) patch.Evidence_JSON = JSON.stringify(offerEvidenceSave_(o.Offer_ID, files));
      if (str_(p.Joining_Date)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(str_(p.Joining_Date))) throw userError_('تاريخ الاستلام غلط.');
        patch.Joining_Date = str_(p.Joining_Date);
      }
      break;
    case 'DECLINE':
      teamOnly(); need(['PRESENTED', 'APPROVED']);
      if (OFFER_DECLINE_.indexOf(str_(p.reason)) < 0) throw userError_('اختار سبب رفض المرشح للعرض.');
      if (str_(p.reason) === 'OTHER' && note.length < 3) throw userError_('اكتب السبب.');
      patch = { Status: 'DECLINED', Responded_At: nowIso_(), Decline_Reason: str_(p.reason), Decline_Note: note.slice(0, 400) };
      break;
    case 'NEGOTIATE':
      teamOnly(); need(['PRESENTED', 'APPROVED']);
      if (note.length < 3) throw userError_('اكتب طلب المرشح (مثال: طالب 9000 بدل 8000).');
      patch = { Status: 'SUPERSEDED', Response_Note: 'تفاوض: ' + note.slice(0, 400) };
      break;
    case 'WITHDRAW':
      teamOnly(); need(OFFER_LIVE_);
      if (note.length < 5) throw userError_('اكتب سبب سحب العرض.');
      patch = { Status: 'WITHDRAWN', Response_Note: note.slice(0, 400) };
      break;
    case 'EXTEND':
      need(['APPROVED', 'PRESENTED', 'EXPIRED']);
      if (!hasAnyRole_(ctx, offerExtendRoles_())) throw userError_('مد صلاحية العرض لمديري التوظيف و HR.');
      var nv = str_(p.Valid_Until);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nv) || nv < today_()) throw userError_('اختار تاريخ صلاحية جديد (النهارده أو بعده).');
      if (note.length < 5) throw userError_('اكتب سبب مد الصلاحية.');
      if (o.Status === 'EXPIRED' && a.Stage !== 'OFFER') throw userError_('المرشح مش في مرحلة العرض.');
      patch = { Valid_Until: nv, Extended_Note: (o.Extended_Note ? o.Extended_Note + ' | ' : '') + o.Valid_Until + ' ← ' + nv + ': ' + note.slice(0, 200) + ' — ' + ctx.user.Full_Name_AR };
      if (o.Status === 'EXPIRED') patch.Status = o.Presented_At ? 'PRESENTED' : 'APPROVED';
      break;
    default: throw userError_('إجراء غير معروف.');
  }
  var res, nv2 = null;
  withLock_(function () {
    var cur = findOne_('OFFERS', { Offer_ID: o.Offer_ID });
    if (cur.Status !== o.Status) throw userError_('العرض اتغيّر من حد تاني — افتحه من جديد.');
    res = update_('OFFERS', o.Offer_ID, patch, me);
    var app = findOne_('APPLICATIONS', { Application_ID: o.Application_ID });
    if (act === 'NEGOTIATE') {
      var copy = {}; SCHEMA.OFFERS.cols.forEach(function (k) { copy[k] = o[k]; });
      ['Approver_ID', 'Approved_At', 'Approval_Note', 'Returned_Note', 'Presented_At', 'Presented_Via', 'Responded_At', 'Decline_Reason', 'Decline_Note',
       'Evidence_JSON', 'HC_Override', 'Submitted_At', 'Superseded_By', 'Response_Note', 'Extended_Note', 'Approved_Package', 'Final_Accepted',
       'Net_Reviewed_By', 'Net_Reviewed_At', 'Net_Review_Note', 'Presented_Mobile'].forEach(function (k) { copy[k] = ''; });
      copy.Offer_ID = nextId_('OFFER'); copy.Version = String(num_(o.Version, 1) + 1); copy.Status = 'DRAFT'; copy.Valid_Until = addDaysYmd_(today_(), cfg_('OFFER_VALID_DAYS', 7));
      copy.Approved_Package = '';
      nv2 = insert_('OFFERS', copy, me);
      update_('OFFERS', o.Offer_ID, { Superseded_By: nv2.Offer_ID }, me);
      activity_(me, app, 'NOTE', { Note: 'تفاوض على العرض ' + o.Offer_No + ': ' + note + ' — اتعملت نسخة ' + copy.Version });
    }
    if (act === 'ACCEPT') {
      update_('APPLICATIONS', app.Application_ID, { Stage: 'ACCEPTED', Stage_At: nowIso_() }, me);
      activity_(me, app, 'STAGE', { Stage_From: app.Stage, Stage_To: 'ACCEPTED', Note: 'قبل العرض ' + o.Offer_No + ' v' + o.Version + ' — ' + note });
      if (!app.Source_Locked_At) update_('APPLICATIONS', app.Application_ID, { Source_Locked_At: lockAttribution_(me, app) }, me);
      joiningCreate_(me, app, res.after);   // v0.14.0: joining date + hiring documents checklist
    }
    if (act === 'DECLINE') {
      activity_(me, app, 'NOTE', { Note: 'المرشح رفض العرض ' + o.Offer_No + ': ' + OFFER_DECLINE_AR_[p.reason] + (note ? ' — ' + note : '') });
    }
    if (act === 'PRESENT') activity_(me, app, via === 'EMAIL' ? 'EMAIL' : via === 'WHATSAPP' ? 'WHATSAPP' : 'MEETING', { Template_Code: 'OFFER_LETTER', Note: 'اتقدم العرض ' + o.Offer_No + ' v' + o.Version + ' (' + offerViaAr_(via) + ')' });
  });
  event_(ctx, 'OFFER', o.Offer_ID, ev, note || str_(p.reason));
  audit_(ctx, { entityType: 'OFFER', entityId: o.Offer_ID, action: ev, oldValue: o.Status, newValue: res.after.Status, reason: note || str_(p.reason) });
  // who hears about it
  var mineTeam = team.filter(function (u) { return u && u !== me; });
  if (out.notify) notify_(out.notify.filter(function (u) { return u !== me; }), 'عرض وظيفي مستني موافقتك', line + ' · ' + money0_(o.Fixed_Package) + ' ج.م', 'OFFER', o.Offer_ID, true);
  if (act === 'APPROVE' || ev === 'SELF_APPROVED') {
    if (netReviewNeeded_(res.after)) notify_(netReviewers_().filter(function (u) { return u !== o.Created_By; }), 'عرض محتاج مراجعة الصافي', line + ' · صافي تقديري ' + money0_(o.Net_Salary) + ' ج.م', 'OFFER', o.Offer_ID, false);
    if (act === 'APPROVE') notify_(mineTeam, netReviewNeeded_(res.after) ? 'العرض اتعتمد — مستني مراجعة الصافي من المرتبات' : 'العرض اتعتمد — قدّمه للمرشح', line, 'OFFER', o.Offer_ID, false);
  }
  if (act === 'NET_REVIEW') notify_(mineTeam, 'الصافي اتراجع — قدّم العرض للمرشح', line, 'OFFER', o.Offer_ID, false);
  if (act === 'RETURN') notify_(mineTeam, 'العرض راجع للتعديل', line + ' · ' + note, 'OFFER', o.Offer_ID, false);
  if (act === 'ACCEPT') {
    var req2 = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID });
    notify_(mineTeam.concat(req2 ? [req2.Requester_User_ID] : []).concat(v.Position_ID ? managerUsersOf_(v.Position_ID) : []).filter(function (u) { return u !== me; }), 'المرشح قبل العرض — ' + t.ar, per.Full_Name + (patch.Joining_Date || o.Joining_Date ? ' · الاستلام المتوقع ' + (patch.Joining_Date || o.Joining_Date) : ''), 'APPLICATION', o.Application_ID, true);
  }
  if (act === 'DECLINE') {
    var reserve = find_('SELECTIONS', { Vacancy_ID: v.Vacancy_ID, Status: 'Current', Decision: 'RESERVE' }).length;
    notify_(mineTeam, 'المرشح رفض العرض — ' + t.ar, per.Full_Name + ' · ' + OFFER_DECLINE_AR_[p.reason] + (reserve ? ' · عندك ' + reserve + ' مرشح احتياطي على الشاغر' : ''), 'APPLICATION', o.Application_ID, false);
    out.reserve = reserve;
  }
  out.offer = offerView_(ctx, res.after, A.full);
  if (nv2) out.newOffer = offerView_(ctx, nv2, true);
  return out;
}

function offerViaAr_(v) { return { EMAIL: 'إيميل', PRINT: 'مطبوع', WHATSAPP: 'واتساب', IN_PERSON: 'مقابلة شخصية' }[v] || v; }
function money0_(x) { var n = Math.round(num_(x, 0)); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function offerEvidenceSave_(offerId, checked) {
  var props = PropertiesService.getScriptProperties(), fid = props.getProperty('OFFER_FOLDER_ID'), folder = null;
  if (fid) { try { folder = DriveApp.getFolderById(fid); } catch (e) { folder = null; } }
  if (!folder) { folder = getOrCreateFolder_().createFolder('Offers — العروض الموقعة'); props.setProperty('OFFER_FOLDER_ID', folder.getId()); }
  return checked.map(function (c) {
    var file = folder.createFile(Utilities.newBlob(c.bytes, c.mime, offerId + ' — ' + c.name.replace(/[\\\/:*?"<>|]/g, '_')));
    return { id: file.getId(), name: c.name, mime: c.mime };
  });
}

/** p = { Offer_ID, File_ID } — the signed copy, for the recruitment team. */
function offerFile_(ctx, p) {
  var o = offerGet_(p.Offer_ID), A = offerAccess_(ctx, o);
  if (!A.full) throw userError_('مالكش صلاحية.');
  var meta = null; try { (JSON.parse(o.Evidence_JSON || '[]') || []).forEach(function (f) { if (f.id === str_(p.File_ID)) meta = f; }); } catch (e) {}
  if (!meta) throw userError_('الملف غير موجود.');
  var blob = DriveApp.getFileById(meta.id).getBlob();
  audit_(ctx, { entityType: 'OFFER', entityId: o.Offer_ID, action: 'FILE_VIEW', newValue: meta.name });
  return { name: meta.name, mime: meta.mime || blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- views ---------------- */

function offerView_(ctx, o, full) {
  var names = userNames_(), comps = {}; payComponents_().concat(find_('PAY_COMPONENTS', { Status: 'Inactive' })).forEach(function (c) { comps[c.Component_Code] = c; });
  var x = { Offer_ID: o.Offer_ID, Offer_No: o.Offer_No, Version: o.Version, Status: o.Status, statusName: OFFER_ST_AR_[o.Status], Application_ID: o.Application_ID,
    Vacancy_ID: o.Vacancy_ID, Valid_Until: o.Valid_Until, Joining_Date: o.Joining_Date, Presented_At: o.Presented_At, Presented_Via: o.Presented_Via, Responded_At: o.Responded_At,
    Decline_Reason: o.Decline_Reason, Decline_Note: o.Decline_Note, Response_Note: o.Response_Note, Returned_Note: o.Returned_Note, Superseded_By: o.Superseded_By,
    createdBy: names[o.Created_By] || '', Created_At: o.Created_At, approverName: names[o.Approver_ID] || '', Approved_At: o.Approved_At, Approval_Note: o.Approval_Note,
    Required_Role: o.Required_Role, expired: OFFER_OUT_.indexOf(o.Status) >= 0 && o.Valid_Until < today_(),
    netNeeded: netReviewNeeded_(o), netReviewedBy: names[o.Net_Reviewed_By] || '', Net_Reviewed_At: o.Net_Reviewed_At, Net_Review_Note: o.Net_Review_Note,
    canNetReview: o.Status === 'APPROVED' && netReviewNeeded_(o) && o.Created_By !== ctx.user.User_ID && netReviewer_(ctx), Presented_Mobile: o.Presented_Mobile };
  if (!full) return x;
  var cl = []; try { cl = JSON.parse(o.Components_JSON || '[]'); } catch (e) {}
  x.components = cl.map(function (c) { var m = comps[c.c] || {}; return { c: c.c, a: c.a, n: c.n, name: m.Name_AR || c.c, kind: m.Kind || '', show: m.Show_On_Offer === 'Y' }; });
  ['Grade_Code', 'Basic', 'Fixed_Package', 'Variable_Note', 'Terms', 'Justification', 'Current_Salary', 'Expected_Salary', 'Initial_Proposed', 'Approved_Package',
   'Final_Accepted', 'HC_Override', 'Extended_Note', 'Submitted_At', 'Contract_Basis', 'Agreed_Amount', 'Contrib_Wage', 'Comprehensive_Wage', 'Emp_Insurance',
   'Income_Tax', 'Net_Salary', 'Company_Martyr', 'Incentive_Amount', 'Incentive_Terms', 'No_Insurance', 'No_Ins_Basis'].forEach(function (k) { x[k] = o[k]; });
  var ackJ = o.No_Insurance === 'Y' && o.Status === 'ACCEPTED' ? joiningOf_(o.Application_ID) : null, ackD = ackJ ? noInsAckDoc_(ackJ.Joining_ID) : null;
  var wt0 = workTermsOf_(o); x.Work_Hours = wt0.hours; x.Weekly_Rest = wt0.rest; x.weeklyRestName = wt0.restName;     // v0.50.0 (CHG-107)
  x.noInsForm = !!o.No_Ins_Form_File || !!(ackD && ['UPLOADED', 'VERIFIED'].indexOf(ackD.Status) >= 0); x.noInsBases = noInsBases_();
  try { x.inputs = JSON.parse(o.Calc_JSON || '{}').inputs || {}; } catch (e) { x.inputs = {}; }
  try { x.range = o.Range_JSON ? JSON.parse(o.Range_JSON) : null; } catch (e) { x.range = null; }
  try { x.files = JSON.parse(o.Evidence_JSON || '[]'); } catch (e) { x.files = []; }
  var rn = {}; all_('ROLES').forEach(function (r) { rn[r.Role_Code] = r.Role_Name_AR; });
  x.requiredName = o.Required_Role === 'CEO_BOARD' ? noInsAuthority_().roleName : (rn[o.Required_Role] || o.Required_Role);
  return x;
}

/** The selection & offer card on the candidate page. */
function appOffers_(ctx, a, v, access) {
  var names = userNames_(), full = access === 'FULL';
  var sel = currentSelection_(a.Application_ID);
  var hist = find_('SELECTIONS', { Application_ID: a.Application_ID }).sort(function (x, y) { return x.Selection_ID < y.Selection_ID ? 1 : -1; });
  var offers = find_('OFFERS', { Application_ID: a.Application_ID }).sort(function (x, y) { return x.Offer_ID < y.Offer_ID ? 1 : -1; });
  var view = function (s) {
    var snap = {}; try { snap = JSON.parse(s.Snapshot_JSON || '{}'); } catch (e) {}
    return { Selection_ID: s.Selection_ID, Decision: s.Decision, decisionName: SEL_AR_[s.Decision], Reason: s.Reason, Conditions: s.Conditions, Override_Reason: s.Override_Reason,
      by: names[s.Decided_By] || s.Decided_By, at: s.Decided_At, snap: snap, current: s.Status === 'Current' };
  };
  var out = { selection: sel ? view(sel) : null, history: hist.slice(0, 10).map(view),
    canDecide: ['INTERVIEW', 'OFFER'].indexOf(a.Stage) >= 0, canReject: full,
    offers: offers.map(function (o) { return offerView_(ctx, o, full); }) };
  if (!full) return out;
  out.references = find_('REFERENCE_CHECKS', { Application_ID: a.Application_ID }).map(function (r) { r.checkedBy = names[r.Checked_By] || ''; return r; });
  out.canOffer = a.Stage === 'OFFER' && !offers.some(function (o) { return OFFER_LIVE_.indexOf(o.Status) >= 0; });
  out.canExtend = hasAnyRole_(ctx, offerExtendRoles_());
  out.myAuthSort = myAuthSort_(ctx);
  out.room = vacancyRoom_(v, a.Application_ID);
  return out;
}

/** Everything the offer editor needs for an application. */
function offerSetup_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), v = L.vac, a = L.app;
  var P = payProfile_(v), grade = P.grade, range = rangeOf_(structureOf_(grade)), per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
  var rates = find_('JOB_NATURE_RATES', { Status: 'Active' });
  var manual = payComponents_().filter(function (c) { return c.Kind === 'FIXED' && AUTO_ITEMS_.concat(['REPRESENTATION', 'OTHER_ALLOW']).indexOf(c.Component_Code) < 0; })
    .map(function (c) { return { code: c.Component_Code, name: c.Name_AR }; });
  return { weeklyRests: WEEKLY_RESTS_, workDefaults: workTermsOf_(null), noInsBases: noInsBases_(), grade: grade, gradeName: (get_('GRADES', grade) || {}).Grade_Name || '', range: range, collar: P.collar, collarName: COLLARS_[P.collar] || '',
    zone: P.zone, locationName: P.loc ? P.loc.Name_AR : '', temp: P.temp.map(function (t) { return { amount: t.Amount, to: t.To_Date, reason: t.Reason }; }),
    noTable: !P.row, jobNature: P.jobNature, rates: rates.map(function (r) { return { id: r.Rate_ID, name: r.Group_Name + ' — ' + r.Department, amount: r.Amount }; })
      .sort(function (x, y) { return x.name < y.name ? -1 : 1; }), suggestRate: P.jobNature ? suggestRate_(v, rates) : '', manual: manual,
    canIncentive: canIncentive_(ctx), validDays: cfg_('OFFER_VALID_DAYS', 7), today: today_(),
    current: per.Current_Salary, expected: per.Expected_Salary, notice: per.Notice_Period, room: vacancyRoom_(v, a.Application_ID) };
}

/** p = { Offer_ID } — the separate incentive sheet (never part of the offer letter). */
function offerIncentiveGet_(ctx, p) {
  var o = offerGet_(p.Offer_ID), A = offerAccess_(ctx, o);
  if (!A.full) throw userError_('مالكش صلاحية.');
  if (!num_(o.Incentive_Amount, 0)) throw userError_('العرض ده مافيهوش حافز.');
  var per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {}, t = vacTitle_(A.v);
  audit_(ctx, { entityType: 'OFFER', entityId: o.Offer_ID, action: 'PRINT_INCENTIVE', newValue: o.Incentive_Amount });
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.9;max-width:720px;margin:auto">' +
    '<h3 style="text-align:center">ملحق الحافز — سري</h3>التاريخ: ' + today_() + '<br>مرجع العرض: ' + escHtml_(o.Offer_No) + (num_(o.Version, 1) > 1 ? ' / v' + o.Version : '') + '<br><br>' +
    'السيد/ة ' + escHtml_(per.Full_Name) + '،<br>بالإشارة إلى عرض العمل لوظيفة ' + escHtml_(t.ar) + ' في ' + escHtml_(locName_(A.v.Location_ID)) + '، يُمنح سيادتكم حافز شهري بقيمة <b dir="ltr">' + money0_(o.Incentive_Amount) + ' ج.م</b> وفق الشروط التالية:<br>' +
    escHtml_(o.Incentive_Terms).replace(/\n/g, '<br>') + '<br><br>هذا الملحق منفصل عن خطاب العرض، ويخضع لقرار الإدارة ويمكن مراجعته وفق سياسات الشركة.<br><br>' +
    '<table style="width:100%;margin-top:30px"><tr><td>توقيع الموظف: ..................</td><td>إدارة الموارد البشرية: ..................</td></tr></table></div>';
  return { subject: 'ملحق الحافز — ' + per.Full_Name, html: html };
}

/** p = { tab: approve|active|expiring|closed } — the offers list. */
function offersList_(ctx, p) {
  var me = ctx.user.User_ID, names = userNames_(), tab = str_(p.tab) || 'active', today = today_();
  var soon = addDaysYmd_(today, 2), vacs = {}, acc = {};
  var rows = all_('OFFERS').filter(function (o) { return o.Status !== 'SUPERSEDED'; }).filter(function (o) {
    if (!vacs[o.Vacancy_ID]) { vacs[o.Vacancy_ID] = findOne_('VACANCIES', { Vacancy_ID: o.Vacancy_ID }) || {}; acc[o.Vacancy_ID] = vacancyAccess_(ctx, vacs[o.Vacancy_ID]); }
    var approver = (o.Status === 'PENDING_APPROVAL' && offerApprovers_({ sort: num_(o.Required_Sort, 0) }).eligible.indexOf(me) >= 0) ||
      (o.Status === 'APPROVED' && netReviewNeeded_(o) && o.Created_By !== me && netReviewer_(ctx));
    o._full = acc[o.Vacancy_ID] === 'FULL'; o._approver = approver;
    if (tab === 'approve') return approver;
    if (!o._full) return false;
    if (tab === 'active') return OFFER_LIVE_.indexOf(o.Status) >= 0;
    if (tab === 'expiring') return OFFER_OUT_.indexOf(o.Status) >= 0 && o.Status !== 'PENDING_APPROVAL' && o.Valid_Until <= soon;
    return ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'].indexOf(o.Status) >= 0;
  }).sort(function (x, y) { return x.Offer_ID < y.Offer_ID ? 1 : -1; }).slice(0, 200).map(function (o) {
    var per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {}, v = vacs[o.Vacancy_ID];
    var x = offerView_(ctx, o, o._full || o._approver);
    x.name = per.Full_Name; x.jobTitle = v.Vacancy_ID ? vacTitle_(v).ar : ''; x.locationName = locName_(v.Location_ID); x.approver = o._approver;
    return x;
  });
  return { rows: rows, tab: tab };
}

/** Counts for the home page. */
function offerTodo_(ctx) {
  var me = ctx.user.User_ID, t = { approve: 0, present: 0, expiring: 0, returned: 0, decide: 0 };
  var soon = addDaysYmd_(today_(), 1), myVac = myTeamVacancies_(ctx), all = candAll_(ctx), netRev = null;
  all_('OFFERS').forEach(function (o) {
    if (o.Status === 'PENDING_APPROVAL' && offerApprovers_({ sort: num_(o.Required_Sort, 0) }).eligible.indexOf(me) >= 0) t.approve++;
    if (o.Status === 'APPROVED' && netReviewNeeded_(o) && o.Created_By !== me) { if (netRev === null) netRev = netReviewer_(ctx); if (netRev) t.approve++; }
    var mine = all || myVac[o.Vacancy_ID] || o.Created_By === me;
    if (!mine) return;
    if (o.Status === 'APPROVED' && !netReviewNeeded_(o)) t.present++;
    if (o.Status === 'RETURNED' && o.Created_By === me) t.returned++;
    if (['APPROVED', 'PRESENTED'].indexOf(o.Status) >= 0 && o.Valid_Until <= soon) t.expiring++;
  });
  return t;
}

/* ---------------- offer letter ---------------- */

function offerLetter_(o, v, per, lang) {
  var t = findOne_('MESSAGE_TEMPLATES', { Template_ID: 'OFFER_LETTER-' + lang }) || findOne_('MESSAGE_TEMPLATES', { Template_ID: 'OFFER_LETTER-ar' }) || {};
  var title = vacTitle_(v), comps = {}; find_('PAY_COMPONENTS', {}).forEach(function (c) { comps[c.Component_Code] = c; });
  var cl = []; try { cl = JSON.parse(o.Components_JSON || '[]'); } catch (e) {}
  var shown = cl.filter(function (c) { var m = comps[c.c]; return m && m.Show_On_Offer === 'Y' && m.Kind !== 'VARIABLE'; });
  var shownTotal = shown.reduce(function (s, c) { return s + num_(c.a, 0); }, 0);
  var cur = lang === 'en' ? ' EGP' : ' ج.م';
  var table = '<table style="border-collapse:collapse;margin:8px 0;min-width:280px">' + shown.map(function (c) {
    var m = comps[c.c]; return '<tr><td style="border:1px solid #ccc;padding:6px 10px">' + escHtml_(lang === 'en' && m.Name_EN ? m.Name_EN : m.Name_AR) + '</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:left" dir="ltr">' + money0_(c.a) + cur + '</td></tr>';
  }).join('') + '<tr><td style="border:1px solid #ccc;padding:6px 10px"><b>' + (lang === 'en' ? 'Total monthly (gross)' : 'الإجمالي الشهري') + '</b></td><td style="border:1px solid #ccc;padding:6px 10px;text-align:left" dir="ltr"><b>' + money0_(shownTotal) + cur + '</b></td></tr></table>';
  var map = { name: per.Full_Name, job: lang === 'en' && title.en ? title.en : title.ar, location: locName_(v.Location_ID, lang), company: lang === 'en' ? 'Kandil Egypt' : 'قنديل مصر',
    joining: o.Joining_Date || (lang === 'en' ? 'to be agreed' : 'يتم الاتفاق عليه'), valid_until: o.Valid_Until, offer_no: o.Offer_No + (num_(o.Version, 1) > 1 ? ' / v' + o.Version : ''),
    date: today_(), terms: o.Terms || '', package: money0_(shownTotal) + cur, net_salary: o.Net_Salary ? money0_(o.Net_Salary) + cur + (lang === 'en' ? ' (estimated net)' : ' (صافي تقديري)') : '' };
  function fill(s) { return escHtml_(str_(s).replace(/\{(name|job|location|company|joining|valid_until|offer_no|date|terms|package|net_salary)\}/g, function (m, k) { return map[k] || ''; })).replace(/\n/g, '<br>'); }
  var body = fill(t.Body || '').replace('{salary_table}', table).replace(/\{salary_table\}/g, '');
  if (str_(t.Body).indexOf('{salary_table}') < 0) body += table;
  // v0.40.0 (CHG-84): the net is shown as an estimate only (payroll confirms it after the first salary)
  if (o.Net_Salary && str_(t.Body).indexOf('{net_salary}') < 0) body += '<div style="margin-top:6px">' + (lang === 'en' ? 'Estimated monthly net: <b dir="ltr">' + money0_(o.Net_Salary) + cur + '</b> — an estimate; payroll confirms the exact net.'
    : 'الصافي الشهري التقديري: <b dir="ltr">' + money0_(o.Net_Salary) + cur + '</b> — صافي تقديري، والمرتبات بتأكد الصافي الفعلي.') + '</div>';
  var html = '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.9;max-width:720px;margin:auto">' + body + '</div>';
  return { lang: lang, subject: str_(t.Subject).replace(/\{(job|offer_no)\}/g, function (m, k) { return map[k] || ''; }), html: html };
}

/** p = { Offer_ID, lang } — the printable letter (only fixed components marked «show on offer»). */
function offerLetterGet_(ctx, p) {
  var o = offerGet_(p.Offer_ID), A = offerAccess_(ctx, o);
  if (!A.full) throw userError_('مالكش صلاحية.');
  if (['APPROVED', 'PRESENTED', 'ACCEPTED'].indexOf(o.Status) < 0) throw userError_('خطاب العرض بيطلع بعد اعتماد العرض.');
  var per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {};
  audit_(ctx, { entityType: 'OFFER', entityId: o.Offer_ID, action: 'PRINT', newValue: o.Status });
  return offerLetter_(o, A.v, per, str_(p.lang) === 'en' ? 'en' : (per.Language === 'en' ? 'en' : 'ar'));
}

/* ---------------- daily: expiry, reminders ---------------- */

function offerDaily_() {
  var today = today_(), tmr = nextWorkDay_(), out = { expired: 0, warned: 0, waiting: 0 };
  all_('OFFERS').forEach(function (o) {
    if (['APPROVED', 'PRESENTED'].indexOf(o.Status) < 0) {
      if (o.Status === 'PENDING_APPROVAL' && o.Submitted_At && workDaysBetween_(o.Submitted_At.slice(0, 10), today) >= 1 && o.Reminded_At !== today) {
        notify_(offerApprovers_({ sort: num_(o.Required_Sort, 0) }).notify, 'تذكير: عرض وظيفي مستني موافقتك', o.Offer_No + ' v' + o.Version, 'OFFER', o.Offer_ID, false);
        withLock_(function () { update_('OFFERS', o.Offer_ID, { Reminded_At: today }, 'SYSTEM'); });
        out.waiting++;
      }
      return;
    }
    var v = findOne_('VACANCIES', { Vacancy_ID: o.Vacancy_ID }) || {}, per = findOne_('PERSONS', { Person_ID: o.Person_ID }) || {};
    var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: o.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; }).concat([v.Lead_Recruiter_ID, o.Created_By]);
    var line = per.Full_Name + ' — ' + (v.Vacancy_ID ? vacTitle_(v).ar : '') + ' (' + o.Offer_No + ')';
    if (o.Valid_Until < today) {
      withLock_(function () {
        update_('OFFERS', o.Offer_ID, { Status: 'EXPIRED' }, 'SYSTEM');
        var a = findOne_('APPLICATIONS', { Application_ID: o.Application_ID });
        if (a) activity_('SYSTEM', a, 'SYSTEM', { Note: 'صلاحية العرض ' + o.Offer_No + ' خلصت (' + o.Valid_Until + ') من غير رد' });
      });
      event_(null, 'OFFER', o.Offer_ID, 'EXPIRED', o.Valid_Until);
      notify_(team, 'صلاحية عرض وظيفي خلصت', line + ' · تقدر تمد الصلاحية أو تسحب العرض', 'OFFER', o.Offer_ID, false);
      out.expired++;
    } else if (o.Valid_Until <= tmr && o.Reminded_At !== today) {
      notify_(team, 'عرض وظيفي صلاحيته بتخلص ' + (o.Valid_Until === today ? 'النهارده' : 'بكرة'), line + ' · كلّم المرشح', 'OFFER', o.Offer_ID, false);
      withLock_(function () { update_('OFFERS', o.Offer_ID, { Reminded_At: today }, 'SYSTEM'); });
      out.warned++;
    }
  });
  return out;
}

/* ---------------- withdraw live offers when the candidate is closed ---------------- */

function withdrawLiveOffers_(actorId, appId, why) {
  var n = 0;
  find_('OFFERS', { Application_ID: appId }).forEach(function (o) {
    if (OFFER_LIVE_.indexOf(o.Status) < 0) return;
    update_('OFFERS', o.Offer_ID, { Status: 'WITHDRAWN', Response_Note: why }, actorId);
    n++;
  });
  return n;
}
