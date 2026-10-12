/**
 * Consent.gs — v0.38.0 (CHG-81): a candidate added by hand, from an import or from a job site gives his own consent
 * before the recruitment work goes on. Until he does, he cannot move past «Contacted» (no screening, shortlist,
 * interview or offer). The recruiter sends him a private link (WhatsApp / e-mail): it shows the employer and the privacy
 * notice; the candidate agrees to the processing and to the storage outside Egypt. The link lasts CONSENT_LINK_DAYS
 * (7), works once, and «send a new link» replaces it.
 */

/** The person gave his own consent (the apply page or the consent link) — not only the recruiter's note. */
function personConsentOk_(per) {
  var v = str_(per && per.Consent_Version);
  return !!v && !/-(RECRUITER|IMPORT)$/.test(v);
}
var CONSENT_GATE_MSG_ = 'المرشح لسه ماوافقش بنفسه على إشعار الخصوصية — ابعتله «لينك الموافقة» من صفحته، ولما يوافق تقدر تكمّل.';

/** Stops a move past «Contacted» for a person without his own consent. */
function consentGate_(personId, toStage) {
  var i = STAGES_ACTIVE_.indexOf(toStage);
  if (i >= 0 && i <= STAGES_ACTIVE_.indexOf('CONTACTED')) return;
  var per = findOne_('PERSONS', { Person_ID: personId });
  if (per && !personConsentOk_(per)) throw userError_(CONSENT_GATE_MSG_);
}

/** Recruiter: a new consent link for the candidate of an application. p = { Application_ID } */
function consentLink_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (ctx.readOnly) throw userError_('مالكش صلاحية.');
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID });
  if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
  if (personConsentOk_(per)) throw userError_('المرشح وافق بنفسه بالفعل.');
  var token = randomToken_(), days = num_(cfg_('CONSENT_LINK_DAYS', 7), 7), until = addDaysIso_(days);
  withLock_(function () { update_('PERSONS', per.Person_ID, { Consent_Link_Hash: hash_('CONSENT:' + token), Consent_Link_Until: until }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'CONSENT_LINK', newValue: until.slice(0, 10) });
  var url = ScriptApp.getService().getUrl() + '?consent=' + token;
  var first = str_(per.Full_Name).split(/\s+/)[0];
  var mob = latinDigits_(per.Mobile).replace(/\D/g, ''); if (/^01\d{9}$/.test(mob)) mob = '2' + mob;
  return { url: url, until: until.slice(0, 10), phone: mob,
    text: 'أهلاً ' + first + '، معاك فريق التوظيف في قنديل مصر. قبل ما نكمّل في طلبك محتاجين موافقتك على إشعار الخصوصية من اللينك ده (صالح ' + days + ' أيام): ' + url };
}

function consentPersonByToken_(token) {
  token = str_(token);
  if (!/^[A-Za-z0-9]{20,}$/.test(token)) throw userError_('اللينك ده مش صحيح — اطلب لينك جديد من مسؤول التوظيف.');
  var h = hash_('CONSENT:' + token);
  var per = where_('PERSONS', function (x) { return x.Consent_Link_Hash === h; })[0];
  if (!per || per.Status !== 'Active') throw userError_('اللينك ده اتستخدم أو اتلغى — اطلب لينك جديد من مسؤول التوظيف.');
  if (str_(per.Consent_Link_Until) < nowIso_()) throw userError_('صلاحية اللينك انتهت — اطلب لينك جديد من مسؤول التوظيف.');
  return per;
}

/** Public: what the consent page shows. */
function consentInfo_(p) {
  var per = consentPersonByToken_(p.token);
  var app = find_('APPLICATIONS', { Person_ID: per.Person_ID }).sort(function (x, y) { return x.Application_ID < y.Application_ID ? 1 : -1; })[0];
  var v = app ? get_('VACANCIES', app.Vacancy_ID) : null, ent = v ? entityOfVacancy_(v) || {} : {};
  return { name: str_(per.Full_Name).split(/\s+/)[0], job: v ? vacTitle_(v).ar : '', entity: ent.Name_AR || '', entityEn: ent.Name_EN || '',
    version: str_(cfg_('PRIVACY_VERSION', '1')), ar: cfg_('PRIVACY_TEXT_AR', ''), en: cfg_('PRIVACY_TEXT_EN', ''),
    fullAr: cfg_('PRIVACY_FULL_AR', ''), fullEn: cfg_('PRIVACY_FULL_EN', ''), email: cfg_('PRIVACY_EMAIL', '') };
}

/** Public: p = { token, consent: 'Y', consentTransfer: 'Y', version } — the link is used once. */
function consentAccept_(p) {
  var per = consentPersonByToken_(p.token), ver = str_(cfg_('PRIVACY_VERSION', '1'));
  if (str_(p.consent) !== 'Y' || str_(p.version) !== ver) throw userError_('وافق على إشعار الخصوصية عشان نكمّل.');
  if (str_(p.consentTransfer) !== 'Y') throw userError_('وافق على حفظ البيانات عشان نكمّل في طلبك.');
  var apps = find_('APPLICATIONS', { Person_ID: per.Person_ID });
  withLock_(function () {
    var cur = get_('PERSONS', per.Person_ID);
    if (cur.Consent_Link_Hash !== per.Consent_Link_Hash) throw userError_('اللينك ده اتستخدم أو اتلغى — اطلب لينك جديد من مسؤول التوظيف.');
    update_('PERSONS', per.Person_ID, { Consent_Version: ver, Consent_At: nowIso_(), Consent_Link_Hash: '', Consent_Link_Until: '' }, 'PUBLIC');
    var appId = apps.length ? apps[apps.length - 1].Application_ID : '';
    ['APPLY', 'TRANSFER'].forEach(function (k) { consentLog_('PUBLIC', { Person_ID: per.Person_ID, Application_ID: appId, Kind: k, Version: ver, Channel: 'LINK' }); });
  });
  audit_(null, { userId: 'PUBLIC', entityType: 'PERSON', entityId: per.Person_ID, action: 'CONSENT_GIVEN', newValue: 'LINK ' + ver });
  var team = [];
  apps.forEach(function (a) { if (a.Owner_User_ID && team.indexOf(a.Owner_User_ID) < 0) team.push(a.Owner_User_ID); });
  notify_(team, 'المرشح وافق على إشعار الخصوصية', per.Full_Name + ' — تقدر تكمّل في طلبه.', 'APPLICATION', apps.length ? apps[apps.length - 1].Application_ID : '', false);
  return { ok: true };
}
