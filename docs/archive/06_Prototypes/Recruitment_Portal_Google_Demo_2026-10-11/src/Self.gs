/**
 * Self.gs — v0.39.0 (CHG-83): the candidate's own page, opened from a private link the recruiter sends.
 *   • gives his consent when he has not yet (§9.6);
 *   • completes his data and uploads / replaces his CV;
 *   • confirms or declines an interview the team invited him to;
 *   • reads the offer letter presented to him and accepts or declines it.
 * Each step runs through the same rules as the team's own buttons (the application's recruiter is the acting user,
 * marked «from the candidate's link»), so nothing can be done here that the portal would not allow. The page shows only
 * his own applications, interviews and the presented letter. The link lasts SELF_LINK_DAYS (7), «send a new link»
 * replaces it, and it stops when all his applications are closed.
 */

var SELF_FIELDS_ = ['Email', 'Governorate', 'City', 'Education', 'Specialization', 'Graduation_Year', 'Experience_Years', 'Current_Employer',
  'Current_Title', 'Notice_Period', 'Preferred_Channel'];
var PREF_CHANNELS_ = { WHATSAPP: 'واتساب', EMAIL: 'إيميل', PHONE: 'مكالمة' };
var SELF_CLOSED_ = ['REJECTED', 'WITHDRAWN', 'JOINED'];

/** Recruiter: a new link for the candidate of an application. p = { Application_ID } */
function selfLink_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (ctx.readOnly) throw userError_('مالكش صلاحية.');
  if (SELF_CLOSED_.indexOf(a.Stage) >= 0) throw userError_('الطلب ده مقفول — مفيش حاجة يعملها المرشح.');
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID });
  if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
  var token = randomToken_(), days = num_(cfg_('SELF_LINK_DAYS', 7), 7), until = addDaysIso_(days);
  withLock_(function () { update_('PERSONS', per.Person_ID, { Self_Link_Hash: hash_('SELF:' + token), Self_Link_Until: until }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'SELF_LINK', newValue: until.slice(0, 10) });
  var url = ScriptApp.getService().getUrl() + '?me=' + token, first = str_(per.Full_Name).split(/\s+/)[0];
  var mob = latinDigits_(per.Mobile).replace(/\D/g, ''); if (/^01\d{9}$/.test(mob)) mob = '2' + mob;
  return { url: url, until: until.slice(0, 10), phone: mob, email: per.Email,
    text: 'أهلاً ' + first + '، ده لينك صفحتك على بوابة التوظيف في قنديل مصر — تقدر منه تكمّل بياناتك وترفع السيرة الذاتية وتأكد معاد المقابلة أو ترد على العرض (صالح ' + days + ' أيام): ' + url };
}

function selfPerson_(token) {
  token = str_(token);
  if (!/^[A-Za-z0-9]{20,}$/.test(token)) throw userError_('اللينك ده مش صحيح — اطلب لينك جديد من مسؤول التوظيف.');
  var h = hash_('SELF:' + token);
  var per = where_('PERSONS', function (x) { return x.Self_Link_Hash === h; })[0];
  if (!per || per.Status !== 'Active') throw userError_('اللينك ده اتلغى — اطلب لينك جديد من مسؤول التوظيف.');
  if (str_(per.Self_Link_Until) < nowIso_()) throw userError_('صلاحية اللينك انتهت — اطلب لينك جديد من مسؤول التوظيف.');
  var apps = find_('APPLICATIONS', { Person_ID: per.Person_ID }).filter(function (a) { return SELF_CLOSED_.indexOf(a.Stage) < 0; });
  if (!apps.length) throw userError_('مفيش طلبات مفتوحة ليك دلوقتي — اللينك ده خلص.');
  return { per: per, apps: apps };
}

/** The acting user for a step the candidate takes: the application's recruiter (or the vacancy's lead). */
function selfActor_(a) {
  var v = get_('VACANCIES', a.Vacancy_ID) || {};
  var ids = [a.Owner_User_ID, v.Lead_Recruiter_ID].filter(String);
  for (var i = 0; i < ids.length; i++) { var u = get_('USERS', ids[i]); if (u && u.Status === 'Active') return { user: u, sessionId: 'CANDIDATE-LINK', viaSelf: true }; }
  throw userError_('مفيش مسؤول توظيف على طلبك دلوقتي — كلّم الشركة.');
}

/** Public: what the candidate's page shows. */
function selfInfo_(p) {
  var S = selfPerson_(p.token), per = S.per, lang = per.Language === 'en' ? 'en' : 'ar';
  var data = {}; SELF_FIELDS_.forEach(function (k) { data[k] = str_(per[k]); });
  var out = { name: str_(per.Full_Name).split(/\s+/)[0], consentOk: personConsentOk_(per), data: data, needNid: !per.National_ID, needBirth: !per.Birth_Date,
    hasCv: !!per.CV_File_ID, cvName: per.CV_File_Name, channels: PREF_CHANNELS_, apps: [] };
  if (!out.consentOk) {
    out.privacy = { version: str_(cfg_('PRIVACY_VERSION', '1')), ar: cfg_('PRIVACY_TEXT_AR', ''), en: cfg_('PRIVACY_TEXT_EN', ''), fullAr: cfg_('PRIVACY_FULL_AR', ''), email: cfg_('PRIVACY_EMAIL', '') };
    return out;                                         // nothing else before his consent
  }
  S.apps.forEach(function (a) {
    var v = get_('VACANCIES', a.Vacancy_ID); if (!v) return;
    var ent = entityOfVacancy_(v) || {};
    var x = { appId: a.Application_ID, job: vacTitle_(v).ar, entity: ent.Name_AR || '', stage: STAGE_AR_[a.Stage] || a.Stage, interviews: [], offers: [] };
    find_('INTERVIEWS', { Application_ID: a.Application_ID }).forEach(function (iv) {
      if (['CANDIDATE_PENDING', 'CONFIRMED'].indexOf(iv.Status) < 0 || iv.Date < today_()) return;
      x.interviews.push({ id: iv.Interview_ID, round: iv.Round_Name, date: iv.Date, time: iv.Time, mode: iv.Mode, place: ivPlaceText_(iv, lang),
        confirmed: iv.Status === 'CONFIRMED', canAnswer: iv.Status === 'CANDIDATE_PENDING' });
    });
    find_('OFFERS', { Application_ID: a.Application_ID }).forEach(function (o) {
      if (o.Status !== 'PRESENTED') return;
      var L = offerLetter_(o, v, per, lang);
      x.offers.push({ id: o.Offer_ID, no: o.Offer_No, validUntil: o.Valid_Until, expired: o.Valid_Until < today_(), letter: L.html, subject: L.subject });
    });
    out.apps.push(x);
  });
  out.declineReasons = Object.keys(OFFER_DECLINE_AR_).filter(function (k) { return k !== 'NO_RESPONSE'; }).map(function (k) { return { code: k, name: OFFER_DECLINE_AR_[k] }; });
  return out;
}

/** Public: his consent from his page (same as the consent link). p = { token, consent, consentTransfer, version } */
function selfConsent_(p) {
  var S = selfPerson_(p.token), per = S.per, ver = str_(cfg_('PRIVACY_VERSION', '1'));
  if (str_(p.consent) !== 'Y' || str_(p.version) !== ver) throw userError_('وافق على إشعار الخصوصية عشان نكمّل.');
  if (str_(p.consentTransfer) !== 'Y') throw userError_('وافق على حفظ البيانات عشان نكمّل في طلبك.');
  withLock_(function () {
    update_('PERSONS', per.Person_ID, { Consent_Version: ver, Consent_At: nowIso_(), Consent_Link_Hash: '', Consent_Link_Until: '' }, 'PUBLIC');
    ['APPLY', 'TRANSFER'].forEach(function (k) { consentLog_('PUBLIC', { Person_ID: per.Person_ID, Application_ID: S.apps[0].Application_ID, Kind: k, Version: ver, Channel: 'LINK' }); });
  });
  audit_(null, { userId: 'PUBLIC', entityType: 'PERSON', entityId: per.Person_ID, action: 'CONSENT_GIVEN', newValue: 'SELF ' + ver });
  selfTell_(S.apps, per, 'المرشح وافق على إشعار الخصوصية من صفحته');
  return selfInfo_(p);
}

function selfTell_(apps, per, title) {
  var team = [];
  apps.forEach(function (a) { if (a.Owner_User_ID && team.indexOf(a.Owner_User_ID) < 0) team.push(a.Owner_User_ID); });
  notify_(team, title, per.Full_Name, 'APPLICATION', apps[0].Application_ID, false);
}
function selfMustConsent_(per) { if (!personConsentOk_(per)) throw userError_('وافق على إشعار الخصوصية الأول.'); }

/** Public: complete his data / upload his CV. p = { token, fields: {...}, National_ID?, Birth_Date?, cv? } */
function selfSave_(p) {
  var S = selfPerson_(p.token), per = S.per;
  selfMustConsent_(per);
  var f = p.fields || {}, patch = {};
  var src = {}; for (var k in per) src[k] = per[k];
  SELF_FIELDS_.forEach(function (k) { if (f[k] !== undefined) src[k] = f[k]; });
  if (!per.National_ID && f.National_ID) src.National_ID = f.National_ID;
  if (!per.Birth_Date && f.Birth_Date) src.Birth_Date = f.Birth_Date;
  src.lang = per.Language;
  var clean = personFields_(src, false);                 // the same checks as everywhere (e-mail, National ID, numbers…)
  SELF_FIELDS_.concat(['National_ID', 'Birth_Date']).forEach(function (k) { if (clean[k] !== undefined && str_(clean[k]) !== str_(per[k]) && k !== 'Preferred_Channel') patch[k] = clean[k]; });
  var ch = str_(f.Preferred_Channel); if (ch && PREF_CHANNELS_[ch] && ch !== per.Preferred_Channel) patch.Preferred_Channel = ch;
  var cvc = cvCheck_(p.cv, per.Language === 'en' ? 'en' : 'ar'), cv = cvc ? saveCv_(per.Person_ID, cvc) : null;
  if (cv) { patch.CV_File_ID = cv.id; patch.CV_File_Name = cv.name; patch.CV_Updated_At = nowIso_(); }
  if (!Object.keys(patch).length) return selfInfo_(p);
  var res;
  withLock_(function () {
    res = update_('PERSONS', per.Person_ID, patch, 'PUBLIC');
    S.apps.forEach(function (a) { activity_('PUBLIC', a, 'SYSTEM', { Note: 'المرشح حدّث بياناته من صفحته: ' + Object.keys(patch).filter(function (k) { return k.indexOf('CV_') !== 0; }).join('، ') + (cv ? (Object.keys(patch).length > 3 ? ' + ' : '') + 'سيرة ذاتية جديدة' : '') }); });
  });
  auditDiff_({ user: { User_ID: 'PUBLIC' }, sessionId: 'CANDIDATE-LINK' }, 'PERSON', per.Person_ID, res.before, res.after, 'من صفحة المرشح');
  if (patch.National_ID || patch.Email) {
    var m = dupMatches_(res.after, per.Person_ID);
    if (m.length) withLock_(function () { update_('PERSONS', per.Person_ID, { Dup_Status: 'PENDING', Dup_Candidates: m.map(function (x) { return x.Person_ID; }).join(',') }, 'SYSTEM'); });
  }
  selfTell_(S.apps, per, 'المرشح حدّث بياناته من صفحته');
  return selfInfo_(p);
}

function selfOwnApp_(S, appId) {
  var a = S.apps.filter(function (x) { return x.Application_ID === appId; })[0];
  if (!a) throw userError_('غير موجود.');
  return a;
}

/** Public: p = { token, Interview_ID, answer: CONFIRM | DECLINE, note } */
function selfInterview_(p) {
  var S = selfPerson_(p.token);
  selfMustConsent_(S.per);
  var iv = get_('INTERVIEWS', str_(p.Interview_ID));
  if (!iv || iv.Person_ID !== S.per.Person_ID) throw userError_('المقابلة غير موجودة.');
  var a = selfOwnApp_(S, iv.Application_ID), ans = str_(p.answer), note = str_(p.note);
  if (['CONFIRM', 'DECLINE'].indexOf(ans) < 0) throw userError_('اختار تأكيد أو اعتذار.');
  if (ans === 'DECLINE' && note.length < 3) throw userError_('اكتب سبب الاعتذار (ممكن نحدد معاد تاني).');
  intAction_(selfActor_(a), { Interview_ID: iv.Interview_ID, action: ans === 'CONFIRM' ? 'CAND_CONFIRM' : 'CAND_DECLINE', note: 'من صفحة المرشح' + (note ? ': ' + note : '') });
  audit_(null, { userId: 'PUBLIC', entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: 'CANDIDATE_' + ans, reason: note });
  if (iv.Organizer_ID) notify_([iv.Organizer_ID], ans === 'CONFIRM' ? 'المرشح أكّد المقابلة من صفحته' : 'المرشح اعتذر عن المقابلة', S.per.Full_Name + ' — ' + iv.Round_Name + ' — ' + iv.Date + (note ? ' — ' + note : ''), 'INTERVIEW', iv.Interview_ID, ans === 'DECLINE');
  return selfInfo_(p);
}

/** Public: p = { token, Offer_ID, answer: ACCEPT | DECLINE, reason, note } */
function selfOffer_(p) {
  var S = selfPerson_(p.token);
  selfMustConsent_(S.per);
  var o = get_('OFFERS', str_(p.Offer_ID));
  if (!o || o.Person_ID !== S.per.Person_ID || o.Status !== 'PRESENTED') throw userError_('العرض ده مش متاح للرد.');
  var a = selfOwnApp_(S, o.Application_ID), ans = str_(p.answer), note = str_(p.note).slice(0, 300);
  if (o.Valid_Until < today_()) throw userError_('صلاحية العرض انتهت — كلّم مسؤول التوظيف.');
  if (ans === 'ACCEPT') offerAction_(selfActor_(a), { Offer_ID: o.Offer_ID, action: 'ACCEPT', note: 'وافق من صفحة المرشح' + (note ? ': ' + note : '') });
  else if (ans === 'DECLINE') {
    var r = str_(p.reason);
    if (!OFFER_DECLINE_AR_[r] || r === 'NO_RESPONSE') throw userError_('اختار سبب الاعتذار عن العرض.');
    offerAction_(selfActor_(a), { Offer_ID: o.Offer_ID, action: 'DECLINE', reason: r, note: 'من صفحة المرشح' + (note ? ': ' + note : '') });
  } else throw userError_('اختار موافقة أو اعتذار.');
  audit_(null, { userId: 'PUBLIC', entityType: 'OFFER', entityId: o.Offer_ID, action: 'CANDIDATE_' + ans, reason: note });
  return selfInfo_(p);
}
