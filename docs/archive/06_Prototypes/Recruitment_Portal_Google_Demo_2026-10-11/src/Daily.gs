/**
 * Daily.gs — the once-a-day job (v0.8.1, decision CHG-40/1).
 *
 *   • Approval reminders: a step waiting APPROVAL_REMIND_DAYS gets an in-app reminder, repeated every
 *     APPROVAL_REMIND_DAYS days.
 *   • Escalation: a step waiting APPROVAL_ESCALATE_DAYS is raised once to the HR Sector Manager and HR Manager.
 *   • Expiry: a step left without a decision APPROVAL_EXPIRE_DAYS days counts as REJECTED (by the system);
 *     the approver and requester are warned EXPIRY_WARN_DAYS before.
 *   • Daily digest: one email per user who has approvals waiting or a request returned to him.
 *   • The older daily checks (employees' last working days, subscription expiry) run from here too.
 *
 * Runs from a time-driven trigger (installTriggers, at DIGEST_TIME). Until that trigger exists — or if it
 * missed a day — the first portal call of the day runs the same checks, without the digest.
 * Email: only immediate alerts and the digest go by email, within EMAIL_DAILY_BUDGET (login codes always go).
 */

var DAILY_HANDLER_ = 'dailyTrigger';

/** Time-driven trigger entry point. */
function dailyTrigger(e) {
  requireTriggerOrEditor_(e);
  ensureUpgraded_();            // a new version may not have had its first portal call yet
  return runDaily_(true);
}
/** The one-off background run scheduled by dailySoon_: removes itself, then runs the daily job. */
function dailySoonTrigger(e) {
  requireTriggerOrEditor_(e);
  try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailySoonTrigger') ScriptApp.deleteTrigger(t); }); } catch (e) {}
  ensureUpgraded_();
  return runDaily_(true);
}

/**
 * Run ONCE from the Apps Script editor after upgrading to 0.8.1: approves the "run on a schedule" permission
 * and creates the daily trigger at DIGEST_TIME. Safe to run again (replaces the old trigger).
 */
function installTriggers() {
  requireEditor_();
  ensureUpgraded_();
  try { protectAllSheets_(); } catch (e) { console.warn('sheet protection: ' + e); }
  var r = installTriggers_();
  Logger.log('Daily trigger ready at ' + r.hour + ':00 (' + APP.TZ + ')');
  return r;
}

function digestHour_() {
  var m = /^(\d{1,2})/.exec(str_(cfg_('DIGEST_TIME', '08:00')));
  var h = m ? Number(m[1]) : 8;
  return h >= 0 && h <= 23 ? h : 8;
}

function installTriggers_() {
  return "Disabled in the private review deployment";
  var hour = digestHour_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DAILY_HANDLER_ || t.getHandlerFunction() === HOURLY_HANDLER_) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(DAILY_HANDLER_).timeBased().everyDays(1).atHour(hour).inTimezone(APP.TZ).create();
  ScriptApp.newTrigger(HOURLY_HANDLER_).timeBased().everyHours(1).create();          // v0.12.0: reminders 2 hours before
  var props = PropertiesService.getScriptProperties();
  props.setProperty('HOURLY_TRIGGER', 'Y');
  props.setProperty('DAILY_TRIGGER', 'Y');
  props.setProperty('DAILY_TRIGGER_HOUR', String(hour));
  return { hour: hour };
}

/** Called on upgrade: creates the trigger when the permission is already approved; never fails the upgrade. */
function tryInstallTriggers_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('DAILY_TRIGGER') === 'Y' && props.getProperty('HOURLY_TRIGGER') === 'Y' && props.getProperty('DAILY_TRIGGER_HOUR') === String(digestHour_())) return 'ok';
    installTriggers_();
    return 'installed';
  } catch (e) {
    console.warn('Daily trigger not installed yet (run installTriggers from the editor): ' + e);
    return 'pending';
  }
}

/** First portal call of the day: run the checks when the scheduled run has not happened (no trigger, or it missed a day). */
function dailyFallback_() {
  return; // Private review: no automatic background processing.
  var last = sprop_('DAILY_RUN') || '';
  var trig = sprop_('DAILY_TRIGGER') === 'Y';
  if (last === today_()) return;
  if (trig && last >= yesterday_()) return;      // the trigger runs later today
  // v0.32.1: never make a user wait for the daily job — put it in the background (in a minute) when the permission allows
  if (dailySoon_()) return;
  runDaily_(false);
}

/** A one-off run of the daily job in about a minute (and the daily trigger, when missing). false = cannot schedule. */
function dailySoon_() {
  return false; // Private review: do not create background triggers.
  try {
    if (sprop_('DAILY_SOON') === today_()) return true;      // already scheduled today
    tryInstallTriggers_();
    ScriptApp.newTrigger('dailySoonTrigger').timeBased().after(60 * 1000).create();
    PropertiesService.getScriptProperties().setProperty('DAILY_SOON', today_());
    return true;
  } catch (e) { console.warn('daily job in the background: ' + e); return false; }
}

/**
 * The daily job, in steps (v0.35.0). Each finished step is written down for the day (DAILY_PROGRESS); when the run
 * nears the Apps Script limit (DAILY_BUDGET_MS) it stops and schedules a background continuation, which carries on
 * from the first unfinished step — nothing is lost and nothing runs twice.
 * fromTrigger = a scheduled run: also the deletions, housekeeping and the digest (never inside a user's request).
 */
var DAILY_BUDGET_MS_ = 270000;     // 4.5 minutes of the 6
function dailySteps_(fromTrigger, weekend, day) {
  var S = [];
  function add(name, fn, opts) { opts = opts || {}; if (opts.trigger && !fromTrigger) return; if (opts.weekday && weekend) return; S.push({ name: name, fn: function () { return notifyBatch_(fn); } }); }
  add('protect', function () { protectAllSheets_(); }, { trigger: true });
  add('employees', function () { return empDailyRefresh_(); });
  add('sourcing', function () { return sourcingDailyCheck_(); });
  add('retention', function () { return retentionDaily_(); }, { trigger: true });
  add('housekeeping', function () { return housekeeping_(); }, { trigger: true });
  // ID counters: once a week is enough (they only drift after overlapping writes) — and the big logs are left out
  add('sequences', function () { return new Date(ymdMs_(day)).getUTCDay() === 5 ? repairSequences_(true) : 'weekly'; }, { trigger: true });
  // v0.40.0 (CHG-84): expiries, transfers and probation run every day; reminders and escalations pause on the days off
  add('sla', function () { return approvalSla_(weekend); });
  add('iv', function () { return interviewSla_(); }, { weekday: true });
  add('offers', function () { return offerDaily_(); }, { weekday: true });
  add('joinings', function () { return joiningDaily_(); }, { weekday: true });
  add('onb', function () { return onbDaily_(); }, { weekday: true });
  add('ins', function () { return insDaily_(); }, { weekday: true });
  add('nhv', function () { return nhvDaily_(); }, { weekday: true });
  add('prob', function () { return probDaily_(weekend); });
  add('kpi', function () { return kpiMonthly_(); }, { weekday: true });
  add('trf', function () { return trfDaily_(); });
  add('docs', function () { return docExpiryDaily_(weekend); });
  add('restrict', function () { return restrictionDaily_(); }, { weekday: true });
  add('ceo', function () { return ceoDaily_(); });
  add('jdr', function () { return jdrDaily_(); }, { weekday: true });     // v0.45.0 (CHG-96)
  add('backup', function () { return backupDaily_(); }, { trigger: true });
  add('dormant', function () { return dormantDaily_(); }, { trigger: true });       // v0.49.0 (CHG-105)
  add('auditchain', function () { return auditChainDaily_(); }, { trigger: true });  // v0.49.0 (CHG-106)
  add('ops', function () { return { incidents: incidentDaily_(), reminders: opsReminders_() }; });
  if (fromTrigger && !weekend && cfg_('DIGEST_ENABLED', true)) add('digest', function () { return dailyDigest_(); });
  return S;
}

function dailyProgress_(day) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DAILY_RUN') !== day) return { day: day, done: [], out: {} };     // the day not claimed yet: a fresh start
  var raw = props.getProperty('DAILY_PROGRESS'), p = null;
  try { p = JSON.parse(raw || 'null'); } catch (e) { p = null; }
  return p && p.day === day ? p : { day: day, done: [], out: {} };
}

function runDaily_(fromTrigger, cont) {
  var props = PropertiesService.getScriptProperties();
  var day = today_(), t0 = Date.now();
  if (!props.getProperty(SS_PROP.CORE)) return { skipped: true };     // not installed
  var prog = dailyProgress_(day);
  if (props.getProperty('DAILY_RUN') === day && (!cont || prog.complete)) return { skipped: true };
  // claim the day (or the continuation) under the lock: two runs arriving together must not both send the reminders
  var claimed = withLock_(function () {
    var p2 = dailyProgress_(day), lease = num_(props.getProperty('DAILY_LEASE'), 0);
    if (p2.complete || (props.getProperty('DAILY_RUN') === day && !cont)) return false;
    if (cont && lease && Date.now() - lease < 6 * 60 * 1000) return false;      // another run is still working on it
    if (props.getProperty('DAILY_RUN') !== day) props.setProperty('DAILY_PROGRESS', JSON.stringify({ day: day, done: [], out: {} }));
    props.setProperty('DAILY_RUN', day);
    props.setProperty('DAILY_LEASE', String(Date.now()));
    return true;
  });
  if (!claimed) return { skipped: true };
  prog = dailyProgress_(day);
  var weekend = isWeekend_(day), steps = dailySteps_(fromTrigger || !!prog.trigger, weekend, day), out = prog.out || {};
  if (fromTrigger) prog.trigger = true;
  if (weekend) out.weekend = true;
  var stopped = false, ran = 0;
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    if (prog.done.indexOf(s.name) >= 0) continue;
    if (ran > 0 && Date.now() - t0 > DAILY_BUDGET_MS_) { stopped = true; break; }     // every run moves at least one step
    ran++;
    try { var r = s.fn(); if (r !== undefined) out[s.name] = r; }
    catch (e) { console.error(s.name + ': ' + (e.stack || e)); out[s.name] = { error: str_(e.message).slice(0, 80) }; }
    prog.done.push(s.name);
    prog.out = out;
    props.setProperty('DAILY_PROGRESS', JSON.stringify(prog).slice(0, 8000));
  }
  try { flushAudit_(); } catch (e) { console.warn('audit flush: ' + e); }
  props.deleteProperty('DAILY_LEASE');
  if (stopped) {
    // carry on in the background from the first unfinished step
    try { ScriptApp.newTrigger('dailyMoreTrigger').timeBased().after(60 * 1000).create(); } catch (e) { console.warn('daily continuation: ' + e); }
    out.continued = true;
  } else {
    prog.complete = true;
    props.setProperty('DAILY_PROGRESS', JSON.stringify(prog).slice(0, 8000));
  }
  props.setProperty('DAILY_RESULT', JSON.stringify(out).slice(0, 400));
  out.day = day;
  return out;
}

/** The continuation of a daily job that stopped before the time limit (removes its own one-off trigger). */
function dailyMoreTrigger(e) {
  requireTriggerOrEditor_(e);
  try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyMoreTrigger') ScriptApp.deleteTrigger(t); }); } catch (x) {}
  ensureUpgraded_();
  return runDaily_(false, true);
}

/* ---------------- email budget ---------------- */

/**
 * May the portal send one more e-mail of this kind today? (v0.35.0: priorities — CHG-79)
 *   login codes never ask (they keep MAIL_LOGIN_RESERVE of Google's quota for themselves);
 *   CANDIDATE mails may use the whole EMAIL_DAILY_BUDGET; APPROVAL (and internal) mails leave MAIL_CANDIDATE_RESERVE
 *   for candidates; DIGEST (daily summary, monthly KPIs) uses at most half the budget.
 * When 80 % of the budget is used the owner and the HR sector manager are told once that day.
 */
function mailOk_(kind) {
  var remaining = 0;
  try { remaining = MailApp.getRemainingDailyQuota(); } catch (e) { return false; }
  if (remaining <= num_(cfg_('MAIL_LOGIN_RESERVE', 10), 10)) { mailNearLimit_(true); return false; }
  var budget = num_(cfg_('EMAIL_DAILY_BUDGET', 80), 80), sent = mailSentToday_();
  var limit = kind === 'DIGEST' ? Math.floor(budget / 2) : kind === 'CANDIDATE' ? budget : budget - num_(cfg_('MAIL_CANDIDATE_RESERVE', 15), 15);
  if (sent >= budget * 0.8) mailNearLimit_(false);
  return sent < limit;
}
/** One alert a day when the e-mail budget is nearly used (or Google's quota reached the reserve). */
function mailNearLimit_(quota) {
  try {
    var props = PropertiesService.getScriptProperties(), day = today_();
    if (props.getProperty('MAIL_ALERT_DAY') === day) return;
    props.setProperty('MAIL_ALERT_DAY', day);
    notify_(roleHolders_(ROLE.OWNER).concat(roleHolders_(ROLE.HR_SECTOR)), 'الإيميلات قربت تخلص النهارده',
      (quota ? 'حد جوجل اليومي قرب يخلص — الإيميلات وقفت ما عدا أكواد الدخول.' : 'البوابة بعتت ' + mailSentToday_() + ' إيميل من ' + num_(cfg_('EMAIL_DAILY_BUDGET', 80), 80) + ' — الملخص اليومي اتوقف وإيميلات المرشحين ليها الأولوية.') +
      ' الحل الدائم: حساب Google Workspace (1,500 في اليوم).', 'CONFIG', '', false);
  } catch (e) { console.warn('mail alert: ' + e); }
}
function mailSentToday_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('MAIL_DAY') === today_() ? num_(props.getProperty('MAIL_COUNT'), 0) : 0;
}
function mailSent_() {
  var props = PropertiesService.getScriptProperties();
  var n = mailSentToday_() + 1;
  props.setProperty('MAIL_DAY', today_());
  props.setProperty('MAIL_COUNT', String(n));
}

/* ---------------- approvals: reminders, escalation, expiry ---------------- */

var SLA_ENTITY_ = {
  REQUEST: { table: 'RECRUITMENT_REQUESTS', open: function () { return REQ_OPEN_; }, title: function (r) { return reqTitle_(r); } },
  PCR: { table: 'POSITION_CHANGE_REQUESTS', open: function () { return PCR_OPEN_; }, title: function (r) { return pcrTitle_(r); } }
};

/** Working days a step has been waiting (from when it reached the approver; weekly days off not counted). */
function stepWaitDays_(a, today) {
  var from = str_(a.Activated_At || a.Created_At).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(from) ? workDaysBetween_(from, today || today_()) : 0;
}

function approvalSla_(weekend) {
  var today = today_();
  var remind = cfg_('APPROVAL_REMIND_DAYS', 3), esc = cfg_('APPROVAL_ESCALATE_DAYS', 7);
  var expire = cfg_('APPROVAL_EXPIRE_DAYS', 30), warn = cfg_('APPROVAL_EXPIRY_WARN_DAYS', 5);
  var res = { reminded: 0, escalated: 0, warned: 0, expired: 0 };
  var hrHeads = roleUserIds_([ROLE.HR_SECTOR, ROLE.HR_MANAGER]);
  find_('APPROVAL_INSTANCES', { Status: 'PENDING' }).forEach(function (a) {
    var def = SLA_ENTITY_[a.Entity_Type];
    if (!def) return;
    var r = get_(def.table, a.Entity_ID);
    if (!r || r.Version !== a.Entity_Version || def.open().indexOf(r.Status) < 0) return;
    var days = stepWaitDays_(a, today);
    var title = a.Entity_ID + ' — ' + def.title(r);
    if (expire > 0 && days >= expire) { if (expireStep_(a, r, def, days) !== false) res.expired++; return; }
    if (weekend) return;                                                   // the days off: expiry only
    var who = eligibleUsers_(a.Authority, r.Requester_User_ID);
    var patch = {};
    if (expire > 0 && warn > 0 && days >= expire - warn && !a.Expiry_Warned_At) {
      var left = expire - days;
      notify_(who.concat([r.Requester_User_ID]), 'تنبيه: الطلب هيترفض تلقائياً بعد ' + left + ' يوم',
        title + ' — واقف عند «' + a.Label + '» من ' + days + ' يوم. لو مفيش قرار خلال ' + left + ' يوم هيتحسب مرفوض.', a.Entity_Type, a.Entity_ID, false);
      patch.Expiry_Warned_At = nowIso_(); patch.Last_Reminder_At = patch.Expiry_Warned_At; res.warned++;   // the warning is today's reminder
    } else if (remind > 0 && days >= remind && who.length &&
        (!a.Last_Reminder_At || workDaysBetween_(a.Last_Reminder_At.slice(0, 10), today) >= remind)) {
      notify_(who, 'تذكير: طلب مستني اعتمادك من ' + days + ' يوم', title + ' — ' + a.Label, a.Entity_Type, a.Entity_ID, false);
      patch.Reminder_Count = String(num_(a.Reminder_Count, 0) + 1);
      patch.Last_Reminder_At = nowIso_(); res.reminded++;
    }
    if (esc > 0 && days >= esc && !a.Escalated_At) {
      var to = hrHeads.filter(function (u) { return who.indexOf(u) < 0; });
      if (!who.length) to = hrHeads.slice();                              // nobody can act: HR must fix it
      if (to.length) {
        notify_(to, 'تصعيد: طلب متأخر في الاعتماد', title + ' — واقف عند «' + a.Label + '» من ' + days + ' يوم' +
          (who.length ? ' (عند: ' + who.map(function (u) { return userNames_()[u] || u; }).join('، ') + ')' : ' ومفيش مستخدم يقدر يعتمده'), a.Entity_Type, a.Entity_ID, false);
        res.escalated++;
      }
      patch.Escalated_At = nowIso_();
    }
    if (Object.keys(patch).length) withLock_(function () { update_('APPROVAL_INSTANCES', a.Approval_ID, patch, 'SYSTEM'); });
  });
  return res;
}

/** A step left without a decision for APPROVAL_EXPIRE_DAYS: the request counts as rejected. */
function expireStep_(a, r, def, days) {
  var id = a.Entity_ID, type = a.Entity_Type;
  var note = 'رفض تلقائي: «' + a.Label + '» فضل من غير قرار ' + days + ' يوم';
  var who = eligibleUsers_(a.Authority, r.Requester_User_ID), gone = false;
  withLock_(function () {
    // v0.35.0: read the step again under the lock — an approver who decided a moment ago wins over the automatic rejection
    var cur = get_('APPROVAL_INSTANCES', a.Approval_ID);
    if (!cur || cur.Status !== 'PENDING') { gone = true; return; }
    update_('APPROVAL_INSTANCES', a.Approval_ID, { Status: 'REJECTED', Decision_By: 'SYSTEM', Decision_At: nowIso_(), Comment: note }, 'SYSTEM');
  });
  if (gone) return false;
  cancelOpenSteps_(type, id, r.Version);
  withLock_(function () { update_(def.table, id, { Status: 'REJECTED', Decided_At: nowIso_() }, 'SYSTEM'); });
  event_(null, type, id, 'EXPIRED', note, { step: a.Label, days: days });
  audit_(null, { entityType: type, entityId: id, action: 'AUTO_REJECT', reason: note });
  var title = id + ' — ' + def.title(r);
  notify_([r.Requester_User_ID], 'طلبك اترفض تلقائياً', title + ' — ' + note + '. تقدر تعمل طلب جديد لو الاحتياج لسه موجود.', type, id, true);
  notify_(who, 'طلب اترفض تلقائياً لعدم الاعتماد', title + ' — ' + note, type, id, false);
}

/* ---------------- daily digest ---------------- */

/** One email per active user who has approvals waiting or a request returned to him. */
function dailyDigest_() {
  var today = today_();
  var per = {};
  function bucket(u) { return per[u] = per[u] || { approvals: [], returned: [] }; }
  find_('APPROVAL_INSTANCES', { Status: 'PENDING' }).forEach(function (a) {
    var def = SLA_ENTITY_[a.Entity_Type];
    if (!def) return;
    var r = get_(def.table, a.Entity_ID);
    if (!r || r.Version !== a.Entity_Version || def.open().indexOf(r.Status) < 0) return;
    var line = a.Entity_ID + ' — ' + def.title(r) + ' (' + stepWaitDays_(a, today) + ' يوم)';
    eligibleUsers_(a.Authority, r.Requester_User_ID).forEach(function (u) { bucket(u).approvals.push(line); });
  });
  find_('RECRUITMENT_REQUESTS', { Status: 'RETURNED' }).forEach(function (r) { bucket(r.Requester_User_ID).returned.push(r.Request_ID + ' — ' + reqTitle_(r)); });
  find_('POSITION_CHANGE_REQUESTS', { Status: 'RETURNED' }).forEach(function (r) { bucket(r.Requester_User_ID).returned.push(r.PCR_ID + ' — ' + pcrTitle_(r)); });
  var sent = 0, skipped = 0, portalOnly = 0;
  Object.keys(per).forEach(function (uid) {
    var b = per[uid];
    if (!b.approvals.length && !b.returned.length) return;
    var u = get_('USERS', uid);
    if (!u || u.Status !== 'Active' || !u.Email) return;
    // v0.37.0 (CHG-79): the e-mail goes to unit heads (and those acting for one) and the CEO; everyone else sees it on the home page
    if (!headedUnits_(u).length && realRoles_(uid).indexOf(ROLE.CEO) < 0) { portalOnly++; return; }
    if (!mailOk_('DIGEST')) { skipped++; return; }
    var lang = userLang_(u);
    var T = function (s) { return escHtml_(tr_(s, lang)); };
    var list = function (arr) {
      return '<ul style="margin:4px 0 12px;padding-' + (lang === 'en' ? 'left' : 'right') + ':18px">' +
        arr.slice(0, 15).map(function (x) { return '<li>' + T(x) + '</li>'; }).join('') +
        (arr.length > 15 ? '<li>' + T('و ' + (arr.length - 15) + ' غيرهم') + '</li>' : '') + '</ul>';
    };
    var html = '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' +
      '<b>' + T('صباح الخير ' + str_(lang === 'en' && u.Full_Name_EN ? u.Full_Name_EN : u.Full_Name_AR).split(/\s+/)[0] + '،') + '</b><br>' +
      T('ده ملخص المطلوب منك النهارده في بوابة التوظيف.') + '<br><br>' +
      (b.approvals.length ? '<b>' + T('طلبات مستنية اعتمادك: ' + b.approvals.length) + '</b>' + list(b.approvals) : '') +
      (b.returned.length ? '<b>' + T('طلبات رجعت لك للتعديل: ' + b.returned.length) + '</b>' + list(b.returned) : '') +
      '<span style="color:#6F7B85">' + T('افتح بوابة التوظيف للمتابعة.') + '</span></div>';
    try {
      sendMail_({ to: u.Email, name: 'Kandil Recruitment Portal', htmlBody: html,
        subject: tr_('ملخص اليوم — بوابة التوظيف قنديل مصر', lang) });
      mailSent_(); sent++;
    } catch (e) { console.warn('digest mail failed: ' + e); }
  });
  return { sent: sent, skipped: skipped, portalOnly: portalOnly };
}

/* ---------------- status for the settings screen ---------------- */

function dailyStatus_() {
  var props = PropertiesService.getScriptProperties();
  var last = {};
  try { last = JSON.parse(props.getProperty('DAILY_RESULT') || '{}'); } catch (e) {}
  return { trigger: props.getProperty('DAILY_TRIGGER') === 'Y', hour: props.getProperty('DAILY_TRIGGER_HOUR') || '',
    lastRun: props.getProperty('DAILY_RUN') || '', last: last, mailToday: mailSentToday_(), mailBudget: cfg_('EMAIL_DAILY_BUDGET', 80) };
}

/**
 * Keep the tables read on every request small: expired / closed sessions and used login codes go after 30 days
 * (sign-ins stay in the audit log), read notifications after NOTIF_KEEP_DAYS. Scheduled run only.
 */
function housekeeping_() {
  var cut = addDaysIso_(-30), keepDays = num_(cfg_('NOTIF_KEEP_DAYS', 365), 365), out = {};
  var nCut = keepDays > 0 ? addDaysIso_(-keepDays) : '';
  // v0.35.0: only the expired rows are deleted (in blocks) — the tables are never cleared and written again, so a stop
  // half-way can no longer sign everyone out or lose notifications
  out.sessions = deleteRowsWhere_('SESSIONS', function (s) { return s.Expires_At < cut || (s.Revoked_At && s.Revoked_At < cut); });
  out.codes = deleteRowsWhere_('LOGIN_CODES', function (c) { return c.Expires_At < cut; });
  if (nCut) out.notifications = deleteRowsWhere_('NOTIFICATIONS', function (n) { return n.Read_At && n.Read_At < nCut; });
  try { out.trimmed = trimColumnsOnce_(); } catch (e) { console.warn('trim columns: ' + e); }
  try { out.archived = archiveLogsMonthly_(); } catch (e) { console.warn('archive logs: ' + e); }
  return out;
}

/** Delete the rows a test picks — bottom up, one call per run of adjacent rows, at most maxBlocks calls per run. */
function deleteRowsWhere_(table, dropFn, maxBlocks) {
  maxBlocks = maxBlocks || 300;
  return withLock_(function () {
    var t = load_(table), rows = t.rows.filter(function (r) { return dropFn(r); }).map(function (r) { return r.__row; }).sort(function (a, b) { return b - a; });
    if (!rows.length) return 0;
    var sh = tSheet_(t), blocks = 0, n = 0, i = 0;
    while (i < rows.length && blocks < maxBlocks) {
      var end = rows[i], start = end;
      while (i + 1 < rows.length && rows[i + 1] === start - 1) { i++; start--; }
      sh.deleteRows(start, end - start + 1);
      n += end - start + 1; blocks++; i++;
    }
    delete REPO_.tables[table];
    DIRTY_[table] = 1;                    // row numbers changed: the shared copy is retired at release
    return n;
  });
}

/** Sheets are created with 26 columns: the empty ones still count towards the 10-million-cell limit. Once. */
function trimColumnsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('COLS_TRIMMED') === APP.VERSION) return 0;
  var n = 0;
  Object.keys(SCHEMA).forEach(function (table) {
    try {
      var sh = sheet_(table), last = Math.max(sh.getLastColumn(), 1), max = sh.getMaxColumns();
      if (max > last) { sh.deleteColumns(last + 1, max - last); n += max - last; }
    } catch (e) { console.warn('trim ' + table + ': ' + e); }
  });
  props.setProperty('COLS_TRIMMED', APP.VERSION);
  return n;
}

/**
 * On the 1st of each month: audit and timeline rows older than LOG_ARCHIVE_MONTHS (default 12) move to the archive
 * spreadsheet (same columns) — the live sheets stay small. Logs are appended in time order, so the old rows are the
 * first ones; at most 20,000 rows per run.
 */
function archiveLogsMonthly_() {
  var props = PropertiesService.getScriptProperties(), month = today_().slice(0, 7);
  if (props.getProperty('LOG_ARCHIVE_MONTH') === month) return 'done';
  var months = num_(cfg_('LOG_ARCHIVE_MONTHS', 12), 12);
  if (months <= 0) return 'off';
  var cutoff = addMonthsYmd_(today_(), -months), out = {};
  [['AUDIT_LOG', 'Timestamp'], ['EVENTS', 'Created_At']].forEach(function (x) {
    out[x[0]] = withLock_(function () {
      var sh = sheet_(x[0]), last = sh.getLastRow();
      if (last < 2) return 0;
      var take = Math.min(last - 1, 20000), lastCol = sh.getLastColumn();
      var vals = sh.getRange(1, 1, take + 1, lastCol).getValues(), head = vals[0].map(str_), col = head.indexOf(x[1]);
      if (col < 0) return 0;
      var k = 0;
      while (k + 1 < vals.length && str_(vals[k + 1][col]).slice(0, 10) < cutoff && str_(vals[k + 1][col]) !== '') k++;
      if (!k) return 0;
      var ash = archiveSheet_(x[0], head);
      var start = ash.getLastRow() + 1, need = start + k - 1;
      if (need > ash.getMaxRows()) ash.insertRowsAfter(ash.getMaxRows(), need - ash.getMaxRows() + 100);
      ash.getRange(start, 1, k, lastCol).setValues(vals.slice(1, k + 1).map(function (r) { return r.map(str_); }));
      SpreadsheetApp.flush();
      var hc = head.indexOf('Chain_Hash');                           // v0.49.0 (CHG-106): the chain goes on from the last archived seal
      if (x[0] === 'AUDIT_LOG' && hc >= 0 && str_(vals[k][hc])) props.setProperty('AUDIT_CHAIN_ANCHOR', str_(vals[k][hc]));
      sh.deleteRows(2, k);
      delete REPO_.tables[x[0]];
      return k;
    });
  });
  props.setProperty('LOG_ARCHIVE_MONTH', month);
  return out;
}

/** The archive spreadsheet (created once, next to the data) and its sheet for a log. */
function archiveSheet_(table, head) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('ARCHIVE_SS_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Kandil Recruitment — Archive');
    try { DriveApp.getFileById(ss.getId()).moveTo(getOrCreateFolder_()); } catch (e) {}
    props.setProperty('ARCHIVE_SS_ID', ss.getId());
  }
  var sh = ss.getSheetByName(table);
  if (!sh) { sh = ss.insertSheet(table); sh.getRange(1, 1, 1, head.length).setValues([head]); }
  return sh;
}
