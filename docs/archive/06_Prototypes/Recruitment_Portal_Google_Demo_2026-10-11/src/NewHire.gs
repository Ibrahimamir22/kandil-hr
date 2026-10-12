/**
 * NewHire.gs — v0.18.0 (phase 6B): welcome gift, social-insurance tracking, New Hire Voice surveys.
 *
 * Social insurance (INSURANCE_CASES): one case per new hire, opened when he joins.
 *   Start date by INSURANCE_START_RULE: DAY_ONE (default) | NEXT_MONTH | DOCS_COMPLETE (set when the documents receipt is issued).
 *   TO_SUBMIT → SUBMITTED (date + request ref) → REGISTERED (insurance number + date); NOT_INSURED for no-insurance contracts.
 *   Late = not submitted INSURANCE_SUBMIT_DAYS days after the start date. HR team only.
 * New Hire Voice (NHV_SURVEYS): a short survey NHV_DAYS after joining (7 and 30), answered on a private link (no login).
 *   Answers visible to the HR team only; any score ≤ NHV_ALERT_SCORE alerts the HR site specialist and HR managers.
 */

var INS_ST_ = { TO_SUBMIT: 'لسه ماتقدمش', SUBMITTED: 'اتقدم — مستني التسجيل', REGISTERED: 'اتسجل', NOT_INSURED: 'بدون تأمينات', WAIT_DOCS: 'مستني اكتمال المسوغات' };
var NHV_DEFAULT_Q_ = [
  { id: 'Q1', axis: 'JOB', ar: 'الشغل الفعلي زي ما اتقالك في المقابلة والعرض؟', en: 'Is the actual job what you were told in the interview and the offer?' },
  { id: 'Q2', axis: 'WELCOME', ar: 'استقبالك وأول يوم كانوا منظمين؟', en: 'Were your welcome and first day well organised?' },
  { id: 'Q3', axis: 'MANAGER', ar: 'مديرك المباشر واضح معاك في المطلوب منك؟', en: 'Is your direct manager clear about what is expected of you?' },
  { id: 'Q4', axis: 'TEAM', ar: 'زمايلك والـ Buddy ساعدوك تتأقلم؟', en: 'Did your colleagues and your buddy help you settle in?' },
  { id: 'Q5', axis: 'STAY', ar: 'مرتاح في قنديل ومكمّل معانا؟', en: 'Are you comfortable at Kandil and planning to stay?' }
];
// v0.41.0 (CHG-86): every question belongs to an axis; the report shows the axes (job as promised, welcome, manager,
// team, intention to stay), each the average of its questions — with the same small-group rule as the questions
var NHV_AXES_ = { JOB: 'الوظيفة زي ما اتوعد', WELCOME: 'الاستقبال وأول يوم', MANAGER: 'المدير المباشر', TEAM: 'الزملاء والاندماج', STAY: 'الرغبة في الاستمرار', OTHER: 'أخرى' };

function insRoles_() { return HR_ALL_ROLES.slice(); }
function nhvRoles_() { return HR_ALL_ROLES.concat([ROLE.REC_MANAGER]); }

/* ================= welcome gift ================= */

function welcomeGifts_() {
  var v = cfg_('WELCOME_GIFTS', '[]'), arr = [];
  try { arr = JSON.parse(str_(v) || '[]'); } catch (e) { arr = []; }
  return Array.isArray(arr) ? arr.map(str_).filter(Boolean) : [];
}

/** p = { Onboarding_ID, item, date, note, signed: 'Y', clear } */
function giftSave_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID);
  var d = onbDetail_(ctx, p);
  if (!d.canManage) throw userError_('تسجيل الهدية لفريق الموارد البشرية والمدير والمشرف.');
  if (p.clear) {
    if (!onbIsAdmin_(ctx)) throw userError_('إلغاء تسجيل الهدية لفريق الموارد البشرية بس.');
    withLock_(function () { update_('ONBOARDINGS', o.Onboarding_ID, { Gift_Item: '', Gift_At: '', Gift_By: '', Gift_Signed: '', Gift_Note: '' }, ctx.user.User_ID); });
    event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'GIFT_CLEARED', str_(p.note));
    return { ok: true };
  }
  var item = str_(p.item).slice(0, 120), date = str_(p.date) || today_();
  if (item.length < 2) throw userError_('اختار الهدية أو اكتبها.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('تاريخ التسليم غير صحيح.');
  if (date > today_()) throw userError_('تاريخ التسليم مايبقاش في المستقبل.');
  withLock_(function () {
    update_('ONBOARDINGS', o.Onboarding_ID, { Gift_Item: item, Gift_At: date, Gift_By: ctx.user.User_ID, Gift_Signed: str_(p.signed) === 'Y' ? 'Y' : 'N',
      Gift_Note: str_(p.note).slice(0, 200) }, ctx.user.User_ID);
  });
  event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'GIFT', item + ' · ' + date);
  return { ok: true };
}

/* ================= social insurance ================= */

function insRule_() { var r = str_(cfg_('INSURANCE_START_RULE', 'DAY_ONE')); return ['DAY_ONE', 'NEXT_MONTH', 'DOCS_COMPLETE'].indexOf(r) >= 0 ? r : 'DAY_ONE'; }
function insOffices_() {
  var arr = []; try { arr = JSON.parse(str_(cfg_('INSURANCE_OFFICES', '[]')) || '[]'); } catch (e) { arr = []; }
  return Array.isArray(arr) ? arr.map(str_).filter(Boolean) : [];
}
function firstOfNextMonth_(ymd) {
  var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) + 1; if (m > 12) { m = 1; y++; }
  return y + '-' + ('0' + m).slice(-2) + '-01';
}
/** Start date by the rule ('' while waiting for the documents). */
function insStartFor_(rule, joined, j) {
  if (rule === 'NEXT_MONTH') return joined.slice(8, 10) === '01' ? joined : firstOfNextMonth_(joined);
  if (rule === 'DOCS_COMPLETE') return j && j.Receipt_At ? (str_(j.Receipt_At).slice(0, 10) > joined ? str_(j.Receipt_At).slice(0, 10) : joined) : '';
  return joined;
}
function insDue_(start) { return start ? addDaysYmd_(start, num_(cfg_('INSURANCE_SUBMIT_DAYS', 7), 7)) : ''; }

/** Hook: the new hire joined → open his insurance case once. */
function insOnJoined_(actor, j, vac, jd, empId, name) {
  if (findOne_('INSURANCE_CASES', { Joining_ID: j.Joining_ID })) return null;
  var noIns = j.No_Insurance === 'Y', rule = insRule_();
  var loc = vac && vac.Location_ID ? get_('LOCATIONS', vac.Location_ID) : null;
  var start = noIns ? '' : insStartFor_(rule, jd, get_('JOININGS', j.Joining_ID) || j);
  var c;
  withLock_(function () {
    c = insert_('INSURANCE_CASES', { Case_ID: nextId_('INS_CASE'), Joining_ID: j.Joining_ID, Employee_ID: str_(empId), Person_ID: j.Person_ID, Full_Name: name || '',
      Location_ID: vac ? vac.Location_ID : '', Office: loc ? str_(loc.Insurance_Office) : '', Rule: rule, Joined_Date: jd, Start_Date: start,
      Due_Date: insDue_(start), Status: noIns ? 'NOT_INSURED' : (start ? 'TO_SUBMIT' : 'WAIT_DOCS'), Submitted_At: '', Submit_Ref: '', Registered_At: '',
      Insurance_No: '', Note: '', Updated_Note: '', Reminded_At: '' }, actor);
  });
  return c;
}
/** Hook: documents receipt issued → a DOCS_COMPLETE case gets its start date. */
function insOnReceipt_(actor, j) {
  var c = findOne_('INSURANCE_CASES', { Joining_ID: j.Joining_ID });
  if (!c || c.Status !== 'WAIT_DOCS') return;
  var start = insStartFor_('DOCS_COMPLETE', c.Joined_Date, j);
  withLock_(function () { update_('INSURANCE_CASES', c.Case_ID, { Start_Date: start, Due_Date: insDue_(start), Status: 'TO_SUBMIT' }, actor); });
}

function insView_(c, names, today) {
  var loc = c.Location_ID ? get_('LOCATIONS', c.Location_ID) : null;
  return { id: c.Case_ID, name: c.Full_Name, employeeId: c.Employee_ID, joiningId: c.Joining_ID, location: loc ? loc.Name_AR : '', office: c.Office,
    rule: c.Rule, joined: c.Joined_Date, start: c.Start_Date, due: c.Due_Date, status: c.Status, statusName: INS_ST_[c.Status] || c.Status,
    submittedAt: c.Submitted_At, ref: c.Submit_Ref, registeredAt: c.Registered_At, number: c.Insurance_No, note: c.Note,
    startRequest: c.Start_Request, startRequestReason: c.Start_Request_Reason, startRequestBy: names[c.Start_Request_By] || '',
    late: c.Status === 'TO_SUBMIT' && c.Due_Date && c.Due_Date < today, by: names[c.Updated_By] || names[c.Created_By] || '' };
}

/** p.tab = open | late | done | all */
function insList_(ctx, p) {
  var tab = str_(p.tab) || 'open', t = today_(), names = userNames_();
  var rows = all_('INSURANCE_CASES').map(function (c) { return insView_(c, names, t); }).filter(function (c) {
    if (tab === 'late') return c.late;
    if (tab === 'open') return ['TO_SUBMIT', 'SUBMITTED', 'WAIT_DOCS'].indexOf(c.status) >= 0;
    if (tab === 'done') return ['REGISTERED', 'NOT_INSURED'].indexOf(c.status) >= 0;
    return true;
  }).sort(function (a, b) { return (a.due || a.joined) < (b.due || b.joined) ? -1 : 1; });
  var all = all_('INSURANCE_CASES');
  return { tab: tab, rows: rows, offices: insOffices_(), rule: insRule_(),
    counts: { open: all.filter(function (c) { return ['TO_SUBMIT', 'SUBMITTED', 'WAIT_DOCS'].indexOf(c.Status) >= 0; }).length,
      late: all.filter(function (c) { return c.Status === 'TO_SUBMIT' && c.Due_Date && c.Due_Date < t; }).length },
    canEdit: !ctx.readOnly };
}

/** p = { Case_ID, action: SUBMIT | REGISTER | OFFICE | START | REOPEN | NOTE, date, ref, number, office, note, reason } */
function insAction_(ctx, p) {
  var c = get_('INSURANCE_CASES', str_(p.Case_ID));
  if (!c) throw userError_('ملف التأمينات غير موجود.');
  var act = str_(p.action), date = str_(p.date) || today_(), patch = {}, me = ctx.user.User_ID;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('التاريخ غير صحيح.');
  if (act === 'SUBMIT') {
    if (c.Status !== 'TO_SUBMIT') throw userError_('الملف مش في مرحلة التقديم.');
    if (date > today_()) throw userError_('تاريخ التقديم مايبقاش في المستقبل.');
    if (!c.Office && !str_(p.office)) throw userError_('حدد مكتب التأمينات.');
    patch = { Status: 'SUBMITTED', Submitted_At: date, Submit_Ref: str_(p.ref).slice(0, 60) };
    if (str_(p.office)) patch.Office = str_(p.office).slice(0, 80);
  } else if (act === 'REGISTER') {
    if (['SUBMITTED', 'TO_SUBMIT'].indexOf(c.Status) < 0) throw userError_('سجّل التقديم الأول.');
    var no = latinDigits_(p.number).replace(/\s+/g, '');
    if (!/^\d{5,15}$/.test(no)) throw userError_('اكتب الرقم التأميني (أرقام بس).');
    if (date > today_()) throw userError_('تاريخ التسجيل مايبقاش في المستقبل.');
    var dup = where_('INSURANCE_CASES', function (x) { return x.Insurance_No === no && x.Case_ID !== c.Case_ID; })[0];
    if (dup) throw userError_('الرقم التأميني ده متسجل لـ ' + dup.Full_Name + '.');
    patch = { Status: 'REGISTERED', Registered_At: date, Insurance_No: no };
    if (c.Status === 'TO_SUBMIT') { patch.Submitted_At = c.Submitted_At || date; }
  } else if (act === 'OFFICE') {
    var off = str_(p.office).slice(0, 80);
    if (!off) throw userError_('اختار مكتب التأمينات.');
    patch = { Office: off };
  } else if (act === 'START') {
    if (['TO_SUBMIT', 'WAIT_DOCS'].indexOf(c.Status) < 0) throw userError_('تاريخ البداية بيتغير قبل التقديم بس.');
    if (str_(p.reason).length < 3) throw userError_('اكتب سبب تغيير تاريخ بداية التأمين.');
    if (date < c.Joined_Date) throw userError_('تاريخ بداية التأمين مايبقاش قبل الاستلام (' + c.Joined_Date + ').');
    // v0.38.0 (CHG-80): the insurance starts on the first working day — any other date is an exception approved by the HR Sector Manager
    if (date !== c.Joined_Date && !hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR])) {
      if (str_(p.reason).length < 10) throw userError_('اكتب سبب الاستثناء بالتفصيل (التأمين من أول يوم شغل).');
      patch = { Start_Request: date, Start_Request_Reason: str_(p.reason).slice(0, 300), Start_Request_By: me };
      notify_(roleHolders_(ROLE.HR_SECTOR), 'استثناء في بداية التأمين محتاج موافقتك', c.Full_Name + ': من ' + date + ' بدل ' + c.Joined_Date + ' — ' + str_(p.reason).slice(0, 160), 'INSURANCE', c.Case_ID, true);
    } else {
      patch = { Start_Date: date, Due_Date: insDue_(date), Status: 'TO_SUBMIT', Start_Request: '', Start_Request_Reason: '', Start_Request_By: '',
        Note: (c.Note ? c.Note + ' | ' : '') + 'بداية ' + date + (date !== c.Joined_Date ? ' (استثناء بموافقة ' + ctx.user.Full_Name_AR + ')' : '') + ': ' + str_(p.reason).slice(0, 120) };
    }
  } else if (act === 'APPROVE_START' || act === 'REJECT_START') {
    if (!hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]) || ctx.readOnly) throw userError_('استثناء بداية التأمين بيعتمده مدير قطاع الموارد البشرية.');
    if (!c.Start_Request) throw userError_('مفيش طلب استثناء.');
    if (c.Start_Request_By === me) throw userError_('اللي طلب الاستثناء مايعتمدوش.');
    if (act === 'REJECT_START' && str_(p.reason).length < 3) throw userError_('اكتب سبب الرفض.');
    patch = act === 'APPROVE_START'
      ? { Start_Date: c.Start_Request, Due_Date: insDue_(c.Start_Request), Status: 'TO_SUBMIT', Start_Request: '', Start_Request_Reason: '', Start_Request_By: '',
          Note: (c.Note ? c.Note + ' | ' : '') + 'بداية ' + c.Start_Request + ' (استثناء بموافقة ' + ctx.user.Full_Name_AR + '): ' + c.Start_Request_Reason.slice(0, 120) }
      : { Start_Request: '', Start_Request_Reason: '', Start_Request_By: '', Note: (c.Note ? c.Note + ' | ' : '') + 'رفض استثناء ' + c.Start_Request + ': ' + str_(p.reason).slice(0, 120) };
    if (c.Start_Request_By) notify_([c.Start_Request_By], act === 'APPROVE_START' ? 'استثناء بداية التأمين اتوافق عليه' : 'استثناء بداية التأمين اترفض', c.Full_Name, 'INSURANCE', c.Case_ID, false);
  } else if (act === 'REOPEN') {
    if (['SUBMITTED', 'REGISTERED'].indexOf(c.Status) < 0) throw userError_('مفيش حاجة ترجع.');
    if (!hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('الرجوع لمديرين الموارد البشرية بس.');
    if (str_(p.reason).length < 3) throw userError_('اكتب السبب.');
    patch = c.Status === 'REGISTERED' ? { Status: 'SUBMITTED', Registered_At: '', Insurance_No: '' } : { Status: 'TO_SUBMIT', Submitted_At: '', Submit_Ref: '' };
    patch.Note = (c.Note ? c.Note + ' | ' : '') + 'رجوع: ' + str_(p.reason).slice(0, 120);
  } else if (act === 'NOTE') {
    patch = { Note: str_(p.note).slice(0, 300) };
  } else throw userError_('عملية غير معروفة.');
  var res;
  withLock_(function () { res = update_('INSURANCE_CASES', c.Case_ID, patch, me); });
  auditDiff_(ctx, 'INSURANCE', c.Case_ID, res.before, res.after, str_(p.reason));
  return insView_(res.after, userNames_(), today_());
}

/** The case of one joining (for the employee file / onboarding page). HR only; null otherwise. */
function insOf_(ctx, joiningId) {
  if (!joiningId || !hasAnyRole_(ctx, insRoles_())) return null;
  var c = findOne_('INSURANCE_CASES', { Joining_ID: joiningId });
  return c ? insView_(c, userNames_(), today_()) : null;
}

function insTodo_(ctx) {
  if (!hasAnyRole_(ctx, insRoles_()) || ctx.readOnly) return 0;
  var t = today_();
  return where_('INSURANCE_CASES', function (c) { return c.Status === 'TO_SUBMIT' && c.Due_Date && c.Due_Date < t; }).length;
}

/** Daily: tell the HR managers once about each case that passed its submission date. */
function insDaily_() {
  var t = today_();
  var late = where_('INSURANCE_CASES', function (c) { return c.Status === 'TO_SUBMIT' && c.Due_Date && c.Due_Date < t && !c.Reminded_At; });
  if (!late.length) return { late: 0 };
  withLock_(function () { late.forEach(function (c) { update_('INSURANCE_CASES', c.Case_ID, { Reminded_At: nowIso_() }, 'SYSTEM'); }); });
  var to = roleHolders_(ROLE.HR_MANAGER);
  late.forEach(function (c) { var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === c.Joining_ID; })[0]; if (o && o.HR_Site_User_ID) to.push(o.HR_Site_User_ID); });
  notify_(to, 'تأمينات متأخرة (' + late.length + ')', late.slice(0, 4).map(function (c) { return c.Full_Name + ' — من ' + c.Start_Date; }).join(' · '), 'INSURANCE', '', false);
  return { late: late.length };
}

/* ================= New Hire Voice ================= */

function nhvQuestions_() {
  var arr = null; try { arr = JSON.parse(str_(cfg_('NHV_QUESTIONS', '')) || 'null'); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || !arr.length) arr = NHV_DEFAULT_Q_;
  var def = {}; NHV_DEFAULT_Q_.forEach(function (q) { def[q.id] = q.axis; });
  return arr.filter(function (q) { return q && str_(q.id) && str_(q.ar); }).slice(0, 12).map(function (q) {
    var ax = str_(q.axis).toUpperCase() || def[q.id] || 'OTHER';
    return { id: q.id, ar: q.ar, en: q.en, axis: NHV_AXES_[ax] ? ax : 'OTHER' };
  });
}
function nhvDays_() {
  return str_(cfg_('NHV_DAYS', '7,30')).split(/[\s,]+/).map(Number).filter(function (n) { return n > 0 && n <= 180; }).slice(0, 4);
}

/** Hook: joined → schedule one survey per NHV_DAYS entry. */
function nhvSchedule_(actor, j, empId, name, jd) {
  if (!cfg_('NHV_ENABLED', true)) return 0;
  if (find_('NHV_SURVEYS', { Joining_ID: j.Joining_ID }).length) return 0;
  var days = nhvDays_(); if (!days.length) return 0;
  withLock_(function () {
    var ids = nextIds_('NHV', days.length);
    insertMany_('NHV_SURVEYS', days.map(function (d, i) {
      return { Survey_ID: ids[i], Joining_ID: j.Joining_ID, Employee_ID: str_(empId), Person_ID: j.Person_ID, Full_Name: name || '', Round_Day: String(d),
        Due_Date: addDaysYmd_(jd, d), Status: 'SCHEDULED', Token_Hash: '', Token_Until: '', Sent_At: '', Sent_Via: '', Answered_At: '',
        Answers_JSON: '', Comment: '', Min_Score: '', Avg_Score: '', Lang: '', Reviewed_By: '', Reviewed_At: '', Review_Note: '' };
    }), actor);
  });
  return days.length;
}

function nhvToken_(actor, s) {
  var token = randomToken_(), until = addDaysYmd_(today_(), num_(cfg_('NHV_LINK_DAYS', 7), 7));
  withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Token_Hash: hash_('NHV:' + token), Token_Until: until, Status: s.Status === 'SCHEDULED' ? 'READY' : s.Status }, actor); });
  return { link: ScriptApp.getService().getUrl() + '?voice=' + token, until: until };
}
function nhvSiteOf_(s) {
  var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === s.Joining_ID; })[0];
  return o ? (o.HR_Site_User_ID || o.Recruiter_User_ID) : '';
}

/** Daily: due surveys → link emailed when the person has an email, else the HR site specialist is asked to send it. */
function nhvDaily_() {
  if (!cfg_('NHV_ENABLED', true)) return { sent: 0 };
  var t = today_(), out = { emailed: 0, asked: 0, expired: 0 };
  where_('NHV_SURVEYS', function (s) { return s.Status === 'SENT' && s.Token_Until && s.Token_Until < t; }).forEach(function (s) {
    withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Status: 'EXPIRED' }, 'SYSTEM'); }); out.expired++;
  });
  where_('NHV_SURVEYS', function (s) { return s.Status === 'SCHEDULED' && s.Due_Date <= t; }).forEach(function (s) {
    var per = get_('PERSONS', s.Person_ID) || {}, email = str_(per.Email);
    var tk = nhvToken_('SYSTEM', s), lang = per.Language === 'en' ? 'en' : 'ar';
    if (email && mailOk_('CANDIDATE')) {
      try {
        sendMail_({ to: email, name: 'Kandil Egypt HR', subject: tr_('رأيك يهمنا — أول ' + s.Round_Day + ' يوم في قنديل مصر', lang),
          htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8">' +
            escHtml_(tr_('أهلاً ' + str_(per.Full_Name).split(' ')[0] + '،', lang)) + '<br>' +
            tr_('عدّى ' + s.Round_Day + ' يوم على انضمامك لقنديل مصر. جاوب على 5 أسئلة قصيرة (دقيقتين) عشان نعرف رأيك ونحسّن تجربة الموظفين الجداد. ردك بيوصل لفريق الموارد البشرية بس.', lang) +
            '<br><a href="' + tk.link + '">' + tr_('افتح الاستبيان', lang) + '</a></div>' });
        mailSent_();
        withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Status: 'SENT', Sent_At: nowIso_(), Sent_Via: 'EMAIL' }, 'SYSTEM'); });
        out.emailed++;
        return;
      } catch (e) { console.warn('nhv mail: ' + e); }
    }
    var site = nhvSiteOf_(s);
    if (site) notify_([site], 'استبيان موظف جديد جاهز — ' + s.Full_Name, 'أول ' + s.Round_Day + ' يوم. افتح «التهيئة» ← «صوت الموظف الجديد» وابعتله اللينك واتساب.', 'NHV', s.Survey_ID, false);
    out.asked++;
  });
  return out;
}

function nhvView_(s, names, full) {
  var x = { id: s.Survey_ID, name: s.Full_Name, employeeId: s.Employee_ID, day: num_(s.Round_Day, 0), due: s.Due_Date, status: s.Status,
    sentAt: s.Sent_At, via: s.Sent_Via, answeredAt: s.Answered_At, min: s.Min_Score === '' ? null : num_(s.Min_Score, 0), avg: s.Avg_Score === '' ? null : num_(s.Avg_Score, 0),
    reviewed: !!s.Reviewed_At, reviewedBy: names[s.Reviewed_By] || '', reviewNote: s.Review_Note, linkActive: !!(s.Token_Hash && s.Token_Until >= today_() && s.Status !== 'ANSWERED') };
  if (full) { try { x.answers = JSON.parse(s.Answers_JSON || '{}'); } catch (e) { x.answers = {}; } x.comment = s.Comment; }
  var o = where_('ONBOARDINGS', function (q) { return q.Joining_ID === s.Joining_ID; })[0];
  x.onb = o ? o.Onboarding_ID : '';
  return x;
}

/** p.tab = todo (ready / to send) | answered | all */
function nhvList_(ctx, p) {
  var tab = str_(p.tab) || 'todo', names = userNames_(), qs = nhvQuestions_(), alert = num_(cfg_('NHV_ALERT_SCORE', 2), 2);
  var all = all_('NHV_SURVEYS');
  var rows = all.filter(function (s) {
    if (tab === 'todo') return ['READY', 'SENT'].indexOf(s.Status) >= 0 || (s.Status === 'SCHEDULED' && s.Due_Date <= today_());
    if (tab === 'answered') return s.Status === 'ANSWERED';
    return true;
  }).map(function (s) { return nhvView_(s, names, tab === 'answered'); })
    .sort(function (a, b) { return (b.answeredAt || b.due) < (a.answeredAt || a.due) ? -1 : 1; });
  // averages per question and round
  var stats = {};
  all.filter(function (s) { return s.Status === 'ANSWERED'; }).forEach(function (s) {
    var a = {}; try { a = JSON.parse(s.Answers_JSON || '{}'); } catch (e) {}
    var r = stats[s.Round_Day] = stats[s.Round_Day] || { n: 0, q: {}, ax: {} };
    r.n++;
    qs.forEach(function (q) { var v = num_(a[q.id], 0); if (v) {
      var e = r.q[q.id] = r.q[q.id] || { sum: 0, n: 0 }; e.sum += v; e.n++;
      var x = r.ax[q.axis] = r.ax[q.axis] || { sum: 0, n: 0, people: {} }; x.sum += v; x.n++; x.people[s.Survey_ID] = 1;
    } });
  });
  // v0.38.0 (CHG-81): averages only for groups with SURVEY_MIN_ANSWERS answers or more (a small group would point at people)
  var minN = surveyMin_();
  Object.keys(stats).forEach(function (d) {
    if (stats[d].n < minN) { stats[d] = { n: stats[d].n, q: {}, ax: {}, hidden: true }; return; }
    Object.keys(stats[d].q).forEach(function (k) { var e = stats[d].q[k]; if (e.n < minN) { delete stats[d].q[k]; return; } e.avg = Math.round(e.sum / e.n * 10) / 10; delete e.sum; });
    Object.keys(stats[d].ax).forEach(function (k) { var e = stats[d].ax[k], people = Object.keys(e.people).length;
      if (people < minN) { delete stats[d].ax[k]; return; } stats[d].ax[k] = { avg: Math.round(e.sum / e.n * 10) / 10, n: people }; });
  });
  return { tab: tab, rows: rows, questions: qs, stats: stats, axes: NHV_AXES_, days: nhvDays_(), alertScore: alert, enabled: !!cfg_('NHV_ENABLED', true), canAct: !ctx.readOnly,
    unreviewedLow: all.filter(function (s) { return s.Status === 'ANSWERED' && s.Min_Score !== '' && num_(s.Min_Score, 5) <= alert && !s.Reviewed_At; }).length };
}

/** p = { Survey_ID, action: LINK | SENT | REVIEW | CANCEL, via, note } */
function nhvAction_(ctx, p) {
  var s = get_('NHV_SURVEYS', str_(p.Survey_ID));
  if (!s) throw userError_('الاستبيان غير موجود.');
  var act = str_(p.action), me = ctx.user.User_ID;
  if (act === 'LINK') {
    if (['SCHEDULED', 'READY', 'SENT', 'EXPIRED'].indexOf(s.Status) < 0) throw userError_('الاستبيان ده اتجاوب أو اتلغى.');
    var tk = nhvToken_(me, s);
    audit_(ctx, { entityType: 'NHV', entityId: s.Survey_ID, action: 'LINK', newValue: 'until ' + tk.until });
    return tk;
  }
  if (act === 'SENT') {
    if (['READY', 'EXPIRED'].indexOf(s.Status) < 0 || !s.Token_Hash) throw userError_('اعمل اللينك الأول.');
    var via = ['WHATSAPP', 'SMS', 'EMAIL', 'IN_PERSON'].indexOf(str_(p.via)) >= 0 ? str_(p.via) : 'WHATSAPP';
    withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Status: 'SENT', Sent_At: nowIso_(), Sent_Via: via }, me); });
    return { ok: true };
  }
  if (act === 'REVIEW') {
    if (s.Status !== 'ANSWERED') throw userError_('لسه ماجاوبش.');
    var note = str_(p.note);
    if (note.length < 3) throw userError_('اكتب عملت إيه (مثلاً: قعدت معاه واتحلت المشكلة).');
    withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Reviewed_By: me, Reviewed_At: nowIso_(), Review_Note: note.slice(0, 400) }, me); });
    return { ok: true };
  }
  if (act === 'CANCEL') {
    if (s.Status === 'ANSWERED') throw userError_('الاستبيان اتجاوب.');
    if (str_(p.note).length < 3) throw userError_('اكتب السبب.');
    withLock_(function () { update_('NHV_SURVEYS', s.Survey_ID, { Status: 'CANCELLED', Token_Hash: '', Review_Note: str_(p.note).slice(0, 200) }, me); });
    return { ok: true };
  }
  throw userError_('عملية غير معروفة.');
}

function nhvGet_(ctx, p) {
  var s = get_('NHV_SURVEYS', str_(p.Survey_ID));
  if (!s) throw userError_('الاستبيان غير موجود.');
  var v = nhvView_(s, userNames_(), true);
  v.questions = nhvQuestions_();
  return v;
}

function nhvTodo_(ctx) {
  if (!hasAnyRole_(ctx, nhvRoles_()) || ctx.readOnly) return { send: 0, low: 0 };
  var me = ctx.user.User_ID, alert = num_(cfg_('NHV_ALERT_SCORE', 2), 2), t = today_();
  var send = where_('NHV_SURVEYS', function (s) { return (s.Status === 'READY' || (s.Status === 'SCHEDULED' && s.Due_Date <= t)) && (nhvSiteOf_(s) === me || hasAnyRole_(ctx, HR_ADMIN_ROLES)); }).length;
  var low = where_('NHV_SURVEYS', function (s) { return s.Status === 'ANSWERED' && s.Min_Score !== '' && num_(s.Min_Score, 5) <= alert && !s.Reviewed_At; }).length;
  return { send: send, low: low };
}

/* ---------- the employee's private page ---------- */

function nhvByToken_(token) {
  var t = str_(token);
  if (t.length < 20) throw userError_('اللينك غير صحيح.');
  var s = findOne_('NHV_SURVEYS', { Token_Hash: hash_('NHV:' + t) });
  if (!s || ['CANCELLED'].indexOf(s.Status) >= 0) throw userError_('اللينك ده مش شغال — كلّم الموارد البشرية.');
  if (s.Status !== 'ANSWERED' && s.Token_Until < today_()) throw userError_('اللينك ده انتهى — كلّم الموارد البشرية يبعتولك لينك جديد.');
  return s;
}
function voiceInfo_(p) {
  var s = nhvByToken_(p.token);
  return { name: str_(s.Full_Name).split(' ')[0], day: num_(s.Round_Day, 0), answered: s.Status === 'ANSWERED', questions: nhvQuestions_().map(function (q) { return { id: q.id, ar: q.ar, en: q.en || q.ar }; }) };
}
/** p = { token, answers: {Q1: 1..5}, comment, lang } */
function voiceSubmit_(p) {
  var s = nhvByToken_(p.token);
  if (s.Status === 'ANSWERED') throw userError_('اتسجل ردك قبل كده — شكراً.');
  var qs = nhvQuestions_(), a = p.answers || {}, clean = {}, sum = 0, min = 6;
  qs.forEach(function (q) {
    var v = Number(a[q.id]);
    if (!(v >= 1 && v <= 5) || Math.round(v) !== v) throw userError_('جاوب على كل الأسئلة.');
    clean[q.id] = v; sum += v; min = Math.min(min, v);
  });
  var avg = Math.round(sum / qs.length * 10) / 10, comment = str_(p.comment).slice(0, 1500);
  withLock_(function () {
    update_('NHV_SURVEYS', s.Survey_ID, { Status: 'ANSWERED', Answered_At: nowIso_(), Answers_JSON: JSON.stringify(clean), Comment: comment, Min_Score: String(min),
      Avg_Score: String(avg), Lang: str_(p.lang) === 'en' ? 'en' : 'ar', Token_Hash: '' }, 'PUBLIC');
  });
  event_(null, 'NHV', s.Survey_ID, 'ANSWERED', 'avg ' + avg + ' min ' + min);
  var alert = num_(cfg_('NHV_ALERT_SCORE', 2), 2);
  if (min <= alert) {
    var to = roleHolders_(ROLE.HR_MANAGER), site = nhvSiteOf_(s);
    if (site) to.push(site);
    notify_(to, 'تقييم منخفض من موظف جديد — ' + s.Full_Name, 'أول ' + s.Round_Day + ' يوم: أقل تقييم ' + min + ' من 5' + (comment ? ' — «' + comment.slice(0, 100) + '»' : '') + '. اتكلم معاه وسجّل عملت إيه.', 'NHV', s.Survey_ID, true);
  }
  return { ok: true };
}
