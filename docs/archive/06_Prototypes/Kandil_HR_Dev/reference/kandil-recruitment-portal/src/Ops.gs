/**
 * Ops.gs — v0.37.0: going live and running the portal safely (CHG-79, CHG-82, CHG-73).
 *   • Go live: the owner presses it once (typed phrase, no demo data left). GOLIVE_AT is recorded for good: demo data
 *     and the data wipe are locked, and consultant accounts lose the personal-data screens.
 *   • Weekly backups of every spreadsheet into a dated folder (kept BACKUP_KEEP_WEEKS), and the quarterly restore test
 *     the owner records on the readiness screen.
 *   • The incident log (personal-data breaches): reported by the owner / HR Sector Manager / DPO, decided by the DPO
 *     with the 72-hour clock from detection.
 *   • Reminders: the Anthropic key's age (CVAI_KEY_ROTATE_DAYS), the restore test (92 days), open incidents (48 hours).
 */

var GOLIVE_PHRASE_ = 'تشغيل فعلي';

function opsRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }
function dpoUser_() { var id = str_(cfg_('DPO_USER_ID', '')); var u = id ? get_('USERS', id) : null; return u && u.Status === 'Active' ? u.User_ID : ''; }
function isDpo_(ctx) { var d = dpoUser_(); return !!d && d === ctx.user.User_ID; }

/* ---------------- go live ---------------- */

/** What stops the go-live: demo data still in the portal. */
function goliveBlockers_() {
  var out = [];
  var demoUsers = where_('USERS', function (u) { return isDemoUser_(u); }).length, demoEmp = where_('EMPLOYEES', function (e) { return str_(e.Is_Demo) === 'Y'; }).length;
  if (demoUsers || demoEmp) out.push('امسح البيانات التجريبية الأول (' + demoUsers + ' مستخدم و' + demoEmp + ' موظف تجريبي).');
  return out;
}

/** p = { phrase, note } — owner only; once. */
function goliveStart_(ctx, p) {
  if (ctx.readOnly || realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) < 0) throw userError_('زرار التشغيل الفعلي لمالك النظام بس.');
  if (golive_()) throw userError_('البوابة في التشغيل الفعلي بالفعل من ' + str_(cfg_('GOLIVE_AT', '')).slice(0, 10) + '.');
  if (str_(p.phrase) !== GOLIVE_PHRASE_) throw userError_('اكتب «' + GOLIVE_PHRASE_ + '» بالظبط للتأكيد.');
  var b = goliveBlockers_();
  if (b.length) throw userError_(b.join(' '));
  var at = nowIso_();
  withLock_(function () {
    if (get_('CONFIG', 'GOLIVE_AT')) update_('CONFIG', 'GOLIVE_AT', { Config_Value: at }, ctx.user.User_ID);
    else insert_('CONFIG', { Config_Key: 'GOLIVE_AT', Config_Value: at, Value_Type: 'TEXT', Description: 'Go-live date (set once by the owner)' }, ctx.user.User_ID);
  });
  invalidate_('CONFIG');
  audit_(ctx, { entityType: 'GOLIVE', entityId: 'GOLIVE', action: 'GO_LIVE', newValue: at, reason: str_(p.note).slice(0, 300) });
  // open two-person wipe requests can never run now
  where_('DUAL_REQUESTS', function (d) { return d.Kind === 'WIPE' && d.Status === 'PENDING'; }).forEach(function (d) {
    withLock_(function () { update_('DUAL_REQUESTS', d.Dual_ID, { Status: 'REJECTED', Decided_By: 'SYSTEM', Decided_At: nowIso_(), Comment: 'البوابة دخلت التشغيل الفعلي' }, 'SYSTEM'); });
  });
  notify_(roleHolders_(ROLE.HR_SECTOR).concat(roleHolders_(ROLE.OWNER)).filter(function (u, i, a) { return a.indexOf(u) === i; }),
    'البوابة دخلت التشغيل الفعلي', 'من النهارده البيانات حقيقية: البيانات التجريبية ومسح الحركات اتقفلوا نهائياً.', 'GOLIVE', '', true);
  return { at: at, licence: cfg_('CVAI_ENABLED', false) ? 'افتكر ترخيص نقل البيانات للخارج قبل ما تقرا سير ذاتية حقيقية بالذكاء الاصطناعي.' : '' };
}

/** After go-live, a consultant account no longer opens personal data. */
var CONSULTANT_PERSONAL_ = ['cand.cv', 'cand.app', 'cand.search', 'cand.empSearch', 'photo.get', 'offer.letter', 'offer.file', 'doc.file',
  'int.file', 'emp.get', 'privacy.find', 'dsr.list', 'pool.list', 'pool.suggest'];

/* ---------------- backups ---------------- */

var BACKUP_DAYS_ = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function backupLog_() { var a = []; try { a = JSON.parse(PropertiesService.getScriptProperties().getProperty('BACKUP_LOG') || '[]') || []; } catch (e) { a = []; } return a; }
function backupLogPut_(a) { PropertiesService.getScriptProperties().setProperty('BACKUP_LOG', JSON.stringify(a.slice(-30))); }

/** Daily step: on BACKUP_WEEKDAY, copy every spreadsheet into a dated folder (once a day); bin the folders past the keep. */
function backupDaily_(force) {
  var day = today_(), wd = str_(cfg_('BACKUP_WEEKDAY', 'FRI')).toUpperCase();
  var log = backupLog_();
  if (!force) {
    if (BACKUP_DAYS_[wd] === undefined) return 'off';
    if (new Date(ymdMs_(day)).getUTCDay() !== BACKUP_DAYS_[wd]) return 'not today';
  }
  if (log.some(function (x) { return x.date === day; })) return 'done';
  var props = PropertiesService.getScriptProperties(), root = null, folder = null, copies = 0;
  try {
    var rid = props.getProperty('BACKUP_FOLDER_ID');
    if (rid) { try { root = DriveApp.getFolderById(rid); } catch (e) { root = null; } }
    if (!root) { root = getOrCreateFolder_().createFolder('Kandil Recruitment — Backups'); props.setProperty('BACKUP_FOLDER_ID', root.getId()); }
    folder = root.createFolder(day);
  } catch (e) { console.warn('backup folder: ' + e); return 'no folder'; }
  Object.keys(SS_PROP).forEach(function (g) {
    var id = props.getProperty(SS_PROP[g]); if (!id) return;
    try { DriveApp.getFileById(id).makeCopy(SS_TITLES[g] + ' — ' + day, folder); copies++; } catch (e) { console.warn('backup ' + g + ': ' + e); }
  });
  log.push({ date: day, folder: folder.getId(), copies: copies });
  // keep BACKUP_KEEP_WEEKS weeks
  var keepFrom = addDaysYmd_(day, -7 * num_(cfg_('BACKUP_KEEP_WEEKS', 8), 8));
  var kept = [];
  log.forEach(function (x) {
    if (x.date >= keepFrom) { kept.push(x); return; }
    try { DriveApp.getFolderById(x.folder).setTrashed(true); } catch (e) { console.warn('backup bin: ' + e); }
  });
  backupLogPut_(kept);
  return copies + ' copies';
}

/** The quarterly restore test: the owner records it (date + note). */
function restoreTestRecord_(ctx, p) {
  if (ctx.readOnly || realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) < 0) throw userError_('تجربة الاسترجاع بيسجلها مالك النظام.');
  var note = str_(p.note);
  if (note.length < 5) throw userError_('اكتب إيه اللي اترجع واتأكدت منه (مثلاً: رجّعت نسخة الأسبوع اللي فات وفتحت الطلبات).');
  withLock_(function () {
    if (get_('CONFIG', 'RESTORE_TEST_LAST')) update_('CONFIG', 'RESTORE_TEST_LAST', { Config_Value: today_() }, ctx.user.User_ID);
    else insert_('CONFIG', { Config_Key: 'RESTORE_TEST_LAST', Config_Value: today_(), Value_Type: 'TEXT', Description: 'Date of the last restore test' }, ctx.user.User_ID);
  });
  invalidate_('CONFIG');
  audit_(ctx, { entityType: 'BACKUP', entityId: today_(), action: 'RESTORE_TESTED', reason: note });
  return { last: today_() };
}

/** For the readiness screen. */
function opsStatus_() {
  var log = backupLog_(), last = log.length ? log[log.length - 1] : null;
  var props = PropertiesService.getScriptProperties();
  var keyAt = str_(props.getProperty('CVAI_KEY_SET_AT')), keyDays = keyAt ? Math.round((ymdMs_(today_()) - ymdMs_(keyAt)) / 864e5) : null;
  return { backupLast: last ? last.date : '', backupCopies: last ? last.copies : 0, backups: log.length,
    restoreLast: str_(cfg_('RESTORE_TEST_LAST', '')), keyAt: keyAt, keyDays: keyDays, keyLimit: num_(cfg_('CVAI_KEY_ROTATE_DAYS', 180), 180),
    hasKey: !!cvaiKey_(), golive: str_(cfg_('GOLIVE_AT', '')), dpo: dpoUser_() };
}

/** Daily: remind the owner of an old key (once a month) and of a restore test older than 92 days (once a month). */
function opsReminders_() {
  var props = PropertiesService.getScriptProperties(), st = opsStatus_(), month = today_().slice(0, 7), out = [];
  if (st.hasKey && st.keyDays !== null && st.keyDays >= st.keyLimit && props.getProperty('KEY_ROTATE_ASKED') !== month) {
    props.setProperty('KEY_ROTATE_ASKED', month);
    notify_(roleHolders_(ROLE.OWNER), 'غيّر مفتاح الذكاء الاصطناعي', 'المفتاح الحالي عمره ' + st.keyDays + ' يوم — اعمل مفتاح جديد من Anthropic Console واحفظه في «قراءة السير الذاتية»، وامسح القديم.', 'CONFIG', '', true);
    out.push('key');
  }
  var restoreOld = !st.restoreLast || st.restoreLast < addDaysYmd_(today_(), -92);
  if (st.backups && restoreOld && props.getProperty('RESTORE_ASKED') !== month) {
    props.setProperty('RESTORE_ASKED', month);
    notify_(roleHolders_(ROLE.OWNER), 'تجربة استرجاع نسخة احتياطية', 'كل 3 شهور: رجّع نسخة من فولدر Backups في مكان تجريبي، اتأكد إنها بتفتح، وسجّل التجربة في «جاهزية التشغيل».', 'GOLIVE', '', true);
    out.push('restore');
  }
  return out.join(',') || 'none';
}

/* ---------------- the incident log ---------------- */

var INC_ST_ = { OPEN: 'مستني قرار', NOTIFY: 'لازم يتبلغ الجهاز', NO_NOTIFY: 'مش محتاج تبليغ', NOTIFIED: 'اتبلغ الجهاز', CLOSED: 'اتقفل' };

function incCanReport_(ctx) { return !ctx.readOnly && (hasAnyRole_(ctx, opsRoles_()) || isDpo_(ctx)); }
function incCanDecide_(ctx) { return !ctx.readOnly && (dpoUser_() ? isDpo_(ctx) : realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) >= 0); }

/** p = { Detected_At (YYYY-MM-DDTHH:MM), Description, Data_Affected, People_Count } */
function incidentReport_(ctx, p) {
  if (!incCanReport_(ctx)) throw userError_('تسجيل الحوادث لمالك النظام ومدير قطاع الموارد البشرية ومسؤول حماية البيانات.');
  var desc = str_(p.Description), data = str_(p.Data_Affected), det = str_(p.Detected_At).replace(' ', 'T');
  if (desc.length < 10) throw userError_('اوصف اللي حصل (إيه، إمتى، إزاي اكتشفته).');
  if (data.length < 3) throw userError_('اكتب البيانات اللي اتأثرت (مثلاً: أسماء وموبايلات مرشحين).');
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(det)) throw userError_('حدد وقت اكتشاف الحادثة.');
  if (det.length === 10) det += 'T00:00';
  if (det.slice(0, 16) > nowIso_().slice(0, 16)) throw userError_('وقت الاكتشاف بعد دلوقتي.');
  var row;
  withLock_(function () {
    row = insert_('INCIDENTS', { Incident_ID: nextId_('INCIDENT'), Detected_At: det.slice(0, 16) + ':00', Reported_By: ctx.user.User_ID, Description: desc.slice(0, 2000),
      Data_Affected: data.slice(0, 500), People_Count: String(Math.max(0, Math.round(num_(p.People_Count, 0)))), Status: 'OPEN', Decision: '', Decision_Reason: '',
      Decided_By: '', Decided_At: '', Regulator_Notified_At: '', Actions: '', Closed_At: '', Reminded: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'INCIDENT', entityId: row.Incident_ID, action: 'REPORTED', reason: desc.slice(0, 200) });
  var to = roleHolders_(ROLE.HR_SECTOR).concat(roleHolders_(ROLE.OWNER)); if (dpoUser_()) to.push(dpoUser_());
  notify_(to.filter(function (u, i, a) { return a.indexOf(u) === i && u !== ctx.user.User_ID; }), 'حادثة بيانات شخصية اتسجلت',
    row.Incident_ID + ': ' + desc.slice(0, 160) + ' — القرار خلال 72 ساعة من الاكتشاف.', 'INCIDENT', row.Incident_ID, true);
  return incView_(row, userNames_());
}

function incDeadline_(i) { return new Date(Date.parse(i.Detected_At.slice(0, 19) + 'Z') + 72 * 3600000).toISOString().slice(0, 16); }
function incView_(i, names) {
  var dl = incDeadline_(i), left = Math.round((Date.parse(dl + ':00Z') - Date.parse(nowIso_().slice(0, 19) + 'Z')) / 3600000);
  return { id: i.Incident_ID, detected: i.Detected_At.slice(0, 16), by: names[i.Reported_By] || i.Reported_By, description: i.Description, data: i.Data_Affected,
    people: i.People_Count, status: i.Status, statusName: INC_ST_[i.Status] || i.Status, decision: i.Decision, reason: i.Decision_Reason,
    decidedBy: names[i.Decided_By] || i.Decided_By, decidedAt: i.Decided_At, notifiedAt: i.Regulator_Notified_At, actions: i.Actions, closedAt: i.Closed_At,
    deadline: dl, hoursLeft: i.Status === 'OPEN' ? left : null };
}

function incidentList_(ctx) {
  if (!incCanReport_(ctx) && !(ctx.readOnly && hasAnyRole_(ctx, opsRoles_()))) throw userError_('سجل الحوادث لمالك النظام ومدير قطاع الموارد البشرية ومسؤول حماية البيانات.');
  var names = userNames_();
  return { items: all_('INCIDENTS').slice().sort(function (a, b) { return a.Incident_ID < b.Incident_ID ? 1 : -1; }).map(function (i) { return incView_(i, names); }),
    canReport: incCanReport_(ctx), canDecide: incCanDecide_(ctx), dpo: dpoUser_() ? names[dpoUser_()] : '' };
}

/**
 * The DPO's steps. p = { Incident_ID, op: DECIDE | NOTIFIED | CLOSE, decision: NOTIFY | NO_NOTIFY, reason, at, actions }
 */
function incidentUpdate_(ctx, p) {
  if (!incCanDecide_(ctx)) throw userError_('القرار لمسؤول حماية البيانات' + (dpoUser_() ? '' : ' (ولحد ما يتعيّن: مالك النظام)') + '.');
  var i = get_('INCIDENTS', str_(p.Incident_ID));
  if (!i) throw userError_('الحادثة غير موجودة.');
  var op = str_(p.op), patch = {}, reason = str_(p.reason);
  if (op === 'DECIDE') {
    if (i.Status !== 'OPEN') throw userError_('الحادثة دي اتاخد فيها قرار.');
    var d = str_(p.decision);
    if (['NOTIFY', 'NO_NOTIFY'].indexOf(d) < 0) throw userError_('اختار: يتبلغ الجهاز أو لأ.');
    if (reason.length < 10) throw userError_('اكتب سبب القرار.');
    patch = { Status: d, Decision: d, Decision_Reason: reason.slice(0, 1000), Decided_By: ctx.user.User_ID, Decided_At: nowIso_() };
  } else if (op === 'NOTIFIED') {
    if (i.Status !== 'NOTIFY') throw userError_('التبليغ بيتسجل بعد قرار «يتبلغ الجهاز».');
    var at = str_(p.at).replace(' ', 'T'); if (!/^\d{4}-\d{2}-\d{2}/.test(at)) at = nowIso_();
    patch = { Status: 'NOTIFIED', Regulator_Notified_At: at.length === 10 ? at + 'T00:00:00' : at.slice(0, 16) + ':00' };
  } else if (op === 'CLOSE') {
    if (['NO_NOTIFY', 'NOTIFIED'].indexOf(i.Status) < 0) throw userError_('الحادثة بتتقفل بعد القرار (وبعد التبليغ لو مطلوب).');
    if (str_(p.actions).length < 5) throw userError_('اكتب اللي اتعمل عشان ماتتكررش.');
    patch = { Status: 'CLOSED', Actions: str_(p.actions).slice(0, 1000), Closed_At: nowIso_() };
  } else throw userError_('عملية غير معروفة.');
  withLock_(function () { update_('INCIDENTS', i.Incident_ID, patch, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'INCIDENT', entityId: i.Incident_ID, action: op === 'DECIDE' ? 'DECIDED_' + patch.Decision : op, reason: reason || str_(p.actions) });
  if (op === 'DECIDE') notify_(roleHolders_(ROLE.HR_SECTOR).concat(roleHolders_(ROLE.OWNER)).filter(function (u, k, a) { return a.indexOf(u) === k && u !== ctx.user.User_ID; }),
    'قرار في حادثة ' + i.Incident_ID, INC_ST_[patch.Decision] + ' — ' + reason.slice(0, 200), 'INCIDENT', i.Incident_ID, true);
  return incView_(get_('INCIDENTS', i.Incident_ID), userNames_());
}

/** Daily: an open incident 48 hours after detection → remind the DPO (or the owner) and the HR Sector Manager, once. */
function incidentDaily_() {
  var n = 0, lim = addMinutesIso_(-48 * 60).slice(0, 16);
  where_('INCIDENTS', function (i) { return i.Status === 'OPEN' && !i.Reminded && i.Detected_At.slice(0, 16) <= lim; }).forEach(function (i) {
    var to = (dpoUser_() ? [dpoUser_()] : roleHolders_(ROLE.OWNER)).concat(roleHolders_(ROLE.HR_SECTOR));
    notify_(to.filter(function (u, k, a) { return a.indexOf(u) === k; }), 'حادثة بيانات من غير قرار — فاضل أقل من 24 ساعة',
      i.Incident_ID + ': القرار (تبليغ الجهاز أو لأ) لازم يتاخد خلال 72 ساعة من الاكتشاف (' + incDeadline_(i).replace('T', ' ') + ').', 'INCIDENT', i.Incident_ID, true);
    withLock_(function () { update_('INCIDENTS', i.Incident_ID, { Reminded: nowIso_() }, 'SYSTEM'); });
    n++;
  });
  return n;
}

/** Home count for whoever decides. */
function incidentTodo_(ctx) {
  if (!incCanDecide_(ctx)) return 0;
  return where_('INCIDENTS', function (i) { return i.Status === 'OPEN' || i.Status === 'NOTIFY'; }).length;
}
