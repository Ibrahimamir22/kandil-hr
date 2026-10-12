/**
 * Privacy.gs — v0.14.1: personal-data protection (Egyptian PDP Law 151/2020 — wording awaits legal review).
 *
 *   • Separate, recorded consents (CONSENTS, append-only): application, salary data (financial = sensitive),
 *     storage outside Egypt, talent pool (optional, time-limited), hiring documents (sensitive), references.
 *   • Talent pool only with the person's consent, valid RETENTION_POOL_MONTHS; expired consents leave the pool.
 *   • Legal entities (LEGAL_ENTITIES): the employer of each vacancy, inherited down the structure.
 *   • Retention: candidates due for deletion by rule (rejected / did not join); deletion is manual by HR managers,
 *     automatic only when RETENTION_ENABLED = Y. Deletion clears personal fields and trashes the files, and keeps
 *     anonymous statistics (stages, sources, dates).
 *   • Data-subject requests (DATA_REQUESTS): access (printable export), correction, deletion, pool withdrawal.
 *   • Criminal record and medical form files open for HR managers, the recruitment manager and the application owner only.
 */

var CONSENT_KINDS_ = { APPLY: 'التقديم ومعالجة البيانات', SENSITIVE: 'بيانات المرتب (بيانات مالية حساسة)', TRANSFER: 'التخزين على خدمات خارج مصر',
  POOL: 'قاعدة المرشحين', POOL_WITHDRAW: 'سحب موافقة قاعدة المرشحين', DOCS: 'مسوغات التعيين (بيانات حساسة)', REFERENCE: 'التواصل مع المراجع',
  GUARDIAN: 'موافقة ولي الأمر (أقل من 18 سنة)', PHOTO: 'الصورة الشخصية', AI_WITHDRAW: 'سحب الموافقة على القراءة بالذكاء الاصطناعي' };
var CONSENT_CHANNELS_ = { ONLINE: 'أونلاين', RECRUITER: 'سجّلها مسؤول التوظيف', IMPORT: 'استيراد', DOCS_LINK: 'لينك المسوغات', PAPER: 'ورقي موقّع', REQUEST: 'طلب صاحب البيانات', LINK: 'لينك الموافقة' };
var DSR_KINDS_ = { ACCESS: 'اطلاع على البيانات', CORRECT: 'تصحيح بيانات', DELETE: 'حذف البيانات', POOL_WITHDRAW: 'سحب موافقة قاعدة المرشحين',
  OBJECT: 'اعتراض على المعالجة', AI_WITHDRAW: 'سحب الموافقة على القراءة بالذكاء الاصطناعي', OTHER: 'أخرى' };
var DSR_ID_METHODS_ = { NID_CARD: 'اطلعنا على البطاقة', REG_EMAIL: 'من الإيميل المسجّل', REG_MOBILE: 'مكالمة على الموبايل المسجّل', IN_PERSON: 'حضوري' };
var DSR_CHANNELS_ = { EMAIL: 'إيميل', PHONE: 'تليفون', WHATSAPP: 'واتساب', IN_PERSON: 'حضوري', LETTER: 'خطاب' };

function privacyRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }
function sensitiveDocRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }

function addMonthsYmd_(ymd, n) {
  var y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)) - 1 + Number(n || 0), d = Number(ymd.slice(8, 10));
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + Math.min(d, last)).slice(-2);
}

/* ---------------- consents ---------------- */

/** Append one consent record (inside a lock or not — insert_ is append-only). */
function consentLog_(actorId, f) {
  return insert_('CONSENTS', { Consent_ID: nextId_('CONSENT'), Person_ID: str_(f.Person_ID), Application_ID: str_(f.Application_ID), Kind: str_(f.Kind),
    Granted: f.Granted === 'N' ? 'N' : 'Y', Version: str_(f.Version), Channel: str_(f.Channel), Until: str_(f.Until), Note: str_(f.Note).slice(0, 300) }, actorId || 'SYSTEM');
}

function poolConsentActive_(per) { return !!per && per.Pool_Consent === 'Y' && str_(per.Pool_Consent_Until) >= today_(); }

/** Record the person's talent-pool consent for RETENTION_POOL_MONTHS (runs inside a lock). */
function poolConsentGrant_(actorId, personId, appId, channel, note) {
  var until = addMonthsYmd_(today_(), num_(cfg_('RETENTION_POOL_MONTHS', 12), 12));
  update_('PERSONS', personId, { Pool_Consent: 'Y', Pool_Consent_At: nowIso_(), Pool_Consent_Until: until }, actorId);
  consentLog_(actorId, { Person_ID: personId, Application_ID: appId, Kind: 'POOL', Version: str_(cfg_('PRIVACY_VERSION', '1')), Channel: channel, Until: until, Note: note });
  return until;
}

/** Withdraw the pool consent: the person leaves the pool (runs inside a lock). */
function poolConsentWithdraw_(actorId, personId, channel, note) {
  update_('PERSONS', personId, { Pool_Consent: 'N', Pool_Consent_Until: '' }, actorId);
  consentLog_(actorId, { Person_ID: personId, Kind: 'POOL_WITHDRAW', Granted: 'N', Version: str_(cfg_('PRIVACY_VERSION', '1')), Channel: channel, Note: note });
  find_('TALENT_POOL', { Person_ID: personId, Status: 'Active' }).forEach(function (r) {
    update_('TALENT_POOL', r.Pool_ID, { Status: 'Removed', Removed_Reason: 'سحب الموافقة' }, actorId);
  });
}

/** Consents of a person for the candidate page. */
function consentsOf_(personId) {
  var names = userNames_();
  return find_('CONSENTS', { Person_ID: personId }).sort(function (a, b) { return a.Consent_ID < b.Consent_ID ? -1 : 1; }).map(function (c) {
    return { Kind: c.Kind, kindName: CONSENT_KINDS_[c.Kind] || c.Kind, Granted: c.Granted, Version: c.Version, channelName: CONSENT_CHANNELS_[c.Channel] || c.Channel,
      Until: c.Until, at: c.Created_At, by: c.Created_By === 'PUBLIC' ? 'المرشح' : (names[c.Created_By] || ''), Note: c.Note };
  });
}

/** p = { Application_ID, action: GRANT|WITHDRAW, note } — the recruiter records the pool consent the candidate gave (or withdrew). */
function poolConsentSave_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, me = ctx.user.User_ID, note = str_(p.note);
  if (note.length < 3) throw userError_('اكتب إزاي المرشح وافق / سحب الموافقة (مثال: وافق في مكالمة يوم ...).');
  var until = '';
  withLock_(function () {
    if (str_(p.action) === 'WITHDRAW') poolConsentWithdraw_(me, a.Person_ID, 'RECRUITER', note);
    else until = poolConsentGrant_(me, a.Person_ID, a.Application_ID, 'RECRUITER', note);
  });
  audit_(ctx, { entityType: 'PERSON', entityId: a.Person_ID, action: str_(p.action) === 'WITHDRAW' ? 'POOL_CONSENT_WITHDRAW' : 'POOL_CONSENT', newValue: until, reason: note });
  return { until: until };
}

/* ---------------- legal entities ---------------- */

function entitiesAll_() { return all_('LEGAL_ENTITIES').sort(function (a, b) { return a.Entity_ID < b.Entity_ID ? -1 : 1; }); }

/** The legal entity of an org unit: its own, else the nearest parent's. */
function entityOfUnit_(unitId) {
  var seen = {}, u = unitId ? get_('ORG_UNITS', unitId) : null;
  while (u && !seen[u.Org_Unit_ID]) {
    seen[u.Org_Unit_ID] = 1;
    if (u.Legal_Entity_ID) { var e = get_('LEGAL_ENTITIES', u.Legal_Entity_ID); if (e && e.Status !== 'Inactive') return e; }
    u = u.Parent_Org_Unit_ID ? get_('ORG_UNITS', u.Parent_Org_Unit_ID) : null;
  }
  return null;
}
function entityOfVacancy_(v) {
  var pos = v && v.Position_ID ? get_('POSITIONS', v.Position_ID) : null;
  return pos ? entityOfUnit_(pos.Org_Unit_ID) : null;
}

/** p = { Entity_ID?, Name_AR, Name_EN, Commercial_Reg, Tax_ID, Address, Status, units: [Org_Unit_ID] } */
function entitySave_(ctx, p) {
  var name = str_(p.Name_AR);
  if (name.length < 3) throw userError_('اكتب اسم الشركة زي السجل التجاري.');
  var units = (Array.isArray(p.units) ? p.units : []).map(str_).filter(function (id) { return !!get_('ORG_UNITS', id); });
  var f = { Name_AR: name.slice(0, 150), Name_EN: str_(p.Name_EN).slice(0, 150), Commercial_Reg: str_(p.Commercial_Reg).slice(0, 40), Tax_ID: str_(p.Tax_ID).slice(0, 40),
    Address: str_(p.Address).slice(0, 300), Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active',
    Signatory_Name: str_(p.Signatory_Name).slice(0, 100), Signatory_Title: str_(p.Signatory_Title).slice(0, 100) };     // v0.47.0 (CHG-101): who signs the contracts
  var me = ctx.user.User_ID, res;
  withLock_(function () {
    if (str_(p.Entity_ID)) { if (!get_('LEGAL_ENTITIES', p.Entity_ID)) throw userError_('الشركة غير موجودة.'); res = update_('LEGAL_ENTITIES', p.Entity_ID, f, me).after; }
    else { f.Entity_ID = nextId_('LEGAL_ENTITY'); res = insert_('LEGAL_ENTITIES', f, me); }
    all_('ORG_UNITS').forEach(function (u) {
      var want = units.indexOf(u.Org_Unit_ID) >= 0;
      if (want && u.Legal_Entity_ID !== res.Entity_ID) update_('ORG_UNITS', u.Org_Unit_ID, { Legal_Entity_ID: res.Entity_ID }, me);
      else if (!want && u.Legal_Entity_ID === res.Entity_ID) update_('ORG_UNITS', u.Org_Unit_ID, { Legal_Entity_ID: '' }, me);
    });
  });
  audit_(ctx, { entityType: 'LEGAL_ENTITY', entityId: res.Entity_ID, action: str_(p.Entity_ID) ? 'UPDATE' : 'CREATE', newValue: name + ' / ' + units.join(',') });
  return res;
}

/* ---------------- deletion (retention) ---------------- */

var LIVE_STAGES_ = function () { return STAGES_ACTIVE_.concat(['ON_HOLD', 'JOINED']); };

/** Why this person cannot be deleted (or '' when it can). */
function purgeBlock_(per) {
  if (!per || per.Status === 'Purged') return 'اتحذف قبل كده.';
  if (per.Status === 'Merged') return 'اتدمج في ملف تاني — احذف الملف الأساسي.';
  if (per.Is_Employee === 'Y') return 'موظف — بياناته في ملف الموظف وبتتحفظ بقانون العمل.';
  var live = find_('APPLICATIONS', { Person_ID: per.Person_ID }).filter(function (a) { return LIVE_STAGES_().indexOf(a.Stage) >= 0; });
  if (live.length) return 'عليه طلب شغال (' + live.map(function (a) { return a.Application_ID; }).join('، ') + ') — اقفله الأول.';
  return '';
}

function trashFile_(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('trash ' + id + ': ' + e); } }

/**
 * Delete a person's personal data: personal fields cleared, CV / hiring documents / signed offers / test evidence trashed,
 * references and notes cleared. Applications, stages, sources and dates stay as anonymous statistics. Runs inside a lock.
 */
function purgePerson_(actorId, personId, reason) {
  var per = get_('PERSONS', personId), why = purgeBlock_(per);
  if (why) throw userError_(why);
  var apps = find_('APPLICATIONS', { Person_ID: personId }), appIds = apps.map(function (a) { return a.Application_ID; });
  var files = 0;
  trashFile_(per.CV_File_ID); if (per.CV_File_ID) files++;
  appIds.forEach(function (aid) {
    find_('CANDIDATE_DOCS', { Application_ID: aid }).forEach(function (d) {
      (JSON.parse(d.Files_JSON || '[]') || []).forEach(function (f) { trashFile_(f.id); files++; });
      update_('CANDIDATE_DOCS', d.Doc_ID, { Files_JSON: '[]', Review_Note: '', Expiry_Date: '', Defer_Reason: '', Waive_Reason: '' }, actorId);
    });
    find_('OFFERS', { Application_ID: aid }).forEach(function (o) {
      (JSON.parse(o.Evidence_JSON || '[]') || []).forEach(function (f) { trashFile_(f.id); files++; });
      if (o.Evidence_JSON) update_('OFFERS', o.Offer_ID, { Evidence_JSON: '[]', Response_Note: '', Decline_Note: '' }, actorId);
      if (o.No_Ins_Form_File) { trashFile_(o.No_Ins_Form_File); files++; update_('OFFERS', o.Offer_ID, { No_Ins_Form_File: '' }, actorId); }     // v0.40.0
    });
    find_('JOININGS', { Application_ID: aid }).forEach(function (j) {          // v0.40.0: the signed employment contract
      if (j.Contract_File_ID) { trashFile_(j.Contract_File_ID); files++; update_('JOININGS', j.Joining_ID, { Contract_File_ID: '' }, actorId); }
    });
    find_('INTERVIEWS', { Application_ID: aid }).forEach(function (iv) {
      find_('EVALUATIONS', { Interview_ID: iv.Interview_ID }).forEach(function (e) {
        var d = {}; try { d = JSON.parse(e.Data_JSON || '{}') || {}; } catch (x) {}
        (d.files || []).forEach(function (f) { trashFile_(f.id); files++; });
        // v0.34.0: written comments go too — ratings and the recommendation stay as anonymous statistics
        update_('EVALUATIONS', e.Evaluation_ID, { Data_JSON: JSON.stringify(scrubEvalData_(d)), Strengths: '', Concerns: '', Summary: '', Revision_Reason: '' }, actorId);
      });
    });
    find_('REFERENCE_CHECKS', { Application_ID: aid }).forEach(function (r) {
      update_('REFERENCE_CHECKS', r.Reference_ID, { Referee_Name: '—', Referee_Company: '', Referee_Title: '', Referee_Mobile: '', Notes: '' }, actorId);
    });
    find_('ACTIVITIES', { Application_ID: aid }).forEach(function (x) { if (x.Note) update_('ACTIVITIES', x.Activity_ID, { Note: '' }, actorId); });
    var a = get_('APPLICATIONS', aid);
    update_('APPLICATIONS', aid, { Answers_JSON: '', Referrer_Name: '', Close_Note: '', Hold_Reason: '' }, actorId);
    if (a.Stage !== 'REJECTED' && a.Stage !== 'WITHDRAWN') update_('APPLICATIONS', aid, { Stage: 'WITHDRAWN', Stage_At: nowIso_(), Close_Code: 'DATA_DELETED' }, actorId);
  });
  find_('ATT_ENROLL', { Person_ID: personId }).forEach(function (r) { update_('ATT_ENROLL', r.Enroll_ID, { Full_Name: 'محذوف — ' + personId, Bio_Code: '', Note: '' }, actorId); });     // v0.44.0 (CHG-91)
  find_('TALENT_POOL', { Person_ID: personId, Status: 'Active' }).forEach(function (r) { update_('TALENT_POOL', r.Pool_ID, { Status: 'Removed', Removed_Reason: 'حذف البيانات' }, actorId); });
  var fullName = str_(per.Full_Name);
  update_('PERSONS', personId, { Full_Name: 'محذوف — ' + personId, Mobile: '', Mobile_Norm: '', Email: '', National_ID: '', Birth_Date: '', City: '',
    Gender: '', Governorate: '', Education: '', Specialization: '', Graduation_Year: '', Experience_Years: '', Notice_Period: '',
    Current_Employer: '', Current_Title: '', Current_Salary: '', Expected_Salary: '', CV_File_ID: '', CV_File_Name: '', CV_Updated_At: '', Notes: '', Residence_Address: '',
    Dup_Candidates: '', Former_Check: '', Pool_Consent: 'N', Pool_Consent_Until: '', Status: 'Purged', Purged_At: nowIso_(), Purge_Reason: str_(reason).slice(0, 200) }, actorId);
  // v0.34.0: every other copy — AI readings, photo, notifications that carry the name, old values in the audit log, the cache
  cvaiPurge_(actorId, personId);
  photoPurge_(actorId, personId);
  purgeNotifications_(actorId, fullName);
  purgeAudit_(actorId, [personId].concat(appIds));
  return { files: files, apps: appIds.length };
}

/** Evaluation data with the written notes removed (ratings, scores and question ids kept). */
function scrubEvalData_(d) {
  d = d && typeof d === 'object' ? d : {};
  ['comps', 'qs', 'reqs', 'added'].forEach(function (k) {
    if (!Array.isArray(d[k])) return;
    d[k] = d[k].map(function (x) {
      var y = {}; Object.keys(x || {}).forEach(function (f) { if (['n', 'e', 'q', 'note', 'text'].indexOf(f) < 0) y[f] = x[f]; });
      return y;
    });
  });
  d.files = [];
  return d;
}

/** Notification titles / bodies that name the person: the name is replaced. */
function purgeNotifications_(actorId, fullName) {
  fullName = str_(fullName);
  if (fullName.length < 3) return;
  all_('NOTIFICATIONS').forEach(function (n) {
    if (str_(n.Title).indexOf(fullName) < 0 && str_(n.Body).indexOf(fullName) < 0) return;
    update_('NOTIFICATIONS', n.Notification_ID, { Title: str_(n.Title).split(fullName).join('(محذوف)'), Body: str_(n.Body).split(fullName).join('(محذوف)') }, actorId);
  });
}

/** Old and new values of the person's and his applications' audit rows become «محذوف» (the event itself stays). */
function purgeAudit_(actorId, entityIds) {
  var want = {}; entityIds.forEach(function (id) { if (id) want[id] = 1; });
  var keep = { Stage: 1, Status: 1, Close_Code: 1, Source: 1, Channel: 1, Owner_User_ID: 1, Vacancy_ID: 1 };
  all_('AUDIT_LOG').forEach(function (r) {
    if (!want[r.Entity_ID] || keep[r.Field]) return;
    if (!str_(r.Old_Value) && !str_(r.New_Value)) return;
    update_('AUDIT_LOG', r.Audit_ID, { Old_Value: str_(r.Old_Value) ? 'محذوف' : '', New_Value: str_(r.New_Value) ? 'محذوف' : '', Redacted: str_(r.Chain_Hash) ? 'Y' : '' }, actorId);     // v0.49.0: the seals stay
  });
  // v0.35.0: the archived audit rows too (archive spreadsheet, moved there monthly)
  try {
    var id = PropertiesService.getScriptProperties().getProperty('ARCHIVE_SS_ID'); if (!id) return;
    var sh = SpreadsheetApp.openById(id).getSheetByName('AUDIT_LOG'); if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = vals[0].map(str_);
    var cE = h.indexOf('Entity_ID'), cF = h.indexOf('Field'), cO = h.indexOf('Old_Value'), cN = h.indexOf('New_Value');
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      if (!want[str_(r[cE])] || keep[str_(r[cF])] || (!str_(r[cO]) && !str_(r[cN]))) continue;
      var row = [str_(r[cO]) ? 'محذوف' : '', str_(r[cN]) ? 'محذوف' : ''];
      sh.getRange(i + 1, cO + 1, 1, 1).setValues([[row[0]]]); sh.getRange(i + 1, cN + 1, 1, 1).setValues([[row[1]]]);
      var cR = h.indexOf('Redacted'), cH = h.indexOf('Chain_Hash');
      if (cR >= 0 && cH >= 0 && str_(r[cH])) sh.getRange(i + 1, cR + 1, 1, 1).setValues([['Y']]);
    }
  } catch (e) { console.warn('archive purge: ' + e); }
}

/** Candidates whose data is due for deletion today by the retention rules. */
function retentionDue_(day) {
  day = day || today_();
  var rejM = num_(cfg_('RETENTION_REJECTED_MONTHS', 6), 6), dnjM = num_(cfg_('RETENTION_DNJ_MONTHS', 3), 3), out = [];
  var byPerson = {};
  all_('APPLICATIONS').forEach(function (a) { (byPerson[a.Person_ID] = byPerson[a.Person_ID] || []).push(a); });
  all_('PERSONS').forEach(function (per) {
    if (per.Status !== 'Active' || per.Is_Employee === 'Y') return;
    var apps = byPerson[per.Person_ID] || [];
    if (!apps.length || apps.some(function (a) { return LIVE_STAGES_().indexOf(a.Stage) >= 0; })) return;
    if (poolConsentActive_(per)) return;
    var last = apps.reduce(function (m, a) { return str_(a.Stage_At) > str_(m.Stage_At) ? a : m; }, apps[0]);
    var dnj = last.Close_Code === 'DID_NOT_JOIN', closed = str_(last.Stage_At).slice(0, 10);
    if (!closed) return;
    var dueOn = addMonthsYmd_(closed, dnj ? dnjM : rejM);
    if (dueOn > day) return;
    out.push({ Person_ID: per.Person_ID, name: per.Full_Name, closedAt: closed, dueOn: dueOn, rule: dnj ? 'قبل العرض وماستلمش' : 'طلب مقفول', apps: apps.length,
      pool: per.Pool_Consent === 'Y' ? 'موافقة القاعدة خلصت ' + per.Pool_Consent_Until : '' });
  });
  return out.sort(function (a, b) { return a.dueOn < b.dueOn ? -1 : 1; });
}

/** Daily: pool entries with expired consent leave the pool; due candidates are deleted when RETENTION_ENABLED. */
function retentionDaily_() {
  var out = { poolExpired: 0, purged: 0 };
  if (!cfg_('RETENTION_ENABLED', false)) return out;
  if (!golive_()) { out.testData = retentionDue_(today_()).length; return out; }     // v0.38.0: test data before go-live — listed, never deleted
  var day = today_();
  withLock_(function () {
    find_('TALENT_POOL', { Status: 'Active' }).forEach(function (r) {
      var per = get_('PERSONS', r.Person_ID);
      if (per && !poolConsentActive_(per)) { update_('TALENT_POOL', r.Pool_ID, { Status: 'Removed', Removed_Reason: 'مفيش موافقة سارية' }, 'SYSTEM'); out.poolExpired++; }
    });
  });
  retentionDue_(day).slice(0, 30).forEach(function (x) {
    try { withLock_(function () { purgePerson_('SYSTEM', x.Person_ID, 'مدة الاحتفاظ انتهت (' + x.rule + ')'); }); out.purged++; }
    catch (e) { console.warn('purge ' + x.Person_ID + ': ' + e); }
  });
  if (out.purged) audit_(null, { userId: 'SYSTEM', entityType: 'PRIVACY', entityId: day, action: 'RETENTION_PURGE', newValue: String(out.purged) });
  return out;
}

/** p = { Person_ID, reason, Request_ID? } — delete now (HR managers). */
function privacyPurge_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب الحذف.');
  var r;
  withLock_(function () {
    r = purgePerson_(ctx.user.User_ID, str_(p.Person_ID), reason);
    if (str_(p.Request_ID)) update_('DATA_REQUESTS', p.Request_ID, { Status: 'DONE', Outcome: 'اتحذفت البيانات', Closed_By: ctx.user.User_ID, Closed_At: nowIso_() }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'PERSON', entityId: str_(p.Person_ID), action: 'PURGE', newValue: r.files + ' files', reason: reason });
  return r;
}

/* ---------------- data-subject requests ---------------- */

/** p = { q } — find persons by name / mobile / email / national ID. */
function privacyFind_(ctx, p) {
  var q = norm_(latinDigits_(p.q));
  if (q.length < 3) throw userError_('اكتب 3 حروف أو أرقام على الأقل.');
  return all_('PERSONS').filter(function (x) {
    return x.Status !== 'Merged' && norm_([x.Full_Name, x.Mobile_Norm, x.Email, x.National_ID, x.Person_ID].join(' ')).indexOf(q) >= 0;
  }).slice(0, 30).map(function (x) {
    return { Person_ID: x.Person_ID, name: x.Full_Name, mobile: x.Mobile, Status: x.Status, apps: find_('APPLICATIONS', { Person_ID: x.Person_ID }).length,
      block: purgeBlock_(x), pool: poolConsentActive_(x) ? x.Pool_Consent_Until : '' };
  });
}

/** p = { Person_ID, Kind, Channel, Received_On, Details } */
function dsrSave_(ctx, p) {
  var per = get_('PERSONS', str_(p.Person_ID));
  if (!per) throw userError_('اختار صاحب البيانات.');
  if (!DSR_KINDS_[str_(p.Kind)]) throw userError_('اختار نوع الطلب.');
  if (!DSR_CHANNELS_[str_(p.Channel)]) throw userError_('اختار وصل إزاي.');
  var rec = str_(p.Received_On) || today_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec) || rec > today_()) throw userError_('تاريخ استلام الطلب غلط.');
  var r;
  withLock_(function () {
    r = insert_('DATA_REQUESTS', { Request_ID: nextId_('DATA_REQUEST'), Person_ID: per.Person_ID, Kind: p.Kind, Channel: p.Channel, Received_On: rec,
      Due_Date: addDaysYmd_(rec, num_(cfg_('DSR_DAYS', 30), 30)), Details: str_(p.Details).slice(0, 500), Status: 'OPEN', Outcome: '', Closed_By: '', Closed_At: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'DATA_REQUEST', entityId: r.Request_ID, action: 'CREATE', newValue: p.Kind + ' ' + per.Person_ID });
  return r;
}

/**
 * p = { Request_ID, Status: DONE|REFUSED, Outcome, Identity_Method } — POOL_WITHDRAW done also withdraws the consent;
 * AI_WITHDRAW done stops any further AI reading of the person (v0.38.0). The identity check is recorded first (CHG-80).
 */
function dsrClose_(ctx, p) {
  var r = get_('DATA_REQUESTS', str_(p.Request_ID));
  if (!r || r.Status !== 'OPEN') throw userError_('الطلب مش مفتوح.');
  var st = str_(p.Status) === 'REFUSED' ? 'REFUSED' : 'DONE', outc = str_(p.Outcome);
  if (outc.length < 3) throw userError_('اكتب اللي اتعمل / سبب الرفض.');
  var idm = str_(p.Identity_Method);
  if (!DSR_ID_METHODS_[idm]) throw userError_('سجّل اتأكدت من شخصية صاحب الطلب إزاي قبل ما تقفله.');
  withLock_(function () {
    if (st === 'DONE' && r.Kind === 'POOL_WITHDRAW') poolConsentWithdraw_(ctx.user.User_ID, r.Person_ID, 'REQUEST', r.Request_ID);
    if (st === 'DONE' && r.Kind === 'AI_WITHDRAW') {
      update_('PERSONS', r.Person_ID, { Ai_Opt_Out: 'Y' }, ctx.user.User_ID);
      consentLog_(ctx.user.User_ID, { Person_ID: r.Person_ID, Kind: 'AI_WITHDRAW', Granted: 'N', Version: str_(cfg_('PRIVACY_VERSION', '1')), Channel: 'REQUEST', Note: r.Request_ID });
    }
    update_('DATA_REQUESTS', r.Request_ID, { Status: st, Outcome: outc.slice(0, 500), Closed_By: ctx.user.User_ID, Closed_At: nowIso_(),
      Identity_Method: idm, Identity_Checked_By: ctx.user.User_ID, Identity_Checked_At: nowIso_() }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'DATA_REQUEST', entityId: r.Request_ID, action: st, reason: outc });
  return { ok: true };
}

function dsrList_(ctx, p) {
  var names = userNames_(), day = today_();
  return all_('DATA_REQUESTS').sort(function (a, b) { return a.Request_ID < b.Request_ID ? 1 : -1; }).slice(0, 300).map(function (r) {
    var per = get_('PERSONS', r.Person_ID) || {};
    return { Request_ID: r.Request_ID, Person_ID: r.Person_ID, name: per.Full_Name, Kind: r.Kind, kindName: DSR_KINDS_[r.Kind], channelName: DSR_CHANNELS_[r.Channel],
      Received_On: r.Received_On, Due_Date: r.Due_Date, overdue: r.Status === 'OPEN' && r.Due_Date < day, Details: r.Details, Status: r.Status, Outcome: r.Outcome,
      identity: DSR_ID_METHODS_[r.Identity_Method] || '', identityBy: names[r.Identity_Checked_By] || '',
      closedBy: names[r.Closed_By] || '', Closed_At: r.Closed_At, block: r.Kind === 'DELETE' && r.Status === 'OPEN' ? purgeBlock_(per) : '' };
  });
}

/** p = { Person_ID } — printable copy of everything the portal holds about a person (access request). */
function privacyExport_(ctx, p) {
  var per = get_('PERSONS', str_(p.Person_ID));
  if (!per) throw userError_('صاحب البيانات غير موجود.');
  var row = function (k, v) { return v ? '<tr><td style="border:1px solid #bbb;padding:5px;width:34%">' + escHtml_(k) + '</td><td style="border:1px solid #bbb;padding:5px">' + escHtml_(v) + '</td></tr>' : ''; };
  var tbl = function (rows) { return '<table style="width:100%;border-collapse:collapse;margin-bottom:14px">' + rows + '</table>'; };
  var h = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;max-width:780px;margin:auto"><h3 style="text-align:center">بياناتك الشخصية المسجلة في بوابة التوظيف</h3>' +
    '<div style="text-align:center;color:#555">قنديل مصر — الموارد البشرية · ' + escHtml_(today_()) + '</div><h4>البيانات الأساسية</h4>' +
    tbl([['الاسم', per.Full_Name], ['الموبايل', per.Mobile], ['الإيميل', per.Email], ['الرقم القومي', per.National_ID], ['تاريخ الميلاد', per.Birth_Date], ['النوع', per.Gender === 'F' ? 'أنثى' : per.Gender === 'M' ? 'ذكر' : ''],
      ['المحافظة / المدينة', [per.Governorate, per.City].filter(String).join(' — ')], ['محل الإقامة', per.Residence_Address], ['المؤهل والتخصص', [EDU_LABEL_[per.Education] || per.Education, per.Specialization, per.Graduation_Year].filter(String).join(' — ')],
      ['سنين الخبرة', per.Experience_Years], ['جهة العمل / المسمى', [per.Current_Employer, per.Current_Title].filter(String).join(' — ')], ['المرتب الحالي / المتوقع', [per.Current_Salary, per.Expected_Salary].filter(String).join(' / ')],
      ['السيرة الذاتية', per.CV_File_Name], ['قاعدة المرشحين', poolConsentActive_(per) ? 'موافق لحد ' + per.Pool_Consent_Until : 'لا']].map(function (x) { return row(x[0], x[1]); }).join(''));
  var apps = find_('APPLICATIONS', { Person_ID: per.Person_ID });
  if (apps.length) h += '<h4>طلبات التوظيف</h4>' + tbl(apps.map(function (a) {
    var v = get_('VACANCIES', a.Vacancy_ID); return row((v ? vacTitle_(v).ar : a.Vacancy_ID) + ' (' + a.Application_ID + ')', 'قدّم ' + String(a.Applied_At).slice(0, 10) + ' · ' + (STAGE_AR_[a.Stage] || a.Stage));
  }).join(''));
  var cons = consentsOf_(per.Person_ID);
  if (cons.length) h += '<h4>الموافقات</h4>' + tbl(cons.map(function (c) { return row(c.kindName, (c.Granted === 'Y' ? 'موافق' : 'سحب') + ' · ' + String(c.at).slice(0, 10) + ' · ' + c.channelName + (c.Until ? ' · لحد ' + c.Until : '')); }).join(''));
  var docs = []; apps.forEach(function (a) { docs = docs.concat(find_('CANDIDATE_DOCS', { Application_ID: a.Application_ID })); });
  var held = docs.filter(function (d) { return (JSON.parse(d.Files_JSON || '[]') || []).length || d.Physical === 'RECEIVED'; });
  if (held.length) h += '<h4>مسوغات التعيين</h4>' + tbl(held.map(function (d) { return row(d.Name, [(JSON.parse(d.Files_JSON || '[]') || []).length ? 'نسخة إلكترونية' : '', d.Physical === 'RECEIVED' ? 'الورق مستلم' : '', d.Expiry_Date ? 'ينتهي ' + d.Expiry_Date : ''].filter(String).join(' · ')); }).join(''));
  h += '<p style="color:#555">بالإضافة لسجل التواصل معك ونتائج المقابلات والتقييمات الخاصة بطلباتك. لطلب تصحيح أو حذف تواصل مع ' + escHtml_(cfg_('PRIVACY_EMAIL', '') || 'إدارة الموارد البشرية') + '.</p></div>';
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'DATA_EXPORT' });
  return { subject: 'بياناتك الشخصية — ' + per.Full_Name, html: h };
}

/* ---------------- settings screen ---------------- */

var PRIVACY_CFG_ = ['PRIVACY_TEXT_AR', 'PRIVACY_TEXT_EN', 'PRIVACY_FULL_AR', 'PRIVACY_FULL_EN', 'DOCS_PRIVACY_AR', 'DOCS_PRIVACY_EN', 'PRIVACY_EMAIL', 'DPO_TITLE',
  'RETENTION_ENABLED', 'RETENTION_REJECTED_MONTHS', 'RETENTION_DNJ_MONTHS', 'RETENTION_POOL_MONTHS', 'DSR_DAYS'];

function privacyAdmin_(ctx) {
  var c = {}; PRIVACY_CFG_.concat(['PRIVACY_VERSION', 'DOCS_PRIVACY_VERSION']).forEach(function (k) { var r = get_('CONFIG', k); c[k] = r ? r.Config_Value : ''; });
  var units = all_('ORG_UNITS').filter(function (u) { return u.Status !== 'Inactive' && ['COMPANY', 'SECTOR'].indexOf(u.Unit_Type) >= 0; })
    .map(function (u) { return { id: u.Org_Unit_ID, name: u.Name_AR, type: u.Unit_Type, entity: u.Legal_Entity_ID || '' }; });
  var dsr = all_('DATA_REQUESTS').filter(function (r) { return r.Status === 'OPEN'; }).length;
  return { cfg: c, entities: entitiesAll_(), units: units, openRequests: dsr, due: retentionDue_().length, canEnable: hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]) };
}

/** p = { cfg: { key: value } } — the notice texts bump their version when changed (people consent to a version). */
function privacySave_(ctx, p) {
  var inp = p.cfg || {}, me = ctx.user.User_ID, changed = [];
  if (inp.RETENTION_ENABLED !== undefined && str_(inp.RETENTION_ENABLED) !== str_((get_('CONFIG', 'RETENTION_ENABLED') || {}).Config_Value) && !hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]))
    throw userError_('تشغيل الحذف التلقائي لمدير قطاع الموارد البشرية بس.');
  ['RETENTION_REJECTED_MONTHS', 'RETENTION_DNJ_MONTHS', 'RETENTION_POOL_MONTHS', 'DSR_DAYS'].forEach(function (k) {
    if (inp[k] !== undefined && !(num_(latinDigits_(inp[k]), 0) >= 1 && num_(latinDigits_(inp[k]), 0) <= 120)) throw userError_('المدد لازم تكون أرقام من 1 لـ 120.');
  });
  var email = str_(inp.PRIVACY_EMAIL);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw userError_('إيميل الخصوصية غلط.');
  withLock_(function () {
    PRIVACY_CFG_.forEach(function (k) {
      if (inp[k] === undefined) return;
      var cur = get_('CONFIG', k), v = str_(inp[k]);
      if (/MONTHS|DAYS/.test(k)) v = String(num_(latinDigits_(v), 0));
      if (k === 'RETENTION_ENABLED') v = v === 'Y' ? 'Y' : 'N';
      if (cur && cur.Config_Value !== v) { update_('CONFIG', k, { Config_Value: v }, me); changed.push(k); }
    });
    var bump = function (key) { var c = get_('CONFIG', key); update_('CONFIG', key, { Config_Value: String(num_(c ? c.Config_Value : '1', 1) + 1) }, me); };
    if (changed.some(function (k) { return /^PRIVACY_(TEXT|FULL)_/.test(k); })) bump('PRIVACY_VERSION');
    if (changed.some(function (k) { return /^DOCS_PRIVACY_/.test(k); })) bump('DOCS_PRIVACY_VERSION');
  });
  invalidate_('CONFIG');
  if (changed.length) audit_(ctx, { entityType: 'CONFIG', entityId: 'PRIVACY', action: 'UPDATE', newValue: changed.join(', ') });
  return privacyAdmin_(ctx);
}

/* ---------------- migration ---------------- */

var PRIVACY_OLD_AR_ = 'بتقديمك على هذه الوظيفة، توافق على أن تقوم شركة قنديل مصر بجمع بياناتك الشخصية وسيرتك الذاتية واستخدامها لأغراض التوظيف فقط، والاحتفاظ بها لمدة تصل إلى سنتين للتواصل معك بشأن فرص مناسبة. لن تتم مشاركة بياناتك مع أي جهة خارج الشركة، ويمكنك طلب تعديلها أو حذفها في أي وقت بالتواصل مع إدارة الموارد البشرية.';
var PRIVACY_NEW_AR_ = 'نجمع بياناتك الشخصية ونستخدمها لإدارة طلب التوظيف والتواصل معك وتقييم ملاءمتك للوظيفة وإتمام إجراءات الاختيار والعرض الوظيفي. تشمل: بيانات الاتصال والهوية، التعليم والخبرة، الراتب الحالي والمتوقع، السيرة الذاتية، ونتائج التقييم والمقابلات. لا يطّلع عليها إلا المصرّح لهم في الموارد البشرية والتوظيف، والمديرون المعنيون بالقدر اللازم للاختيار. تُحفظ البيانات على خدمات Google وقد تتم معالجتها خارج مصر. نحتفظ بها للمدة اللازمة للغرض، ولمدة إضافية محددة فقط إذا وافقت على قاعدة المرشحين. لك حق الاطلاع على بياناتك وتصحيحها وطلب حذفها.';
var PRIVACY_NEW_EN_ = 'We collect and use your personal data to manage your application, contact you, assess your suitability and complete selection and offer steps. It includes contact and identity details, education and experience, current and expected salary, your CV, and assessment and interview results. Only authorised Human Resources and recruitment staff, and the managers concerned to the extent needed, can see it. The data is kept on Google services and may be processed outside Egypt. We keep it as long as needed for this purpose, and for a set extra period only if you agree to join our candidate database. You may access, correct or ask us to delete your data.';
var DOCS_PRIVACY_AR_ = 'المستندات اللي بترفعها هنا بتُستخدم لإتمام إجراءات تعيينك والتأمينات والالتزامات القانونية بس. بعضها فيه بيانات حساسة (صحيفة الحالة الجنائية والكشف الطبي)، ومش بيطّلع عليها غير الموارد البشرية المصرّح لهم. بتتحفظ على خدمات Google وممكن تتعالج خارج مصر، ومابتتحفظش أكتر من المدة اللازمة أو اللي القانون بيحددها.';
var DOCS_PRIVACY_EN_ = 'The documents you upload here are used only to complete your hiring, social insurance and legal requirements. Some contain sensitive data (criminal record and medical examination) and are seen only by authorised Human Resources staff. They are kept on Google services, may be processed outside Egypt, and are not kept longer than needed or required by law.';

function privacy0141_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('PRIVACY_0141') === 'Y') return;
  var c = get_('CONFIG', 'PRIVACY_TEXT_AR');
  if (c && c.Config_Value === PRIVACY_OLD_AR_) {
    update_('CONFIG', 'PRIVACY_TEXT_AR', { Config_Value: PRIVACY_NEW_AR_ }, 'SYSTEM');
    update_('CONFIG', 'PRIVACY_TEXT_EN', { Config_Value: PRIVACY_NEW_EN_ }, 'SYSTEM');
    var v = get_('CONFIG', 'PRIVACY_VERSION');
    update_('CONFIG', 'PRIVACY_VERSION', { Config_Value: String(num_(v ? v.Config_Value : '1', 1) + 1) }, 'SYSTEM');
  }
  ['CRIMINAL', 'MEDICAL_111'].forEach(function (k) { var t = get_('DOC_TYPES', k); if (t && !t.Sensitive) update_('DOC_TYPES', k, { Sensitive: 'Y' }, 'SYSTEM'); });
  invalidate_('CONFIG');
  props.setProperty('PRIVACY_0141', 'Y');
}
