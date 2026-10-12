/**
 * PrivacyRules.gs — v0.38.0 (CHG-80 / CHG-81): rules that guard fairness and personal data along the journey.
 *   • Relatives: the candidate's answer is matched against active employees (a «possible relative» alert); every
 *     interviewer and offer approver declares he is not related to the candidate before he acts.
 *   • The disability share of active employees against the legal 5 %.
 *   • Survey averages only for groups with SURVEY_MIN_ANSWERS answers or more.
 *   • The usage policy every user accepts once (per version).
 */

/* ---------------- relatives ---------------- */

function nameKey_(s) {
  return str_(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^ء-يa-zA-Z\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
/** Employees whose name holds every word the candidate wrote (at least two words). */
function relativeMatches_(name) {
  var w = nameKey_(name).split(' ').filter(function (x) { return x.length > 1; });
  if (w.length < 2) return [];
  return where_('EMPLOYEES', function (e) {
    if (e.Status !== 'Active') return false;
    var k = ' ' + nameKey_(e.Full_Name) + ' ';
    return w.every(function (x) { return k.indexOf(' ' + x + ' ') >= 0; });
  }).slice(0, 5);
}

/** Runs inside the lock after the person is saved: records the match and alerts the vacancy's team. */
function relativeCheck_(actor, person, app) {
  var m = relativeMatches_(person.Relative_Name);
  var ids = m.map(function (e) { return e.Employee_ID; }).join(',');
  update_('PERSONS', person.Person_ID, { Relative_Match: ids }, actor);
  var note = 'كتب إن له قريب في الشركة: ' + person.Relative_Name + ' (' + person.Relative_Relation + ')' +
    (m.length ? ' — ممكن يكون: ' + m.map(function (e) { return e.Full_Name + ' (' + e.Employee_ID + ')'; }).join('، ') : ' — مالقيناش الاسم في الموظفين');
  activity_(actor, app, 'SYSTEM', { Note: note });
  if (m.length && app.Owner_User_ID) notify_([app.Owner_User_ID], 'مرشح ممكن يكون قريب موظف', person.Full_Name + ' — ' + note, 'APPLICATION', app.Application_ID, false);
  return m;
}

/**
 * Interviewers and offer approvers: «I am not related to the candidate». p.noRelation = 'Y' (not related) or 'N'
 * (related — he must step aside). Recorded in the audit log.
 */
function noRelationCheck_(ctx, p, what, appId) {
  var v = str_(p.noRelation);
  if (v === 'N') {
    audit_(ctx, { entityType: 'APPLICATION', entityId: appId, action: 'RELATION_DECLARED', newValue: what });
    throw userError_('قلت إن عندك صلة قرابة بالمرشح — الخطوة دي لازم يعملها حد تاني (بلّغ مسؤول التوظيف).');
  }
  if (v !== 'Y') throw userError_('أكّد إنه مفيش صلة قرابة بينك وبين المرشح (إقرار).');
  audit_(ctx, { entityType: 'APPLICATION', entityId: appId, action: 'NO_RELATION_DECLARED', newValue: what });
}

/* ---------------- disability share (the legal 5 %) ---------------- */

function disabilityShare_() {
  var act = where_('EMPLOYEES', function (e) { return e.Status === 'Active' && str_(e.Is_Demo) !== 'Y'; });
  var d = act.filter(function (e) { return e.Disability === 'Y'; }).length;
  return { employees: act.length, disabled: d, pct: act.length ? Math.round(d / act.length * 1000) / 10 : 0, target: 5,
    need: Math.max(0, Math.ceil(act.length * 0.05) - d) };
}

/* ---------------- small surveys ---------------- */

function surveyMin_() { return Math.max(1, num_(cfg_('SURVEY_MIN_ANSWERS', 5), 5)); }

/* ---------------- usage policy ---------------- */

function policyNeeded_(user) {
  if (!cfg_('USAGE_POLICY_REQUIRED', true) || isDemoUser_(user)) return false;
  return !str_(user.Policy_Accepted_At) || str_(user.Policy_Version) !== str_(cfg_('USAGE_POLICY_VERSION', '1'));
}
function policyAccept_(ctx) {
  if (!policyNeeded_(ctx.user)) return { ok: true };
  var ver = str_(cfg_('USAGE_POLICY_VERSION', '1'));
  withLock_(function () { update_('USERS', ctx.user.User_ID, { Policy_Version: ver, Policy_Accepted_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'USER', entityId: ctx.user.User_ID, action: 'POLICY_ACCEPTED', newValue: ver });
  return { ok: true };
}
