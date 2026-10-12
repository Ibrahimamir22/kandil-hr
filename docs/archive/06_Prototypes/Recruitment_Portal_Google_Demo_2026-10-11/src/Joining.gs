/**
 * Joining.gs — Phase 5B (v0.14.0): joining date, hiring documents, physical receipt, deferrals and payroll notices.
 *
 * Rules (Blueprint §14 + owner decisions 2026-10-05):
 *   • An accepted offer opens a joining record: planned date, every change kept with its reason.
 *   • The document list comes from DOC_TYPES (all jobs / males / a collar / listed jobs); documents marked «insured only»
 *     become optional for a contract without social insurance — anything brought anyway is still recorded.
 *   • Each document: a digital copy (uploaded by the candidate from a private link, or by HR) reviewed by the recruiter,
 *     and the paper side (original kept / copies) ticked when physically received. Upload is never physical receipt.
 *   • Everything is due before joining; a deferral needs a recruitment manager, a due date and stays within the
 *     document's maximum days. Cleared to join = every required document complete or deferred.
 *   • The receipt of hiring documents is printed only when every required document is complete.
 *   • Deferred documents still missing near the payroll cut-off (day 25, alert a week before) appear in a list to
 *     notify payroll; the portal records the notice — it never stops a salary itself. A release notice follows completion.
 *   • Joined = actual date + employee code → the vacancy and headcount update through the normal fill.
 */

var DOC_KEEP_ = { ORIGINAL: 'أصل يتحفظ', COPY: 'صورة', PHYSICAL: 'ورقي' };
var DOC_ST_AR_ = { MISSING: 'لسه', UPLOADED: 'مستني المراجعة', VERIFIED: 'اتراجع', REJECTED: 'مرفوض — محتاج بديل', WAIVED: 'اتلغى بقرار',
  EXPIRED: 'انتهت صلاحيته — محتاج تجديد', SUSPECT: 'فيه شك — عند مدير الموارد البشرية', REPLACEMENT: 'مطلوب نسخة بديلة' };
// v0.40.0 (FIL-001): the 13 states shown for a document — derived from its stored status, the paper side and the deferral
var DOC_STATE_AR_ = { NOT_SUBMITTED: 'لم يُقدَّم', UPLOADED: 'اترفع', UNDER_REVIEW: 'تحت المراجعة', VERIFIED_DIGITAL: 'اتراجع إلكترونياً',
  ORIGINAL_PENDING: 'مستني الأصل', ORIGINAL_RECEIVED: 'الأصل اتستلم', COMPLETED: 'مكتمل', REJECTED: 'مرفوض', EXPIRED: 'منتهي',
  DEFERRED: 'مؤجل', WAIVED: 'اتلغى بقرار', SUSPECT: 'فيه شك', REPLACEMENT: 'مطلوب بديل' };
var DOC_BAD_ = ['EXPIRED', 'SUSPECT', 'REPLACEMENT'];
var DNJ_REASONS_ = { COUNTEROFFER: 'شركته زودت له', ANOTHER_OFFER: 'عرض تاني', PERSONAL: 'ظروف شخصية', NO_CONTACT: 'انقطع التواصل', SALARY: 'المرتب',
  JOINING_DATE: 'معاد الاستلام', DOCUMENTS: 'ماكمّلش الأوراق', OTHER: 'أخرى' };
var DOC_MIME_ = ['image/jpeg', 'image/png', 'application/pdf'];

function deferRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }
function docTypeEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }

/* ---------------- document types ---------------- */

var DOC_TYPES_SEED_ = [
  // code, name, keep, copies, digital, scope, scope value, insured only, deferrable, max days, expiry
  ['PHOTOS', 'صور شخصية', 'PHYSICAL', 6, 'N', 'ALL', '', 'N', 'Y', 30, 'N'],
  ['BIRTH', 'شهادة الميلاد (كمبيوتر)', 'ORIGINAL', 2, 'Y', 'ALL', '', 'N', 'Y', 30, 'N'],
  ['QUALIFICATION', 'شهادة المؤهل', 'ORIGINAL', 2, 'Y', 'ALL', '', 'N', 'Y', 30, 'N'],
  ['MILITARY', 'شهادة الموقف من التجنيد', 'ORIGINAL', 2, 'Y', 'MALE', '', 'N', 'Y', 30, 'N'],
  ['CRIMINAL_CONSENT', 'إقرار موافقة على الكشف الجنائي (موقّع)', 'ORIGINAL', 0, 'Y', 'ALL', '', 'N', 'N', 0, 'N'],
  ['CRIMINAL', 'فيش وتشبيه باسم شركة قنديل للنجف', 'ORIGINAL', 0, 'Y', 'ALL', '', 'N', 'Y', 30, 'N'],
  ['WORK_STUB', 'كعب عمل حديث', 'ORIGINAL', 0, 'Y', 'ALL', '', 'Y', 'Y', 30, 'N'],
  ['NATIONAL_ID', 'صورة بطاقة الرقم القومي سارية', 'COPY', 2, 'Y', 'ALL', '', 'N', 'N', 0, 'Y'],
  ['INS_PRINT', 'شهادة بالموقف التأميني (برنت تأمينات)', 'ORIGINAL', 0, 'Y', 'ALL', '', 'Y', 'Y', 30, 'N'],
  ['MEDICAL_111', 'نموذج كشف طبي 111', 'ORIGINAL', 2, 'Y', 'ALL', '', 'Y', 'Y', 30, 'N'],
  ['SYNDICATE', 'كارنيه النقابة', 'COPY', 1, 'Y', 'JOBS', '', 'N', 'Y', 30, 'Y'],
  ['PRACTICE_PERMIT', 'صورة تصريح مزاولة المهنة', 'COPY', 1, 'Y', 'COLLAR', 'B', 'Y', 'Y', 30, 'Y'],
  ['SKILL_CERT', 'شهادة قياس مستوى المهارة', 'ORIGINAL', 0, 'Y', 'COLLAR', 'B', 'Y', 'Y', 30, 'N']];
/* v0.46.2 (CHG-100): the signed «no-insurance acknowledgement» is a joining document of its own — on the list of a contract
   without social insurance only, never deferred or waived, uploaded before the person is recorded as joined. A system type:
   it is added to the list whatever its settings say, and the document-types screen cannot change it. */
var NO_INS_ACK_ = 'NO_INS_ACK';
var NO_INS_ACK_TYPE_ = { Doc_Code: NO_INS_ACK_, Name_AR: 'إقرار التعاقد من غير تأمينات اجتماعية (موقّع)', Name_EN: 'Signed no-insurance acknowledgement', Keep: 'ORIGINAL',
  Copies: '0', Digital: 'Y', Scope: 'ALL', Scope_Value: '', Insured_Only: 'N', Deferrable: 'N', Max_Defer_Days: '0', Has_Expiry: 'N', Sort_Order: '5', Status: 'Active', Sensitive: '' };
function noInsAckEnsure_() { if (!get_('DOC_TYPES', NO_INS_ACK_)) insert_('DOC_TYPES', NO_INS_ACK_TYPE_, 'SYSTEM'); }
function noInsAckDoc_(joiningId) { return findOne_('CANDIDATE_DOCS', { Joining_ID: joiningId, Doc_Code: NO_INS_ACK_ }); }
function noInsAckRow_(id, j) {
  var t = NO_INS_ACK_TYPE_;
  return { Doc_ID: id, Joining_ID: j.Joining_ID, Application_ID: j.Application_ID, Doc_Code: t.Doc_Code, Name: t.Name_AR, Keep: t.Keep, Copies: t.Copies,
    Digital: t.Digital, Required: 'Y', Status: 'MISSING', Files_JSON: '[]', Uploaded_By: '', Uploaded_At: '', Reviewed_By: '', Reviewed_At: '', Review_Note: '',
    Physical: '', Physical_At: '', Physical_By: '', Expiry_Date: '', Deferred: '', Due_Date: '', Defer_By: '', Defer_Reason: '', Waive_By: '', Waive_Reason: '' };
}

function seedDocTypes_() {
  if (all_('DOC_TYPES').length) return;
  insertMany_('DOC_TYPES', DOC_TYPES_SEED_.map(function (r, i) {
    return { Doc_Code: r[0], Name_AR: r[1], Name_EN: '', Keep: r[2], Copies: String(r[3]), Digital: r[4], Scope: r[5], Scope_Value: r[6], Insured_Only: r[7],
      Deferrable: r[8], Max_Defer_Days: String(r[9]), Has_Expiry: r[10], Sort_Order: String((i + 1) * 10), Status: 'Active',
      Sensitive: r[0] === 'CRIMINAL' || r[0] === 'CRIMINAL_CONSENT' || r[0] === 'MEDICAL_111' ? 'Y' : '' };
  }).concat([NO_INS_ACK_TYPE_]), 'SYSTEM');
}

/** Does a document type apply to this person / job? */
function docApplies_(t, per, job, collar) {
  var vals = str_(t.Scope_Value).split(/[,،\s]+/).filter(String);
  switch (t.Scope) {
    case 'MALE': return per.Gender !== 'F';
    case 'COLLAR': return vals.indexOf(collar) >= 0;
    case 'JOBS': return vals.indexOf(job.Job_Code) >= 0;
    case 'FAMILY': return vals.indexOf(job.Job_Family) >= 0;
    default: return true;
  }
}

/** p = { Doc_Code, Name_AR, Name_EN, Keep, Copies, Digital, Scope, Scope_Value, Insured_Only, Deferrable, Max_Defer_Days, Has_Expiry, Sort_Order, Status } */
function docTypeSave_(ctx, p) {
  var code = str_(p.Doc_Code).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!code) throw userError_('اكتب كود المستند (حروف إنجليزي).');
  if (code === NO_INS_ACK_) throw userError_('ده مستند نظام: بيتضاف لوحده للعقود اللي من غير تأمينات، ومايتعدلش من هنا.');
  if (str_(p.Name_AR).length < 3) throw userError_('اكتب اسم المستند.');
  if (!DOC_KEEP_[str_(p.Keep)]) throw userError_('حدد بيتسلّم إزاي.');
  if (['ALL', 'MALE', 'COLLAR', 'JOBS', 'FAMILY'].indexOf(str_(p.Scope)) < 0) throw userError_('حدد مين يتطلب منه.');
  var yn = function (x) { return str_(x) === 'Y' ? 'Y' : 'N'; };
  var f = { Doc_Code: code, Name_AR: str_(p.Name_AR).slice(0, 80), Name_EN: str_(p.Name_EN).slice(0, 80), Keep: str_(p.Keep), Copies: String(Math.max(0, num_(p.Copies, 0))),
    Digital: yn(p.Digital), Scope: str_(p.Scope), Scope_Value: str_(p.Scope_Value).slice(0, 500), Insured_Only: yn(p.Insured_Only), Deferrable: yn(p.Deferrable),
    Max_Defer_Days: String(Math.max(0, num_(p.Max_Defer_Days, 30))), Has_Expiry: yn(p.Has_Expiry), Sort_Order: String(num_(p.Sort_Order, 100)),
    Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active', Sensitive: yn(p.Sensitive) === 'Y' ? 'Y' : '' };
  var res, isNew = !get_('DOC_TYPES', code);
  withLock_(function () { res = isNew ? insert_('DOC_TYPES', f, ctx.user.User_ID) : update_('DOC_TYPES', code, f, ctx.user.User_ID).after; });
  audit_(ctx, { entityType: 'DOC_TYPE', entityId: code, action: isNew ? 'CREATE' : 'UPDATE', newValue: f.Name_AR + ' / ' + f.Scope + ' ' + f.Scope_Value });
  return res;
}

/* ---------------- joining record ---------------- */

/** The application's joining record: the live one, else the latest closed one. */
function joiningOf_(appId) {
  var js = find_('JOININGS', { Application_ID: appId }).sort(function (a, b) { return a.Joining_ID < b.Joining_ID ? -1 : 1; });
  return js.filter(function (j) { return j.Status !== 'DID_NOT_JOIN'; })[0] || js[js.length - 1] || null;
}

/** Create the joining record and the document checklist (on acceptance, or lazily for older accepted offers). Runs inside a lock. */
function joiningCreate_(actorId, a, offer) {
  var cur = joiningOf_(a.Application_ID);
  if (cur && cur.Status !== 'DID_NOT_JOIN') return cur;
  var v = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID }) || {}, per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
  var job = findOne_('JOBS', { Job_Code: v.Job_Code }) || {}, P = v.Vacancy_ID ? payProfile_(v) : { collar: '' };
  var noIns = offer && offer.No_Insurance === 'Y';
  var j = insert_('JOININGS', { Joining_ID: nextId_('JOINING'), Application_ID: a.Application_ID, Vacancy_ID: a.Vacancy_ID, Person_ID: a.Person_ID,
    Offer_ID: offer ? offer.Offer_ID : '', Status: 'PENDING', Planned_Date: offer ? str_(offer.Joining_Date) : '', Date_Confirmed_At: '', Changes_JSON: '[]',
    No_Insurance: noIns ? 'Y' : '', Joined_Date: '', Employee_ID: '', Fill_ID: '', DNJ_Reason: '', DNJ_Note: '', Token_Hash: '', Token_Until: '',
    Receipt_ID: '', Receipt_At: '', Closed_By: '', Closed_At: '' }, actorId);
  var types = find_('DOC_TYPES', { Status: 'Active' }).filter(function (t) { return t.Doc_Code !== NO_INS_ACK_; })
    .concat(noIns ? [get_('DOC_TYPES', NO_INS_ACK_) || NO_INS_ACK_TYPE_] : [])
    .sort(function (x, y) { return num_(x.Sort_Order, 0) - num_(y.Sort_Order, 0); })
    .filter(function (t) { return t.Doc_Code === NO_INS_ACK_ || docApplies_(t, per, job, P.collar); });
  var ids = nextIds_('CAND_DOC', types.length);
  if (types.length) insertMany_('CANDIDATE_DOCS', types.map(function (t, i) {
    return { Doc_ID: ids[i], Joining_ID: j.Joining_ID, Application_ID: a.Application_ID, Doc_Code: t.Doc_Code, Name: t.Name_AR, Keep: t.Keep, Copies: t.Copies,
      Digital: t.Digital, Required: noIns && t.Insured_Only === 'Y' ? 'N' : 'Y', Status: 'MISSING', Files_JSON: '[]', Uploaded_By: '', Uploaded_At: '',
      Reviewed_By: '', Reviewed_At: '', Review_Note: '', Physical: '', Physical_At: '', Physical_By: '', Expiry_Date: '', Deferred: '', Due_Date: '',
      Defer_By: '', Defer_Reason: '', Waive_By: '', Waive_Reason: '' };
  }), actorId);
  return j;
}

function joiningGet_(id) {
  var j = findOne_('JOININGS', { Joining_ID: str_(id) });
  if (!j) throw userError_('سجل الاستلام غير موجود.');
  return j;
}
function joiningAccess_(ctx, j, needFull) {
  var v = findOne_('VACANCIES', { Vacancy_ID: j.Vacancy_ID }), acc = vacancyAccess_(ctx, v);
  if (!acc || (needFull && acc !== 'FULL')) throw userError_('مالكش صلاحية على المرشح ده.');
  return { v: v, full: acc === 'FULL' };
}

/** Completion of one document. */
function docDone_(d) {
  if (d.Status === 'WAIVED') return true;
  if (DOC_BAD_.indexOf(d.Status) >= 0) return false;
  var digital = d.Digital !== 'Y' || d.Status === 'VERIFIED';
  return digital && d.Physical === 'RECEIVED';
}

/** FIL-001: the document's state of the 13. */
function docState_(d) {
  if (d.Status === 'WAIVED') return 'WAIVED';
  if (DOC_BAD_.indexOf(d.Status) >= 0 || d.Status === 'REJECTED') return d.Status;
  if (docDone_(d)) return 'COMPLETED';
  if (d.Deferred === 'Y' && d.Due_Date) return 'DEFERRED';
  if (d.Status === 'UPLOADED') return d.Review_Started_At ? 'UNDER_REVIEW' : 'UPLOADED';
  if (d.Status === 'VERIFIED') return d.Keep === 'ORIGINAL' ? 'ORIGINAL_PENDING' : 'VERIFIED_DIGITAL';
  if (d.Physical === 'RECEIVED') return 'ORIGINAL_RECEIVED';
  return 'NOT_SUBMITTED';
}

/** Summary of a joining's documents. */
function docSummary_(docs, day) {
  day = day || today_();
  var req = docs.filter(function (d) { return d.Required === 'Y'; });
  var done = req.filter(docDone_), deferred = req.filter(function (d) { return !docDone_(d) && d.Deferred === 'Y' && d.Due_Date; });
  var overdue = deferred.filter(function (d) { return d.Due_Date < day; });
  var open = req.filter(function (d) { return !docDone_(d) && !(d.Deferred === 'Y' && d.Due_Date); });
  return { required: req.length, done: done.length, deferred: deferred.length, overdue: overdue.length, open: open.length,
    review: docs.filter(function (d) { return d.Status === 'UPLOADED'; }).length,
    cleared: open.length === 0, complete: done.length === req.length };
}

/* ---------------- payroll cut-off ---------------- */

/** The next payroll cut-off date (day PAYROLL_CUTOFF_DAY of this or next month). */
function payrollCutoff_(day) {
  day = day || today_();
  var cd = Math.min(28, Math.max(1, num_(cfg_('PAYROLL_CUTOFF_DAY', 25), 25)));
  var y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)), d = Number(day.slice(8, 10));
  if (d > cd) { m++; if (m > 12) { m = 1; y++; } }
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + cd).slice(-2);
}

/** Payroll status of a joined employee with deferred documents. */
function payrollState_(j, docs, day) {
  day = day || today_();
  if (j.Status !== 'JOINED') return null;
  var cut = payrollCutoff_(day), alertFrom = addDaysYmd_(cut, -num_(cfg_('PAYROLL_ALERT_DAYS', 7), 7));
  var missing = docs.filter(function (d) { return d.Required === 'Y' && !docDone_(d) && d.Deferred === 'Y' && d.Due_Date && d.Due_Date <= cut; });
  var notices = find_('PAYROLL_NOTICES', { Joining_ID: j.Joining_ID }).sort(function (a, b) { return a.Notice_ID < b.Notice_ID ? -1 : 1; });
  var last = notices[notices.length - 1];
  var stopped = last && last.Kind === 'STOP';
  var stillMissing = docs.some(function (d) { return d.Required === 'Y' && !docDone_(d); });
  return { cutoff: cut, alertFrom: alertFrom, inWindow: day >= alertFrom, missing: missing.map(function (d) { return d.Name; }),
    needStop: !stopped && missing.length > 0 && (day >= alertFrom || missing.some(function (d) { return d.Due_Date < day; })),
    needRelease: !!stopped && !stillMissing, stopped: !!stopped, lastNotice: last || null };
}

/* ---------------- views ---------------- */

function docView_(d) {
  var files = []; try { files = JSON.parse(d.Files_JSON || '[]'); } catch (e) {}
  var names = userNames_(), t = findOne_('DOC_TYPES', { Doc_Code: d.Doc_Code }) || {};
  return { Doc_ID: d.Doc_ID, Doc_Code: d.Doc_Code, Name: d.Name, Keep: d.Keep, keepName: DOC_KEEP_[d.Keep] || d.Keep, Copies: d.Copies, Digital: d.Digital,
    Required: d.Required, Status: d.Status, statusName: DOC_ST_AR_[d.Status], files: files, Uploaded_By: d.Uploaded_By === 'PUBLIC' ? 'المرشح' : (names[d.Uploaded_By] || ''),
    Uploaded_At: d.Uploaded_At, reviewedBy: names[d.Reviewed_By] || '', Reviewed_At: d.Reviewed_At, Review_Note: d.Review_Note, Physical: d.Physical,
    Physical_At: d.Physical_At, physicalBy: names[d.Physical_By] || '', Expiry_Date: d.Expiry_Date, Deferred: d.Deferred, Due_Date: d.Due_Date,
    deferBy: names[d.Defer_By] || '', Defer_Reason: d.Defer_Reason, Waive_Reason: d.Waive_Reason, done: docDone_(d),
    state: docState_(d), stateName: DOC_STATE_AR_[docState_(d)], Issue_Note: d.Issue_Note,
    hasExpiry: t.Has_Expiry === 'Y', deferrable: t.Deferrable !== 'N', maxDefer: t.Max_Defer_Days || '', sensitive: t.Sensitive === 'Y' };
}

function joiningView_(ctx, j, full) {
  var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }).sort(function (a, b) { return a.Doc_ID < b.Doc_ID ? -1 : 1; });
  var changes = []; try { changes = JSON.parse(j.Changes_JSON || '[]'); } catch (e) {}
  var names = userNames_();
  var x = { Joining_ID: j.Joining_ID, Status: j.Status, Planned_Date: j.Planned_Date, Date_Confirmed_At: j.Date_Confirmed_At, Joined_Date: j.Joined_Date,
    Employee_ID: j.Employee_ID, DNJ_Reason: j.DNJ_Reason, dnjName: DNJ_REASONS_[j.DNJ_Reason] || '', DNJ_Note: j.DNJ_Note, No_Insurance: j.No_Insurance, Offer_ID: j.Offer_ID,
    changes: changes.map(function (c) { c.byName = names[c.by] || ''; return c; }), summary: docSummary_(docs), Receipt_ID: j.Receipt_ID, Receipt_At: j.Receipt_At,
    Contract_At: j.Contract_At, contractBy: names[j.Contract_By] || '' };
  if (!full) return x;
  x.docs = docs.map(docView_);
  x.linkActive = !!(j.Token_Hash && j.Token_Until >= today_());
  x.Token_Until = j.Token_Until;
  x.payroll = payrollState_(j, docs);
  x.notices = find_('PAYROLL_NOTICES', { Joining_ID: j.Joining_ID }).map(function (n) { n.byName = names[n.Sent_By] || ''; return n; });
  x.canDefer = hasAnyRole_(ctx, deferRoles_());
  x.empMode = occFromEmployees_();
  x.dnjReasons = DNJ_REASONS_;
  try { var cd = contractData_(j, { v: findOne_('VACANCIES', { Vacancy_ID: j.Vacancy_ID }) || {} });     // v0.47.0 (CHG-101)
    x.contract = { type: cd.type.name, fixed: cd.fixed, months: cd.months, end: cd.end, address: str_(cd.person.Residence_Address), missing: cd.missing }; } catch (eC) { x.contract = null; }
  x.canPayDetails = !!j.Offer_ID && hasAnyRole_(ctx, payViewRoles_());     // v0.48.0 (CHG-102)
  x.docsConsentAt = j.Docs_Consent_At; x.docsConsentChannel = CONSENT_CHANNELS_[j.Docs_Consent_Channel] || '';
  x.extraTypes = find_('DOC_TYPES', { Status: 'Active' }).filter(function (t) { return t.Doc_Code !== NO_INS_ACK_ && !docs.some(function (d) { return d.Doc_Code === t.Doc_Code; }); })
    .map(function (t) { return { code: t.Doc_Code, name: t.Name_AR }; });
  return x;
}

/** Card on the candidate page (accepted / joined / did not join). */
function appJoining_(ctx, a, access) {
  if (['ACCEPTED', 'JOINED'].indexOf(a.Stage) < 0 && !joiningOf_(a.Application_ID)) return null;
  var j = joiningOf_(a.Application_ID);
  if ((!j || j.Status === 'DID_NOT_JOIN') && a.Stage === 'ACCEPTED') {
    var off = find_('OFFERS', { Application_ID: a.Application_ID, Status: 'ACCEPTED' })[0] || null;
    withLock_(function () { j = joiningCreate_(ctx.user.User_ID, a, off); });
  }
  return j ? joiningView_(ctx, j, access === 'FULL') : null;
}

/* ---------------- actions ---------------- */

/**
 * p = { Joining_ID, action, ... }
 *   DATE {date, reason} · CONFIRM_DATE · LINK · JOINED {date, Employee_ID, override} · DNJ {reason, note} · NOTICE {kind, note}
 */
function joiningAction_(ctx, p) {
  var j = joiningGet_(p.Joining_ID), A = joiningAccess_(ctx, j, true), me = ctx.user.User_ID;
  var a = findOne_('APPLICATIONS', { Application_ID: j.Application_ID }), per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {};
  var act = str_(p.action), out = {}, t = vacTitle_(A.v);
  if (j.Status !== 'PENDING' && ['NOTICE', 'LINK'].indexOf(act) < 0) throw userError_('الاستلام اتقفل بالفعل.');
  var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID });
  switch (act) {
    case 'DATE':
      var nd = str_(p.date), reason = str_(p.reason);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) throw userError_('اختار تاريخ الاستلام.');
      if (j.Planned_Date && reason.length < 3) throw userError_('اكتب سبب تغيير التاريخ.');
      var ch = []; try { ch = JSON.parse(j.Changes_JSON || '[]'); } catch (e) {}
      if (j.Planned_Date) ch.push({ from: j.Planned_Date, to: nd, reason: reason.slice(0, 200), by: me, at: nowIso_() });
      withLock_(function () { update_('JOININGS', j.Joining_ID, { Planned_Date: nd, Changes_JSON: JSON.stringify(ch), Date_Confirmed_At: '' }, me); });
      event_(ctx, 'JOINING', j.Joining_ID, j.Planned_Date ? 'DATE_CHANGED' : 'DATE_SET', (j.Planned_Date ? j.Planned_Date + ' → ' : '') + nd + (reason ? ' — ' + reason : ''));
      onbRedate_(me, j.Joining_ID, nd);
      break;
    case 'CONFIRM_DATE':
      if (!j.Planned_Date) throw userError_('حدد تاريخ الاستلام الأول.');
      withLock_(function () { update_('JOININGS', j.Joining_ID, { Date_Confirmed_At: nowIso_() }, me); });
      event_(ctx, 'JOINING', j.Joining_ID, 'DATE_CONFIRMED', j.Planned_Date);
      out.onboarding = (onbOnConfirm_(ctx, j, A.v) || {}).Onboarding_ID || '';
      var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: A.v.Request_ID });
      notify_((req ? [req.Requester_User_ID] : []).concat(A.v.Position_ID ? managerUsersOf_(A.v.Position_ID) : []).filter(function (u) { return u !== me; }),
        'موظف جديد هيستلم ' + j.Planned_Date + ' — ' + t.ar, per.Full_Name + ' · جهّز مكانه وأول يوم ليه.', 'APPLICATION', j.Application_ID, true);
      break;
    case 'LINK':
      if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش.');
      var token = randomToken_(), until = addDaysYmd_(today_(), cfg_('DOC_LINK_DAYS', 7));
      withLock_(function () { update_('JOININGS', j.Joining_ID, { Token_Hash: hash_('DOCS:' + token), Token_Until: until }, me); });
      audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'DOC_LINK', newValue: 'until ' + until });
      out.link = ScriptApp.getService().getUrl() + '?docs=' + token;
      out.until = until;
      break;
    case 'JOINED':
      var jd = str_(p.date) || today_();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jd)) throw userError_('اختار تاريخ الاستلام الفعلي.');
      if (jd > today_()) throw userError_('تاريخ الاستلام الفعلي مايبقاش في المستقبل.');
      // v0.34.0 (§9.3): no employee without a valid National ID (insurance, contract, payroll all need it)
      if (!/^[23]\d{13}$/.test(str_(per.National_ID))) throw userError_('سجّل الرقم القومي الصحيح (14 رقم) في بيانات المرشح الأول — مفيش استلام من غيره.');
      // v0.38.0 (CHG-80) / v0.46.2 (CHG-100): no insurance → the signed acknowledgement is uploaded on the joining documents first
      if (j.No_Insurance === 'Y') {
        var ack = noInsAckDoc_(j.Joining_ID);
        if (!ack || ['UPLOADED', 'VERIFIED'].indexOf(ack.Status) < 0) throw userError_('العقد من غير تأمينات: اطبع «إقرار عدم التأمين» وارفعه موقّع في مسوغات التعيين قبل تسجيل الاستلام.');
      }
      var S = docSummary_(docs);
      if (!S.cleared) {
        if (!hasAnyRole_(ctx, deferRoles_())) throw userError_('المسوغات لسه ناقصة (' + S.open + ' مستند) — كمّلها أو أجّلها بموافقة مدير التوظيف قبل الاستلام.');
        if (str_(p.override).length < 5) throw userError_('المسوغات لسه ناقصة — اكتب سبب السماح بالاستلام.');
      }
      var name = per.Full_Name, fill;
      fill = vacancyFill_(ctx, { Vacancy_ID: j.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: name, Employee_ID: str_(p.Employee_ID), Effective_Date: jd,
        Notes: 'استلام من التوظيف: ' + j.Application_ID + (str_(p.override) ? ' — استثناء: ' + str_(p.override) : ''), _overHire: 'Y' }).fill;
      withLock_(function () {
        update_('JOININGS', j.Joining_ID, { Status: 'JOINED', Joined_Date: jd, Employee_ID: fill.Employee_ID, Fill_ID: fill.Fill_ID, Closed_By: me, Closed_At: nowIso_() }, me);
        if (per.Disability === 'Y' && fill.Employee_ID && get_('EMPLOYEES', fill.Employee_ID)) update_('EMPLOYEES', fill.Employee_ID, { Disability: 'Y' }, me);   // v0.38.0: the 5 % quota
        var cur = findOne_('APPLICATIONS', { Application_ID: j.Application_ID });
        update_('APPLICATIONS', j.Application_ID, { Stage: 'JOINED', Stage_At: nowIso_() }, me);
        activity_(me, cur, 'STAGE', { Stage_From: cur.Stage, Stage_To: 'JOINED', Note: 'استلم العمل ' + jd + (fill.Employee_ID ? ' — كود ' + fill.Employee_ID : '') });
        var pp = { Is_Employee: 'Y', Employee_Position_ID: A.v.Position_ID || '' };
        if (fill.Employee_ID) pp.Employee_ID = fill.Employee_ID;
        update_('PERSONS', j.Person_ID, pp, me);
      });
      event_(ctx, 'JOINING', j.Joining_ID, 'JOINED', jd + (str_(p.override) ? ' — ' + str_(p.override) : ''));
      onbOnJoined_(ctx, j, A.v, jd, fill.Employee_ID);
      try { insOnJoined_(me, findOne_('JOININGS', { Joining_ID: j.Joining_ID }) || j, A.v, jd, fill.Employee_ID, per.Full_Name); } catch (eIns) { console.warn('insurance case: ' + eIns); }
      try { nhvSchedule_(me, j, fill.Employee_ID, per.Full_Name, jd); } catch (eNhv) { console.warn('nhv schedule: ' + eNhv); }
      try { probOnJoined_(me, j, A.v, jd, fill.Employee_ID, per.Full_Name); } catch (ePrb) { console.warn('probation open: ' + ePrb); }
      break;
    case 'DNJ':
      if (!DNJ_REASONS_[str_(p.reason)]) throw userError_('اختار سبب عدم الاستلام.');
      var note = str_(p.note);
      if (str_(p.reason) === 'OTHER' && note.length < 3) throw userError_('اكتب السبب.');
      withLock_(function () {
        update_('JOININGS', j.Joining_ID, { Status: 'DID_NOT_JOIN', DNJ_Reason: str_(p.reason), DNJ_Note: note.slice(0, 300), Closed_By: me, Closed_At: nowIso_() }, me);
        var cur = findOne_('APPLICATIONS', { Application_ID: j.Application_ID });
        update_('APPLICATIONS', j.Application_ID, { Stage: 'WITHDRAWN', Stage_At: nowIso_(), Close_Code: 'DID_NOT_JOIN', Close_Note: DNJ_REASONS_[p.reason] + (note ? ' — ' + note : ''),
          Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '' }, me);
        activity_(me, cur, 'STAGE', { Stage_From: cur.Stage, Stage_To: 'WITHDRAWN', Outcome: 'DID_NOT_JOIN', Note: 'ماستلمش: ' + DNJ_REASONS_[p.reason] + (note ? ' — ' + note : '') });
      });
      event_(ctx, 'JOINING', j.Joining_ID, 'DID_NOT_JOIN', p.reason + (note ? ' — ' + note : ''));
      onbOnDidNotJoin_(ctx, j, DNJ_REASONS_[p.reason]);
      var reserve = find_('SELECTIONS', { Vacancy_ID: j.Vacancy_ID, Status: 'Current', Decision: 'RESERVE' }).length;
      notify_(find_('VACANCY_RECRUITERS', { Vacancy_ID: j.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; }).filter(function (u) { return u !== me; }),
        'المرشح ماستلمش — ' + t.ar, per.Full_Name + ' · ' + DNJ_REASONS_[p.reason] + (reserve ? ' · عندك ' + reserve + ' مرشح احتياطي' : ''), 'APPLICATION', j.Application_ID, false);
      out.reserve = reserve;
      break;
    case 'NOTICE':
      var kind = str_(p.kind) === 'RELEASE' ? 'RELEASE' : 'STOP';
      var PS = payrollState_(j, docs);
      if (!PS) throw userError_('إخطار المرتبات للموظفين اللي استلموا بس.');
      if (kind === 'STOP' && !PS.missing.length) throw userError_('مفيش مستندات متأخرة على الموظف ده.');
      if (kind === 'RELEASE' && !PS.needRelease) throw userError_('المسوغات لسه ناقصة، أو مفيش إخطار سابق بمسوغات ناقصة.');
      var n = null;
      withLock_(function () {
        n = insert_('PAYROLL_NOTICES', { Notice_ID: nextId_('PAYROLL_NOTICE'), Joining_ID: j.Joining_ID, Application_ID: j.Application_ID, Kind: kind, Cutoff_Date: PS.cutoff,
          Docs: PS.missing.join('، '), Sent_At: nowIso_(), Sent_By: me, Note: str_(p.note).slice(0, 300) }, me);
      });
      audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'PAYROLL_' + kind, newValue: n.Docs, reason: str_(p.note) });
      out.notice = n;
      break;
    default: throw userError_('إجراء غير معروف.');
  }
  out.joining = joiningView_(ctx, joiningGet_(j.Joining_ID), true);
  return out;
}

/* ---------------- documents ---------------- */

function docGet_(id) {
  var d = findOne_('CANDIDATE_DOCS', { Doc_ID: str_(id) });
  if (!d) throw userError_('المستند غير موجود.');
  return d;
}

/** Folder per person for hiring documents (Drive; stable IDs in the name). */
function personDocFolder_(personId) {
  var props = PropertiesService.getScriptProperties(), root = null, rid = props.getProperty('DOCS_FOLDER_ID');
  if (rid) { try { root = DriveApp.getFolderById(rid); } catch (e) { root = null; } }
  if (!root) { root = getOrCreateFolder_().createFolder('Employee files — ملفات الموظفين'); props.setProperty('DOCS_FOLDER_ID', root.getId()); }
  var it = root.getFoldersByName(personId);
  return it.hasNext() ? it.next() : root.createFolder(personId);
}

function docFileCheck_(f) {
  if (!f || !f.data) throw userError_('اختار ملف.');
  var mime = str_(f.mime).toLowerCase();
  if (DOC_MIME_.indexOf(mime) < 0) throw userError_('الملف لازم يكون صورة (JPG / PNG) أو PDF.');
  var bytes = Utilities.base64Decode(str_(f.data));
  if (!bytes.length) throw userError_('الملف فاضي.');
  if (bytes.length > CV_MAX_BYTES_) throw userError_('حجم الملف أكبر من 5 ميجا.');
  mime = uploadMime_(bytes, DOC_MIME_);
  if (!mime) throw userError_('الملف لازم يكون صورة (JPG / PNG) أو PDF.');
  return { bytes: bytes, mime: mime, name: str_(f.name).slice(0, 80) || 'document' };
}

/** Store an upload as a new version of the document (Drive first, then the row inside the lock). */
function docStore_(d, f, actorId) {
  // v0.38.0 (CHG-80): the criminal-record check needs the candidate's signed consent first
  if (d.Doc_Code === 'CRIMINAL') {
    var cc = findOne_('CANDIDATE_DOCS', { Joining_ID: d.Joining_ID, Doc_Code: 'CRIMINAL_CONSENT' });
    if (cc && ['UPLOADED', 'VERIFIED'].indexOf(cc.Status) < 0) throw userError_('ارفع إقرار موافقة المرشح على الكشف الجنائي (موقّع) الأول، وبعدين الفيش والتشبيه.');
  }
  var c = docFileCheck_(f);
  var file = personDocFolder_(findOne_('JOININGS', { Joining_ID: d.Joining_ID }).Person_ID).createFile(Utilities.newBlob(c.bytes, c.mime, d.Doc_Code + ' — ' + c.name.replace(/[\\\/:*?"<>|]/g, '_')));
  var res;
  withLock_(function () {
    var cur = findOne_('CANDIDATE_DOCS', { Doc_ID: d.Doc_ID });
    var files = []; try { files = JSON.parse(cur.Files_JSON || '[]'); } catch (e) {}
    files.push({ id: file.getId(), name: c.name, mime: c.mime, at: nowIso_(), by: actorId });
    res = update_('CANDIDATE_DOCS', d.Doc_ID, { Files_JSON: JSON.stringify(files.slice(-10)), Status: cur.Status === 'WAIVED' && d.Doc_Code !== NO_INS_ACK_ ? 'WAIVED' : 'UPLOADED', Uploaded_By: actorId, Uploaded_At: nowIso_(),
      Reviewed_By: '', Reviewed_At: '', Review_Note: cur.Status === 'REJECTED' ? cur.Review_Note : '', Review_Started_At: '', Expired_At: '', Renew_Notice_At: '',
      Issue_Note: DOC_BAD_.indexOf(cur.Status) >= 0 ? cur.Issue_Note : '' }, actorId === 'PUBLIC' ? 'PUBLIC' : actorId).after;
  });
  return res;
}

/**
 * p = { Doc_ID, action, ... }
 *   UPLOAD {file} · VERIFY {Expiry_Date} · REJECT {note} · PHYSICAL · UNPHYSICAL {note} · DEFER {Due_Date, reason} · UNDEFER · WAIVE {reason} · EXPIRY {Expiry_Date}
 *   v0.40.0 (FIL-001): SUSPECT {note} — a doubt about the document goes to the HR managers (only they verify it again);
 *   REPLACE {note} — ask the candidate / employee for a new copy.
 */
function docAction_(ctx, p) {
  var d = docGet_(p.Doc_ID), j = joiningGet_(d.Joining_ID), A = joiningAccess_(ctx, j, true), me = ctx.user.User_ID, act = str_(p.action), patch = null, ev = act;
  if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش — الملف مقفول.');
  var type = findOne_('DOC_TYPES', { Doc_Code: d.Doc_Code }) || {};
  switch (act) {
    case 'UPLOAD':
      if (!j.Docs_Consent_At) {
        if (str_(p.paperConsent) !== 'Y') throw userError_('المرشح لسه ماوافقش على إشعار خصوصية المسوغات — خلّيه يوافق من اللينك، أو أكّد إنه وقّع على الموافقة الورقية.');
        docsConsentRecord_(me, j, 'PAPER');
      }
      docStore_(d, p.file, me);
      break;
    case 'VERIFY':
      if (d.Status === 'SUSPECT') { if (!hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('المستند عليه شك — مدير الموارد البشرية بس اللي يأكده.'); }
      else if (d.Status !== 'UPLOADED') throw userError_('مفيش ملف مستني المراجعة.');
      var ex = str_(p.Expiry_Date);
      if (type.Has_Expiry === 'Y' && !/^\d{4}-\d{2}-\d{2}$/.test(ex)) throw userError_('اكتب تاريخ انتهاء المستند.');
      if (ex && ex < today_()) throw userError_('المستند منتهي — اطلب نسخة سارية.');
      patch = { Status: 'VERIFIED', Reviewed_By: me, Reviewed_At: nowIso_(), Review_Note: str_(p.note).slice(0, 200) };
      if (ex) patch.Expiry_Date = ex;
      break;
    case 'REJECT':
      if (d.Status !== 'UPLOADED' && d.Status !== 'VERIFIED') throw userError_('مفيش ملف يترفض.');
      if (str_(p.note).length < 3) throw userError_('اكتب سبب الرفض عشان المرشح يعرف يجيب إيه.');
      patch = { Status: 'REJECTED', Reviewed_By: me, Reviewed_At: nowIso_(), Review_Note: str_(p.note).slice(0, 200) };
      break;
    case 'SUSPECT':
      if (['UPLOADED', 'VERIFIED'].indexOf(d.Status) < 0) throw userError_('مفيش ملف عشان يتعلّم عليه شك.');
      if (str_(p.note).length < 5) throw userError_('اكتب إيه اللي مش مظبوط في المستند.');
      patch = { Status: 'SUSPECT', Issue_Note: str_(p.note).slice(0, 200), Reviewed_By: me, Reviewed_At: nowIso_() };
      break;
    case 'REPLACE':
      if (['UPLOADED', 'VERIFIED', 'SUSPECT', 'EXPIRED'].indexOf(d.Status) < 0) throw userError_('مفيش ملف يتطلب بديله.');
      if (str_(p.note).length < 3) throw userError_('اكتب ليه محتاجين نسخة بديلة.');
      patch = { Status: 'REPLACEMENT', Issue_Note: str_(p.note).slice(0, 200), Reviewed_By: me, Reviewed_At: nowIso_() };
      break;
    case 'PHYSICAL':
      if (j.Receipt_ID) throw userError_('إيصال الاستلام اتطبع — المسوغات مقفولة.');
      patch = { Physical: 'RECEIVED', Physical_At: nowIso_(), Physical_By: me };
      break;
    case 'UNPHYSICAL':
      if (j.Receipt_ID) throw userError_('إيصال الاستلام اتطبع — المسوغات مقفولة.');
      if (str_(p.note).length < 3) throw userError_('اكتب السبب.');
      patch = { Physical: '', Physical_At: '', Physical_By: '' };
      break;
    case 'DEFER':
      if (!hasAnyRole_(ctx, deferRoles_())) throw userError_('تأجيل المستندات بموافقة مدير التوظيف.');
      if (d.Doc_Code === NO_INS_ACK_) throw userError_('إقرار عدم التأمين لازم يترفع قبل الاستلام — مايتأجلش.');
      if (type.Deferrable === 'N') throw userError_('المستند ده لازم قبل الاستلام — مايتأجلش.');
      var due = str_(p.Due_Date), max = addDaysYmd_(j.Planned_Date && j.Planned_Date > today_() ? j.Planned_Date : today_(), num_(type.Max_Defer_Days, 30));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < today_()) throw userError_('اختار تاريخ الاستحقاق (النهارده أو بعده).');
      if (due > max) throw userError_('أقصى تأجيل للمستند ده ' + type.Max_Defer_Days + ' يوم من الاستلام (لحد ' + max + ').');
      if (str_(p.reason).length < 5) throw userError_('اكتب سبب التأجيل.');
      patch = { Deferred: 'Y', Due_Date: due, Defer_By: me, Defer_Reason: str_(p.reason).slice(0, 200) };
      break;
    case 'UNDEFER':
      if (!hasAnyRole_(ctx, deferRoles_())) throw userError_('مالكش صلاحية.');
      patch = { Deferred: '', Due_Date: '', Defer_By: '', Defer_Reason: '' };
      break;
    case 'WAIVE':
      if (!hasAnyRole_(ctx, deferRoles_())) throw userError_('إلغاء مستند بموافقة مدير التوظيف.');
      if (d.Doc_Code === NO_INS_ACK_) throw userError_('إقرار عدم التأمين مايتلغيش طول ما العقد من غير تأمينات.');
      if (str_(p.reason).length < 5) throw userError_('اكتب سبب إلغاء المستند.');
      patch = { Status: 'WAIVED', Waive_By: me, Waive_Reason: str_(p.reason).slice(0, 200) };
      break;
    case 'EXPIRY':
      var e2 = str_(p.Expiry_Date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e2)) throw userError_('اكتب تاريخ الانتهاء.');
      patch = { Expiry_Date: e2 };
      break;
    default: throw userError_('إجراء غير معروف.');
  }
  if (patch) withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, patch, me); });
  event_(ctx, 'JOINING', j.Joining_ID, 'DOC_' + ev, d.Name + (p.note || p.reason ? ' — ' + (p.note || p.reason) : '') + (p.Due_Date ? ' → ' + p.Due_Date : ''));
  if (act === 'SUSPECT') {
    var perS = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {};
    notify_(roleUserIds_(HR_ADMIN_ROLES).filter(function (u) { return u !== me; }), 'مستند عليه شك — ' + perS.Full_Name, d.Name + ': ' + str_(p.note), 'APPLICATION', j.Application_ID, true);
  }
  if (['DEFER', 'WAIVE', 'REJECT', 'SUSPECT', 'REPLACE'].indexOf(act) >= 0) audit_(ctx, { entityType: 'CANDIDATE_DOC', entityId: d.Doc_ID, action: act, newValue: d.Name + ' ' + (p.Due_Date || ''), reason: str_(p.reason || p.note) });
  return { joining: joiningView_(ctx, joiningGet_(j.Joining_ID), true) };
}

/** p = { Joining_ID, Doc_Code, required } — add a document type to one candidate's list (e.g. a syndicate card for this job). */
function docAdd_(ctx, p) {
  var j = joiningGet_(p.Joining_ID); joiningAccess_(ctx, j, true);
  var t = findOne_('DOC_TYPES', { Doc_Code: str_(p.Doc_Code) });
  if (!t || t.Status !== 'Active') throw userError_('نوع المستند غير موجود.');
  if (t.Doc_Code === NO_INS_ACK_) throw userError_('إقرار عدم التأمين بيتضاف لوحده للعقود اللي من غير تأمينات بس.');
  if (find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID, Doc_Code: t.Doc_Code }).length) throw userError_('المستند موجود في القايمة.');
  if (j.Receipt_ID) throw userError_('إيصال الاستلام اتطبع — المسوغات مقفولة.');
  withLock_(function () {
    insert_('CANDIDATE_DOCS', { Doc_ID: nextId_('CAND_DOC'), Joining_ID: j.Joining_ID, Application_ID: j.Application_ID, Doc_Code: t.Doc_Code, Name: t.Name_AR, Keep: t.Keep,
      Copies: t.Copies, Digital: t.Digital, Required: str_(p.required) === 'N' ? 'N' : 'Y', Status: 'MISSING', Files_JSON: '[]', Uploaded_By: '', Uploaded_At: '', Reviewed_By: '',
      Reviewed_At: '', Review_Note: '', Physical: '', Physical_At: '', Physical_By: '', Expiry_Date: '', Deferred: '', Due_Date: '', Defer_By: '', Defer_Reason: '',
      Waive_By: '', Waive_Reason: '' }, ctx.user.User_ID);
  });
  event_(ctx, 'JOINING', j.Joining_ID, 'DOC_ADDED', t.Name_AR);
  return { joining: joiningView_(ctx, joiningGet_(j.Joining_ID), true) };
}

/** p = { Doc_ID, File_ID } — open a document file (recruitment team). */
function docFile_(ctx, p) {
  var d = docGet_(p.Doc_ID), j = joiningGet_(d.Joining_ID); joiningAccess_(ctx, j, true);
  if ((findOne_('DOC_TYPES', { Doc_Code: d.Doc_Code }) || {}).Sensitive === 'Y' && !hasAnyRole_(ctx, sensitiveDocRoles_())) {
    var app = findOne_('APPLICATIONS', { Application_ID: j.Application_ID }) || {};
    if (app.Owner_User_ID !== ctx.user.User_ID) throw userError_('المستند ده حساس — بيفتحه المسؤول عن المرشح ومديرين الموارد البشرية والتوظيف بس.');
  }
  var meta = null; try { (JSON.parse(d.Files_JSON || '[]') || []).forEach(function (f) { if (f.id === str_(p.File_ID)) meta = f; }); } catch (e) {}
  if (!meta) throw userError_('الملف غير موجود.');
  var blob = DriveApp.getFileById(meta.id).getBlob();
  if (d.Status === 'UPLOADED' && !d.Review_Started_At) withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Review_Started_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'CANDIDATE_DOC', entityId: d.Doc_ID, action: 'FILE_VIEW', newValue: meta.name });
  return { name: meta.name, mime: meta.mime || blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- receipt ---------------- */

/** p = { Joining_ID } — the receipt of hiring documents: only when every required document is complete. Issued once. */
function receiptIssue_(ctx, p) {
  var j = joiningGet_(p.Joining_ID), A = joiningAccess_(ctx, j, true), me = ctx.user.User_ID;
  var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID });
  if (!j.Receipt_ID) {
    var S = docSummary_(docs);
    if (!S.complete) throw userError_('الإيصال بيتطبع لما كل المسوغات تكتمل — فاضل ' + (S.required - S.done) + ' مستند.');
    var items = docs.filter(function (d) { return d.Physical === 'RECEIVED'; }).map(function (d) {
      return { name: d.Name, keep: DOC_KEEP_[d.Keep], copies: d.Copies, at: d.Physical_At };
    });
    withLock_(function () {
      var cur = joiningGet_(j.Joining_ID);
      if (cur.Receipt_ID) { j = cur; return; }
      var rid = nextId_('DOC_RECEIPT');
      insert_('DOC_RECEIPTS', { Receipt_ID: rid, Joining_ID: j.Joining_ID, Application_ID: j.Application_ID, Person_ID: j.Person_ID, Items_JSON: JSON.stringify(items), File_ID: '' }, me);
      j = update_('JOININGS', j.Joining_ID, { Receipt_ID: rid, Receipt_At: nowIso_(), Token_Hash: '', Token_Until: '' }, me).after;   // v0.39.0: the upload link's purpose is done
    });
    event_(ctx, 'JOINING', j.Joining_ID, 'RECEIPT', j.Receipt_ID);
    try { insOnReceipt_(me, j); } catch (eIns) { console.warn('insurance receipt: ' + eIns); }
  }
  var r = findOne_('DOC_RECEIPTS', { Receipt_ID: j.Receipt_ID }), per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}, t = vacTitle_(A.v);
  var it = []; try { it = JSON.parse(r.Items_JSON || '[]'); } catch (e) {}
  var names = userNames_();
  audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'PRINT_RECEIPT', newValue: r.Receipt_ID });
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;max-width:760px;margin:auto">' +
    '<h3 style="text-align:center;margin:0">إيصال استلام مسوغات التعيين</h3><div style="text-align:center;color:#555">قنديل مصر — إدارة الموارد البشرية</div><br>' +
    'رقم الإيصال: <b dir="ltr">' + escHtml_(r.Receipt_ID) + '</b> &nbsp; · &nbsp; التاريخ: ' + escHtml_(String(r.Created_At).slice(0, 10)) + '<br>' +
    'الاسم: <b>' + escHtml_(per.Full_Name) + '</b>' + (per.National_ID ? ' &nbsp; · &nbsp; الرقم القومي: <span dir="ltr">' + escHtml_(per.National_ID) + '</span>' : '') + '<br>' +
    'الوظيفة: ' + escHtml_(t.ar) + ' — ' + escHtml_(locName_(A.v.Location_ID)) + (j.Employee_ID ? ' &nbsp; · &nbsp; كود الموظف: ' + escHtml_(j.Employee_ID) : '') + '<br><br>' +
    '<table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #999;padding:6px">#</th><th style="border:1px solid #999;padding:6px">المستند</th><th style="border:1px solid #999;padding:6px">أصل / صورة</th><th style="border:1px solid #999;padding:6px">عدد الصور</th><th style="border:1px solid #999;padding:6px">تاريخ الاستلام</th></tr>' +
    it.map(function (x, i) { return '<tr><td style="border:1px solid #999;padding:6px;text-align:center">' + (i + 1) + '</td><td style="border:1px solid #999;padding:6px">' + escHtml_(x.name) + '</td><td style="border:1px solid #999;padding:6px">' + escHtml_(x.keep) + '</td><td style="border:1px solid #999;padding:6px;text-align:center">' + escHtml_(x.copies || '—') + '</td><td style="border:1px solid #999;padding:6px">' + escHtml_(String(x.at || '').slice(0, 10)) + '</td></tr>'; }).join('') +
    '</table><br>استلم: ' + escHtml_(names[r.Created_By] || '') + '<br><br><table style="width:100%"><tr><td>توقيع الموظف: ..................</td><td>توقيع المستلم: ..................</td></tr></table></div>';
  return { subject: 'إيصال استلام مسوغات — ' + per.Full_Name, html: html, Receipt_ID: r.Receipt_ID };
}

/* ---------------- v0.40.0 (CHG-84): the employment contract ---------------- */

/** p = { Joining_ID } — the Arabic contract form to print and sign (lawyer to confirm the wording). Never blocks joining. */
/* v0.47.0 (CHG-101): the employment contract. A fixed-term contract (request employment type CONTRACT) prints the two-page
   preliminary template from the legal review (docs/legal, «نموذج مبدئي — يراجعه المحامي»); the other types keep the short form
   until their own template is delivered. Both state the contribution wage (أجر الاشتراك) as the contract wage — owner decision,
   10 Oct 2026, pending the lawyer on art. 22 of decree 162/2026. The full pay stays in the offer. */
var AR_ONES_ = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر',
  'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
var AR_TENS_ = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
var AR_HUNDREDS_ = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
function arUnder1000_(n) {
  var h = Math.floor(n / 100), r = n % 100, out = [];
  if (h) out.push(AR_HUNDREDS_[h]);
  if (r) out.push(r < 20 ? AR_ONES_[r] : (r % 10 ? AR_ONES_[r % 10] + ' و' : '') + AR_TENS_[Math.floor(r / 10)]);
  return out.join(' و');
}
/** An amount of Egyptian pounds in Arabic words («ثلاثة آلاف وخمسمائة جنيه»). */
function arMoneyWords_(x) {
  var n = Math.round(num_(x, 0) * 100), le = Math.floor(n / 100), pt = n % 100;
  var group = function (v, one, two, few, many) {
    if (!v) return '';
    if (v === 1) return one;
    if (v === 2) return two;
    return arUnder1000_(v) + ' ' + (v >= 3 && v <= 10 ? few : many);
  };
  var parts = [group(Math.floor(le / 1e6), 'مليون', 'مليونان', 'ملايين', 'مليون'), group(Math.floor(le / 1000) % 1000, 'ألف', 'ألفان', 'آلاف', 'ألف'), arUnder1000_(le % 1000)].filter(String);
  var w = (parts.length ? parts.join(' و') : 'صفر') + ' جنيه';
  return pt ? w + ' و' + arUnder1000_(pt) + ' قرش' : w;
}
/** The last day of a contract of «months» from «start»: the day before the same date that many months later (1 Mar + 12 → 28 Feb). */
function contractEndYmd_(start, months) { return /^\d{4}-\d{2}-\d{2}$/.test(str_(start)) ? addDaysYmd_(addMonthsYmd_(start, months), -1) : ''; }
function contractTypeOf_(req) { var t = (reqOptions_().employmentTypes.filter(function (x) { return x.code === req.Employment_Type; })[0]) || {}; return { code: str_(t.code), name: str_(t.name) }; }
/** The contract wage: the contribution wage; a contract without insurance has none, so its comprehensive wage (same base). */
function contractWage_(o) { var c = num_(o.Contrib_Wage, 0); return c > 0 ? c : num_(o.Comprehensive_Wage, 0); }

/** Everything the contract prints, and what is missing before it can be printed. */
function contractData_(j, A) {
  var per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}, o = j.Offer_ID ? findOne_('OFFERS', { Offer_ID: j.Offer_ID }) || {} : {};
  var ent = entityOfVacancy_(A.v) || {}, req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: A.v.Request_ID }) || {}, type = contractTypeOf_(req);
  var loc = A.v.Location_ID ? get_('LOCATIONS', A.v.Location_ID) || {} : {}, ins = findOne_('INSURANCE_CASES', { Joining_ID: j.Joining_ID }) || {};
  var start = j.Joined_Date || j.Planned_Date || '', months = num_(j.Contract_Months, 0) || num_(cfg_('CONTRACT_MONTHS_DEFAULT', 12), 12);
  var x = { type: type, fixed: type.code === 'CONTRACT', person: per, offer: o, entity: ent, start: start, months: months,
    end: contractEndYmd_(start, months), wage: contractWage_(o), payDay: num_(cfg_('PAY_DAY', ''), 0),
    workAddress: str_(loc.Address) || str_(ent.Address), insuranceNo: str_(ins.Insurance_No), location: locName_(A.v.Location_ID),
    work: workTermsOf_(o), job: vacTitle_(A.v).ar, workModel: ((reqOptions_().workModels.filter(function (w) { return w.code === req.Work_Model; })[0]) || {}).name || '',
    qualification: [EDU_LABEL_[per.Education] || str_(per.Education), str_(per.Specialization)].filter(String).join(' — '), missing: [] };
  if (x.fixed) {             // the fixed-term template needs these (art. 89 of law 14/2025 / art. 22 of decree 162/2026)
    if (!ent.Name_AR || !ent.Address) x.missing.push('اسم الشركة القانونية وعنوانها (الإدارة ← الخصوصية والبيانات ← الشركات)');
    if (!ent.Commercial_Reg || !ent.Tax_ID) x.missing.push('السجل التجاري والبطاقة الضريبية للشركة');
    if (!ent.Signatory_Name || !ent.Signatory_Title) x.missing.push('اسم ممثل الشركة في التوقيع وصفته');
    if (!str_(per.Residence_Address)) x.missing.push('محل إقامة العامل («بيانات العقد» في كارت الاستلام)');
    if (!/^[23]\d{13}$/.test(str_(per.National_ID))) x.missing.push('الرقم القومي');
    if (!start) x.missing.push('تاريخ بداية العمل');
    if (!(x.wage > 0)) x.missing.push('الأجر (العرض المقبول)');
    if (!(x.payDay >= 1 && x.payDay <= 28)) x.missing.push('يوم صرف الأجر (الإعدادات ← PAY_DAY)');
  }
  return x;
}

function joiningContractForm_(ctx, p) {
  var j = joiningGet_(p.Joining_ID), A = joiningAccess_(ctx, j, true);
  if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش.');
  var x = contractData_(j, A), per = x.person, o = x.offer, ent = x.entity, e = escHtml_;
  if (x.missing.length) throw userError_('العقد مايتطبعش قبل ما تكمّل: ' + x.missing.join('، ') + '.');
  audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'PRINT_CONTRACT', newValue: x.type.code || '' });
  if (x.fixed) return { subject: 'عقد عمل محدد المدة — ' + per.Full_Name, html: contractFixedHtml_(j, x), theme: true };
  var start = x.start || '____________', days = probDays_();
  var td = function (a, b) { return '<tr><td style="border:1px solid #999;padding:6px;width:35%">' + a + '</td><td style="border:1px solid #999;padding:6px">' + b + '</td></tr>'; };
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.9;max-width:760px;margin:auto">' +
    '<h3 style="text-align:center;margin:0">عقد عمل</h3><div style="text-align:center;color:#555">طبقاً لأحكام قانون العمل</div><br>' +
    '<p>إنه في يوم ............ الموافق ............ تحرر هذا العقد بين كل من:</p>' +
    '<p><b>الطرف الأول (صاحب العمل):</b> ' + e(ent.Name_AR || 'قنديل مصر') + (ent.Address ? ' — ' + e(ent.Address) : '') + '، ويمثلها في التوقيع ' + (ent.Signatory_Name ? e(ent.Signatory_Name) + (ent.Signatory_Title ? ' بصفته ' + e(ent.Signatory_Title) : '') : '........................') + '</p>' +
    '<p><b>الطرف الثاني (العامل):</b> ' + e(per.Full_Name) + ' — الرقم القومي ' + (per.National_ID ? '<b dir="ltr">' + e(per.National_ID) + '</b>' : '________________') + (per.Residence_Address ? ' — محل الإقامة: ' + e(per.Residence_Address) : '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
    td('الوظيفة', e(x.job)) + td('مكان العمل', e(x.location)) + td('نوع التعاقد', e(x.type.name || '____________')) +
    td('تاريخ بداية العمل', e(start)) + td('الأجر الشهري (أجر الاشتراك التأميني)', x.wage > 0 ? e(money0_(x.wage)) + ' ج.م' : '________') +
    td('ساعات العمل والراحة الأسبوعية', e(x.work.hours + ' ساعات يومياً — الراحة: ' + x.work.restName)) +
    td('فترة الاختبار', days + ' يوم من تاريخ بداية العمل (لا تزيد عن ثلاثة أشهر ولا تتكرر)') + td('التأمينات الاجتماعية', o.No_Insurance === 'Y' ? 'من غير تأمينات — طبقاً للإقرار الموقّع (' + e(o.No_Ins_Basis || '') + ')' : 'يُشترك عنه طبقاً للقانون') + '</table>' +
    '<p>يلتزم الطرفان بأحكام قانون العمل ولائحة الشركة الداخلية في كل ما لم يرد فيه نص في هذا العقد. حُرر هذا العقد من نسختين بيد كل طرف نسخة.</p>' +
    '<table style="width:100%;margin-top:36px"><tr><td>الطرف الأول: ____________</td><td>الطرف الثاني: ____________</td></tr></table>' +
    '<div style="color:#777;font-size:11px;margin-top:20px">نموذج من البوابة — ' + e(j.Joining_ID) + ' · الصياغة النهائية يراجعها المحامي.</div></div>';
  return { subject: 'عقد عمل — ' + per.Full_Name, html: html };
}

/** The fixed-term contract: the legal review's two-page preliminary template (docs/legal/01-employment-contract.md, part 1), clause 7 on the contribution wage. */
function contractFixedHtml_(j, x) {
  var per = x.person, o = x.offer, ent = x.entity, e = escHtml_, n = 0;
  var b = function (v) { return '<b>' + e(v) + '</b>'; }, cl = function (t) { return '<li>' + t + '</li>'; };
  var sec = function (t, items) { return '<h4>' + t + '</h4><ol start="' + (n + 1) + '">' + items.map(function (i) { n++; return cl(i); }).join('') + '</ol>'; };
  // the portal's print theme (.pr — the same head, section titles and foot as every printed form), tightened to two A4 pages
  var css = '<style>.pr.kc{font-size:10.3pt;line-height:1.6}.pr.kc ol{margin:0;padding-inline-start:20px}.pr.kc li{margin:1px 0;text-align:justify}' +
    '.pr.kc p{margin:3px 0;text-align:justify}.pr.kc h4{margin:7px 0 2px}.pr.kc .pr-t.sg td{height:54px;width:50%}</style>';
  var allow = payLines_(o).filter(function (l) { return l.kind !== 'BASIC' && l.kind !== 'VARIABLE'; }).map(function (l) { return l.name; });
  return css + '<div class="pr kc">' +
    '<div class="pr-head"><div><div class="pr-co">' + e(ent.Name_AR) + '</div><div class="pr-sub">الموارد البشرية — مجموعة قنديل</div></div>' +
      '<div style="text-align:center"><div class="pr-title">عقد عمل فردي محدد المدة</div><div class="pr-sub">طبقاً لقانون العمل رقم 14 لسنة 2025</div></div>' +
      '<div class="pr-meta">المرجع: <b dir="ltr">' + e(j.Joining_ID) + '</b><br>نموذج مبدئي</div></div>' +
    '<p>إنه في يوم ............ الموافق ...../...../........ أُبرم هذا العقد بين كل من:</p>' +
    '<p><b>الطرف الأول (صاحب العمل):</b> ' + b(ent.Name_AR) + ' (إحدى الكيانات القانونية لمجموعة قنديل، وهي جميعاً صاحب عمل واحد) — وعنوانها ' + e(ent.Address) +
      ' — سجل تجاري رقم <span dir="ltr">' + e(ent.Commercial_Reg) + '</span> — بطاقة ضريبية رقم <span dir="ltr">' + e(ent.Tax_ID) + '</span> — ويمثلها في التوقيع ' + b(ent.Signatory_Name) + ' بصفته ' + e(ent.Signatory_Title) + '.</p>' +
    '<p><b>الطرف الثاني (العامل):</b> السيد/ ' + b(per.Full_Name) + ' — بطاقة رقم قومي <span dir="ltr">' + e(per.National_ID) + '</span> — المؤهل الدراسي ' + e(x.qualification || '—') +
      ' — المهنة/الحرفة ' + e(x.job) + ' — الرقم التأميني ' + (x.insuranceNo ? '<span dir="ltr">' + e(x.insuranceNo) + '</span>' : '................') + ' — محل الإقامة ' + e(per.Residence_Address) + '.</p>' +
    '<p>وبعد أن أقر الطرفان بصحة بياناتهما وأهليتهما للتعاقد، اتفقا على ما يلي:</p>' +
    sec('أولاً: الوظيفة ومدة العقد', [
      'يعمل الطرف الثاني في وظيفة ' + b(x.job) + ' بمحل العمل ' + e(x.location) + ' وعنوانه ' + e(x.workAddress) + (x.workModel ? '، بنمط عمل ' + e(x.workModel) : '') + '، وطبيعة العمل المتفق عليها هي المبينة في الوصف الوظيفي الموقّع منه والمرفق بهذا العقد.',
      'مدة هذا العقد ' + b(x.months + ' شهراً') + '، تبدأ في <b dir="ltr">' + e(x.start) + '</b> وتنتهي في <b dir="ltr">' + e(x.end) + '</b>، وينتهي بانتهائها. وإذا استمر الطرفان في تنفيذه بعد انتهائها دون اتفاق كتابي اعتُبر غير محدد المدة منذ إبرامه، ولا يتجدد لمدة أخرى إلا باتفاق كتابي.',
      'للطرف الأول تكليف الطرف الثاني بعمل آخر أو نقله بين الإدارات أو مواقع العمل بحسب حاجة العمل، بشرط ألا يختلف العمل اختلافاً جوهرياً عن المتفق عليه، وألا يمس ذلك أجره أو درجته الوظيفية، وألا تقل الوظيفة الجديدة عن مستوى وظيفته الأصلية، ولا يفوّت عليه دوره في الترقية إلا بطلبه، مع إخطاره كتابةً قبل التنفيذ.']) +
    sec('ثانياً: فترة الاختبار', [
      'يعمل الطرف الثاني تحت الاختبار مدة ' + b(probDays_() + ' يوماً') + ' من تاريخ بدء العقد (لا تزيد على ثلاثة أشهر)، لمرة واحدة فقط لدى صاحب العمل بكياناته القانونية جميعاً، ولا تتجدد ولا تمدد.',
      'يُقيَّم أداء الطرف الثاني خلالها وفق معايير موضوعية معلنة قابلة للقياس، ويُخطر كتابةً بنتيجة التقييم ويحق له التظلم منها لدى صاحب العمل أو الإدارة العليا.',
      'يسري على إنهاء العقد خلال فترة الاختبار أو في نهايتها ما يقرره القانون وقراراته التنفيذية. وإذا انقضت دون إنهاء اعتُبر الطرف الثاني معيناً حتى نهاية مدة العقد.']) +
    sec('ثالثاً: الأجر', [
      'يتقاضى الطرف الثاني أجراً شهرياً قدره ' + b(money0_(x.wage)) + ' جنيهاً مصرياً (فقط ' + e(arMoneyWords_(x.wage)) + ' لا غير)، وهو الأجر المتخذ أساساً للاشتراك في التأمينات الاجتماعية' +
        (allow.length ? '، وتُصرف له البدلات (' + e(allow.join('، ')) + ')' : '، وتُصرف له البدلات') + ' والحوافز وفق شروط استحقاقها المكتوبة ولائحة المنشأة المعتمدة.',
      'لا يُستقطع من الأجر إلا ما يوجبه القانون من ضريبة الدخل وحصة العامل في التأمينات الاجتماعية وغيرها من الاستقطاعات المقررة قانوناً وفي حدودها.',
      'يُؤدى الأجر مرة على الأقل كل شهر، في موعد أقصاه يوم ' + b(String(x.payDay)) + ' من الشهر التالي، في يوم عمل وبمكانه أو بتحويله على الحساب البنكي للطرف الثاني أو بوسيلة دفع إلكتروني يجيزها القانون، مع إعطائه بياناً بمفردات أجره. وتُؤدى مستحقاته عند انتهاء العلاقة لأي سبب خلال سبعة أيام من مطالبته بها.']) +
    sec('رابعاً: ساعات العمل والإجازات والتأمينات', [
      'ساعات العمل الفعلية ' + b(x.work.hours + ' ساعات') + ' يومياً، والراحة الأسبوعية ' + b(x.work.restName) + ' مدفوعة الأجر. ويحدد الطرف الأول مواعيد العمل وفترات الراحة والإجازات ويعلنها، في حدود قانون العمل ولائحة المنشأة المعتمدة. ولا يُشغَّل الطرف الثاني بعد مواعيد العمل أو في الراحة الأسبوعية أو الأعياد والإجازات الرسمية إلا استثناءً وبمقابل لا يقل عن المقرر قانوناً.',
      o.No_Insurance === 'Y' ? 'هذا التعاقد من غير تأمينات اجتماعية للسند القانوني: ' + b(o.No_Ins_Basis || '—') + '، بموجب إقرار مستقل موقّع من الطرفين، ويعالج الطرف الأول الطرف الثاني من إصابة العمل وفق القانون.'
        : 'يشترك الطرف الأول عن الطرف الثاني في التأمينات الاجتماعية والصحية من تاريخ بدء العمل طبقاً للقانون، ويعالجه من إصابة العمل وفق قانوني العمل والتأمينات الاجتماعية.']) +
    sec('خامساً: التزامات الطرفين', [
      'يقر الطرف الثاني باطلاعه على لائحة تنظيم العمل بالمنشأة المعتمدة من مديرية العمل بما فيها جدول الجزاءات، وعلى الوصف الوظيفي، وبعلمه بمخاطر عمله وطرق الوقاية منها، وتُعد جزءاً مكملاً لهذا العقد، وعند التعارض يسري الحكم الأفضل للعامل.',
      'يقر الطرف الثاني بصحة بياناته ومسوغات تعيينه، ويخطر الطرف الأول بأي تغيير فيها خلال 7 أيام، ويستكمل ما نقص من المسوغات خلال 15 يوماً من بدء العقد.',
      'يلتزم الطرف الثاني بتنفيذ تعليمات العمل ولوائح المنشأة ومواعيدها، وبالأمانة وحسن السلوك، وبالمحافظة على العهدة والمستندات وأموال المنشأة، وبقواعد السلامة والصحة المهنية، وبعدم طلب أو قبول أي مبالغ أو هدايا أو عمولات أو قروض من مورد أو مقاول أو عميل للطرف الأول.',
      'يحظر على الطرف الثاني العمل لحساب نفسه أو لدى الغير في أوقات العمل الرسمية أو داخل مقار العمل أو باستخدام أدوات المنشأة أو أجهزتها أو مستنداتها، كما يحظر عليه مزاولة عمل منافس للطرف الأول أو المشاركة فيه طوال مدة العقد. ولا يعمل بأجر لدى الغير في غير ذلك إلا بعد إخطار الطرف الأول وموافقته الكتابية.',
      'يلتزم الطرف الثاني بسرية معلومات الطرف الأول وبياناته ومستنداته وأسرار العمل طوال مدة العقد وبعد انتهائه.',
      'يتحمل الطرف الأول نفقة التدريب اللازم للوظيفة. وأي تدريب متخصص على نفقته يلتزم عنه الطرف الثاني بالبقاء مدة معينة يكون بموجب اتفاق كتابي مستقل يحدد المدة والنفقات ونسبتها للمدة المتبقية، ولا يقيّد حريته في العمل أو الانتقال.']) +
    sec('سادساً: انتهاء العلاقة والجزاءات', [
      'للطرف الثاني الاستقالة كتابةً، موقّعة منه ومعتمدة من الجهة الإدارية المختصة، ويستمر في العمل إلى أن يبت الطرف الأول فيها خلال عشرة أيام من تقديمها وإلا اعتُبرت مقبولة، وله العدول عنها كتابةً خلال عشرة أيام من إخطاره بقبولها بعد اعتماد العدول من الجهة الإدارية.',
      'إذا زادت مدة العقد أو تجديده على خمس سنوات جاز للطرف الثاني إنهاؤه دون تعويض عند انقضاء خمس سنوات بإخطار الطرف الأول كتابةً قبل ثلاثة أشهر، ويستحق عند إنهائه من جانب الطرف الأول مكافأة تعادل أجر شهر عن كل سنة خدمة.',
      'لا يُوقَّع على الطرف الثاني جزاء إلا بعد إبلاغه كتابةً بما نُسب إليه وسماع أقواله وتحقيق دفاعه وإثبات ذلك، وفي الحدود والجزاءات الواردة بلائحة المنشأة المعتمدة وفقاً للقانون. ويكون الفصل من الخدمة للمحكمة العمالية المختصة وحدها، ولا يكون إلا لخطأ جسيم من الحالات المنصوص عليها في قانون العمل وبعد استنفاد الجزاءات الأدنى متى سمحت المخالفة بذلك.']) +
    sec('سابعاً: أحكام عامة', [
      'يسري على هذا العقد قانون العمل رقم 14 لسنة 2025 وقرار وزير العمل رقم 162 لسنة 2026 وما يصدر تنفيذاً لهما، وقانون التأمينات الاجتماعية والمعاشات رقم 148 لسنة 2019 وقانون الضريبة على الدخل رقم 91 لسنة 2005، وأي تعديلات لاحقة. وكل شرط يتعارض مع القانون أو ينتقص من حقوق العامل المقررة قانوناً يُعد باطلاً دون أن يمس ذلك بقية البنود.',
      'يتخذ كل طرف من عنوانه المذكور في صدر العقد موطناً مختاراً للإخطارات، وأي تغيير فيه يُخطر به الطرف الآخر كتابةً خلال 7 أيام عمل بخطاب موصى عليه بعلم الوصول.',
      'حُرر هذا العقد باللغة العربية من أربع نسخ: لكل طرف نسخة، والثالثة لمكتب التأمينات الاجتماعية، والرابعة للجهة الإدارية المختصة، ويُعد توقيع الطرف الثاني إقراراً باستلام نسخته.']) +
    '<table class="pr-t sg"><tr><td><b>الطرف الأول</b><br>' + e(ent.Signatory_Name) + ' — ' + e(ent.Signatory_Title) + '<br>التوقيع والختم:</td><td><b>الطرف الثاني</b><br>' + e(per.Full_Name) + '<br>التوقيع:</td></tr></table>' +
    '<div class="pr-foot">نموذج مبدئي — يراجعه المحامي · طُبع من بوابة التوظيف · المرجع <span dir="ltr">' + e(j.Joining_ID) + '</span></div></div>';
}

/** The offer's pay lines with their names (Components_JSON items are { c: code, a: amount }), in the components' order. */
function payLines_(o) {
  var meta = {}; find_('PAY_COMPONENTS', {}).forEach(function (c) { meta[c.Component_Code] = c; });
  var cl = []; try { cl = JSON.parse(o.Components_JSON || '[]') || []; } catch (e) {}
  return cl.filter(function (c) { return c && num_(c.a, 0) > 0; }).map(function (c) {
    var m = meta[c.c] || {}; return { code: c.c, name: str_(m.Name_AR) || str_(c.c), kind: str_(m.Kind), amount: num_(c.a, 0), sort: num_(m.Sort_Order, 999) };
  }).sort(function (a, b) { return a.sort - b.sort; });
}

/* v0.48.0 (CHG-102): «مفردات الراتب عند بداية التعيين» — the actual pay in detail, one A4 page in the print theme, the company's
   copy only (marked confidential), signed by the candidate as seen. For those who may see pay; every print logged; nothing stored. */
var PAY_TERMS_DEFAULT_ = ['مدة الاختبار {probation_days} يوماً من تاريخ بداية العمل، لمرة واحدة لدى صاحب العمل.',
  'ساعات العمل {work_hours} ساعات يومياً، والراحة الأسبوعية {weekly_rest} مدفوعة الأجر (يوم كامل بعد 6 أيام عمل على الأكثر).',
  'فترة المحاسبة من يوم 26 إلى يوم 25، ويُصرف الأجر مرة شهرياً في موعد أقصاه يوم {pay_day} من الشهر التالي.',
  'الأجر الإضافي بتكليف مسبق، وبما لا يقل عن المقرر قانوناً (35% نهاراً و70% ليلاً على الأقل).',
  'لا يُستقطع من الأجر إلا ما يوجبه القانون (ضريبة الدخل وحصة العامل في التأمينات الاجتماعية).',
  'مستحقات نهاية العلاقة تُصرف خلال 7 أيام من المطالبة بها، والاستقالة وفق الإجراءات القانونية (كتابةً واعتماد الجهة الإدارية).',
  'يستكمل العامل ما نقص من مسوغات التعيين في المواعيد المحددة، ويتابعها قسم الموارد البشرية دون حجب أجر مستحق.'].join('\n');

/** p = { Joining_ID } */
function joiningPayDetails_(ctx, p) {
  var j = joiningGet_(p.Joining_ID), A = joiningAccess_(ctx, j, true);
  if (!hasAnyRole_(ctx, payViewRoles_())) throw userError_('مفردات الراتب لمن له صلاحية الاطلاع على المرتبات بس.');
  if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش.');
  var o = j.Offer_ID ? findOne_('OFFERS', { Offer_ID: j.Offer_ID }) : null;
  if (!o) throw userError_('مفيش عرض مقبول للاستلام ده.');
  var per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}, ent = entityOfVacancy_(A.v) || {}, e = escHtml_, m = function (x) { return e(money0_(x)); };
  var pos = A.v.Position_ID ? get_('POSITIONS', A.v.Position_ID) : null, chain = pos ? unitAncestors_(pos.Org_Unit_ID) : [];
  var unit = chain[0] ? chain[0].Name_AR : '', sector = (chain.filter(function (u) { return u.Unit_Type === 'SECTOR'; })[0] || {}).Name_AR || '';
  var lines = payLines_(o), fixed = lines.filter(function (l) { return l.kind !== 'VARIABLE'; }), gross = num_(o.Final_Accepted, 0) || num_(o.Fixed_Package, 0) || fixed.reduce(function (s, l) { return s + l.amount; }, 0);
  var wk = workTermsOf_(o), payDay = num_(cfg_('PAY_DAY', ''), 0), hrHead = str_(cfg_('HR_HEAD_NAME', '')), now = nowIso_();
  var terms = str_(cfg_('PAY_DETAILS_TERMS', '')) || PAY_TERMS_DEFAULT_;
  terms = terms.replace(/\\n/g, '\n').split(/\n+/).map(function (t) { return t.trim(); }).filter(String)
    .map(function (t) { return t.replace(/\{probation_days\}/g, String(probDays_())).replace(/\{pay_day\}/g, payDay ? String(payDay) : '.....')
      .replace(/\{work_hours\}/g, String(wk.hours)).replace(/\{weekly_rest\}/g, wk.restName); });
  var row2 = function (k, v, k2, v2) { return '<tr><th>' + k + '</th><td>' + v + '</td><th>' + k2 + '</th><td>' + v2 + '</td></tr>'; };
  var line = function (n, k, v, note, b) { return '<tr' + (b ? ' style="font-weight:700;background:#FAF8F5"' : '') + '><td>' + n + '</td><td>' + k + '</td><td dir="ltr" style="text-align:right">' + v + '</td><td class="small">' + (note || '') + '</td></tr>'; };
  var k = 0, body = fixed.map(function (l) { return line(++k, e(l.name), m(l.amount), ''); }).join('');
  var noIns = o.No_Insurance === 'Y';
  var html = '<style>.pr.pd{font-size:10pt;line-height:1.45}.pr.pd .pr-t{margin-bottom:5px}.pr.pd .pr-t th,.pr.pd .pr-t td{padding:3px 7px}.pr.pd .pr-t.inf th{width:13%}.pr.pd ol{margin:2px 0;padding-inline-start:18px}.pr.pd li{margin:1px 0}' +
      '.pr.pd .conf{display:inline-block;border:2px solid #A8111C;color:#A8111C;font-weight:800;padding:2px 10px;border-radius:6px;margin-bottom:4px}.pr.pd .sg td{height:52px;vertical-align:top;width:33%}.pr.pd h4{margin:6px 0 2px}</style>' +
    '<div class="pr pd"><div class="pr-head"><div><div class="pr-co">' + e(ent.Name_AR || 'قنديل مصر') + '</div><div class="pr-sub">الموارد البشرية — مجموعة قنديل</div></div>' +
      '<div style="text-align:center"><div class="pr-title">مفردات الراتب عند بداية التعيين</div><div class="pr-sub">نموذج مبدئي — يراجعه المحامي</div></div>' +
      '<div class="pr-meta">العرض: <b dir="ltr">' + e(o.Offer_No || o.Offer_ID) + (num_(o.Version, 1) > 1 ? ' / v' + e(o.Version) : '') + '</b><br>الطلب: <span dir="ltr">' + e(A.v.Request_ID || '—') + '</span><br>المرجع: <span dir="ltr">' + e(j.Joining_ID) + '</span><br>التاريخ: <span dir="ltr">' + e(today_()) + '</span></div></div>' +
    '<div class="conf">نسخة الشركة فقط — سري</div>' +
    '<table class="pr-t inf">' + row2('اسم المرشح', '<b>' + e(per.Full_Name) + '</b>', 'الوظيفة', e(vacTitle_(A.v).ar)) + row2('الوحدة', e(unit || '—'), 'القطاع', e(sector || '—')) +
      row2('الموقع', e(locName_(A.v.Location_ID)), 'تاريخ بداية العمل', '<span dir="ltr">' + e(j.Joined_Date || j.Planned_Date || '—') + '</span>') + '</table>' +
    '<table class="pr-t pr-grid"><thead><tr><th style="width:24px">#</th><th>البند</th><th style="width:110px">شهرياً (ج.م)</th><th>ملاحظات</th></tr></thead><tbody>' + body +
      line('', 'الإجمالي الشهري', m(gross), 'أساس العقد: ' + (o.Contract_Basis === 'NET' ? 'صافي' : 'إجمالي'), true) +
      line('', 'أجر الاشتراك التأميني', noIns ? '—' : m(o.Contrib_Wage), noIns ? 'من غير تأمينات' : '') +
      line('', 'الأجر الشامل (وعاء الضريبة)', m(o.Comprehensive_Wage), '') +
      line('', 'حصة العامل في التأمينات', m(o.Emp_Insurance), 'تقديرية') + line('', 'ضريبة الدخل', m(o.Income_Tax), 'تقديرية') +
      line('', 'الصافي التقديري', m(o.Net_Salary), o.Net_Reviewed_At ? 'راجعه مشرف الرواتب' : 'لم يراجعه مشرف الرواتب بعد', true) +
      (num_(o.Incentive_Amount, 0) > 0 ? line('', 'الحافز المتغير', 'حتى ' + m(o.Incentive_Amount), e(o.Incentive_Terms || '')) : '') + '</tbody></table>' +
    (noIns ? '<div class="small"><b>تعاقد من غير تأمينات اجتماعية</b> — السند: ' + e(o.No_Ins_Basis || '—') + ' (الاستقطاعات التأمينية صفر).</div>' : '') +
    '<h4>الشروط والتنبيهات</h4><ol>' + terms.map(function (t) { return '<li>' + e(t) + '</li>'; }).join('') + '</ol>' +
    '<table class="pr-t pr-grid sg"><tr><th>أُعدَّ بواسطة</th><th>اعتمد</th><th>علم المرشح</th></tr><tr><td>' + e(ctx.user.Full_Name_AR) + '<br><span class="small" dir="ltr">' + e(now.slice(0, 16).replace('T', ' ')) + '</span><br>التوقيع:</td>' +
      '<td>رئيس الموارد البشرية' + (hrHead ? ': ' + e(hrHead) : '') + '<br>التوقيع:</td><td>أقر بأنني اطلعت على مفردات راتبي أعلاه.<br>' + e(per.Full_Name) + '<br>التوقيع: ............ التاريخ: ............</td></tr></table>' +
    '<div class="pr-foot">نسخة واحدة تُحفظ لدى الشركة في ملف الخدمة · طُبع من بوابة التوظيف · المرجع <span dir="ltr">' + e(j.Joining_ID) + '</span></div></div>';
  audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'PRINT_PAY_DETAILS', newValue: o.Offer_ID });
  return { subject: 'مفردات الراتب — ' + per.Full_Name, html: html, theme: true };
}

/** p = { Joining_ID, Residence_Address?, Contract_Months? } — the contract's own data (v0.47.0, CHG-101). */
function joiningContractData_(ctx, p) {
  var j = joiningGet_(p.Joining_ID); joiningAccess_(ctx, j, true);
  if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش.');
  var me = ctx.user.User_ID, addr = p.Residence_Address !== undefined ? str_(p.Residence_Address).replace(/\s+/g, ' ').trim() : null;
  var months = p.Contract_Months !== undefined && str_(p.Contract_Months) !== '' ? num_(p.Contract_Months, 0) : null;
  if (addr !== null && addr && addr.length < 8) throw userError_('اكتب محل الإقامة بالتفصيل (الشارع والمنطقة والمحافظة).');
  if (months !== null && !(months >= 1 && months <= 60 && months % 1 === 0)) throw userError_('مدة العقد بالشهور من 1 لـ 60.');
  withLock_(function () {
    if (addr !== null) {
      var r = update_('PERSONS', j.Person_ID, { Residence_Address: addr.slice(0, 300) }, me);
      auditDiff_(ctx, 'PERSON', j.Person_ID, r.before, r.after, 'بيانات العقد');
    }
    if (months !== null) update_('JOININGS', j.Joining_ID, { Contract_Months: String(months) }, me);
  });
  return { joining: joiningView_(ctx, joiningGet_(j.Joining_ID), true) };
}

/** p = { Joining_ID, files: [{name, mime, data}] } — the signed contract (one file; a new upload replaces the link). */
function joiningContractUpload_(ctx, p) {
  var j = joiningGet_(p.Joining_ID); joiningAccess_(ctx, j, true);
  if (ctx.readOnly) throw userError_('مالكش صلاحية.');
  if (j.Status === 'DID_NOT_JOIN') throw userError_('المرشح ماستلمش.');
  var checked = evidenceCheck_(p.files);
  if (!checked.length) throw userError_('ارفع العقد الموقّع (PDF أو صورة).');
  var saved = evidenceSave_(j.Joining_ID, checked.slice(0, 1));
  withLock_(function () { update_('JOININGS', j.Joining_ID, { Contract_File_ID: saved[0].id, Contract_At: nowIso_(), Contract_By: ctx.user.User_ID }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'JOINING', entityId: j.Joining_ID, action: 'CONTRACT_SIGNED', newValue: saved[0].name });
  return { ok: true };
}

/* ---------------- lists & todo ---------------- */

/** p = { tab: upcoming|review|deferred|payroll|expiring|done } */
function joiningsList_(ctx, p) {
  var tab = str_(p.tab) || 'upcoming', day = today_(), soon = addDaysYmd_(day, 30), vacs = {}, acc = {};
  var rows = [];
  all_('JOININGS').forEach(function (j) {
    if (!vacs[j.Vacancy_ID]) { vacs[j.Vacancy_ID] = findOne_('VACANCIES', { Vacancy_ID: j.Vacancy_ID }) || {}; acc[j.Vacancy_ID] = vacancyAccess_(ctx, vacs[j.Vacancy_ID]); }
    if (acc[j.Vacancy_ID] !== 'FULL') return;
    var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }), S = docSummary_(docs, day), PS = payrollState_(j, docs, day);
    var expiring = docs.filter(function (d) { return d.Expiry_Date && d.Expiry_Date <= soon; });
    var keep = tab === 'upcoming' ? j.Status === 'PENDING'
      : tab === 'review' ? S.review > 0
      : tab === 'deferred' ? S.deferred > 0 && j.Status !== 'DID_NOT_JOIN'
      : tab === 'payroll' ? !!(PS && (PS.needStop || PS.needRelease))
      : tab === 'expiring' ? expiring.length > 0 && j.Status === 'JOINED'
      : j.Status !== 'PENDING';
    if (!keep) return;
    var per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}, v = vacs[j.Vacancy_ID];
    rows.push({ Joining_ID: j.Joining_ID, Application_ID: j.Application_ID, name: per.Full_Name, jobTitle: v.Vacancy_ID ? vacTitle_(v).ar : '', locationName: locName_(v.Location_ID),
      Status: j.Status, Planned_Date: j.Planned_Date, confirmed: !!j.Date_Confirmed_At, Joined_Date: j.Joined_Date, Employee_ID: j.Employee_ID, summary: S, payroll: PS,
      expiring: expiring.map(function (d) { return d.Name + ' ' + d.Expiry_Date; }), No_Insurance: j.No_Insurance, Receipt_ID: j.Receipt_ID,
      deferredDocs: docs.filter(function (d) { return d.Deferred === 'Y' && !docDone_(d); }).map(function (d) { return d.Name + ' (' + d.Due_Date + ')'; }) });
  });
  rows.sort(function (a, b) { return str_(a.Planned_Date || a.Joined_Date) < str_(b.Planned_Date || b.Joined_Date) ? -1 : 1; });
  return { rows: rows, tab: tab, cutoff: payrollCutoff_(day) };
}

function joiningTodo_(ctx) {
  var t = { review: 0, tomorrow: 0, payroll: 0, overdue: 0 }, day = today_(), tmr = nextWorkDay_();
  if (!hasAnyRole_(ctx, candWorkRoles_())) return t;
  var my = myTeamVacancies_(ctx), all = candAll_(ctx);
  all_('JOININGS').forEach(function (j) {
    if (!all && !my[j.Vacancy_ID]) return;
    if (j.Status === 'DID_NOT_JOIN') return;
    var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }), S = docSummary_(docs, day);
    t.review += S.review;
    if (j.Status === 'PENDING' && j.Planned_Date && j.Planned_Date <= tmr) t.tomorrow++;
    var PS = payrollState_(j, docs, day);
    if (PS && (PS.needStop || PS.needRelease)) t.payroll++;
    if (S.overdue) t.overdue++;
  });
  return t;
}

/** Daily: tell the team when the payroll window opens, deferred documents due, joiners tomorrow. */
function joiningDaily_() {
  var day = today_(), out = { payroll: 0, due: 0 };
  all_('JOININGS').forEach(function (j) {
    if (j.Status === 'DID_NOT_JOIN') return;
    var docs = find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID });
    var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: j.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; });
    var per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {};
    var PS = payrollState_(j, docs, day);
    if (PS && PS.needStop && day === PS.alertFrom) {
      notify_(team, 'مسوغات متأخرة — إخطار المرتبات قبل ' + PS.cutoff, per.Full_Name + ' · ' + PS.missing.join('، '), 'APPLICATION', j.Application_ID, true);
      out.payroll++;
    }
    docs.forEach(function (d) {
      if (d.Required === 'Y' && d.Deferred === 'Y' && !docDone_(d) && d.Due_Date === addDaysYmd_(day, 3)) {
        notify_(team, 'مستند مؤجل استحقاقه بعد 3 أيام', per.Full_Name + ' · ' + d.Name + ' (' + d.Due_Date + ')', 'APPLICATION', j.Application_ID, false);
        out.due++;
      }
    });
  });
  return out;
}

/**
 * v0.40.0 — every day (DOC-002, FIL-001):
 *   • a verified document whose expiry date passed becomes EXPIRED (the team is told; the employee is asked to renew);
 *   • on working days: a renewal notice DOC_RENEW_NOTICE_DAYS before expiry; the employee is reminded of a deferred
 *     document 3 days before and on its due date; DOC_DEFER_ESCALATE_DAYS after the due date it goes to the HR manager.
 */
function docExpiryDaily_(weekend) {
  var day = today_(), out = { expired: 0, renew: 0, reminded: 0, escalated: 0 };
  var renewBy = addDaysYmd_(day, num_(cfg_('DOC_RENEW_NOTICE_DAYS', 30), 30)), escDays = num_(cfg_('DOC_DEFER_ESCALATE_DAYS', 7), 7);
  var J = {}, P = {}, T = {};
  function jo(id) { if (!(id in J)) J[id] = findOne_('JOININGS', { Joining_ID: id }) || null; return J[id]; }
  function per(j) { if (!(j.Person_ID in P)) P[j.Person_ID] = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}; return P[j.Person_ID]; }
  function team(j) { if (!T[j.Vacancy_ID]) T[j.Vacancy_ID] = find_('VACANCY_RECRUITERS', { Vacancy_ID: j.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; }); return T[j.Vacancy_ID]; }
  function mailPerson(j, subject, body) {
    var pr = per(j);
    if (!pr.Email || !mailOk_('CANDIDATE')) return false;                // the daily e-mail budget, like every candidate e-mail
    try { if (!sendMail_({ to: pr.Email, subject: subject, name: 'قنديل مصر — الموارد البشرية',
      htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">أهلاً ' + escHtml_(pr.Full_Name) + '،<br>' + body + '<br><br>قنديل مصر — الموارد البشرية</div>' })) return false; mailSent_(); return true; }
    catch (e) { console.warn('doc mail: ' + e); return false; }
  }
  var hr = null;
  all_('CANDIDATE_DOCS').forEach(function (d) {
    var j = jo(d.Joining_ID);
    if (!j || j.Status === 'DID_NOT_JOIN') return;
    var pr = per(j), who = pr.Full_Name + ' · ' + d.Name;
    if (d.Status === 'VERIFIED' && /^\d{4}-\d{2}-\d{2}$/.test(str_(d.Expiry_Date)) && d.Expiry_Date < day) {
      withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'EXPIRED', Expired_At: nowIso_() }, 'SYSTEM'); });
      notify_(team(j), 'مستند انتهت صلاحيته — ' + pr.Full_Name, who + ' (انتهى ' + d.Expiry_Date + ') — اطلب نسخة سارية.', 'APPLICATION', j.Application_ID, false);
      mailPerson(j, 'تجديد مستند: ' + d.Name, 'صلاحية «' + escHtml_(d.Name) + '» اللي في ملفك انتهت يوم ' + escHtml_(d.Expiry_Date) + '. ابعت نسخة سارية لمسؤول الموارد البشرية في أقرب وقت.');
      out.expired++;
      return;
    }
    if (weekend) return;
    if (d.Status === 'VERIFIED' && d.Expiry_Date && d.Expiry_Date <= renewBy && !d.Renew_Notice_At && j.Status === 'JOINED') {
      withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Renew_Notice_At: nowIso_() }, 'SYSTEM'); });
      notify_(team(j), 'مستند قرب ينتهي — ' + pr.Full_Name, who + ' (ينتهي ' + d.Expiry_Date + ')', 'APPLICATION', j.Application_ID, false);
      mailPerson(j, 'تجديد مستند: ' + d.Name, 'صلاحية «' + escHtml_(d.Name) + '» اللي في ملفك بتنتهي يوم ' + escHtml_(d.Expiry_Date) + '. جدّده وابعت النسخة الجديدة لمسؤول الموارد البشرية.');
      out.renew++;
    }
    if (d.Required === 'Y' && d.Deferred === 'Y' && d.Due_Date && !docDone_(d)) {
      var last = str_(d.Defer_Reminded_At).slice(0, 10);
      if ((day === addDaysYmd_(d.Due_Date, -3) || day === d.Due_Date) && last !== day) {
        withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Defer_Reminded_At: nowIso_() }, 'SYSTEM'); });
        if (mailPerson(j, 'تذكير: مستند مؤجل — ' + d.Name, 'متفقين إنك تسلّم «' + escHtml_(d.Name) + '» لحد يوم ' + escHtml_(d.Due_Date) + '. لو فيه أي مشكلة كلّم مسؤول التوظيف.')) out.reminded++;
      }
      if (escDays > 0 && day >= addDaysYmd_(d.Due_Date, escDays) && !d.Defer_Escalated_At) {
        if (!hr) hr = roleUserIds_([ROLE.HR_MANAGER]);
        withLock_(function () { update_('CANDIDATE_DOCS', d.Doc_ID, { Defer_Escalated_At: nowIso_() }, 'SYSTEM'); });
        notify_(hr.length ? hr : roleUserIds_([ROLE.HR_SECTOR]), 'تصعيد: مستند مؤجل متأخر ' + daysBetween_(d.Due_Date, day) + ' يوم', who + ' — كان مستحق ' + d.Due_Date + '.', 'APPLICATION', j.Application_ID, true);
        out.escalated++;
      }
    }
  });
  return out;
}

/* ---------------- candidate's private upload page ---------------- */

function joiningByToken_(token) {
  var t = str_(token);
  if (t.length < 20) throw userError_('اللينك غير صحيح.');
  var h = hash_('DOCS:' + t), j = findOne_('JOININGS', { Token_Hash: h });
  if (!j || j.Token_Until < today_() || j.Status === 'DID_NOT_JOIN') throw userError_('اللينك ده انتهى أو غير صحيح — كلّم مسؤول التوظيف.');
  return j;
}

/** Record the hiring-documents consent on the joining (inside or outside a lock). */
function docsConsentRecord_(actorId, j, channel) {
  var ver = str_(cfg_('DOCS_PRIVACY_VERSION', '1'));
  withLock_(function () {
    update_('JOININGS', j.Joining_ID, { Docs_Consent_At: nowIso_(), Docs_Consent_Version: ver, Docs_Consent_Channel: channel }, actorId);
    consentLog_(actorId, { Person_ID: j.Person_ID, Application_ID: j.Application_ID, Kind: 'DOCS', Version: ver, Channel: channel });
  });
  j.Docs_Consent_At = nowIso_();
}

/** p = { token, version } — the new hire accepts the hiring-documents notice before the first upload. */
function docsConsent_(p) {
  var j = joiningByToken_(p.token);
  if (str_(p.version) !== str_(cfg_('DOCS_PRIVACY_VERSION', '1'))) throw userError_('الإشعار اتحدّث — افتح الصفحة من جديد.');
  if (!j.Docs_Consent_At) docsConsentRecord_('PUBLIC', j, 'DOCS_LINK');
  return docsInfo_(p);
}

/** p = { token } — what the candidate sees: his name, the job and the document list (no internal notes beyond the rejection reason). */
function docsInfo_(p) {
  var j = joiningByToken_(p.token), per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {}, v = findOne_('VACANCIES', { Vacancy_ID: j.Vacancy_ID }) || {};
  var t = v.Vacancy_ID ? vacTitle_(v) : { ar: '', en: '' };
  var ent = entityOfVacancy_(v);
  return { name: str_(per.Full_Name).split(' ')[0], job: t.ar, jobEn: t.en, planned: j.Planned_Date, until: j.Token_Until,
    consented: !!j.Docs_Consent_At, notice: { version: str_(cfg_('DOCS_PRIVACY_VERSION', '1')), ar: cfg_('DOCS_PRIVACY_AR', ''), en: cfg_('DOCS_PRIVACY_EN', ''),
      email: cfg_('PRIVACY_EMAIL', ''), entity: ent ? ent.Name_AR : '', entityEn: ent ? ent.Name_EN : '' },
    docs: find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }).sort(function (a, b) { return a.Doc_ID < b.Doc_ID ? -1 : 1; }).map(function (d) {
      return { code: d.Doc_Code, name: d.Name, keep: d.Keep, copies: d.Copies, digital: d.Digital, required: d.Required, status: d.Status,
        note: d.Status === 'REJECTED' ? d.Review_Note : d.Status === 'REPLACEMENT' ? d.Issue_Note : '', count: (JSON.parse(d.Files_JSON || '[]') || []).length };
    }) };
}

/** p = { token, code, file } */
function docsUpload_(p) {
  var j = joiningByToken_(p.token);
  if (!j.Docs_Consent_At) throw userError_('وافق على إشعار الخصوصية الأول.');
  // a short-lived counter (cache, not script properties: those have a size limit and these keys would pile up forever)
  var cache = CacheService.getScriptCache(), key = 'DOCUP_' + j.Joining_ID + '_' + today_();
  var n = num_(cache.get(key), 0);
  if (n >= 40) throw userError_('اترفع ملفات كتير النهارده — كمّل بكرة أو كلّم مسؤول التوظيف.');
  var d = findOne_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID, Doc_Code: str_(p.code) });
  if (!d) throw userError_('المستند غير موجود.');
  if (d.Digital !== 'Y') throw userError_('المستند ده بيتسلّم ورقي بس.');
  if (d.Status === 'VERIFIED') throw userError_('المستند ده اتراجع خلاص.');
  docStore_(d, p.file, 'PUBLIC');
  cache.put(key, String(n + 1), 21600);
  event_(null, 'JOINING', j.Joining_ID, 'DOC_UPLOADED_BY_CANDIDATE', d.Name);
  var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: j.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; });
  var per = findOne_('PERSONS', { Person_ID: j.Person_ID }) || {};
  notify_(team, 'مستند اترفع ومستني المراجعة', per.Full_Name + ' · ' + d.Name, 'APPLICATION', j.Application_ID, false);
  return docsInfo_(p);
}
