/**
 * Pool.gs — Phase 3B-3 (v0.10.0):
 *   • Talent pool (blueprint 9.5): people kept for later, with a category and tags the system suggests and the
 *     recruiter confirms; from the pool a person is added to any open vacancy (source = talent pool).
 *   • Bulk import (9.5): 300 rows at most; preview sorts every row (new, possible duplicate, already on the vacancy,
 *     missing mobile, invalid); the recruiter decides each possible duplicate (link / new / skip); one batch per import.
 *   • Transfer to another vacancy (9.4): a new application linked to the original one.
 *   • Vacancy cancellation (CHG-40/4): a decision for every open application — transfer, talent pool,
 *     reject (vacancy cancelled) or hold.
 *   • Former employees and hiring restrictions (9.1): name / code matching against exited employees with rehire
 *     eligibility; Do-Not-Rehire set by HR managers only, with a coded reason, evidence and a review date.
 *   • Source metrics: funnel and ad spend per source and per import batch.
 */

/* ---------------- talent pool ---------------- */

function poolActive_(personId) { return find_('TALENT_POOL', { Person_ID: personId, Status: 'Active' })[0] || null; }

/** Suggested category (job family of the vacancy) and tags (specialization, education, governorate, job). */
function poolSuggest_(per, v) {
  var tags = [];
  function add(t) { t = str_(t).replace(/[,،]/g, ' ').replace(/\s+/g, ' ').trim(); if (t && tags.indexOf(t) < 0 && tags.length < 6) tags.push(t); }
  var job = v ? findOne_('JOBS', { Job_Code: v.Job_Code }) : null;
  if (job) add(job.Job_Title_AR);
  add(per.Specialization);
  add(EDU_LABEL_[per.Education] || '');
  add(per.Governorate);
  return { category: job ? job.Job_Family : '', tags: tags };
}
var EDU_LABEL_ = { NONE: 'بدون مؤهل', INTERMEDIATE: 'مؤهل متوسط', SECONDARY: 'ثانوية عامة', ABOVE_INTERMEDIATE: 'فوق متوسط', BACHELOR: 'مؤهل عالي',
  MASTER: 'ماجستير', PHD: 'دكتوراه' };

/** p = { Application_ID } → suggestion for the "add to pool" dialog. */
function poolSuggestFor_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true);
  var per = findOne_('PERSONS', { Person_ID: L.app.Person_ID }) || {};
  var s = poolSuggest_(per, L.vac), cur = poolActive_(per.Person_ID);
  return { suggestion: s, current: cur, families: jobFamilies_() };
}

/** Add or update a pool entry (no lock taken). */
function poolPut_(actorId, personId, f) {
  var cur = poolActive_(personId);
  var fields = { Category: str_(f.Category), Tags: (Array.isArray(f.Tags) ? f.Tags : str_(f.Tags).split(/[,،]/)).map(str_).filter(String).slice(0, 10).join('، '),
    Note: str_(f.Note).slice(0, 500), From_Application_ID: str_(f.From_Application_ID), Reason: str_(f.Reason) || 'RECRUITER' };
  if (cur) return update_('TALENT_POOL', cur.Pool_ID, fields, actorId).after;
  fields.Pool_ID = nextId_('POOL'); fields.Person_ID = personId; fields.Status = 'Active'; fields.Removed_Reason = '';
  return insert_('TALENT_POOL', fields, actorId);
}

/** p = { Application_ID, Category, Tags, Note } */
function poolAdd_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (str_(p.Category) && !jobFamilies_()[str_(p.Category)]) throw userError_('اختار التصنيف من العائلات الوظيفية.');
  var per0 = findOne_('PERSONS', { Person_ID: a.Person_ID });
  var needConsent = !poolConsentActive_(per0);
  if (needConsent && (str_(p.consent) !== 'Y' || str_(p.consentNote).length < 3))
    throw userError_('قاعدة المرشحين بموافقة المرشح بس — اسأله، ولو وافق علّم الموافقة واكتب إزاي وافق.');
  var row;
  withLock_(function () {
    if (needConsent) poolConsentGrant_(ctx.user.User_ID, a.Person_ID, a.Application_ID, 'RECRUITER', str_(p.consentNote));
    row = poolPut_(ctx.user.User_ID, a.Person_ID, { Category: p.Category, Tags: p.Tags, Note: p.Note, From_Application_ID: a.Application_ID, Reason: 'RECRUITER' });
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: 'اتضاف لقاعدة المرشحين' + (row.Category ? ' — ' + (jobFamilies_()[row.Category] || row.Category) : '') + (row.Tags ? ' (' + row.Tags + ')' : '') });
  });
  audit_(ctx, { entityType: 'TALENT_POOL', entityId: row.Pool_ID, action: 'ADD', newValue: a.Person_ID });
  return row;
}

/** p = { Pool_ID, reason } */
function poolRemove_(ctx, p) {
  var r = findOne_('TALENT_POOL', { Pool_ID: p.Pool_ID });
  if (!r || r.Status !== 'Active') throw userError_('مش موجود في القاعدة.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب السبب.');
  withLock_(function () { update_('TALENT_POOL', r.Pool_ID, { Status: 'Removed', Removed_Reason: reason }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'TALENT_POOL', entityId: r.Pool_ID, action: 'REMOVE', reason: reason });
  return { ok: true };
}

/** p = { q, category, tag } — the pool with each person's latest application. */
function poolList_(ctx, p) {
  p = p || {};
  var q = norm_(latinDigits_(p.q)), tag = norm_(p.tag), fam = jobFamilies_();
  var cats = {};
  var rows = find_('TALENT_POOL', { Status: 'Active' }).map(function (r) {
    cats[r.Category] = (cats[r.Category] || 0) + 1;
    var per = findOne_('PERSONS', { Person_ID: r.Person_ID }) || {};
    if (per.Status === 'Merged' && per.Merged_Into) per = findOne_('PERSONS', { Person_ID: per.Merged_Into }) || per;
    return { r: r, per: per };
  }).filter(function (x) {
    if (x.per.Status !== 'Active') return false;
    if (str_(p.category) && x.r.Category !== p.category) return false;
    if (tag && norm_(x.r.Tags).indexOf(tag) < 0) return false;
    if (q && norm_([x.per.Full_Name, x.per.Mobile_Norm, x.per.Specialization, x.per.Governorate, x.r.Tags, x.r.Note].join(' ')).indexOf(q) < 0) return false;
    return true;
  }).slice(0, 200).map(function (x) {
    var last = find_('APPLICATIONS', { Person_ID: x.per.Person_ID }, { sort: '-Applied_At' })[0] || {};
    var lv = last.Vacancy_ID ? findOne_('VACANCIES', { Vacancy_ID: last.Vacancy_ID }) : null;
    return { Pool_ID: x.r.Pool_ID, Person_ID: x.per.Person_ID, name: x.per.Full_Name, mobile: x.per.Mobile, Governorate: x.per.Governorate,
      Education: x.per.Education, Specialization: x.per.Specialization, Experience_Years: x.per.Experience_Years, hasCv: !!x.per.CV_File_ID,
      Category: x.r.Category, categoryName: fam[x.r.Category] || '', Tags: x.r.Tags, Note: x.r.Note, at: x.r.Updated_At || x.r.Created_At,
      lastApp: last.Application_ID || '', lastStage: last.Stage || '', lastJob: lv ? vacTitle_(lv).ar : '',
      consentUntil: poolConsentActive_(x.per) ? x.per.Pool_Consent_Until : '' };
  });
  return { rows: rows, categories: Object.keys(cats).filter(String).map(function (k) { return { code: k, name: fam[k] || k, n: cats[k] }; }) };
}

/** p = { Person_ID, Vacancy_ID } — add a pool person to an open vacancy. */
function poolToVacancy_(ctx, p) {
  var pool = poolActive_(str_(p.Person_ID));
  if (!pool) throw userError_('المرشح مش في قاعدة المرشحين.');
  if (!poolConsentActive_(findOne_('PERSONS', { Person_ID: pool.Person_ID }))) throw userError_('موافقة المرشح على قاعدة المرشحين خلصت أو مش متسجلة — كلّمه الأول، ولو وافق ضيفه للشاغر يدوياً من «مرشح جديد».');
  var src = sources_().TALENT_POOL ? 'TALENT_POOL' : 'OTHER';
  var r = candCreate_(ctx, { Vacancy_ID: p.Vacancy_ID, Source: src, usePersonId: pool.Person_ID });
  return r;
}

/* ---------------- transfer & vacancy cancellation ---------------- */

/** Move one application to another open vacancy: a new application linked to the original, which closes. */
function transferApp_(ctx, a, target, note) {
  if (VAC_OPEN_.indexOf(target.Status) < 0 || vacPaused_(target.Status)) throw userError_('الشاغر اللي هيتنقل له لازم يكون شغال.');
  requireVacancyFull_(ctx, target);
  if (target.Vacancy_ID === a.Vacancy_ID) throw userError_('ده نفس الشاغر.');
  if (find_('APPLICATIONS', { Person_ID: a.Person_ID, Vacancy_ID: target.Vacancy_ID }).some(function (x) { return x.Stage !== 'REJECTED' && x.Stage !== 'WITHDRAWN'; }))
    throw userError_('المرشح متقدم بالفعل على الشاغر التاني.');
  var t = vacTitle_(target).ar + ' — ' + locName_(target.Location_ID), from = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID }) || {};
  var nw = newApplication_(a.Person_ID, target.Vacancy_ID, { Channel: 'TRANSFER', Source: a.Source, Sub_Source: a.Sub_Source, Referrer_Name: a.Referrer_Name,
    Referrer_Employee_ID: a.Referrer_Employee_ID, Is_Internal: a.Is_Internal, Consent_Version: a.Consent_Version, Ad_ID: a.Ad_ID,
    Owner_User_ID: defaultOwner_(ctx.user.User_ID, target), Original_Source: a.Original_Source, Agency_ID: a.Agency_ID, Agency_Terms_JSON: a.Agency_Terms_JSON,
    Ownership_Until: a.Ownership_Until, Origin_Application_ID: a.Application_ID }, ctx.user.User_ID);
  activity_(ctx.user.User_ID, nw, 'SYSTEM', { Note: 'اتنقل من ' + vacTitle_(from).ar + ' (' + a.Application_ID + ')' + (note ? ' — ' + note : ''), Stage_To: 'NEW' });
  ctx._cancelledIvs = (ctx._cancelledIvs || []).concat(cancelLiveInterviews_(ctx.user.User_ID, a.Application_ID, 'المرشح اتنقل لشاغر تاني'));
  update_('APPLICATIONS', a.Application_ID, { Stage: 'WITHDRAWN', Stage_At: nowIso_(), Close_Code: 'TRANSFERRED', Close_Note: 'اتنقل لـ ' + t + ' (' + nw.Application_ID + ')',
    Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '', Stage_Before_Hold: '', Hold_Reason: '',
    Source_Locked_At: a.Source_Locked_At || lockAttribution_(ctx.user.User_ID, a) }, ctx.user.User_ID);
  activity_(ctx.user.User_ID, a, 'STAGE', { Stage_From: a.Stage, Stage_To: 'WITHDRAWN', Outcome: 'TRANSFERRED', Note: 'اتنقل لـ ' + t });
  return nw;
}

/** p = { Application_ID, Vacancy_ID, note } — move a candidate to another vacancy. */
function appTransfer_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) < 0) throw userError_('المرشح مقفول — افتحه الأول.');
  var target = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!target) throw userError_('اختار الشاغر.');
  var nw;
  withLock_(function () { nw = transferApp_(ctx, a, target, str_(p.note)); });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: 'TRANSFER', newValue: nw.Application_ID });
  if (ctx._cancelledIvs && ctx._cancelledIvs.length) tellCancelled_(ctx._cancelledIvs, 'المرشح اتنقل لشاغر تاني');
  return { application: nw };
}

var CANCEL_DECISIONS_ = ['TRANSFER', 'POOL', 'REJECT', 'HOLD'];

/** Open applications of a vacancy (what a cancellation must decide on). */
function openAppsOf_(vacancyId) {
  return find_('APPLICATIONS', { Vacancy_ID: vacancyId }).filter(function (a) { return STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) >= 0; });
}

/** Before a vacancy is cancelled: every open application must have a decision. decisions = [{ Application_ID, action, Vacancy_ID? }] */
function checkCancelDecisions_(ctx, v, decisions) {
  var open = openAppsOf_(v.Vacancy_ID);
  if (!open.length) return [];
  var by = {}; (decisions || []).forEach(function (d) { by[str_(d.Application_ID)] = d; });
  var need = open.filter(function (a) { return !by[a.Application_ID] || CANCEL_DECISIONS_.indexOf(str_(by[a.Application_ID].action)) < 0; });
  if (need.length) {
    var e = userError_('الشاغر عليه ' + open.length + ' مرشح مفتوح — حدد تصرف لكل واحد قبل الإلغاء (نقل لشاغر تاني، قاعدة المرشحين، اعتذار، أو تعليق).');
    e.data = { needDecisions: true, apps: open.map(function (a) {
      var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
      return { Application_ID: a.Application_ID, name: per.Full_Name, Stage: a.Stage };
    }) };
    throw e;
  }
  return open.map(function (a) {
    var d = by[a.Application_ID];
    if (d.action === 'TRANSFER') {
      var t = findOne_('VACANCIES', { Vacancy_ID: str_(d.Vacancy_ID) });
      if (!t || t.Vacancy_ID === v.Vacancy_ID || VAC_OPEN_.indexOf(t.Status) < 0 || vacPaused_(t.Status)) throw userError_('اختار شاغر شغال للنقل (' + a.Application_ID + ').');
      requireVacancyFull_(ctx, t);
      if (find_('APPLICATIONS', { Person_ID: a.Person_ID, Vacancy_ID: t.Vacancy_ID }).some(function (x) { return x.Stage !== 'REJECTED' && x.Stage !== 'WITHDRAWN'; }))
        throw userError_('المرشح ' + a.Application_ID + ' متقدم بالفعل على الشاغر اللي هيتنقل له — اختار تصرف تاني.');
      return { app: a, action: 'TRANSFER', target: t };
    }
    if (d.action === 'POOL' && !poolConsentActive_(findOne_('PERSONS', { Person_ID: a.Person_ID })))
      throw userError_('المرشح ' + a.Application_ID + ' مش موافق على قاعدة المرشحين — سجّل موافقته من صفحته الأول أو اختار تصرف تاني.');
    return { app: a, action: d.action };
  });
}

/** Carry out the decisions (inside the vacancy-cancel lock). Returns counts. */
function applyCancelDecisions_(ctx, v, plan, reason) {
  var n = { TRANSFER: 0, POOL: 0, REJECT: 0, HOLD: 0 };
  var fam = (findOne_('JOBS', { Job_Code: v.Job_Code }) || {}).Job_Family || '';
  plan.forEach(function (x) {
    var a = x.app;
    if (x.action === 'TRANSFER') transferApp_(ctx, a, x.target, 'إلغاء الشاغر ' + v.Vacancy_ID);
    else if (x.action === 'HOLD') {
      ctx._cancelledIvs = (ctx._cancelledIvs || []).concat(cancelLiveInterviews_(ctx.user.User_ID, a.Application_ID, 'الشاغر اتلغى — المرشح متعلق'));
      if (a.Stage !== 'ON_HOLD') update_('APPLICATIONS', a.Application_ID, { Stage: 'ON_HOLD', Stage_At: nowIso_(), Stage_Before_Hold: a.Stage, Hold_Reason: 'الشاغر اتلغى: ' + reason }, ctx.user.User_ID);
      activity_(ctx.user.User_ID, a, 'STAGE', { Stage_From: a.Stage, Stage_To: 'ON_HOLD', Note: 'الشاغر اتلغى — المرشح متعلق' });
    } else {
      if (x.action === 'POOL') {
        var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
        var sg = poolSuggest_(per, v);
        poolPut_(ctx.user.User_ID, a.Person_ID, { Category: fam, Tags: sg.tags, Note: 'من شاغر اتلغى ' + v.Vacancy_ID, From_Application_ID: a.Application_ID, Reason: 'VACANCY_CANCELLED' });
      }
      ctx._cancelledIvs = (ctx._cancelledIvs || []).concat(cancelLiveInterviews_(ctx.user.User_ID, a.Application_ID, 'الشاغر اتلغى'));
      update_('APPLICATIONS', a.Application_ID, { Stage: 'REJECTED', Stage_At: nowIso_(), Close_Code: 'VACANCY_CANCELLED', Close_Note: reason,
        Reject_Msg_Status: 'PENDING', Reject_Msg_At: '', Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '', Stage_Before_Hold: '', Hold_Reason: '',
        Source_Locked_At: a.Source_Locked_At || lockAttribution_(ctx.user.User_ID, a) }, ctx.user.User_ID);
      activity_(ctx.user.User_ID, a, 'STAGE', { Stage_From: a.Stage, Stage_To: 'REJECTED', Outcome: 'VACANCY_CANCELLED', Note: x.action === 'POOL' ? 'الشاغر اتلغى — اتضاف لقاعدة المرشحين' : 'الشاغر اتلغى' });
    }
    n[x.action]++;
  });
  return n;
}

/* ---------------- bulk import ---------------- */

var IMPORT_MAX_ = 300;
var EDU_BY_TEXT_ = { 'بدون': 'NONE', 'متوسط': 'INTERMEDIATE', 'دبلوم': 'INTERMEDIATE', 'ثانوي': 'SECONDARY', 'فوق متوسط': 'ABOVE_INTERMEDIATE', 'معهد': 'ABOVE_INTERMEDIATE',
  'عالي': 'BACHELOR', 'بكالوريوس': 'BACHELOR', 'ليسانس': 'BACHELOR', 'جامع': 'BACHELOR', 'ماجستير': 'MASTER', 'دكتوراه': 'PHD',
  'bachelor': 'BACHELOR', 'master': 'MASTER', 'phd': 'PHD', 'diploma': 'INTERMEDIATE', 'high school': 'SECONDARY' };
function eduFromText_(t) {
  t = str_(t); if (!t) return '';
  if (EDU_CODES_.indexOf(t.toUpperCase()) >= 0) return t.toUpperCase();
  var low = t.toLowerCase(), best = '';
  Object.keys(EDU_BY_TEXT_).sort(function (a, b) { return b.length - a.length; }).some(function (k) { if (low.indexOf(k) >= 0) { best = EDU_BY_TEXT_[k]; return true; } return false; });
  return best;
}

/**
 * p = { Vacancy_ID, Source, Sub_Source, Agency_ID, fileName, consent:'Y', rows:[{Full_Name, Mobile, Email, National_ID, Governorate, City,
 *       Education, Specialization, Experience_Years, Current_Employer, Current_Title, Expected_Salary, Current_Salary}],
 *       commit, decisions: { <row index>: 'NEW' | 'LINK:<Person_ID>' | 'SKIP' } }
 */
function candImport_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('اختار الشاغر.');
  requireVacancyFull_(ctx, v);
  if (VAC_OPEN_.indexOf(v.Status) < 0 || vacPaused_(v.Status)) throw userError_('الشاغر مش شغال حالياً.');
  var srcs = sources_(), source = str_(p.Source);
  if (!srcs[source]) throw userError_('اختار مصدر الملف.');
  if (isReferralSource_(source)) throw userError_('الترشيحات بتتسجل واحد واحد مع الموظف اللي رشّح — اختار مصدر تاني للملف.');
  var agency = isAgencySource_(source) ? agencyAttach_(p.Agency_ID) : null;
  var rows = p.rows || [];
  if (!rows.length) throw userError_('الملف فاضي.');
  if (rows.length > IMPORT_MAX_) throw userError_('أقصى عدد ' + IMPORT_MAX_ + ' صف في المرة.');
  var seenMobile = {}, onVac = {};
  find_('APPLICATIONS', { Vacancy_ID: v.Vacancy_ID }).forEach(function (a) { if (a.Stage !== 'REJECTED' && a.Stage !== 'WITHDRAWN') onVac[a.Person_ID] = 1; });
  var out = rows.map(function (r, i) {
    var row = { i: i, name: str_(r.Full_Name), mobile: str_(r.Mobile) };
    if (!str_(r.Mobile)) { row.status = 'NO_MOBILE'; row.msg = 'رقم الموبايل ناقص'; return row; }
    var f;
    var src = {}; for (var k in r) src[k] = r[k];
    src.Education = eduFromText_(r.Education);
    try { f = personFields_(src, false); } catch (e) { row.status = 'INVALID'; row.msg = e.message; return row; }
    row.f = f;
    if (seenMobile[f.Mobile_Norm] !== undefined) { row.status = 'DUP_IN_FILE'; row.msg = 'نفس الموبايل في الصف ' + (seenMobile[f.Mobile_Norm] + 2); return row; }
    seenMobile[f.Mobile_Norm] = i;
    var m = dupMatches_(f, '');
    if (m.some(function (x) { return onVac[x.Person_ID]; })) { row.status = 'ON_VACANCY'; row.msg = 'متقدم بالفعل على الشاغر ده'; row.matches = m; return row; }
    if (m.length) { row.status = 'POSSIBLE_DUP'; row.matches = m; return row; }
    row.status = 'NEW';
    return row;
  });
  var counts = { NEW: 0, POSSIBLE_DUP: 0, ON_VACANCY: 0, NO_MOBILE: 0, INVALID: 0, DUP_IN_FILE: 0 };
  out.forEach(function (r) { counts[r.status]++; });
  if (!p.commit) return { counts: counts, rows: out.map(function (r) { var c = {}; for (var k in r) if (k !== 'f') c[k] = r[k]; return c; }) };

  if (str_(p.consent) !== 'Y') throw userError_('أكّد إن المرشحين في الملف موافقين على تسجيل بياناتهم للتوظيف.');
  var dec = p.decisions || {};
  var plan = out.filter(function (r) { return r.status === 'NEW' || r.status === 'POSSIBLE_DUP'; }).map(function (r) {
    var d = str_(dec[r.i]) || (r.status === 'NEW' ? 'NEW' : '');
    if (r.status === 'POSSIBLE_DUP' && !d) throw userError_('حدد تصرف للمكرر المحتمل في الصف ' + (r.i + 2) + ' (' + r.name + ').');
    if (d === 'SKIP') return null;
    if (d.indexOf('LINK:') === 0) {
      var pid = d.slice(5);
      if (!(r.matches || []).some(function (m) { return m.Person_ID === pid; })) throw userError_('الربط في الصف ' + (r.i + 2) + ' مش على مرشح من المتشابهين.');
      return { r: r, link: pid };
    }
    if (d !== 'NEW') throw userError_('تصرف غير معروف في الصف ' + (r.i + 2) + '.');
    return { r: r, link: '' };
  }).filter(Boolean);
  if (!plan.length) throw userError_('مفيش صفوف هتتضاف.');
  var batch, made = { NEW: 0, LINK: 0 };
  withLock_(function () {
    var batchId = nextId_('BATCH');
    plan.forEach(function (x) {
      var person = x.link ? findOne_('PERSONS', { Person_ID: x.link })
        : newPerson_(x.r.f, { Consent_Version: str_(cfg_('PRIVACY_VERSION', '1')) + '-IMPORT', Consent_At: nowIso_(),
            Dup_Candidates: (x.r.matches || []).map(function (m) { return m.Person_ID; }).join(','),
            Notes: x.r.matches ? 'استيراد ' + batchId + ' — اتأكد إنه شخص مختلف' : '' }, ctx.user.User_ID);
      var extra = { Channel: 'IMPORT', Source: source, Sub_Source: str_(p.Sub_Source).slice(0, 60), Is_Internal: person.Is_Employee,
        Consent_Version: person.Consent_Version, Owner_User_ID: defaultOwner_(ctx.user.User_ID, v), Import_Batch_ID: batchId };
      if (agency) for (var k in agency) extra[k] = agency[k];
      var app = newApplication_(person.Person_ID, v.Vacancy_ID, extra, ctx.user.User_ID);
      activity_(ctx.user.User_ID, app, 'SYSTEM', { Note: 'اتضاف من ملف ' + batchId + ' — المصدر: ' + srcs[source] + (x.link ? ' (مرشح موجود قبل كده)' : ''), Stage_To: 'NEW' });
      made[x.link ? 'LINK' : 'NEW']++;
    });
    batch = insert_('IMPORT_BATCHES', { Batch_ID: batchId, Vacancy_ID: v.Vacancy_ID, Source: source, Sub_Source: str_(p.Sub_Source).slice(0, 60),
      Agency_ID: agency ? agency.Agency_ID : '', File_Name: str_(p.fileName).slice(0, 120), Rows_Total: String(rows.length), Rows_New: String(made.NEW),
      Rows_Linked: String(made.LINK), Rows_Skipped: String(rows.length - made.NEW - made.LINK - counts.NO_MOBILE - counts.INVALID),
      Rows_Error: String(counts.NO_MOBILE + counts.INVALID), Notes: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'IMPORT_BATCH', entityId: batch.Batch_ID, action: 'IMPORT', newValue: v.Vacancy_ID + ' · ' + (made.NEW + made.LINK) });
  return { batch: batch, added: made.NEW + made.LINK };
}

/* ---------------- funnel & source metrics ---------------- */

var FUNNEL_ = ['applied', 'contacted', 'screening', 'shortlisted', 'interviewed', 'rejected', 'withdrawn'];

/** Furthest stage each application reached (from its stage history + current stage). */
function reachedMap_(apps) {
  var ids = {}; apps.forEach(function (a) { ids[a.Application_ID] = { CONTACTED: false, SCREENING: false, SHORTLISTED: false, INTERVIEW: false }; });
  find_('ACTIVITIES', { Type: 'STAGE' }).forEach(function (x) { var m = ids[x.Application_ID]; if (m && m[x.Stage_To] !== undefined) m[x.Stage_To] = true; });
  apps.forEach(function (a) {
    var m = ids[a.Application_ID];
    if (m[a.Stage] !== undefined) m[a.Stage] = true;
    if (a.Stage === 'ON_HOLD' && m[a.Stage_Before_Hold] !== undefined) m[a.Stage_Before_Hold] = true;
    if (m.INTERVIEW) m.SHORTLISTED = true;
    if (m.SHORTLISTED) m.SCREENING = true;
    if (m.SCREENING) m.CONTACTED = true;
  });
  return ids;
}

function funnelOf_(apps, reached) {
  var f = { applied: apps.length, contacted: 0, screening: 0, shortlisted: 0, interviewed: 0, rejected: 0, withdrawn: 0, active: 0 };
  apps.forEach(function (a) {
    var m = reached[a.Application_ID];
    if (m.CONTACTED) f.contacted++; if (m.SCREENING) f.screening++; if (m.SHORTLISTED) f.shortlisted++; if (m.INTERVIEW) f.interviewed++;
    if (a.Stage === 'REJECTED') f.rejected++; else if (a.Stage === 'WITHDRAWN') f.withdrawn++; else f.active++;
  });
  return f;
}

/** p = { from, to } (application dates) → per source: funnel, ad spend, cost per application / shortlisted; per import batch. */
function sourceMetrics_(ctx, p) {
  p = p || {};
  var from = str_(p.from), to = str_(p.to), srcs = sources_();
  var apps = find_('APPLICATIONS', {}).filter(function (a) {
    var d = a.Applied_At.slice(0, 10);
    return (!from || d >= from) && (!to || d <= to) && a.Close_Code !== 'TRANSFERRED' && a.Close_Code !== 'DUPLICATE';
  });
  var reached = reachedMap_(apps);
  var by = {};
  apps.forEach(function (a) { (by[a.Source] = by[a.Source] || []).push(a); });
  var spend = {};
  find_('ADVERTISEMENTS', {}).forEach(function (ad) {
    var d = str_(ad.Published_At).slice(0, 10);
    if (!d || (from && d < from) || (to && d > to)) return;
    spend[ad.Source_Code] = (spend[ad.Source_Code] || 0) + num_(ad.Cost, 0);
  });
  var rows = Object.keys(srcs).concat(Object.keys(by).filter(function (k) { return !srcs[k]; })).map(function (k) {
    var list = by[k] || [], f = funnelOf_(list, reached), cost = spend[k] || 0;
    return { source: k, name: srcs[k] || k, funnel: f, spend: cost,
      perApp: f.applied && cost ? Math.round(cost / f.applied) : null, perShort: f.shortlisted && cost ? Math.round(cost / f.shortlisted) : null,
      shortRate: f.applied ? Math.round(100 * f.shortlisted / f.applied) : 0 };
  }).filter(function (r) { return r.funnel.applied || r.spend; }).sort(function (a, b) { return b.funnel.applied - a.funnel.applied; });
  var names = userNames_();
  var batches = find_('IMPORT_BATCHES', {}).sort(function (a, b) { return a.Batch_ID < b.Batch_ID ? 1 : -1; }).slice(0, 50).map(function (b) {
    var list = find_('APPLICATIONS', { Import_Batch_ID: b.Batch_ID }), rr = reachedMap_(list);
    var v = findOne_('VACANCIES', { Vacancy_ID: b.Vacancy_ID });
    return { Batch_ID: b.Batch_ID, job: v ? vacTitle_(v).ar + ' — ' + locName_(v.Location_ID) : b.Vacancy_ID, sourceName: srcs[b.Source] || b.Source,
      File_Name: b.File_Name, at: b.Created_At, by: names[b.Created_By] || b.Created_By, Rows_Total: b.Rows_Total, Rows_New: b.Rows_New,
      Rows_Linked: b.Rows_Linked, Rows_Skipped: b.Rows_Skipped, Rows_Error: b.Rows_Error, funnel: funnelOf_(list, rr) };
  });
  var total = funnelOf_(apps, reached);
  return { rows: rows, batches: batches, total: total, totalSpend: Object.keys(spend).reduce(function (s, k) { return s + spend[k]; }, 0) };
}

/* ---------------- former employees & hiring restrictions ---------------- */

var REHIRE_REVIEW_CODES_ = ['TERMINATION', 'ABSENCE'];
function rehireRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }
function restrictionRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }

function nameWords_(s) {
  return str_(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .replace(/[^ء-يa-zA-Z\s]/g, ' ').replace(/(^|\s)(عبد|ابو)\s+/g, '$1$2').trim().toLowerCase().split(/\s+/).filter(String);
}
/** Same person by name: identical, or the first three names match. */
function sameName_(a, b) {
  var x = nameWords_(a), y = nameWords_(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  // common three-part names repeat a lot: compare four words when both names have them
  var n = Math.min(x.length, y.length) >= 4 ? 4 : 3;
  return x.length >= 3 && y.length >= 3 && x.slice(0, n).join(' ') === y.slice(0, n).join(' ');
}

/** Two words alike: equal, or (both 4+ letters) one letter added, missing or changed. */
function wordNear_(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
/**
 * v0.41.0 (CHG-86): similar names — the same first three words (four when both have four) allowing one letter's
 * difference per word, after the usual normalisation (hamza, taa marbuta, «عبد» joined). Names under three words never match.
 */
function nameSimilar_(a, b) {
  var x = nameWords_(a), y = nameWords_(b);
  if (x.length < 3 || y.length < 3) return false;
  var n = Math.min(x.length, y.length) >= 4 ? 4 : 3;
  for (var k = 0; k < n; k++) if (!wordNear_(x[k], y[k])) return false;
  return true;
}

/** Restrictions stay in force until HR lifts them; the review date only puts them on HR's list to look at again. */
function activeRestrictions_() {
  return find_('HIRING_RESTRICTIONS', { Status: 'Active' });
}

/** Restriction that applies to a person (by person, national ID, mobile, employee code), or null. */
function restrictionFor_(per, formerIds) {
  formerIds = formerIds || [];
  return activeRestrictions_().filter(function (r) {
    return (r.Person_ID && r.Person_ID === per.Person_ID) || (r.National_ID && r.National_ID === per.National_ID) ||
      (r.Mobile_Norm && r.Mobile_Norm === per.Mobile_Norm) || (r.Employee_ID && formerIds.indexOf(r.Employee_ID) >= 0);
  })[0] || null;
}

/** Former employees that may be this person: confirmed link, declared employee code, or a name match. */
function formerMatches_(per) {
  if (per.Former_Check === 'NOT_SAME') return [];
  var out = [], seen = {};
  function add(e, how) { if (!e || seen[e.Employee_ID]) return; seen[e.Employee_ID] = 1; out.push({ e: e, how: how }); }
  if (per.Former_Employee_ID) add(findOne_('EMPLOYEES', { Employee_ID: per.Former_Employee_ID }), 'CONFIRMED');
  if (per.Employee_ID) { var d = findOne_('EMPLOYEES', { Employee_ID: per.Employee_ID }); if (d && d.Status !== 'Active') add(d, 'CODE'); }
  if (per.Former_Check !== 'CONFIRMED') find_('EMPLOYEES', { Status: 'Exited' }).forEach(function (e) { if (sameName_(e.Full_Name, per.Full_Name)) add(e, 'NAME'); });
  return out;
}

/** Flags for the candidate page. detail = HR managers see reasons and eligibility; others only that HR must check. */
function personFlags_(ctx, per) {
  var fm = formerMatches_(per), ids = fm.map(function (x) { return x.e.Employee_ID; });
  var rs = restrictionFor_(per, ids.filter(function (id, i) { return fm[i].how !== 'NAME'; }));
  var nameRs = !rs && fm.length ? restrictionFor_({}, ids) : null;        // a restriction on a name-matched former employee
  if (!fm.length && !rs && !nameRs) return null;
  var detail = hasAnyRole_(ctx, rehireRoles_()), canRestrict = hasAnyRole_(ctx, restrictionRoles_());
  var out = { detail: detail, canRestrict: canRestrict, restricted: !!rs, possibleRestricted: !!nameRs };
  if (!detail) { out.message = rs ? 'المرشح عليه قيد تعيين — كلّم الموارد البشرية قبل أي خطوة.' : 'محتمل يكون موظف سابق — الموارد البشرية بتراجع أهليته لإعادة التعيين.'; return out; }
  out.former = fm.map(function (x) {
    var e = x.e, r = restrictionFor_({}, [e.Employee_ID]);
    return { Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, Exit_Date: e.Exit_Date, Status: e.Status, how: x.how,
      exitReason: reasonLabelAny_('EMPLOYEE_EXIT', e.Exit_Reason) || e.Exit_Reason, positionTitle: (findOne_('POSITIONS', { Position_ID: e.Position_ID }) || {}).Position_Title || '',
      eligibility: r ? 'BLOCKED' : REHIRE_REVIEW_CODES_.indexOf(e.Exit_Reason) >= 0 ? 'REVIEW' : 'ELIGIBLE' };
  });
  var R = rs || nameRs;
  if (R) out.restriction = { Restriction_ID: R.Restriction_ID, reason: reasonLabelAny_('HIRING_RESTRICTION', R.Reason_Code) || R.Reason_Code, evidence: canRestrict ? R.Evidence : '',
    review: R.Review_Date, permanent: R.Permanent === 'Y' && !R.Review_Date, at: R.Created_At, by: userNames_()[R.Created_By] || R.Created_By, onName: !rs };
  out.confirmed = per.Former_Check === 'CONFIRMED';
  return out;
}

/** p = { Person_ID, Employee_ID, same: 'Y'|'N' } — HR confirms or rejects a former-employee match. */
function formerConfirm_(ctx, p) {
  var per = findOne_('PERSONS', { Person_ID: p.Person_ID });
  if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
  var same = str_(p.same) === 'Y';
  var e = same ? findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) }) : null;
  if (same && !e) throw userError_('الموظف غير موجود.');
  withLock_(function () {
    update_('PERSONS', per.Person_ID, same ? { Former_Employee_ID: e.Employee_ID, Former_Check: 'CONFIRMED' } : { Former_Employee_ID: '', Former_Check: 'NOT_SAME' }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, null, 'SYSTEM', { Person_ID: per.Person_ID, Note: same ? 'اتأكد إنه موظف سابق (' + e.Employee_ID + ' — ' + e.Full_Name + ')' : 'اتأكد إنه مش موظف سابق' });
  });
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: same ? 'FORMER_CONFIRMED' : 'FORMER_NOT_SAME', newValue: same ? e.Employee_ID : '' });
  return { ok: true };
}

/** p = { status } — restrictions list for HR managers. */
function restrictionsList_(ctx, p) {
  var names = userNames_(), today = today_();
  return { canDecide: hasAnyRole_(ctx, [ROLE.HR_SECTOR, ROLE.CEO]), me: ctx.user.User_ID, maxReview: restrictionMaxReview_(),
    reasons: find_('REASON_MASTER', { Process: 'HIRING_RESTRICTION', Status: 'Active' }).map(function (r) { return { code: r.Code, name: r.Label_AR }; }),
    rows: find_('HIRING_RESTRICTIONS', {}).filter(function (r) { return !str_(p && p.status) || r.Status === p.status; })
      .sort(function (a, b) { return a.Restriction_ID < b.Restriction_ID ? 1 : -1; }).map(function (r) {
        r.reasonName = reasonLabelAny_('HIRING_RESTRICTION', r.Reason_Code) || r.Reason_Code;
        r.byName = names[r.Created_By] || r.Created_By; r.liftedByName = names[r.Lifted_By] || '';
        r.reviewDue = r.Status === 'Active' && r.Review_Date && r.Review_Date <= today;
        r.appealOpen = !!(r.Appeal_At && !r.Appeal_Decided_At); r.appealByName = names[r.Appeal_By] || ''; r.appealDecidedByName = names[r.Appeal_Decided_By] || '';
        return r;
      }) };
}

/**
 * p = { Employee_ID? , Person_ID?, Reason_Code, Evidence, Review_Date, Permanent:'Y'|'N' }
 * High HR authority only; never from a recruiter's impression: coded reason + evidence required.
 */
function restrictionAdd_(ctx, p) {
  var emp = str_(p.Employee_ID) ? findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) }) : null;
  var per = str_(p.Person_ID) ? findOne_('PERSONS', { Person_ID: str_(p.Person_ID) }) : null;
  if (!emp && !per) throw userError_('اختار الموظف السابق أو المرشح.');
  var code = str_(p.Reason_Code);
  if (!findOne_('REASON_MASTER', { Process: 'HIRING_RESTRICTION', Code: code, Status: 'Active' })) throw userError_('اختار سبب القيد.');
  var ev = str_(p.Evidence);
  if (ev.length < 10) throw userError_('اكتب السند (رقم قرار، تحقيق، مستند…) — القيد مايتعملش من انطباع.');
  // v0.40.0 (CHG-84): no permanent restriction — every one has a review date within RESTRICTION_MAX_YEARS (2) years
  var perm = 'N', review = str_(p.Review_Date), maxRev = restrictionMaxReview_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review)) throw userError_('حدد تاريخ مراجعة القيد — مفيش قيد دائم من غير مراجعة.');
  if (review <= today_()) throw userError_('تاريخ المراجعة لازم يكون بعد النهارده.');
  if (review > maxRev) throw userError_('أقصى تاريخ مراجعة ' + maxRev + ' (سنتين) — وبعدها يتجدد بقرار لو لسه السبب قائم.');
  var row;
  withLock_(function () {
    row = insert_('HIRING_RESTRICTIONS', { Restriction_ID: nextId_('RESTRICTION'), Employee_ID: emp ? emp.Employee_ID : (per && per.Former_Employee_ID) || '',
      Person_ID: per ? per.Person_ID : '', Full_Name: emp ? emp.Full_Name : per.Full_Name, National_ID: per ? per.National_ID : '', Mobile_Norm: per ? per.Mobile_Norm : '',
      Reason_Code: code, Evidence: ev.slice(0, 1000), Review_Date: perm === 'Y' ? '' : review, Permanent: perm, Status: 'Active',
      Lifted_Reason: '', Lifted_By: '', Lifted_At: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'HIRING_RESTRICTION', entityId: row.Restriction_ID, action: 'CREATE', newValue: row.Full_Name + ' · ' + code });
  return row;
}

function restrictionMaxReview_() { return addDaysYmd_(today_(), Math.round(365.25 * Math.max(1, num_(cfg_('RESTRICTION_MAX_YEARS', 2), 2)))); }

/**
 * v0.40.0 (CHG-84): the person's appeal (التظلم), recorded by HR — p = { Restriction_ID, note }. The HR Sector Manager decides
 * (never the one who placed the restriction): UPHOLD keeps it, LIFT lifts it. p = { Restriction_ID, decision, note }
 */
function restrictionAppeal_(ctx, p) {
  var r = findOne_('HIRING_RESTRICTIONS', { Restriction_ID: p.Restriction_ID });
  if (!r || r.Status !== 'Active') throw userError_('القيد غير موجود أو اترفع.');
  if (r.Appeal_At && !r.Appeal_Decided_At) throw userError_('فيه تظلم مستني القرار بالفعل.');
  var note = str_(p.note);
  if (note.length < 10) throw userError_('اكتب ملخص التظلم وأسبابه (10 حروف على الأقل).');
  withLock_(function () { update_('HIRING_RESTRICTIONS', r.Restriction_ID, { Appeal_At: nowIso_(), Appeal_Note: note.slice(0, 1000), Appeal_By: ctx.user.User_ID,
    Appeal_Decision: '', Appeal_Decided_By: '', Appeal_Decided_At: '', Appeal_Decision_Note: '' }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'HIRING_RESTRICTION', entityId: r.Restriction_ID, action: 'APPEAL', reason: note });
  var deciders = roleUserIds_([ROLE.HR_SECTOR]).filter(function (u) { return u !== r.Created_By && u !== ctx.user.User_ID; });
  notify_(deciders.length ? deciders : roleUserIds_([ROLE.CEO]), 'تظلم من قيد تعيين — ' + r.Full_Name, note.slice(0, 200), 'RESTRICTION', r.Restriction_ID, true);
  return { ok: true };
}
function restrictionDecide_(ctx, p) {
  var r = findOne_('HIRING_RESTRICTIONS', { Restriction_ID: p.Restriction_ID });
  if (!r || r.Status !== 'Active') throw userError_('القيد غير موجود أو اترفع.');
  if (!hasAnyRole_(ctx, [ROLE.HR_SECTOR, ROLE.CEO])) throw userError_('القرار في التظلم لمدير قطاع الموارد البشرية.');
  if (!r.Appeal_At || r.Appeal_Decided_At) throw userError_('مفيش تظلم مستني القرار.');
  if (r.Created_By === ctx.user.User_ID || r.Appeal_By === ctx.user.User_ID) throw userError_('إنت اللي حطيت القيد أو سجّلت التظلم — القرار يروح للرئيس التنفيذي.');
  var dec = str_(p.decision), note = str_(p.note);
  if (['UPHOLD', 'LIFT'].indexOf(dec) < 0) throw userError_('اختار القرار.');
  if (note.length < 5) throw userError_('اكتب أسباب القرار.');
  var patch = { Appeal_Decision: dec, Appeal_Decided_By: ctx.user.User_ID, Appeal_Decided_At: nowIso_(), Appeal_Decision_Note: note.slice(0, 600) };
  if (dec === 'LIFT') { patch.Status = 'Lifted'; patch.Lifted_Reason = 'تظلم اتقبل: ' + note.slice(0, 200); patch.Lifted_By = ctx.user.User_ID; patch.Lifted_At = nowIso_(); }
  withLock_(function () { update_('HIRING_RESTRICTIONS', r.Restriction_ID, patch, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'HIRING_RESTRICTION', entityId: r.Restriction_ID, action: 'APPEAL_' + dec, reason: note });
  if (r.Appeal_By) notify_([r.Appeal_By], 'قرار التظلم — ' + r.Full_Name, (dec === 'LIFT' ? 'اترفع القيد' : 'القيد مستمر') + ': ' + note, 'RESTRICTION', r.Restriction_ID, false);
  return { ok: true, decision: dec };
}

/** Daily (working days): a restriction whose review date came → HR managers are told once per review date. */
function restrictionDaily_() {
  var day = today_(), n = 0, to = null;
  find_('HIRING_RESTRICTIONS', { Status: 'Active' }).forEach(function (r) {
    if (!r.Review_Date || r.Review_Date > day || str_(r.Review_Reminded_At).slice(0, 10) >= r.Review_Date) return;
    if (!to) to = roleUserIds_(restrictionRoles_());
    withLock_(function () { update_('HIRING_RESTRICTIONS', r.Restriction_ID, { Review_Reminded_At: nowIso_() }, 'SYSTEM'); });
    notify_(to, 'وقت مراجعة قيد تعيين — ' + r.Full_Name, 'تاريخ المراجعة ' + r.Review_Date + '. ارفع القيد أو جدّده بقرار وتاريخ مراجعة جديد.', 'RESTRICTION', r.Restriction_ID, false);
    n++;
  });
  return { review: n };
}

/** p = { Restriction_ID, Review_Date, reason } — renew a restriction after its review (new date within 2 years). */
function restrictionRenew_(ctx, p) {
  var r = findOne_('HIRING_RESTRICTIONS', { Restriction_ID: p.Restriction_ID });
  if (!r || r.Status !== 'Active') throw userError_('القيد غير موجود أو اترفع.');
  var review = str_(p.Review_Date), reason = str_(p.reason), maxRev = restrictionMaxReview_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review) || review <= today_()) throw userError_('اختار تاريخ مراجعة جديد بعد النهارده.');
  if (review > maxRev) throw userError_('أقصى تاريخ مراجعة ' + maxRev + ' (سنتين).');
  if (reason.length < 5) throw userError_('اكتب ليه القيد لسه لازم.');
  var res;
  withLock_(function () { res = update_('HIRING_RESTRICTIONS', r.Restriction_ID, { Review_Date: review, Permanent: 'N' }, ctx.user.User_ID); });
  auditDiff_(ctx, 'HIRING_RESTRICTION', r.Restriction_ID, res.before, res.after, reason);
  return { ok: true };
}

/** p = { Restriction_ID, reason } */
function restrictionLift_(ctx, p) {
  var r = findOne_('HIRING_RESTRICTIONS', { Restriction_ID: p.Restriction_ID });
  if (!r || r.Status !== 'Active') throw userError_('القيد غير موجود أو اترفع.');
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب رفع القيد.');
  withLock_(function () { update_('HIRING_RESTRICTIONS', r.Restriction_ID, { Status: 'Lifted', Lifted_Reason: reason, Lifted_By: ctx.user.User_ID, Lifted_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'HIRING_RESTRICTION', entityId: r.Restriction_ID, action: 'LIFT', reason: reason });
  return { ok: true };
}

/** New application for a restricted person: HR managers are told (in-app only). */
function alertRestricted_(app, per) {
  try {
    var ids = formerMatches_(per).filter(function (x) { return x.how !== 'NAME'; }).map(function (x) { return x.e.Employee_ID; });
    if (!restrictionFor_(per, ids)) return;
    notify_(roleUserIds_(restrictionRoles_()), 'متقدم عليه قيد تعيين', per.Full_Name + ' — ' + app.Application_ID + '. راجع القيد قبل أي خطوة.', 'APPLICATION', app.Application_ID, false);
  } catch (e) { console.warn('restriction alert: ' + e); }
}
