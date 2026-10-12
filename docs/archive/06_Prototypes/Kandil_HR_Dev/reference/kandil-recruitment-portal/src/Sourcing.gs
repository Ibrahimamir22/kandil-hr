/**
 * Sourcing.gs — Phase 3B part 1: recruitment sources, paid subscriptions (credits + usage) and advertisements.
 *
 * - RECRUITMENT_SOURCES replaces the CANDIDATE_SOURCES setting (seeded from it once).
 * - An advertisement belongs to one vacancy and one platform. Its text is generated from the approved job
 *   description + the request through a per-platform template (MESSAGE_TEMPLATES, Purpose = AD), then edited.
 * - Every ad carries its own apply link (?apply=CODE&src=SOURCE&ad=AD_ID): applications are attributed to the ad.
 * - Publishing an ad on a paid platform consumes one ad credit from an active subscription (SOURCE_USAGE).
 * - Once a day: subscriptions past their end date expire; those near the end alert the recruitment managers.
 */

var SOURCE_KINDS_ = ['JOB_BOARD', 'SOCIAL', 'MESSAGING', 'DIRECT', 'REFERRAL', 'AGENCY', 'INTERNAL', 'POOL', 'OTHER'];
var AD_STATUSES_ = ['DRAFT', 'READY', 'PUBLISHED', 'PAUSED', 'CLOSED'];
var AD_MOVES_ = { DRAFT: ['READY', 'PUBLISHED', 'CLOSED'], READY: ['DRAFT', 'PUBLISHED', 'CLOSED'], PUBLISHED: ['PAUSED', 'CLOSED'],
  PAUSED: ['PUBLISHED', 'CLOSED'], CLOSED: [] };

function sourcingAdminRoles_() { return candAllRoles_(); }

/* ---------------- seeds (run from setupSystem) ---------------- */

function defaultSources_() {
  // code, Arabic, English, kind, has apply link, uses paid credits
  return [
    ['CAREER_PAGE', 'لينك التقديم المباشر', 'Direct apply link', 'DIRECT', 'N', 'N'],
    ['COMPANY_SITE', 'موقع الشركة', 'Company website', 'DIRECT', 'Y', 'N'],
    ['WUZZUF', 'Wuzzuf', 'Wuzzuf', 'JOB_BOARD', 'Y', 'Y'],
    ['LINKEDIN', 'LinkedIn', 'LinkedIn', 'JOB_BOARD', 'Y', 'N'],
    ['FACEBOOK', 'Facebook', 'Facebook', 'SOCIAL', 'Y', 'N'],
    ['WHATSAPP', 'واتساب', 'WhatsApp', 'MESSAGING', 'Y', 'N'],
    ['INTERNAL', 'إعلان داخلي', 'Internal posting', 'INTERNAL', 'Y', 'N'],
    ['EMAIL', 'إيميل', 'Email', 'DIRECT', 'N', 'N'],
    ['REFERRAL', 'ترشيح من موظف', 'Employee referral', 'REFERRAL', 'N', 'N'],
    ['WALK_IN', 'حضور شخصي', 'Walk-in', 'DIRECT', 'N', 'N'],
    ['AGENCY', 'مكتب توظيف', 'Recruitment agency', 'AGENCY', 'N', 'N'],
    ['TALENT_POOL', 'قاعدة المرشحين', 'Talent pool', 'POOL', 'N', 'N'],
    ['OTHER', 'أخرى', 'Other', 'OTHER', 'N', 'N']
  ];
}

function defaultAdTemplates_() {
  var gAr = 'مطلوب {job} — {company}\n📍 مكان العمل: {location}\n💼 نوع التوظيف: {employment}\n\n{summary}\n\nالمسؤوليات:\n{responsibilities}\n\nالمطلوب:\n{requirements}\n\nللتقديم: {apply_link}';
  var gEn = '{company} is hiring: {job}\nLocation: {location}\nEmployment type: {employment}\n\nWhat you will do\n{responsibilities}\n\nWhat we are looking for\n{requirements}\n\nApply here: {apply_link}';
  return [
    ['AD_GENERIC', 'ar', 'نص إعلان عام', 'مطلوب {job} — {company}', gAr],
    ['AD_GENERIC', 'en', 'General job ad', '{company} is hiring: {job}', gEn],
    ['AD_FACEBOOK', 'ar', 'إعلان فيسبوك', 'مطلوب {job}',
     '📢 {company} بتدوّر على {job}\n📍 {location} · {employment}\n\n{summary}\n\n✅ المطلوب:\n{requirements}\n\n👈 قدّم أونلاين في دقيقتين: {apply_link}\n(التقديم من اللينك بس — من غير رسائل خاصة)'],
    ['AD_WHATSAPP', 'ar', 'رسالة واتساب', 'مطلوب {job}',
     '*مطلوب {job}* — {company}\n📍 {location}\n{requirements}\nقدّم من هنا: {apply_link}'],
    ['AD_LINKEDIN', 'en', 'LinkedIn post', '{job} — {company}',
     '{company} is hiring a {job} in {location}.\n\nWhat you will do\n{responsibilities}\n\nWhat we are looking for\n{requirements}\n\nEmployment type: {employment}\nApply in two minutes: {apply_link}\n\n#hiring #Egypt #{company_tag}'],
    ['AD_WUZZUF', 'ar', 'إعلان Wuzzuf', '{job}', gAr],
    ['AD_WUZZUF', 'en', 'Wuzzuf ad', '{job}', gEn],
    ['AD_INTERNAL', 'ar', 'إعلان داخلي للموظفين', 'فرصة داخلية: {job}',
     'إعلان داخلي — فرصة لموظفي {company}\n\nالوظيفة: {job}\nمكان العمل: {location}\n\n{summary}\n\nالمطلوب:\n{requirements}\n\nلو مهتم قدّم من اللينك: {apply_link}\nمديرك المباشر هيتبلّغ لو اتختارت للقائمة المختصرة، قبل أي مقابلة.']
  ];
}

/** Seeds sources (merging the old CANDIDATE_SOURCES setting) and ad templates. Safe to re-run. */
function sourcing080_() {
  var rows = defaultSources_().map(function (a, i) {
    return { Source_Code: a[0], Name_AR: a[1], Name_EN: a[2], Kind: a[3], Has_Link: a[4], Uses_Credits: a[5], Sort_Order: String((i + 1) * 10), Status: 'Active' };
  });
  var old = {};
  try { old = JSON.parse(cfg_('CANDIDATE_SOURCES', '{}') || '{}'); } catch (e) { old = {}; }
  var known = {}; rows.forEach(function (r) { known[r.Source_Code] = r; });
  Object.keys(old).forEach(function (k, i) {
    if (known[k]) { known[k].Name_AR = old[k] || known[k].Name_AR; return; }
    rows.push({ Source_Code: k, Name_AR: old[k], Name_EN: '', Kind: 'OTHER', Has_Link: 'N', Uses_Credits: 'N', Sort_Order: String(500 + i * 10), Status: 'Active' });
  });
  seedRows_('RECRUITMENT_SOURCES', rows);
  seedRows_('MESSAGE_TEMPLATES', defaultAdTemplates_().map(function (a, i) {
    return { Template_ID: a[0] + '-' + a[1], Code: a[0], Language: a[1], Purpose: 'AD', Title: a[2], Subject: a[3], Body: a[4],
      Sort_Order: String(900 + i * 10), Status: 'Active' };
  }));
}

/* ---------------- sources ---------------- */

/** Active sources as { code: Arabic name } (order kept). Falls back to the old setting before the upgrade ran. */
function sources_() {
  var d = {};
  var list = [];
  try { list = find_('RECRUITMENT_SOURCES', { Status: 'Active' }, { sort: 'Sort_Order' }); } catch (e) { list = []; }
  if (list.length) { list.forEach(function (s) { d[s.Source_Code] = s.Name_AR; }); return d; }
  try { d = JSON.parse(cfg_('CANDIDATE_SOURCES', '{}') || '{}'); } catch (e2) { d = {}; }
  if (!Object.keys(d).length) d = { CAREER_PAGE: 'لينك التقديم المباشر', OTHER: 'أخرى' };
  return d;
}
function sourceRow_(code) { return findOne_('RECRUITMENT_SOURCES', { Source_Code: code }); }

/** p = { Source_Code, Name_AR, Name_EN, Kind, Has_Link, Uses_Credits, Status, isNew } */
function sourceSave_(ctx, p) {
  var code = str_(p.Source_Code).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20);
  if (!code) throw userError_('اكتب كود المصدر (حروف إنجليزي).');
  if (!str_(p.Name_AR)) throw userError_('اكتب اسم المصدر.');
  var kind = SOURCE_KINDS_.indexOf(str_(p.Kind)) >= 0 ? str_(p.Kind) : 'OTHER';
  var f = { Name_AR: str_(p.Name_AR).slice(0, 60), Name_EN: str_(p.Name_EN).slice(0, 60), Kind: kind,
    Has_Link: str_(p.Has_Link) === 'Y' ? 'Y' : 'N', Uses_Credits: str_(p.Uses_Credits) === 'Y' ? 'Y' : 'N',
    Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  if (['CAREER_PAGE', 'OTHER'].indexOf(code) >= 0 && f.Status === 'Inactive') throw userError_('المصدر ده أساسي ومينفعش يتوقف.');
  return withLock_(function () {
    var cur = sourceRow_(code);
    if (!cur) {
      if (!p.isNew) throw userError_('المصدر غير موجود.');
      f.Source_Code = code; f.Sort_Order = String((all_('RECRUITMENT_SOURCES').length + 1) * 10);
      var c = insert_('RECRUITMENT_SOURCES', f, ctx.user.User_ID);
      audit_(ctx, { entityType: 'SOURCE', entityId: code, action: 'CREATE', newValue: f.Name_AR });
      return c;
    }
    if (p.isNew) throw userError_('في مصدر بنفس الكود.');
    var res = update_('RECRUITMENT_SOURCES', code, f, ctx.user.User_ID);
    auditDiff_(ctx, 'SOURCE', code, res.before, res.after, str_(p.reason));
    return res.after;
  });
}

/* ---------------- subscriptions ---------------- */

function subUsed_(subId) {
  var used = { AD: 0, CV_SEARCH: 0 };
  find_('SOURCE_USAGE', { Subscription_ID: subId }).forEach(function (u) {
    if (u.Status === 'Active') used[u.Kind] = (used[u.Kind] || 0) + num_(u.Units, 1);
  });
  return used;
}
function subView_(s, names) {
  var used = subUsed_(s.Subscription_ID), today = today_();
  var adLeft = num_(s.Ad_Credits, 0) - used.AD, cvLeft = num_(s.CV_Credits, 0) - used.CV_SEARCH;
  var daysLeft = s.End_Date ? daysBetween_(today, s.End_Date) : null;
  var live = s.Status === 'Active' && (!s.Start_Date || s.Start_Date <= today) && (!s.End_Date || s.End_Date >= today);
  var o = {};
  for (var k in s) o[k] = s[k];
  o.usedAds = used.AD; o.usedCv = used.CV_SEARCH; o.adLeft = adLeft; o.cvLeft = cvLeft; o.daysLeft = daysLeft; o.live = live;
  o.sourceName = (sourceRow_(s.Source_Code) || {}).Name_AR || s.Source_Code;
  o.ownerName = names[s.Owner_User_ID] || '';
  o.expiring = live && daysLeft !== null && daysLeft <= num_(s.Notice_Days, 14);
  o.unusedAtRisk = o.expiring && (adLeft > 0 || cvLeft > 0);
  return o;
}

/** p = { Subscription_ID?, Source_Code, Package, Start_Date, End_Date, Ad_Credits, CV_Credits, Cost, Owner_User_ID, Notice_Days, Contract_URL, Notes, Status, reason } */
function subscriptionSave_(ctx, p) {
  var src = sourceRow_(str_(p.Source_Code));
  if (!src) throw userError_('اختار المصدر.');
  var d = /^\d{4}-\d{2}-\d{2}$/;
  if (!d.test(str_(p.Start_Date)) || !d.test(str_(p.End_Date))) throw userError_('اكتب تاريخ البداية والنهاية.');
  if (str_(p.End_Date) < str_(p.Start_Date)) throw userError_('تاريخ النهاية قبل البداية.');
  ['Ad_Credits', 'CV_Credits', 'Cost', 'Notice_Days'].forEach(function (k) {
    if (str_(p[k]) !== '' && (isNaN(Number(p[k])) || Number(p[k]) < 0)) throw userError_('القيم الرقمية لازم تكون أرقام موجبة.');
  });
  var url = str_(p.Contract_URL);
  if (url && !/^https:\/\//.test(url)) throw userError_('لينك العقد لازم يبدأ بـ https://');
  var f = { Source_Code: src.Source_Code, Package: str_(p.Package).slice(0, 80), Start_Date: str_(p.Start_Date), End_Date: str_(p.End_Date),
    Ad_Credits: str_(p.Ad_Credits) || '0', CV_Credits: str_(p.CV_Credits) || '0', Cost: str_(p.Cost) || '0',
    Owner_User_ID: str_(p.Owner_User_ID), Notice_Days: str_(p.Notice_Days) || '14', Contract_URL: url, Notes: str_(p.Notes).slice(0, 500),
    Status: ['Active', 'Cancelled', 'Expired'].indexOf(str_(p.Status)) >= 0 ? str_(p.Status) : 'Active' };
  return withLock_(function () {
    if (!str_(p.Subscription_ID)) {
      f.Subscription_ID = nextId_('SUBSCRIPTION'); f.Alert_Sent_At = '';
      if (f.End_Date < today_()) f.Status = 'Expired';
      var c = insert_('SOURCE_SUBSCRIPTIONS', f, ctx.user.User_ID);
      audit_(ctx, { entityType: 'SUBSCRIPTION', entityId: c.Subscription_ID, action: 'CREATE', newValue: f.Source_Code + ' ' + f.Package });
      return c;
    }
    var cur = findOne_('SOURCE_SUBSCRIPTIONS', { Subscription_ID: p.Subscription_ID });
    if (!cur) throw userError_('الاشتراك غير موجود.');
    if (cur.End_Date !== f.End_Date) f.Alert_Sent_At = '';
    var res = update_('SOURCE_SUBSCRIPTIONS', cur.Subscription_ID, f, ctx.user.User_ID);
    auditDiff_(ctx, 'SUBSCRIPTION', cur.Subscription_ID, res.before, res.after, str_(p.reason));
    return res.after;
  });
}

/** Manual usage (CV searches, or an ad posted outside the portal). p = { Subscription_ID, Kind: AD|CV_SEARCH, Units, Note } */
function usageAdd_(ctx, p) {
  var s = findOne_('SOURCE_SUBSCRIPTIONS', { Subscription_ID: p.Subscription_ID });
  if (!s) throw userError_('الاشتراك غير موجود.');
  var kind = str_(p.Kind) === 'AD' ? 'AD' : 'CV_SEARCH';
  var units = num_(p.Units, 0);
  if (!(units > 0 && units <= 10000 && Math.floor(units) === units)) throw userError_('العدد لازم يكون رقم صحيح أكبر من صفر.');
  if (str_(p.Note).length < 3) throw userError_('اكتب ملاحظة (استخدمته في إيه).');
  return withLock_(function () {
    var u = insert_('SOURCE_USAGE', { Usage_ID: nextId_('SOURCE_USAGE'), Subscription_ID: s.Subscription_ID, Kind: kind, Units: String(units),
      Ref_ID: '', Note: str_(p.Note).slice(0, 300), Status: 'Active', Voided_By: '', Voided_At: '', Void_Reason: '' }, ctx.user.User_ID);
    audit_(ctx, { entityType: 'SUBSCRIPTION', entityId: s.Subscription_ID, action: 'USAGE_' + kind, newValue: String(units) });
    return u;
  });
}

/** p = { Usage_ID, reason } — usage is never deleted, only voided with a reason. */
function usageVoid_(ctx, p) {
  var u = findOne_('SOURCE_USAGE', { Usage_ID: p.Usage_ID });
  if (!u || u.Status !== 'Active') throw userError_('الاستخدام غير موجود أو اتلغى قبل كده.');
  var reason = requireReason_(p);
  return withLock_(function () {
    var res = update_('SOURCE_USAGE', u.Usage_ID, { Status: 'Voided', Voided_By: ctx.user.User_ID, Voided_At: nowIso_(), Void_Reason: reason }, ctx.user.User_ID);
    audit_(ctx, { entityType: 'SUBSCRIPTION', entityId: u.Subscription_ID, action: 'USAGE_VOID', oldValue: u.Units, reason: reason });
    return res.after;
  });
}

/** Sources + subscriptions screen. */
function sourcingList_(ctx) {
  var names = userNames_();
  var subs = all_('SOURCE_SUBSCRIPTIONS').map(function (s) { return subView_(s, names); })
    .sort(function (a, b) { return (a.live === b.live) ? (a.End_Date < b.End_Date ? -1 : 1) : (a.live ? -1 : 1); });
  var usage = {};
  all_('SOURCE_USAGE').forEach(function (u) { (usage[u.Subscription_ID] = usage[u.Subscription_ID] || []).push(u); });
  subs.forEach(function (s) { s.usage = (usage[s.Subscription_ID] || []).sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; }).slice(0, 50); });
  return {
    sources: find_('RECRUITMENT_SOURCES', {}, { sort: 'Sort_Order' }),
    subscriptions: subs,
    kinds: SOURCE_KINDS_,
    canEdit: hasAnyRole_(ctx, sourcingAdminRoles_()),
    owners: recruitersList_(ctx),
    agencies: agenciesList_(),
    adTemplates: find_('MESSAGE_TEMPLATES', { Purpose: 'AD' }, { sort: 'Sort_Order' })
  };
}

/** Active subscription of a source with ad credits left (the one ending first). */
function subForAd_(sourceCode) {
  var names = {};
  var list = find_('SOURCE_SUBSCRIPTIONS', { Source_Code: sourceCode }).map(function (s) { return subView_(s, names); })
    .filter(function (s) { return s.live && s.adLeft > 0; })
    .sort(function (a, b) { return a.End_Date < b.End_Date ? -1 : 1; });
  return list[0] || null;
}

/* ---------------- daily check ---------------- */

/** Once a day: expire ended subscriptions; alert recruitment managers about those ending soon (once per end date). */
function sourcingDailyCheck_() {
  var day = today_();
  if (sprop_('SRC_DAILY') === day) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SRC_DAILY') === day) return;
  props.setProperty('SRC_DAILY', day);
  var subs;
  try { subs = find_('SOURCE_SUBSCRIPTIONS', { Status: 'Active' }); } catch (e) { return; }
  if (!subs.length) return;
  var names = {}, alerts = [];
  withLock_(function () {
    subs.forEach(function (s) {
      if (s.End_Date && s.End_Date < day) { update_('SOURCE_SUBSCRIPTIONS', s.Subscription_ID, { Status: 'Expired' }, 'SYSTEM'); return; }
      var v = subView_(s, names);
      if (v.expiring && !s.Alert_Sent_At) {
        update_('SOURCE_SUBSCRIPTIONS', s.Subscription_ID, { Alert_Sent_At: nowIso_() }, 'SYSTEM');
        alerts.push(v);
      }
    });
  });
  if (!alerts.length) return;
  var to = roleUserIds_([ROLE.REC_MANAGER, ROLE.HR_MANAGER]);
  alerts.forEach(function (v) {
    var ids = to.slice(); if (v.Owner_User_ID && ids.indexOf(v.Owner_User_ID) < 0) ids.push(v.Owner_User_ID);
    notify_(ids, 'اشتراك ' + v.sourceName + ' بينتهي يوم ' + v.End_Date,
      (v.adLeft > 0 || v.cvLeft > 0 ? 'فاضل ' + v.adLeft + ' إعلان و' + v.cvLeft + ' بحث CV مش مستخدمين. ' : '') + 'قرّر التجديد قبل ما ينتهي.',
      'SUBSCRIPTION', v.Subscription_ID, true);
  });
}

function roleUserIds_(roles) {
  var ids = {};
  where_('USER_ROLES', function (r) { return roles.indexOf(r.Role_Code) >= 0 && isEffective_(r.Effective_From, r.Effective_To); })
    .forEach(function (r) { var u = get_('USERS', r.User_ID); if (u && u.Status === 'Active') ids[u.User_ID] = 1; });
  return Object.keys(ids);
}

/* ---------------- advertisements ---------------- */

function adTemplate_(source, lang) {
  return findOne_('MESSAGE_TEMPLATES', { Template_ID: 'AD_' + source + '-' + lang, Status: 'Active' }) ||
    findOne_('MESSAGE_TEMPLATES', { Template_ID: 'AD_GENERIC-' + lang, Status: 'Active' }) ||
    { Subject: '{job}', Body: '{job} — {location}\n\n{requirements}\n\n{apply_link}' };
}

function adLink_(v, ad) {
  if (!v.Apply_Code) return '';
  return applyUrl_(v.Apply_Code, ad.Source_Code) + '&ad=' + encodeURIComponent(ad.Ad_ID);
}

/** Variables an ad template can use. */
function adVars_(v, lang, link) {
  var en = lang === 'en';
  var t = vacTitle_(v);
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID }) || {};
  var jd = v.Job_Code ? jdApproved_(v.Job_Code) : null;
  var emp = (reqOptions_().employmentTypes.filter(function (o) { return o.code === req.Employment_Type; })[0] || {}).name || '';
  var resp = [];
  if (jd && !en) { try { resp = JSON.parse(jd.Responsibilities || '[]'); } catch (e) { resp = []; } }
  var reqs = [];
  if (en) {
    if (req.Education) reqs.push('• ' + tr_(req.Education, 'en'));
    if (num_(req.Experience_Years, 0) > 0) reqs.push('• At least ' + req.Experience_Years + ' years of experience' + (req.Experience_Context ? ' (' + tr_(req.Experience_Context, 'en') + ')' : ''));
  } else {
    if (req.Education) reqs.push('• ' + req.Education + (req.Specialization ? ' — ' + req.Specialization : ''));
    if (num_(req.Experience_Years, 0) > 0) reqs.push('• خبرة ' + req.Experience_Years + ' سنين على الأقل' + (req.Experience_Context ? ' في ' + req.Experience_Context : ''));
    if (jd && jd.Qualifications && reqs.length < 2) reqs.push('• ' + jd.Qualifications);
  }
  var company = en ? 'Kandil Egypt' : 'قنديل مصر';
  return {
    job: en ? (t.en || tr_(t.ar, 'en')) : t.ar,
    location: locName_(v.Location_ID, lang),
    company: company, company_tag: 'KandilEgypt',
    employment: en ? tr_(emp, 'en') : emp,
    summary: v.Public_Summary || (jd && !en ? jd.Purpose : ''),
    responsibilities: resp.length ? resp.slice(0, 6).map(function (x) { return '• ' + x; }).join('\n') : (en ? '• …' : '• …'),
    requirements: reqs.length ? reqs.join('\n') : '• …',
    experience: req.Experience_Years || '',
    apply_link: link
  };
}
function fillAd_(text, vars) {
  return str_(text).replace(/\{([a-z_]+)\}/g, function (m, k) { return vars.hasOwnProperty(k) ? vars[k] : m; })
    .replace(/\n{3,}/g, '\n\n').trim();
}

function adView_(a, v, counts) {
  var o = {};
  for (var k in a) o[k] = a[k];
  var src = sourceRow_(a.Source_Code) || {};
  o.sourceName = src.Name_AR || a.Source_Code;
  o.usesCredits = src.Uses_Credits === 'Y';
  o.link = v ? adLink_(v, a) : '';
  o.apps = counts ? (counts[a.Ad_ID] || 0) : 0;
  o.costPerApp = o.apps && num_(a.Cost, 0) ? Math.round(num_(a.Cost, 0) / o.apps) : null;
  o.moves = AD_MOVES_[a.Status] || [];
  return o;
}

function requireAdVacancy_(ctx, vacancyId) {
  var v = findOne_('VACANCIES', { Vacancy_ID: vacancyId });
  if (!v) throw userError_('الشاغر غير موجود.');
  requireVacancyFull_(ctx, v);
  return v;
}

/** p = { Vacancy_ID } → ads of a vacancy with their applications. */
function adList_(ctx, p) {
  var v = requireAdVacancy_(ctx, p.Vacancy_ID);
  var counts = {};
  find_('APPLICATIONS', { Vacancy_ID: v.Vacancy_ID }).forEach(function (a) { if (a.Ad_ID) counts[a.Ad_ID] = (counts[a.Ad_ID] || 0) + 1; });
  var srcs = find_('RECRUITMENT_SOURCES', { Status: 'Active' }, { sort: 'Sort_Order' })
    .filter(function (s) { return s.Has_Link === 'Y'; })
    .map(function (s) { var sub = s.Uses_Credits === 'Y' ? subForAd_(s.Source_Code) : null;
      return { code: s.Source_Code, name: s.Name_AR, usesCredits: s.Uses_Credits === 'Y', creditsLeft: sub ? sub.adLeft : 0, subId: sub ? sub.Subscription_ID : '' }; });
  return {
    ads: find_('ADVERTISEMENTS', { Vacancy_ID: v.Vacancy_ID }, { sort: '-Created_At' }).map(function (a) { return adView_(a, v, counts); }),
    sources: srcs,
    applyOpen: v.Apply_Enabled === 'Y' && APPLY_STATUSES_.indexOf(v.Status) >= 0
  };
}

/** p = { Vacancy_ID, Source_Code, Language, Campaign } → a new draft with generated text. */
function adCreate_(ctx, p) {
  var v = requireAdVacancy_(ctx, p.Vacancy_ID);
  if (VAC_OPEN_.indexOf(v.Status) < 0) throw userError_('الشاغر مش شغال.');
  var src = sourceRow_(str_(p.Source_Code));
  if (!src || src.Status !== 'Active') throw userError_('اختار المنصة.');
  var lang = str_(p.Language) === 'en' ? 'en' : 'ar';
  var ad;
  withLock_(function () {
    if (!v.Apply_Code) { update_('VACANCIES', v.Vacancy_ID, { Apply_Code: randomCode_8_() }, ctx.user.User_ID); v = findOne_('VACANCIES', { Vacancy_ID: v.Vacancy_ID }); }
    var id = nextId_('AD');
    var stub = { Ad_ID: id, Source_Code: src.Source_Code };
    var tpl = adTemplate_(src.Source_Code, lang), vars = adVars_(v, lang, adLink_(v, stub));
    ad = insert_('ADVERTISEMENTS', { Ad_ID: id, Vacancy_ID: v.Vacancy_ID, Source_Code: src.Source_Code, Campaign: str_(p.Campaign).slice(0, 60),
      Language: lang, Title: fillAd_(tpl.Subject, vars).slice(0, 150), Body: fillAd_(tpl.Body, vars).slice(0, 5000), Version: '1', Status: 'DRAFT',
      Published_At: '', Closes_On: '', Post_URL: '', Cost: '', Subscription_ID: '', Usage_ID: '', Copied_From: '', Posted_By: '', Status_Note: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'AD', entityId: ad.Ad_ID, action: 'CREATE', newValue: v.Vacancy_ID + ' ' + ad.Source_Code });
  return adView_(ad, v, null);
}

/** p = { Ad_ID, Title, Body, Campaign, Post_URL, Closes_On, Cost } — text edits on a published ad raise its version. */
function adSave_(ctx, p) {
  var a = findOne_('ADVERTISEMENTS', { Ad_ID: p.Ad_ID });
  if (!a) throw userError_('الإعلان غير موجود.');
  var v = requireAdVacancy_(ctx, a.Vacancy_ID);
  if (a.Status === 'CLOSED') throw userError_('الإعلان مقفول — اعمل نسخة منه لو محتاج تعيد نشره.');
  var f = {};
  if (p.Title !== undefined) f.Title = str_(p.Title).slice(0, 150);
  if (p.Body !== undefined) { if (str_(p.Body).length < 20) throw userError_('نص الإعلان قصير جداً.'); f.Body = str_(p.Body).slice(0, 5000); }
  if (p.Campaign !== undefined) f.Campaign = str_(p.Campaign).slice(0, 60);
  adPublishFields_(p, f);
  if ((f.Body !== undefined && f.Body !== a.Body) || (f.Title !== undefined && f.Title !== a.Title)) {
    if (['PUBLISHED', 'PAUSED'].indexOf(a.Status) >= 0) f.Version = String(num_(a.Version, 1) + 1);
  }
  var res;
  withLock_(function () { res = update_('ADVERTISEMENTS', a.Ad_ID, f, ctx.user.User_ID); });
  auditDiff_(ctx, 'AD', a.Ad_ID, res.before, res.after, str_(p.reason));
  return adView_(res.after, v, null);
}

function adPublishFields_(p, f) {
  if (p.Post_URL !== undefined) {
    var u = str_(p.Post_URL);
    if (u && !/^https?:\/\//.test(u)) throw userError_('لينك الإعلان لازم يبدأ بـ http.');
    f.Post_URL = u.slice(0, 500);
  }
  if (p.Closes_On !== undefined) {
    var d = str_(p.Closes_On);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw userError_('التاريخ غير صحيح.');
    f.Closes_On = d;
  }
  if (p.Cost !== undefined) {
    var c = str_(p.Cost);
    if (c && (isNaN(Number(c)) || Number(c) < 0)) throw userError_('التكلفة لازم تكون رقم.');
    f.Cost = c;
  }
}

/**
 * p = { Ad_ID, to, Post_URL?, Closes_On?, Cost?, Subscription_ID?, noCredit?, note? }
 * First publish of a paid platform uses one ad credit (chosen or the subscription ending first).
 */
function adStatus_(ctx, p) {
  var a = findOne_('ADVERTISEMENTS', { Ad_ID: p.Ad_ID });
  if (!a) throw userError_('الإعلان غير موجود.');
  var v = requireAdVacancy_(ctx, a.Vacancy_ID);
  var to = str_(p.to);
  if ((AD_MOVES_[a.Status] || []).indexOf(to) < 0) throw userError_('مينفعش تحوّل الإعلان للحالة دي.');
  var f = { Status: to };
  adPublishFields_(p, f);
  var usage = null, warn = '';
  if (to === 'PUBLISHED') {
    if (!(v.Apply_Enabled === 'Y' && APPLY_STATUSES_.indexOf(v.Status) >= 0)) throw userError_('افتح التقديم على الشاغر الأول، عشان لينك الإعلان يشتغل.');
    if (!a.Published_At) {
      f.Published_At = nowIso_(); f.Posted_By = ctx.user.User_ID;
      var src = sourceRow_(a.Source_Code) || {};
      if (src.Uses_Credits === 'Y') {
        var sub = str_(p.Subscription_ID) ? findOne_('SOURCE_SUBSCRIPTIONS', { Subscription_ID: p.Subscription_ID }) : null;
        var sv = sub ? subView_(sub, {}) : subForAd_(a.Source_Code);
        if (sv && (!sv.live || sv.adLeft <= 0 || sv.Source_Code !== a.Source_Code)) throw userError_('الاشتراك المختار مش ساري أو رصيده خلص.');
        if (!sv) {
          if (str_(p.noCredit) !== 'Y') throw userError_('مفيش اشتراك ساري فيه رصيد إعلانات على المنصة دي. سجّل الاشتراك الأول، أو أكّد النشر من غير اشتراك.');
          f.Status_Note = 'اتنشر من غير اشتراك مسجّل';
          warn = 'noCredit';
        } else usage = sv;
      }
    }
  } else if (to === 'CLOSED' || to === 'PAUSED') {
    if (str_(p.note)) f.Status_Note = str_(p.note).slice(0, 200);
  }
  var res;
  withLock_(function () {
    if (usage) {
      var u = insert_('SOURCE_USAGE', { Usage_ID: nextId_('SOURCE_USAGE'), Subscription_ID: usage.Subscription_ID, Kind: 'AD', Units: '1',
        Ref_ID: a.Ad_ID, Note: vacTitle_(v).ar, Status: 'Active', Voided_By: '', Voided_At: '', Void_Reason: '' }, ctx.user.User_ID);
      f.Subscription_ID = usage.Subscription_ID; f.Usage_ID = u.Usage_ID;
    }
    res = update_('ADVERTISEMENTS', a.Ad_ID, f, ctx.user.User_ID);
  });
  auditDiff_(ctx, 'AD', a.Ad_ID, res.before, res.after, str_(p.note));
  var out = adView_(res.after, v, null);
  out.warn = warn;
  return out;
}

/** p = { Ad_ID, Vacancy_ID?, Source_Code? } — a new draft from an existing ad; the original is not changed. */
function adCopy_(ctx, p) {
  var a = findOne_('ADVERTISEMENTS', { Ad_ID: p.Ad_ID });
  if (!a) throw userError_('الإعلان غير موجود.');
  requireAdVacancy_(ctx, a.Vacancy_ID);
  var v = requireAdVacancy_(ctx, str_(p.Vacancy_ID) || a.Vacancy_ID);
  if (VAC_OPEN_.indexOf(v.Status) < 0) throw userError_('الشاغر مش شغال.');
  var src = sourceRow_(str_(p.Source_Code) || a.Source_Code);
  if (!src || src.Status !== 'Active') throw userError_('اختار المنصة.');
  var oldV = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID });
  var copy;
  withLock_(function () {
    if (!v.Apply_Code) { update_('VACANCIES', v.Vacancy_ID, { Apply_Code: randomCode_8_() }, ctx.user.User_ID); v = findOne_('VACANCIES', { Vacancy_ID: v.Vacancy_ID }); }
    var id = nextId_('AD');
    var oldLink = adLink_(oldV, a), newLink = adLink_(v, { Ad_ID: id, Source_Code: src.Source_Code });
    var body = oldLink ? str_(a.Body).split(oldLink).join(newLink) : str_(a.Body);
    copy = insert_('ADVERTISEMENTS', { Ad_ID: id, Vacancy_ID: v.Vacancy_ID, Source_Code: src.Source_Code, Campaign: a.Campaign, Language: a.Language,
      Title: a.Title, Body: body, Version: '1', Status: 'DRAFT', Published_At: '', Closes_On: '', Post_URL: '', Cost: '', Subscription_ID: '',
      Usage_ID: '', Copied_From: a.Ad_ID, Posted_By: '', Status_Note: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'AD', entityId: copy.Ad_ID, action: 'COPY', oldValue: a.Ad_ID });
  return adView_(copy, v, null);
}

/** Published / paused ads whose vacancy is no longer recruiting: the recruiter must take them down. */
function adsToClose_(ctx) {
  var mine = myTeamVacancies_(ctx), all = candAll_(ctx), out = [];
  where_('ADVERTISEMENTS', function (a) { return a.Status === 'PUBLISHED' || a.Status === 'PAUSED'; }).forEach(function (a) {
    if (!all && !mine[a.Vacancy_ID]) return;
    var v = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID });
    if (v && APPLY_STATUSES_.indexOf(v.Status) >= 0 && v.Apply_Enabled === 'Y') return;
    out.push({ Ad_ID: a.Ad_ID, Vacancy_ID: a.Vacancy_ID, job: v ? vacTitle_(v).ar + ' — ' + locName_(v.Location_ID) : a.Vacancy_ID,
      sourceName: (sourceRow_(a.Source_Code) || {}).Name_AR || a.Source_Code, Post_URL: a.Post_URL });
  });
  return out;
}
