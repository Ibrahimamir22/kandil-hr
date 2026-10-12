/**
 * Candidates.gs — Phase 3A: person master, applications per vacancy, pipeline, activity log,
 * tasks, message templates, public apply page.
 *
 * Pipeline stages: NEW → CONTACTED → SCREENING → SHORTLISTED → INTERVIEW (from the first scheduled interview, v0.11.0)
 *                 → OFFER (selected, v0.13.0) → ACCEPTED (offer accepted; joining comes in 5B)
 *                               ON_HOLD (keeps the stage it came from) · REJECTED · WITHDRAWN
 * Rules: duplicates are flagged, never merged automatically. Rejection needs a coded reason; the
 * internal note is never shown to the candidate. Activities are voided, never deleted.
 * Data access uses find_/findOne_ (simple field filters) so a move to a SQL database stays easy.
 */

var STAGES_ACTIVE_ = ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'ACCEPTED'];
var STAGES_ALL_ = STAGES_ACTIVE_.concat(['JOINED', 'ON_HOLD', 'REJECTED', 'WITHDRAWN']);
var STAGE_AR_ = { NEW: 'جديد', CONTACTED: 'تم التواصل', SCREENING: 'فرز مبدئي', SHORTLISTED: 'قائمة مختصرة', INTERVIEW: 'مقابلات', OFFER: 'عرض وظيفي', ACCEPTED: 'قبل العرض', JOINED: 'استلم العمل',
  ON_HOLD: 'معلّق', REJECTED: 'مرفوض', WITHDRAWN: 'انسحب' };
/** Stages the hiring manager sees (v0.11.0: the shortlist and the interview process). */
var MGR_STAGES_ = ['SHORTLISTED', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'JOINED'];
var ACT_TYPES_ = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE', 'MESSAGE'];
var CALL_OUTCOMES_ = ['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALL_BACK'];
var EDU_CODES_ = ['NONE', 'INTERMEDIATE', 'SECONDARY', 'ABOVE_INTERMEDIATE', 'BACHELOR', 'MASTER', 'PHD'];
var NOTICE_CODES_ = ['IMMEDIATE', 'TWO_WEEKS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_PLUS'];
var CV_MIME_ = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
var CV_MAX_BYTES_ = 5 * 1024 * 1024;

/**
 * The real type of an uploaded file, read from its first bytes (the browser's declared type can be anything).
 * Returns a mime type, or '' when the content is none of the types the portal accepts.
 */
function sniffMime_(bytes) {
  var b = function (i) { return bytes.length > i ? bytes[i] & 255 : -1; };
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'application/pdf';                     // %PDF
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
  if (b(0) === 0x50 && b(1) === 0x4B && b(2) === 0x03 && b(3) === 0x04) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';   // .docx (zip)
  if (b(0) === 0xD0 && b(1) === 0xCF && b(2) === 0x11 && b(3) === 0xE0) return 'application/msword';                  // .doc
  return '';
}
/** The type to store a checked upload under: its real type, when that is one of the allowed ones; else ''. */
function uploadMime_(bytes, allowed) {
  var real = sniffMime_(bytes);
  return real && allowed.indexOf(real) >= 0 ? real : '';
}
var APPLY_STATUSES_ = ['OPEN', 'PARTIALLY_FILLED'];

/* ---------------- roles & visibility ---------------- */

/** Full candidate access across all vacancies. */
function candAllRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR]; }
/** Anyone who works candidates (all-access roles + assigned recruiters). */
function candWorkRoles_() { return candAllRoles_().concat([ROLE.RECRUITER, ROLE.HR_STAFF]); }
function templateEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER]; }

function candAll_(ctx) { return hasAnyRole_(ctx, candAllRoles_()); }

/** Vacancy IDs where the user is an active team member. */
function myTeamVacancies_(ctx) {
  if (!ctx._myVac) {
    ctx._myVac = {};
    find_('VACANCY_RECRUITERS', { User_ID: ctx.user.User_ID, Active: 'Y' }).forEach(function (r) { ctx._myVac[r.Vacancy_ID] = 1; });
  }
  return ctx._myVac;
}

/**
 * Access level on a vacancy's candidates:
 *   'FULL'      — HR/recruitment managers, or a recruiter on the vacancy team
 *   'SHORTLIST' — the hiring manager (requester / head of the unit): shortlisted and interviewing candidates only (MGR_STAGES_), no salary or ID
 *   ''          — none
 */
function vacancyAccess_(ctx, v) {
  if (!v) return '';
  if (candAll_(ctx) || myTeamVacancies_(ctx)[v.Vacancy_ID]) return 'FULL';
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID });
  if (req && req.Requester_User_ID === ctx.user.User_ID) return 'SHORTLIST';
  if (!ctx._scope) ctx._scope = managedScope_(ctx.user);
  return ctx._scope.indexOf(v.Org_Unit_ID) >= 0 ? 'SHORTLIST' : '';
}

function requireVacancyFull_(ctx, v) {
  if (vacancyAccess_(ctx, v) !== 'FULL') throw userError_('مالكش صلاحية على مرشحين الشاغر ده.');
}

/* ---------------- normalization & validation ---------------- */

/** Arabic-Indic and Persian digits → Latin. */
function latinDigits_(s) {
  return str_(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}
/** Egyptian mobile → 01XXXXXXXXX; other numbers → digits with leading +. '' when unusable. */
function normMobile_(m) {
  var raw = latinDigits_(m), d = raw.replace(/\D/g, '');
  if (/^0020\d{10}$/.test(d)) d = '0' + d.slice(4);
  else if (/^20\d{10}$/.test(d)) d = '0' + d.slice(2);
  else if (/^1\d{9}$/.test(d)) d = '0' + d;
  if (/^01[0125]\d{8}$/.test(d)) return d;
  if (/^\+/.test(raw.trim()) && d.length >= 8 && d.length <= 15) return '+' + d;
  return '';
}
function normEmailOpt_(e) { var x = str_(e).toLowerCase(); return x; }
function validEmail_(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

/** Clean the person fields from a payload. strict = public form rules. */
function personFields_(p, strict) {
  var f = {};
  f.Full_Name = str_(p.Full_Name).replace(/\s+/g, ' ');
  if (f.Full_Name.length < 5 || f.Full_Name.split(' ').length < 2) throw userError_(errText_('NAME', p.lang));
  f.Mobile = latinDigits_(p.Mobile).trim();
  f.Mobile_Norm = normMobile_(p.Mobile);
  if (!f.Mobile_Norm) throw userError_(errText_('MOBILE', p.lang));
  f.Email = normEmailOpt_(p.Email);
  if (f.Email && !validEmail_(f.Email)) throw userError_(errText_('EMAIL', p.lang));
  f.National_ID = latinDigits_(p.National_ID).replace(/\D/g, '');
  if (f.National_ID && !/^[23]\d{13}$/.test(f.National_ID)) throw userError_(errText_('NID', p.lang));
  f.Birth_Date = str_(p.Birth_Date);
  if (f.Birth_Date && !/^\d{4}-\d{2}-\d{2}$/.test(f.Birth_Date)) throw userError_(errText_('BIRTH', p.lang));
  f.Gender = ['M', 'F'].indexOf(str_(p.Gender)) >= 0 ? str_(p.Gender) : '';
  f.Governorate = str_(p.Governorate).slice(0, 40);
  f.City = str_(p.City).slice(0, 60);
  f.Education = EDU_CODES_.indexOf(str_(p.Education)) >= 0 ? str_(p.Education) : '';
  f.Specialization = str_(p.Specialization).slice(0, 120);
  f.Graduation_Year = latinDigits_(p.Graduation_Year).replace(/\D/g, '').slice(0, 4);
  var ex = latinDigits_(p.Experience_Years).trim();
  if (ex !== '' && (!/^\d{1,2}(\.\d)?$/.test(ex) || Number(ex) > 50)) throw userError_(errText_('EXP', p.lang));
  f.Experience_Years = ex;
  f.Current_Employer = str_(p.Current_Employer).slice(0, 120);
  f.Current_Title = str_(p.Current_Title).slice(0, 120);
  ['Current_Salary', 'Expected_Salary'].forEach(function (k) {
    var s = latinDigits_(p[k]).replace(/[,\s]/g, '');
    if (s !== '' && !/^\d{1,7}$/.test(s)) throw userError_(errText_('SALARY', p.lang));
    if (s !== '' && Number(s) === 0) throw userError_(errText_('SALARY_ZERO', p.lang));   // CAN-005: never zero
    f[k] = s;
  });
  f.Notice_Period = NOTICE_CODES_.indexOf(str_(p.Notice_Period)) >= 0 ? str_(p.Notice_Period) : '';
  f.Language = str_(p.lang) === 'en' ? 'en' : 'ar';
  f.Is_Employee = str_(p.Is_Employee) === 'Y' ? 'Y' : '';
  f.Employee_ID = f.Is_Employee ? latinDigits_(p.Employee_ID).trim().slice(0, 20) : '';
  if (strict) {
    if (!f.Governorate) throw userError_(errText_('GOV', p.lang));
    if (!f.Education) throw userError_(errText_('EDU', p.lang));
    if (f.Experience_Years === '') throw userError_(errText_('EXP', p.lang));
    if (f.Is_Employee && !f.Employee_ID) throw userError_(errText_('EMPID', p.lang));
  }
  return f;
}

/**
 * v0.38.0 (CHG-80 / CHG-81): the apply page's privacy questions — the expected salary as a range (the current salary is
 * asked at the offer), a relative in the company, accommodation and disability (optional, HR only), under-18 with a
 * guardian, and the photo's own consent.
 */
function applyPrivacyFields_(p, f) {
  var lang = p.lang, o = {};
  var mx = latinDigits_(p.Expected_Salary_Max).replace(/[,\s]/g, '');
  if (mx !== '' && (!/^\d{1,7}$/.test(mx) || Number(mx) === 0)) throw userError_(errText_('SALARY', lang));
  if (mx !== '' && f.Expected_Salary && Number(mx) < Number(f.Expected_Salary)) throw userError_(errText_('SALARY_RANGE', lang));
  o.Expected_Salary_Max = mx;
  o.Has_Relative = ['Y', 'N'].indexOf(str_(p.Has_Relative)) >= 0 ? str_(p.Has_Relative) : '';
  o.Relative_Name = o.Has_Relative === 'Y' ? str_(p.Relative_Name).replace(/\s+/g, ' ').slice(0, 80) : '';
  o.Relative_Relation = o.Has_Relative === 'Y' ? str_(p.Relative_Relation).slice(0, 40) : '';
  if (o.Has_Relative === 'Y' && (o.Relative_Name.length < 3 || !o.Relative_Relation)) throw userError_(errText_('RELATIVE', lang));
  o.Accommodation = str_(p.Accommodation).slice(0, 300);
  o.Disability = str_(p.Disability) === 'Y' ? 'Y' : '';
  var minor = str_(p.Minor) === 'Y';
  if (f.Birth_Date) { var b = f.Birth_Date, t = today_(); minor = minor || (Number(t.slice(0, 4)) - Number(b.slice(0, 4)) - (t.slice(5) < b.slice(5) ? 1 : 0)) < 18; }
  o.Minor = minor ? 'Y' : '';
  o.Guardian_Name = minor ? str_(p.Guardian_Name).replace(/\s+/g, ' ').slice(0, 80) : '';
  o.Guardian_Mobile = minor ? normMobile_(p.Guardian_Mobile) : '';
  if (minor && (o.Guardian_Name.length < 5 || !o.Guardian_Mobile || str_(p.consentGuardian) !== 'Y')) throw userError_(errText_('GUARDIAN', lang));
  o.Photo_Consent = str_(p.consentPhoto) === 'Y' ? 'Y' : '';
  return o;
}

/** Messages for the public form (shown in the candidate's language). */
function errText_(k, lang) {
  var T = {
    NAME: ['اكتب الاسم بالكامل (اسمين على الأقل).', 'Please enter your full name (at least two names).'],
    MOBILE: ['رقم الموبايل غير صحيح. اكتبه بالشكل 01XXXXXXXXX.', 'Mobile number is not valid. Use the format 01XXXXXXXXX.'],
    EMAIL: ['البريد الإلكتروني غير صحيح.', 'Email address is not valid.'],
    NID: ['الرقم القومي لازم يكون 14 رقم.', 'National ID must be 14 digits.'],
    BIRTH: ['تاريخ الميلاد غير صحيح.', 'Birth date is not valid.'],
    EXP: ['اكتب عدد سنوات الخبرة (0 لو لسه بتبدأ).', 'Enter your years of experience (0 if you are just starting).'],
    SALARY: ['المرتب لازم يكون رقم بالجنيه.', 'Salary must be a number in EGP.'],
    SALARY_ZERO: ['المرتب مايبقاش صفر — اكتب المرتب الشهري أو سيب الخانة فاضية.', 'Salary cannot be zero — enter the monthly salary or leave the field empty.'],
    SALARY_RANGE: ['أعلى المرتب المتوقع لازم يكون أكبر من أقله أو قده.', 'The top of the expected salary range must be at least its bottom.'],
    RELATIVE: ['اكتب اسم قريبك اللي شغال في الشركة وصلة القرابة.', 'Please enter your relative\'s name and the relation.'],
    GUARDIAN: ['سنك أقل من 18 سنة: اكتب اسم ولي الأمر وموبايله، ولازم يوافق على التقديم.', 'You are under 18: enter your guardian\'s name and mobile, and the guardian\'s consent.'],
    GOV: ['اختار المحافظة.', 'Please choose your governorate.'],
    EDU: ['اختار المؤهل.', 'Please choose your education level.'],
    EMPID: ['اكتب كودك الوظيفي في قنديل.', 'Please enter your Kandil employee code.'],
    CONSENT: ['لازم توافق على سياسة الخصوصية عشان نقدر نستلم طلبك.', 'Please accept the privacy notice so we can receive your application.'],
    CONSENT_SALARY: ['كتبت المرتب — وافق على معالجة بيانات المرتب، أو امسح خانات المرتب.', 'You entered a salary — accept the salary-data consent, or clear the salary fields.'],
    CONSENT_TRANSFER: ['لازم توافق على حفظ البيانات على خدمات Google (ممكن تكون خارج مصر) عشان نستلم طلبك.', 'Please accept storage on Google services (possibly outside Egypt) so we can receive your application.'],
    CV: ['ارفع سيرتك الذاتية (PDF أو Word أو صورة).', 'Please upload your CV (PDF, Word or image).'],
    CV_TYPE: ['نوع الملف غير مدعوم. ارفع PDF أو Word أو صورة.', 'File type not supported. Upload a PDF, Word file or image.'],
    CV_SIZE: ['حجم الملف أكبر من 5 ميجا.', 'The file is larger than 5 MB.'],
    CLOSED: ['التقديم على الوظيفة دي مقفول حالياً.', 'Applications for this job are closed.'],
    THROTTLE: ['اتسجل أكتر من طلب من نفس الرقم. حاول تاني بعد ساعة.', 'Too many applications from this number. Please try again in an hour.'],
    BUSY: ['فيه ضغط كبير على التقديم دلوقتي. حاول تاني بعد ساعة.', 'We are receiving too many applications right now. Please try again in an hour.'],
    STAMP: ['الصفحة دي اتفتحت من بدري — حدّث الصفحة وقدّم تاني.', 'This page has been open too long — please reload it and apply again.']
  };
  var x = T[k] || [k, k];
  return str_(lang) === 'en' ? x[1] : x[0];
}

/* ---------------- duplicates ---------------- */

/** Persons matching on national ID, mobile or email (active persons only). */
function dupMatches_(f, excludeId) {
  var out = {};
  function add(rows, on) {
    rows.forEach(function (r) {
      if (r.Person_ID === excludeId || r.Status !== 'Active') return;
      out[r.Person_ID] = out[r.Person_ID] || { Person_ID: r.Person_ID, Full_Name: r.Full_Name, Mobile: r.Mobile, Email: r.Email, on: [] };
      if (out[r.Person_ID].on.indexOf(on) < 0) out[r.Person_ID].on.push(on);
    });
  }
  if (f.National_ID) add(find_('PERSONS', { National_ID: f.National_ID }), 'NATIONAL_ID');
  if (f.Mobile_Norm) add(find_('PERSONS', { Mobile_Norm: f.Mobile_Norm }), 'MOBILE');
  if (f.Email) add(find_('PERSONS', { Email: f.Email }), 'EMAIL');
  // v0.41.0 (CHG-86): a similar name (spelling differences, «عبد الله» / «عبدالله», one letter off) is a possible match too
  if (f.Full_Name && nameWords_(f.Full_Name).length >= 3) add(where_('PERSONS', function (r) { return r.Status === 'Active' && r.Person_ID !== excludeId && nameSimilar_(f.Full_Name, r.Full_Name); }).slice(0, 10), 'NAME');
  return Object.keys(out).map(function (k) { return out[k]; });
}

/* ---------------- CV files ---------------- */

function cvFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CV_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ } }
  var f = getOrCreateFolder_().createFolder('CVs — السير الذاتية');
  props.setProperty('CV_FOLDER_ID', f.getId());
  return f;
}

/** Validate an uploaded CV { name, mime, data(base64) } BEFORE anything is saved. null when none. */
function cvCheck_(cv, lang) {
  if (!cv || !cv.data) return null;
  var mime = str_(cv.mime).toLowerCase();
  if (CV_MIME_.indexOf(mime) < 0) throw userError_(errText_('CV_TYPE', lang));
  var bytes = Utilities.base64Decode(str_(cv.data));
  if (!bytes.length) throw userError_(errText_('CV', lang));
  if (bytes.length > CV_MAX_BYTES_) throw userError_(errText_('CV_SIZE', lang));
  mime = uploadMime_(bytes, CV_MIME_);
  if (!mime) throw userError_(errText_('CV_TYPE', lang));
  return { bytes: bytes, mime: mime, name: str_(cv.name).slice(0, 80) || 'CV' };
}

/** Store a checked CV in the private CV folder. Returns { id, name }. */
function saveCv_(personId, c) {
  var file = cvFolder_().createFile(Utilities.newBlob(c.bytes, c.mime, personId + ' — ' + c.name.replace(/[\\\/:*?"<>|]/g, '_')));
  return { id: file.getId(), name: c.name };
}

/* ---------------- shared builders ---------------- */

/* sources_() lives in Sourcing.gs (RECRUITMENT_SOURCES). */

function newPerson_(f, extra, actorId) {
  var o = { Person_ID: (extra && extra.Person_ID) || nextId_('PERSON'), CV_File_ID: '', CV_File_Name: '', CV_Updated_At: '', Consent_Version: '', Consent_At: '',
    Employee_Position_ID: '', Status: 'Active', Merged_Into: '', Dup_Status: '', Dup_Candidates: '', Notes: '' };
  for (var k in f) o[k] = f[k];
  for (var x in extra) o[x] = extra[x];
  return insert_('PERSONS', o, actorId);
}

function newApplication_(personId, vacancyId, extra, actorId) {
  var o = { Application_ID: nextId_('APPLICATION'), Person_ID: personId, Vacancy_ID: vacancyId, Channel: '', Source: '',
    Sub_Source: '', Referrer_Name: '', Referrer_Employee_ID: '', Applied_At: nowIso_(), Stage: 'NEW', Stage_At: nowIso_(),
    Stage_Before_Hold: '', Hold_Reason: '', Close_Code: '', Close_Note: '', Reject_Msg_Status: '', Reject_Msg_At: '',
    Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '', Is_Internal: '', Manager_Notified_At: '', Manager_User_ID: '',
    Consent_Version: '', Answers_JSON: '', Ad_ID: '' };
  for (var k in extra) o[k] = extra[k];
  if (!o.Original_Source) o.Original_Source = originalSourceFor_(personId, o.Source);
  return insert_('APPLICATIONS', o, actorId);
}

function activity_(actorId, app, type, fields) {
  var o = { Activity_ID: nextId_('ACTIVITY'), Application_ID: app ? app.Application_ID : '', Person_ID: app ? app.Person_ID : str_(fields.Person_ID),
    Type: type, Outcome: '', Note: '', Template_Code: '', Stage_From: '', Stage_To: '', Status: 'Active', Voided_By: '', Voided_At: '', Void_Reason: '' };
  for (var k in fields) if (k !== 'Person_ID') o[k] = str_(fields[k]);
  return insert_('ACTIVITIES', o, actorId);
}

function vacTitle_(v) {
  var pos = findOne_('POSITIONS', { Position_ID: v.Position_ID });
  var job = findOne_('JOBS', { Job_Code: v.Job_Code }) || {};
  return { ar: (pos && pos.Position_Title) || job.Job_Title_AR || v.Job_Code, en: job.Job_Title_EN || '' };
}
function locName_(id, lang) {
  var l = findOne_('LOCATIONS', { Location_ID: id });
  return l ? (lang === 'en' && l.Name_EN ? l.Name_EN : l.Name_AR) : '';
}

/* ---------------- public apply page ---------------- */

function applyUrl_(code, src) {
  var base = '';
  try { base = ScriptApp.getService().getUrl(); } catch (e) { base = ''; }
  return base + '?apply=' + encodeURIComponent(code) + (src ? '&src=' + encodeURIComponent(src) : '');
}

/** Vacancy for a public apply code, or null when closed / disabled. */
function vacancyByApplyCode_(code) {
  code = str_(code);
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
  var v = findOne_('VACANCIES', { Apply_Code: code });
  if (!v || v.Apply_Enabled !== 'Y' || APPLY_STATUSES_.indexOf(v.Status) < 0) return null;
  return v;
}

/** Public: job card + privacy notice for the apply page. */
function applyInfo_(p) {
  var v = vacancyByApplyCode_(p.code);
  if (!v) return { closed: true };
  var t = vacTitle_(v);
  var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID }) || {};
  var stampAt = String(Date.now()), stamp = stampAt + '.' + hash_('APPLY:' + str_(p.code) + ':' + stampAt).slice(0, 24);
  var opt = reqOptions_();
  function nm(list, code) { var o = list.filter(function (x) { return x.code === code; })[0]; return o ? o.name : ''; }
  var loc = findOne_('LOCATIONS', { Location_ID: v.Location_ID }) || {};
  return {
    closed: false,
    job: { titleAr: t.ar, titleEn: t.en, locationAr: loc.Name_AR || '', locationEn: loc.Name_EN || '', address: loc.Address || '',
      employmentType: req.Employment_Type || '', employmentTypeAr: nm(opt.employmentTypes, req.Employment_Type),
      summary: v.Public_Summary || '', experienceYears: req.Experience_Years || '' },
    privacy: { version: str_(cfg_('PRIVACY_VERSION', '1')), ar: cfg_('PRIVACY_TEXT_AR', ''), en: cfg_('PRIVACY_TEXT_EN', ''),
      fullAr: cfg_('PRIVACY_FULL_AR', ''), fullEn: cfg_('PRIVACY_FULL_EN', ''), email: cfg_('PRIVACY_EMAIL', ''), poolMonths: num_(cfg_('RETENTION_POOL_MONTHS', 12), 12),
      entity: (entityOfVacancy_(v) || {}).Name_AR || '', entityEn: (entityOfVacancy_(v) || {}).Name_EN || '' },
    stamp: stamp,                                        // v0.35.0: signed time the page opened (checked on submit)
    cvRequired: !!cfg_('APPLY_CV_REQUIRED', false),
    questions: vacancyQuestionsView_(v, false)          // never the knockout rules
  };
}

/** Public: submit an application. Never reveals whether the person already exists. */
function applySubmit_(p) {
  p = p || {};
  var lang = str_(p.lang) === 'en' ? 'en' : 'ar';
  p.lang = lang;
  // bots: hidden field filled or form sent too fast → pretend success, store nothing
  if (str_(p.website) || num_(p.elapsed, 99999) < 3000) return { ok: true, ref: 'APP-' + new Date().getFullYear() + '-00000' };
  var v = vacancyByApplyCode_(p.code);
  if (!v) throw userError_(errText_('CLOSED', lang));
  // v0.35.0: the time the page opened is signed by the server (the browser's own timer can be faked)
  var sm = /^(\d{10,15})\.([0-9a-f]{24})$/.exec(str_(p.stamp));
  if (!sm || hash_('APPLY:' + str_(p.code) + ':' + sm[1]).slice(0, 24) !== sm[2]) throw userError_(errText_('STAMP', lang));
  var age = Date.now() - Number(sm[1]);
  if (age < 3000) return { ok: true, ref: 'APP-' + new Date().getFullYear() + '-00000' };
  if (age > 6 * 3600 * 1000) throw userError_(errText_('STAMP', lang));
  if (str_(p.consent) !== 'Y' || str_(p.consentVersion) !== str_(cfg_('PRIVACY_VERSION', '1'))) throw userError_(errText_('CONSENT', lang));
  if (str_(p.consentTransfer) !== 'Y') throw userError_(errText_('CONSENT_TRANSFER', lang));
  var f = personFields_(p, true);
  f.Current_Salary = '';                               // v0.38.0 (CHG-81): the current salary is asked at the offer, not on the apply form
  var pf = applyPrivacyFields_(p, f); for (var pk in pf) f[pk] = pf[pk];
  if ((f.Expected_Salary || f.Expected_Salary_Max) && str_(p.consentSalary) !== 'Y') throw userError_(errText_('CONSENT_SALARY', lang));
  var cvc = cvCheck_(p.cv, lang);
  if (cfg_('APPLY_CV_REQUIRED', false) && !cvc) throw userError_(errText_('CV', lang));
  var photo = ''; try { photo = f.Photo_Consent === 'Y' ? photoClean_(p.photo) : ''; } catch (ePh) { photo = ''; }   // optional, only with its own consent (v0.38.0)
  var ko = knockoutPatch_(evalAnswers_(v, p.answers || {}, true, lang), null);

  var cache = CacheService.getScriptCache();
  var ck = 'AP_' + f.Mobile_Norm, n = num_(cache.get(ck), 0);
  if (n >= cfg_('APPLY_MAX_PER_HOUR', 3)) throw userError_(errText_('THROTTLE', lang));
  // a flood with changing numbers (a bot) stops at a per-vacancy limit per hour; the lead recruiter is told once
  var vk = 'APV_' + v.Vacancy_ID + '_' + nowIso_().slice(0, 13), vn = num_(cache.get(vk), 0), vmax = cfg_('APPLY_MAX_PER_VACANCY_HOUR', 60);
  if (vmax > 0 && vn >= vmax) {
    if (!cache.get(vk + '_N')) {
      cache.put(vk + '_N', '1', 3600);
      if (v.Lead_Recruiter_ID) notify_([v.Lead_Recruiter_ID], 'تقديم غير طبيعي على ' + vacTitle_(v).ar,
        'وصل ' + vmax + ' طلب على الشاغر في ساعة واحدة، والطلبات الزيادة اتوقفت لحد الساعة الجاية. لو ده إعلان كبير حقيقي، زوّد APPLY_MAX_PER_VACANCY_HOUR من الإعدادات.', 'VACANCY', v.Vacancy_ID, true);
    }
    throw userError_(errText_('BUSY', lang));
  }
  // and for the whole portal (APPLY_MAX_PER_HOUR_ALL): a flood spread over every vacancy stops too — before any Drive upload
  var gk = 'APG_' + nowIso_().slice(0, 13), gn = num_(cache.get(gk), 0), gmax = num_(cfg_('APPLY_MAX_PER_HOUR_ALL', 300), 300);
  if (gmax > 0 && gn >= gmax) throw userError_(errText_('BUSY', lang));
  cache.put(ck, String(n + 1), 3600);
  cache.put(vk, String(vn + 1), 3600);
  cache.put(gk, String(gn + 1), 3600);

  var srcs = sources_(), src = str_(p.src).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20);
  var source = srcs[src] ? src : 'CAREER_PAGE';
  var sub = srcs[src] ? '' : src;
  var adId = str_(p.ad).replace(/[^A-Z0-9-]/g, '').slice(0, 20), ad = null;
  if (adId) {
    ad = findOne_('ADVERTISEMENTS', { Ad_ID: adId });
    if (ad && ad.Vacancy_ID === v.Vacancy_ID) { source = ad.Source_Code; sub = ad.Campaign || ''; } else ad = null;
  }
  var referrer = str_(p.Referrer_Name).slice(0, 80);
  if (referrer && source === 'CAREER_PAGE') source = srcs.REFERRAL ? 'REFERRAL' : source;
  var consentVer = str_(cfg_('PRIVACY_VERSION', '1'));

  var app, person;
  // the CV goes to Drive (slow) BEFORE taking the lock, so other applicants are not kept waiting
  var pid = nextId_('PERSON'), cv = cvc ? saveCv_(pid, cvc) : null;
  withLock_(function () {
    var matches = dupMatches_(f, '');
    person = newPerson_(f, { Person_ID: pid, Consent_Version: consentVer, Consent_At: nowIso_(),
      Dup_Status: matches.length ? 'PENDING' : '', Dup_Candidates: matches.map(function (m) { return m.Person_ID; }).join(','),
      CV_File_ID: cv ? cv.id : '', CV_File_Name: cv ? cv.name : '', CV_Updated_At: cv ? nowIso_() : '' }, 'PUBLIC');
    app = newApplication_(person.Person_ID, v.Vacancy_ID, { Channel: 'ONLINE', Source: source, Sub_Source: sub, Referrer_Name: referrer,
      Is_Internal: f.Is_Employee, Consent_Version: consentVer, Ad_ID: ad ? ad.Ad_ID : '', Owner_User_ID: v.Lead_Recruiter_ID || '',
      Answers_JSON: ko.Answers_JSON, Knockout_Flag: ko.Knockout_Flag, Knockout_Detail: ko.Knockout_Detail }, 'PUBLIC');
    var cl = function (kind) { consentLog_('PUBLIC', { Person_ID: person.Person_ID, Application_ID: app.Application_ID, Kind: kind, Version: consentVer, Channel: 'ONLINE' }); };
    cl('APPLY'); cl('TRANSFER');
    if (f.Expected_Salary || f.Expected_Salary_Max) cl('SENSITIVE');
    if (f.Minor === 'Y') consentLog_('PUBLIC', { Person_ID: person.Person_ID, Application_ID: app.Application_ID, Kind: 'GUARDIAN', Version: consentVer, Channel: 'ONLINE', Note: f.Guardian_Name });
    if (photo) cl('PHOTO');
    if (f.Has_Relative === 'Y') relativeCheck_('PUBLIC', person, app);
    if (str_(p.consentPool) === 'Y') poolConsentGrant_('PUBLIC', person.Person_ID, app.Application_ID, 'ONLINE', '');
    activity_('PUBLIC', app, 'SYSTEM', { Note: 'قدّم أونلاين من ' + (srcs[source] || source) + (sub ? ' (' + sub + ')' : '') + (ad ? ' — إعلان ' + ad.Ad_ID : '') +
      (referrer ? ' — كتب إن اللي رشّحه: ' + referrer + ' (محتاج تأكيد)' : ''), Stage_To: 'NEW' });
  });
  if (photo) { try { photoStore_('PUBLIC', 'P:' + person.Person_ID, photo); } catch (ePh2) { console.warn('apply photo: ' + ePh2); } }
  audit_(null, { userId: 'PUBLIC', entityType: 'APPLICATION', entityId: app.Application_ID, action: 'APPLY_ONLINE', newValue: v.Vacancy_ID });
  alertRestricted_(app, person);
  var t = vacTitle_(v);
  var notifyIds = v.Lead_Recruiter_ID ? [v.Lead_Recruiter_ID] : [];
  notify_(notifyIds, 'متقدم جديد على ' + t.ar, f.Full_Name + (person.Dup_Status === 'PENDING' ? ' — محتمل يكون مكرر، راجعه' : ''),
    'APPLICATION', app.Application_ID, false);
  return { ok: true, ref: app.Application_ID };
}

/* ---------------- vacancy apply link settings ---------------- */

function randomCode_8_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', s = '';
  var hex = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 10; i++) s += chars.charAt(parseInt(hex.substr(i * 2, 2), 16) % chars.length);
  return s;
}

/** p = { Vacancy_ID, Apply_Enabled: 'Y'|'N', Public_Summary } */
function vacancyApplySettings_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  requireVacancyFull_(ctx, v);
  var patch = {};
  if (p.Apply_Enabled !== undefined) {
    var en = str_(p.Apply_Enabled) === 'Y' ? 'Y' : 'N';
    if (en === 'Y' && APPLY_STATUSES_.indexOf(v.Status) < 0) throw userError_('ابدأ التوظيف على الشاغر الأول (حالة «جاري التوظيف») عشان تفتح التقديم.');
    patch.Apply_Enabled = en;
    if (en === 'Y' && !v.Apply_Code) patch.Apply_Code = randomCode_8_();
  }
  if (p.Public_Summary !== undefined) patch.Public_Summary = str_(p.Public_Summary).slice(0, 2000);
  var res;
  withLock_(function () { res = update_('VACANCIES', v.Vacancy_ID, patch, ctx.user.User_ID); });
  auditDiff_(ctx, 'VACANCY', v.Vacancy_ID, res.before, res.after, 'إعدادات التقديم الأونلاين');
  return applyBlock_(res.after);
}

function applyBlock_(v) {
  var srcs = sources_();
  var open = v.Apply_Enabled === 'Y' && APPLY_STATUSES_.indexOf(v.Status) >= 0;
  return { enabled: v.Apply_Enabled === 'Y', live: open, code: v.Apply_Code, summary: v.Public_Summary,
    url: v.Apply_Code ? applyUrl_(v.Apply_Code, '') : '',
    links: v.Apply_Code ? find_('RECRUITMENT_SOURCES', { Status: 'Active', Has_Link: 'Y' }, { sort: 'Sort_Order' })
      .map(function (s) { return { code: s.Source_Code, name: s.Name_AR, url: applyUrl_(v.Apply_Code, s.Source_Code) }; }) : [] };
}

/* ---------------- pipeline ---------------- */

function personView_(per, level) {
  var o = { Person_ID: per.Person_ID, Full_Name: per.Full_Name, Governorate: per.Governorate, City: per.City, Education: per.Education,
    Specialization: per.Specialization, Graduation_Year: per.Graduation_Year, Experience_Years: per.Experience_Years,
    Current_Employer: per.Current_Employer, Current_Title: per.Current_Title, Notice_Period: per.Notice_Period, Gender: per.Gender,
    Birth_Date: per.Birth_Date, hasCv: !!per.CV_File_ID, CV_File_Name: per.CV_File_Name, CV_Updated_At: per.CV_Updated_At,
    Is_Employee: per.Is_Employee, Employee_ID: per.Employee_ID, Language: per.Language, Status: per.Status };
  if (level === 'FULL') {
    ['Mobile', 'Email', 'National_ID', 'Current_Salary', 'Expected_Salary', 'Employee_Position_ID', 'Consent_Version', 'Consent_At',
     'Dup_Status', 'Dup_Candidates', 'Notes', 'Merged_Into', 'Expected_Salary_Max', 'Has_Relative', 'Relative_Name', 'Relative_Relation', 'Relative_Match',
     'Minor', 'Guardian_Name', 'Guardian_Mobile', 'Photo_Consent', 'Ai_Opt_Out', 'Preferred_Channel'].forEach(function (k) { o[k] = per[k]; });
    o.selfLinkUntil = str_(per.Self_Link_Until) > nowIso_() ? str_(per.Self_Link_Until).slice(0, 10) : '';
    o.consentOk = personConsentOk_(per);                       // v0.38.0: his own consent (apply page or link)
    o.consentLinkUntil = str_(per.Consent_Link_Until).slice(0, 10);
  }
  return o;
}

/** p = { Vacancy_ID } → { vacancy, access, counts, rows, apply } */
function pipeline_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  var access = vacancyAccess_(ctx, v);
  if (!access) throw userError_('مالكش صلاحية على مرشحين الشاغر ده.');
  var names = userNames_(), srcs = sources_(), today = today_();
  var apps = find_('APPLICATIONS', { Vacancy_ID: v.Vacancy_ID }, { sort: '-Applied_At' });
  var counts = {}; STAGES_ALL_.forEach(function (s) { counts[s] = 0; });
  apps.forEach(function (a) { counts[a.Stage] = (counts[a.Stage] || 0) + 1; });
  if (access === 'SHORTLIST') apps = apps.filter(function (a) { return MGR_STAGES_.indexOf(a.Stage) >= 0; });
  var X = ivIndex_(v.Vacancy_ID), plan = planOf_(v);
  // v0.42.0 (CHG-87): the stage board shows the AI match of the current CV (a suggestion, never a ranking)
  var ai = {};
  if (access === 'FULL') find_('CV_AI_RUNS', { Vacancy_ID: v.Vacancy_ID, Status: 'OK' }).forEach(function (r) {
    if (r.Result_JSON && (!ai[r.Person_ID] || ai[r.Person_ID].Run_ID < r.Run_ID)) ai[r.Person_ID] = r;
  });
  var rows = apps.map(function (a) {
    var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
    var r = { Application_ID: a.Application_ID, Stage: a.Stage, Stage_At: a.Stage_At, Applied_At: a.Applied_At,
      sourceName: srcs[a.Source] || a.Source, Is_Internal: a.Is_Internal, person: personView_(per, access) };
    if ((X.byApp[a.Application_ID] || []).length || a.Stage === 'INTERVIEW') {
      var R = readiness_(a, plan, X);
      r.iv = { ready: R.code, evals: R.evals.expected ? R.evals.submitted + '/' + R.evals.expected : '', next: R.next };
    }
    var sel = currentSelection_(a.Application_ID);
    if (sel) r.sel = sel.Decision;
    if (access === 'FULL') {
      r.Next_Action = a.Next_Action; r.Next_Action_Date = a.Next_Action_Date; r.nextOwnerName = names[a.Next_Action_Owner] || '';
      r.ownerName = names[a.Owner_User_ID] || ''; r.mine = a.Owner_User_ID === ctx.user.User_ID;
      r.knockout = a.Knockout_Flag === 'Y' && a.Knockout_Review !== 'CONTINUE';
      r.restricted = !!restrictionFor_(per, [per.Former_Employee_ID, per.Employee_ID].filter(String));
      r.overdue = !!(a.Next_Action_Date && a.Next_Action_Date < today && STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) >= 0);
      r.dueToday = a.Next_Action_Date === today;
      r.dup = per.Dup_Status === 'PENDING';
      r.rejectMsgPending = a.Reject_Msg_Status === 'PENDING';
      r.Close_Code = a.Close_Code;
      var run = ai[a.Person_ID];
      if (run && run.CV_File_ID === per.CV_File_ID) { try { var sc = num_((JSON.parse(run.Result_JSON).match || {}).score, 0); if (sc) r.match = sc * 20; } catch (eM) {} }
    }
    r.stageDays = a.Stage_At ? daysBetween_(str_(a.Stage_At).slice(0, 10), today) : '';
    return r;
  });
  var t = vacTitle_(v);
  return {
    vacancy: { Vacancy_ID: v.Vacancy_ID, Status: v.Status, jobTitle: t.ar, unitName: (findOne_('ORG_UNITS', { Org_Unit_ID: v.Org_Unit_ID }) || {}).Name_AR || '',
      locationName: locName_(v.Location_ID), Required_HC: v.Required_HC, Joined_HC: v.Joined_HC, leadName: names[v.Lead_Recruiter_ID] || '',
      Request_ID: v.Request_ID },
    access: access, counts: access === 'FULL' ? counts : { SHORTLISTED: rows.length }, rows: rows, plan: plan,
    apply: access === 'FULL' ? applyBlock_(v) : null,
    questions: access === 'FULL' ? vacancyQuestionsView_(v, true) : []
  };
}

/* ---------------- application detail ---------------- */

function loadApp_(ctx, id, needFull) {
  var a = findOne_('APPLICATIONS', { Application_ID: id });
  if (!a) throw userError_('الطلب غير موجود.');
  var v = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID });
  var access = vacancyAccess_(ctx, v);
  if (!access || (access === 'SHORTLIST' && MGR_STAGES_.indexOf(a.Stage) < 0)) throw userError_('مالكش صلاحية على المرشح ده.');
  if (needFull && access !== 'FULL') throw userError_('العملية دي لفريق التوظيف بس.');
  return { app: a, vac: v, access: access };
}

function appGet_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, false), a = L.app, v = L.vac;
  var per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
  var names = userNames_(), srcs = sources_();
  var t = vacTitle_(v);
  var out = {
    access: L.access,
    app: { Application_ID: a.Application_ID, Vacancy_ID: a.Vacancy_ID, Stage: a.Stage, Stage_At: a.Stage_At, Applied_At: a.Applied_At,
      Channel: a.Channel, sourceName: srcs[a.Source] || a.Source, Sub_Source: a.Sub_Source, Referrer_Name: a.Referrer_Name,
      Is_Internal: a.Is_Internal },
    vacancy: { Vacancy_ID: v.Vacancy_ID, Status: v.Status, jobTitle: t.ar, jobTitleEn: t.en, locationName: locName_(v.Location_ID),
      locationNameEn: locName_(v.Location_ID, 'en'), leadName: names[v.Lead_Recruiter_ID] || '' },
    person: personView_(per, L.access)
  };
  // v0.38.0 (CHG-81): accommodation and disability — the HR team only
  if (L.access === 'FULL' && hasAnyRole_(ctx, HR_ALL_ROLES)) { out.person.Accommodation = per.Accommodation; out.person.Disability = per.Disability; }
  out.iv = appInterviews_(ctx, a, v, L.access);
  out.offer = appOffers_(ctx, a, v, L.access);
  out.joining = appJoining_(ctx, a, L.access);
  if (L.access === 'FULL') {
    var perC = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {};
    out.privacy = { consents: consentsOf_(a.Person_ID), pool: poolConsentActive_(perC), poolUntil: perC.Pool_Consent_Until || '', entity: (entityOfVacancy_(L.vac) || {}).Name_AR || '' };
  }
  if (L.access !== 'FULL') return out;
  ['Stage_Before_Hold', 'Hold_Reason', 'Close_Code', 'Close_Note', 'Reject_Msg_Status', 'Reject_Msg_At', 'Next_Action', 'Next_Action_Date',
   'Next_Action_Owner', 'Manager_Notified_At', 'Manager_User_ID', 'Consent_Version'].forEach(function (k) { out.app[k] = a[k]; });
  out.app.nextOwnerName = names[a.Next_Action_Owner] || '';
  out.app.managerName = names[a.Manager_User_ID] || '';
  out.activities = find_('ACTIVITIES', { Person_ID: a.Person_ID }, { sort: '-Activity_ID' }).map(function (x) {
    x.actorName = names[x.Created_By] || (x.Created_By === 'PUBLIC' ? 'المرشح (أونلاين)' : x.Created_By === 'SYSTEM' ? 'النظام' : x.Created_By);
    x.otherApp = x.Application_ID && x.Application_ID !== a.Application_ID;
    x.canVoid = x.Status === 'Active' && x.Type !== 'STAGE' && x.Type !== 'SYSTEM' && (x.Created_By === ctx.user.User_ID || candAll_(ctx));
    return x;
  });
  out.otherApps = find_('APPLICATIONS', { Person_ID: a.Person_ID }).filter(function (x) { return x.Application_ID !== a.Application_ID; })
    .map(function (x) {
      var ov = findOne_('VACANCIES', { Vacancy_ID: x.Vacancy_ID }) || {};
      return { Application_ID: x.Application_ID, Stage: x.Stage, Applied_At: x.Applied_At, jobTitle: ov.Vacancy_ID ? vacTitle_(ov).ar : x.Vacancy_ID,
        locationName: locName_(ov.Location_ID), canOpen: !!vacancyAccess_(ctx, ov) };
    });
  if (per.Dup_Status === 'PENDING') {
    out.dups = dupMask_(ctx, dupMatches_(per, per.Person_ID)).map(function (m) {
      m.apps = find_('APPLICATIONS', { Person_ID: m.Person_ID }).length;
      return m;
    });
  }
  if (per.Employee_Position_ID) {
    var ep = findOne_('POSITIONS', { Position_ID: per.Employee_Position_ID });
    if (ep) out.person.employeePositionTitle = (ep.Position_Title || (findOne_('JOBS', { Job_Code: ep.Job_Code }) || {}).Job_Title_AR || '') +
      ' — ' + ((findOne_('ORG_UNITS', { Org_Unit_ID: ep.Org_Unit_ID }) || {}).Name_AR || '');
  }
  out.recruiterName = ctx.user.Full_Name_AR;
  // attribution (3B-2): owner, original source, referral, agency terms and ownership
  var ref = activeReferral_(a.Application_ID);
  var ag = a.Agency_ID ? findOne_('AGENCIES', { Agency_ID: a.Agency_ID }) : null;
  var terms = {}; try { terms = JSON.parse(a.Agency_Terms_JSON || '{}'); } catch (e) {}
  var own = agencyOwnership_(a.Person_ID, a.Application_ID);
  out.attr = { ownerId: a.Owner_User_ID, ownerName: names[a.Owner_User_ID] || '', Source: a.Source, Sub_Source: a.Sub_Source,
    originalSource: a.Original_Source && a.Original_Source !== a.Source ? (srcs[a.Original_Source] || a.Original_Source) : '',
    locked: !!a.Source_Locked_At, lockedAt: a.Source_Locked_At,
    isReferralSource: isReferralSource_(a.Source), isAgencySource: isAgencySource_(a.Source),
    referral: ref ? { Referral_ID: ref.Referral_ID, Employee_ID: ref.Employee_ID, Employee_Name: ref.Employee_Name, Relationship: ref.Relationship,
      Kind: ref.Kind, Bonus_Status: ref.Bonus_Status, Bonus_Note: ref.Bonus_Note } : null,
    typedReferrer: !ref && a.Referrer_Name ? a.Referrer_Name : '',
    agency: a.Agency_ID ? { Agency_ID: a.Agency_ID, name: (ag && ag.Name_AR) || terms.name || a.Agency_ID, terms: terms, until: a.Ownership_Until,
      live: !!(a.Ownership_Until && a.Ownership_Until >= today_()) } : null,
    otherAgency: own && own.agencyId !== a.Agency_ID ? own : null,
    canOwner: candAll_(ctx) || a.Owner_User_ID === ctx.user.User_ID || v.Lead_Recruiter_ID === ctx.user.User_ID };
  // 3B-3: screening answers, knockout review, former employee / restriction, origin, talent pool
  out.answers = answersView_(a);
  out.questions = vacancyQuestionsView_(v, true);
  out.knockout = a.Knockout_Flag === 'Y' ? { detail: a.Knockout_Detail, reviewed: a.Knockout_Review === 'CONTINUE',
    by: names[a.Knockout_Reviewed_By] || '', at: a.Knockout_Reviewed_At } : null;
  out.flags = personFlags_(ctx, per);
  out.app.Origin_Application_ID = a.Origin_Application_ID;
  out.app.Import_Batch_ID = a.Import_Batch_ID;
  out.pool = poolActive_(a.Person_ID);
  out.cvai = cvaiForApp_(ctx, per, v);
  out.team = find_('VACANCY_RECRUITERS', { Vacancy_ID: v.Vacancy_ID, Active: 'Y' }).map(function (r) { return { id: r.User_ID, name: names[r.User_ID] || r.User_ID }; });
  out.canReopen = candAll_(ctx);
  return out;
}

/* ---------------- stage moves ---------------- */

/**
 * p = { Application_ID, to, reasonCode?, note? }
 *   to: NEW|CONTACTED|SCREENING|SHORTLISTED|ON_HOLD|RESUME|REJECTED|WITHDRAWN|REOPEN
 */
var STALE_MSG_ = 'حد عدّل على ده قبلك بثواني — حدّث الصفحة وشوف آخر حالة قبل ما تكمّل.';

function appMove_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app, v = L.vac;
  var to = str_(p.to), note = str_(p.note), from = a.Stage, patch = {}, warn = '';
  var vacActive = VAC_OPEN_.indexOf(v.Status) >= 0;
  var closed = from === 'REJECTED' || from === 'WITHDRAWN';
  if (from === 'JOINED') throw userError_('المرشح استلم العمل — الملف اتقفل. أي تعديل يتم من سجل الموظفين.');
  if (from === 'ACCEPTED' && (to === 'WITHDRAWN' || to === 'REJECTED') && joiningOf_(a.Application_ID) && joiningOf_(a.Application_ID).Status === 'PENDING')
    throw userError_('المرشح قبل العرض — لو مش هيستلم سجّل «ماستلمش» بالسبب من كارت «الاستلام والمسوغات».');
  function reason(process) {
    var code = str_(p.reasonCode);
    var r = findOne_('REASON_MASTER', { Process: process, Code: code, Status: 'Active' });
    if (!r) throw userError_('اختار السبب.');
    if (r.Requires_Note === 'Y' && note.length < 3) throw userError_('اكتب توضيح للسبب.');
    return code;
  }
  if (STAGES_ACTIVE_.indexOf(to) >= 0) {
    if (closed || from === 'ON_HOLD') throw userError_(closed ? 'المرشح مقفول — افتحه من جديد الأول.' : 'المرشح معلّق — رجّعه الأول.');
    if (to === from) throw userError_('المرشح في المرحلة دي بالفعل.');
    if (!vacActive) throw userError_('الشاغر مش شغال — مينفعش تحريك المرشحين.');
    if (STAGES_ACTIVE_.indexOf(to) < STAGES_ACTIVE_.indexOf(from) && note.length < 3) throw userError_('اكتب سبب الرجوع لمرحلة سابقة.');
    if (to === 'OFFER') throw userError_('المرشح بيدخل مرحلة العرض بقرار «مختار» — من كارت «الاختيار والعرض» في صفحته.');
    if (to === 'ACCEPTED') throw userError_('المرشح بيبقى «قبل العرض» لما تسجّل قبوله على العرض نفسه.');
    if (from === 'ACCEPTED') throw userError_('المرشح قبل العرض — لو مش هيستلم، سجّل انسحابه بالسبب.');
    if (from === 'OFFER') throw userError_('المرشح «مختار» — غيّر قرار الاختيار من كارت «الاختيار والعرض».');
    consentGate_(a.Person_ID, to);                       // v0.38.0 (CHG-81): his own consent before work goes on
    var ivs = find_('INTERVIEWS', { Application_ID: a.Application_ID });
    if (to === 'INTERVIEW' && !ivs.some(function (x) { return INT_LIVE_.concat(INT_DONE_).indexOf(x.Status) >= 0; }))
      throw userError_('المرشح بيدخل مرحلة المقابلات لما تحدد له أول مقابلة — من كارت «المقابلات» في صفحته.');
    if (from === 'INTERVIEW' && ivs.some(function (x) { return INT_LIVE_.indexOf(x.Status) >= 0; }))
      throw userError_('المرشح عليه مقابلة متحددة — الغيها أو خلّصها الأول.');
    patch.Stage = to;
  } else if (to === 'ON_HOLD') {
    if (STAGES_ACTIVE_.indexOf(from) < 0) throw userError_('المرشح مش في مرحلة شغالة.');
    if (from === 'OFFER' || from === 'ACCEPTED') throw userError_('المرشح في مرحلة العرض — غيّر قرار الاختيار أو اسحب العرض الأول.');
    if (note.length < 3) throw userError_('اكتب سبب التعليق.');
    patch = { Stage: 'ON_HOLD', Stage_Before_Hold: from, Hold_Reason: note };
  } else if (to === 'RESUME') {
    if (from !== 'ON_HOLD') throw userError_('المرشح مش معلّق.');
    if (!vacActive) throw userError_('الشاغر مش شغال.');
    consentGate_(a.Person_ID, a.Stage_Before_Hold || 'SCREENING');
    patch = { Stage: a.Stage_Before_Hold || 'SCREENING', Stage_Before_Hold: '', Hold_Reason: '' };
  } else if (to === 'REJECTED') {
    if (closed) throw userError_('المرشح مقفول بالفعل.');
    patch = { Stage: 'REJECTED', Close_Code: reason('CANDIDATE_REJECT'), Close_Note: note, Reject_Msg_Status: 'PENDING', Reject_Msg_At: '',
      Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '', Stage_Before_Hold: '', Hold_Reason: '' };
  } else if (to === 'WITHDRAWN') {
    if (closed) throw userError_('المرشح مقفول بالفعل.');
    patch = { Stage: 'WITHDRAWN', Close_Code: reason('CANDIDATE_WITHDRAW'), Close_Note: note, Next_Action: '', Next_Action_Date: '',
      Next_Action_Owner: '', Stage_Before_Hold: '', Hold_Reason: '' };
  } else if (to === 'REOPEN') {
    if (!closed) throw userError_('المرشح مش مقفول.');
    if (!candAll_(ctx)) throw userError_('إعادة فتح مرشح مقفول لمديري التوظيف و HR بس.');
    if (!vacActive) throw userError_('الشاغر مش شغال.');
    if (note.length < 3) throw userError_('اكتب سبب إعادة الفتح.');
    consentGate_(a.Person_ID, 'SCREENING');
    patch = { Stage: 'SCREENING', Close_Code: '', Close_Note: '', Reject_Msg_Status: a.Reject_Msg_Status === 'PENDING' ? 'CANCELLED' : a.Reject_Msg_Status };
  } else throw userError_('مرحلة غير معروفة.');

  // internal candidate: current manager is told before any interview (at shortlist)
  var mgrIds = [], per = null;
  if (patch.Stage === 'SHORTLISTED' && a.Is_Internal === 'Y' && !a.Manager_Notified_At) {
    per = findOne_('PERSONS', { Person_ID: a.Person_ID });
    if (!per.Employee_Position_ID) throw userError_('المرشح موظف حالي: حدد وظيفته الحالية من «تعديل البيانات» الأول، عشان نبلّغ مديره قبل المقابلات.');
    mgrIds = managerUsersOf_(per.Employee_Position_ID);
    patch.Manager_Notified_At = nowIso_();
    patch.Manager_User_ID = mgrIds[0] || '';
  }
  patch.Stage_At = nowIso_();
  var res, cancelledIvs = [];
  withLock_(function () {
    // v0.35.0: someone else may have moved the candidate since this page was read — check again under the lock
    var now0 = get_('APPLICATIONS', a.Application_ID);
    if (!now0 || now0.Stage !== from || str_(now0.Updated_At) !== str_(a.Updated_At)) throw userError_(STALE_MSG_);
    if (patch.Stage === 'REJECTED' || patch.Stage === 'WITHDRAWN') {
      cancelledIvs = cancelLiveInterviews_(ctx.user.User_ID, a.Application_ID, 'المرشح اتقفل (' + STAGE_AR_[patch.Stage] + ')');
      withdrawLiveOffers_(ctx.user.User_ID, a.Application_ID, 'المرشح اتقفل (' + STAGE_AR_[patch.Stage] + ')' + (note ? ': ' + note : ''));
    }
    // outcome known: where the candidate came from (source, agency, referral) can no longer change
    if ((patch.Stage === 'REJECTED' || patch.Stage === 'WITHDRAWN') && !a.Source_Locked_At) patch.Source_Locked_At = lockAttribution_(ctx.user.User_ID, a);
    res = update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'STAGE', { Stage_From: from, Stage_To: res.after.Stage, Outcome: str_(p.reasonCode), Note: note });
  });
  auditDiff_(ctx, 'APPLICATION', a.Application_ID, res.before, res.after, note);
  if (cancelledIvs.length) tellCancelled_(cancelledIvs, 'المرشح اتقفل');
  var t = vacTitle_(v);
  if (patch.Manager_Notified_At !== undefined) {
    if (mgrIds.length) {
      notify_(mgrIds, 'للعلم: موظف من فريقك مرشح لوظيفة داخلية', per.Full_Name + ' (' + (per.Employee_ID || '') + ') في القائمة المختصرة لوظيفة ' + t.ar +
        ' — ' + locName_(v.Location_ID) + '. فريق التوظيف هيتواصل معاك قبل أي مقابلة.', 'APPLICATION', a.Application_ID, true);
      withLock_(function () { activity_('SYSTEM', a, 'SYSTEM', { Note: 'اتبلّغ المدير الحالي: ' + (userNames_()[mgrIds[0]] || mgrIds[0]) }); });
    } else {
      warn = 'مفيش مدير مسجّل على البوابة لوظيفة المرشح الحالية — بلّغه بنفسك قبل أي مقابلة.';
      withLock_(function () { activity_('SYSTEM', a, 'SYSTEM', { Note: 'لم يتم العثور على المدير الحالي على البوابة — مطلوب إبلاغه يدوياً' }); });
    }
  }
  if (patch.Stage === 'SHORTLISTED') {
    var req = findOne_('RECRUITMENT_REQUESTS', { Request_ID: v.Request_ID });
    if (req && req.Requester_User_ID !== ctx.user.User_ID) {
      notify_([req.Requester_User_ID], 'مرشح جديد في القائمة المختصرة — ' + t.ar,
        (per || findOne_('PERSONS', { Person_ID: a.Person_ID })).Full_Name + ' · افتح الشاغر وشوف بياناته وسيرته الذاتية.', 'APPLICATION', a.Application_ID, false);
    }
  }
  return { app: res.after, warning: warn };
}

/** Users holding the manager position of a given position (reports-to, else the unit head). */
function managerUsersOf_(positionId) {
  var pos = findOne_('POSITIONS', { Position_ID: positionId });
  if (!pos) return [];
  var cands = [];
  if (pos.Reports_To_Position_ID) cands.push(pos.Reports_To_Position_ID);
  var unit = findOne_('ORG_UNITS', { Org_Unit_ID: pos.Org_Unit_ID });
  if (unit && unit.Head_Position_ID && unit.Head_Position_ID !== positionId) cands.push(unit.Head_Position_ID);
  for (var i = 0; i < cands.length; i++) {
    var us = find_('USERS', { Position_ID: cands[i], Status: 'Active' }).map(function (u) { return u.User_ID; });
    if (us.length) return us;
  }
  return [];
}

/* ---------------- activities, next action, messages ---------------- */

/**
 * p = { Application_ID, Type, Outcome?, Note?, Template_Code?, moveToContacted?,
 *       Next_Action?, Next_Action_Date?, Next_Action_Owner?, clearNext? }
 */
function actAdd_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  var type = str_(p.Type);
  // types come from the editable list (ACTIVITY_TYPE); MESSAGE is the portal's own "message sent" record
  var typeRow = type === 'MESSAGE' ? { Requires_Note: 'N' } : findOne_('REASON_MASTER', { Process: 'ACTIVITY_TYPE', Code: type, Status: 'Active' });
  if (!typeRow && ACT_TYPES_.indexOf(type) >= 0 && !find_('REASON_MASTER', { Process: 'ACTIVITY_TYPE' }).length) typeRow = { Requires_Note: type === 'NOTE' || type === 'MEETING' ? 'Y' : 'N' };
  if (!typeRow) throw userError_('اختار نوع النشاط.');
  var outcome = str_(p.Outcome);
  if (outcome && CALL_OUTCOMES_.indexOf(outcome) < 0) throw userError_('نتيجة غير معروفة.');
  if (type === 'CALL' && !outcome) throw userError_('اختار نتيجة المكالمة.');
  var note = str_(p.Note).slice(0, 2000);
  if (typeRow.Requires_Note === 'Y' && note.length < 3) throw userError_('اكتب الملاحظة.');
  var tpl = str_(p.Template_Code);
  var patch = nextPatch_(ctx, p, a);
  var isReject = tpl === 'REJECT';
  if (isReject && a.Reject_Msg_Status === 'PENDING') { patch.Reject_Msg_Status = 'SENT'; patch.Reject_Msg_At = nowIso_(); }
  var moved = false;
  var reached = type !== 'NOTE' && (type !== 'CALL' || outcome === 'REACHED' || outcome === 'CALL_BACK');
  if (str_(p.moveToContacted) === 'Y' && a.Stage === 'NEW' && reached && !isReject) { patch.Stage = 'CONTACTED'; patch.Stage_At = nowIso_(); moved = true; }
  var act;
  withLock_(function () {
    act = activity_(ctx.user.User_ID, a, type, { Outcome: outcome, Note: note, Template_Code: tpl });
    if (moved) activity_(ctx.user.User_ID, a, 'STAGE', { Stage_From: 'NEW', Stage_To: 'CONTACTED', Note: '' });
    if (Object.keys(patch).length) update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID);
  });
  return { activity: act, moved: moved };
}

/** Next-action patch from a payload (validates owner and date). */
function nextPatch_(ctx, p, a) {
  var patch = {};
  if (str_(p.clearNext) === 'Y') return { Next_Action: '', Next_Action_Date: '', Next_Action_Owner: '' };
  if (p.Next_Action === undefined && p.Next_Action_Date === undefined) return patch;
  var what = str_(p.Next_Action).slice(0, 200), when = str_(p.Next_Action_Date);
  if (!what && !when) return patch;
  if (!what) throw userError_('اكتب الخطوة الجاية.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) throw userError_('حدد تاريخ الخطوة الجاية.');
  var owner = str_(p.Next_Action_Owner) || ctx.user.User_ID;
  if (owner !== ctx.user.User_ID) {
    var team = find_('VACANCY_RECRUITERS', { Vacancy_ID: a.Vacancy_ID, Active: 'Y' }).map(function (r) { return r.User_ID; });
    if (team.indexOf(owner) < 0) throw userError_('المسؤول عن الخطوة لازم يكون من فريق الشاغر.');
  }
  return { Next_Action: what, Next_Action_Date: when, Next_Action_Owner: owner };
}

/** p = { Application_ID, Next_Action, Next_Action_Date, Next_Action_Owner, clearNext } */
function appNext_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  var patch = nextPatch_(ctx, p, a);
  if (!Object.keys(patch).length) throw userError_('اكتب الخطوة الجاية وتاريخها.');
  var res;
  withLock_(function () { res = update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID); });
  return res.after;
}

/** p = { Activity_ID, reason } — the author or a manager; stage records cannot be voided. */
function actVoid_(ctx, p) {
  var x = findOne_('ACTIVITIES', { Activity_ID: p.Activity_ID });
  if (!x || x.Status !== 'Active') throw userError_('النشاط غير موجود أو اتلغى قبل كده.');
  if (x.Type === 'STAGE' || x.Type === 'SYSTEM') throw userError_('سجلات المراحل والنظام مبتتلغيش.');
  loadApp_(ctx, x.Application_ID, true);
  if (x.Created_By !== ctx.user.User_ID && !candAll_(ctx)) throw userError_('تقدر تلغي نشاط انت اللي سجلته بس.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  var res;
  withLock_(function () { res = update_('ACTIVITIES', x.Activity_ID, { Status: 'Voided', Voided_By: ctx.user.User_ID, Voided_At: nowIso_(), Void_Reason: reason }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'ACTIVITY', entityId: x.Activity_ID, action: 'VOID', reason: reason });
  return res.after;
}

/** Close the rejection-message task without using a template. p = { Application_ID, how: SENT|NOT_NEEDED, note } */
function rejectMsgDone_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (a.Reject_Msg_Status !== 'PENDING') throw userError_('مفيش رسالة اعتذار مستنية.');
  var how = str_(p.how) === 'NOT_NEEDED' ? 'NOT_NEEDED' : 'SENT';
  var note = str_(p.note);
  if (how === 'NOT_NEEDED' && note.length < 3) throw userError_('اكتب ليه مش محتاج رسالة.');
  withLock_(function () {
    update_('APPLICATIONS', a.Application_ID, { Reject_Msg_Status: how, Reject_Msg_At: nowIso_() }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'NOTE', { Note: (how === 'SENT' ? 'اتبعتت رسالة الاعتذار' : 'مش محتاج رسالة اعتذار') + (note ? ': ' + note : '') });
  });
  return { ok: true };
}

/* ---------------- manual entry & person editing ---------------- */

/**
 * Recruiter adds a candidate to a vacancy.
 * p = { Vacancy_ID, person fields…, Source, Sub_Source, Referrer_Name, cv?, consent:'Y',
 *       usePersonId?, confirmNew? }  → { needConfirm, matches } or { application, person }
 */
function candCreate_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('اختار الشاغر.');
  requireVacancyFull_(ctx, v);
  if (VAC_OPEN_.indexOf(v.Status) < 0 || vacPaused_(v.Status)) throw userError_('الشاغر مش شغال حالياً.');
  var srcs = sources_(), source = str_(p.Source);
  if (!srcs[source]) throw userError_('اختار مصدر المرشح.');
  var usePerson = str_(p.usePersonId);
  var cvc = cvCheck_(p.cv, 'ar');
  var agency = isAgencySource_(source) ? agencyAttach_(p.Agency_ID) : null;      // validated before anything is saved
  var referral = isReferralSource_(source);
  if (referral && !str_(p.Referrer_Employee_ID) && !str_(p.Referrer_Name)) throw userError_('اختار الموظف اللي رشّح المرشح.');
  var f = null, matches = [];
  if (!usePerson) {
    if (str_(p.consent) !== 'Y') throw userError_('أكّد إن المرشح عارف إن بياناته هتتسجل وموافق.');
    f = personFields_(p, false);
    matches = dupMatches_(f, '');
    if (matches.length && str_(p.confirmNew) !== 'Y') return { needConfirm: true, matches: dupMask_(ctx, matches) };
  } else {
    var ex = findOne_('PERSONS', { Person_ID: usePerson });
    if (!ex || ex.Status !== 'Active') throw userError_('المرشح المختار غير موجود.');
    // v0.34.0: linking a person you have no access to needs his mobile, National ID or e-mail exactly as you typed them
    // (the duplicate check that offered him) — a person number alone never opens someone else's candidate
    if (!personFullOk_(ctx, usePerson) && !personTypedMatch_(ex, p))
      throw userError_('المرشح ده مش على شواغرك — اكتب موبايله أو رقمه القومي أو إيميله زي ما هو مسجّل عشان تربطه.');
    if (find_('APPLICATIONS', { Person_ID: usePerson, Vacancy_ID: v.Vacancy_ID }).some(function (x) { return x.Stage !== 'WITHDRAWN' && x.Stage !== 'REJECTED'; }))
      throw userError_('المرشح ده متقدم بالفعل على نفس الشاغر.');
  }
  if (referral || str_(p.Referrer_Employee_ID))
    referralCheck_({ Application_ID: '', Person_ID: usePerson, Vacancy_ID: v.Vacancy_ID },
      { Employee_ID: p.Referrer_Employee_ID, Employee_Name: p.Referrer_Name, Relationship: p.Relationship }, usePerson ? null : f);
  if (usePerson && agency) {
    var own0 = agencyOwnership_(usePerson, '');
    if (own0 && own0.agencyId !== agency.Agency_ID) throw userError_('المرشح ده ملك ' + own0.name + ' لحد ' + own0.until + ' — مكتب تاني مايقدرش يقدّمه.');
  }
  var person, app, warn = '';
  var pid = usePerson || nextId_('PERSON'), cv = cvc ? saveCv_(pid, cvc) : null;      // Drive upload outside the lock
  withLock_(function () {
    if (usePerson) person = findOne_('PERSONS', { Person_ID: usePerson });
    else person = newPerson_(f, { Person_ID: pid, Consent_Version: str_(cfg_('PRIVACY_VERSION', '1')) + '-RECRUITER', Consent_At: nowIso_(),
      Dup_Candidates: matches.map(function (m) { return m.Person_ID; }).join(','),
      Notes: matches.length ? 'أكّد ' + ctx.user.Full_Name_AR + ' إنه شخص مختلف عن ' + matches.map(function (m) { return m.Person_ID; }).join('، ') : '' }, ctx.user.User_ID);
    if (cv) {
      person = update_('PERSONS', person.Person_ID, { CV_File_ID: cv.id, CV_File_Name: cv.name, CV_Updated_At: nowIso_() }, ctx.user.User_ID).after;
    }
    var extra = { Channel: 'MANUAL', Source: source, Sub_Source: str_(p.Sub_Source).slice(0, 60),
      Referrer_Name: str_(p.Referrer_Name).slice(0, 80), Referrer_Employee_ID: str_(p.Referrer_Employee_ID).slice(0, 20),
      Is_Internal: person.Is_Employee, Consent_Version: person.Consent_Version, Owner_User_ID: defaultOwner_(ctx.user.User_ID, v) };
    if (agency) for (var k in agency) extra[k] = agency[k];
    var own = agency ? null : agencyOwnership_(person.Person_ID, '');
    app = newApplication_(person.Person_ID, v.Vacancy_ID, extra, ctx.user.User_ID);
    if (!usePerson) ['APPLY', 'TRANSFER'].concat(f.Current_Salary || f.Expected_Salary ? ['SENSITIVE'] : []).forEach(function (k) {
      consentLog_(ctx.user.User_ID, { Person_ID: person.Person_ID, Application_ID: app.Application_ID, Kind: k, Version: str_(cfg_('PRIVACY_VERSION', '1')), Channel: 'RECRUITER' });
    });
    if (str_(p.poolConsent) === 'Y' && !poolConsentActive_(person)) poolConsentGrant_(ctx.user.User_ID, person.Person_ID, app.Application_ID, 'RECRUITER', 'وقت التسجيل');
    activity_(ctx.user.User_ID, app, 'SYSTEM', { Note: 'اتضاف يدوياً — المصدر: ' + srcs[source] + (agency ? ' (' + JSON.parse(agency.Agency_Terms_JSON).name + ')' : '') +
      (usePerson ? ' (مرشح موجود قبل كده)' : ''), Stage_To: 'NEW' });
    if (referral || str_(p.Referrer_Employee_ID)) {
      var ref = referralRecord_(ctx.user.User_ID, app, { Employee_ID: p.Referrer_Employee_ID, Employee_Name: p.Referrer_Name, Relationship: p.Relationship });
      app = update_('APPLICATIONS', app.Application_ID, { Referrer_Name: ref.Employee_Name, Referrer_Employee_ID: ref.Employee_ID }, ctx.user.User_ID).after;
    }
    if (own) {
      warn = 'تنبيه: المرشح ده مقدّمه ' + own.name + ' وملكيته سارية لحد ' + own.until + ' — راجع شروط المكتب قبل التعيين.';
      activity_('SYSTEM', app, 'SYSTEM', { Note: warn });
    }
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: app.Application_ID, action: 'CREATE', newValue: v.Vacancy_ID });
  alertRestricted_(app, person);
  return { application: app, person: personView_(person, 'FULL'), warning: warn };
}

/** Edit a person's data (recruiters on one of the person's vacancies, or managers). p = { Person_ID, fields…, cv?, reason } */
function personUpdate_(ctx, p) {
  var per = findOne_('PERSONS', { Person_ID: p.Person_ID });
  if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
  requirePersonFull_(ctx, per.Person_ID);
  var f = personFields_(p, false);
  var empPos = str_(p.Employee_Position_ID);
  if (empPos && !findOne_('POSITIONS', { Position_ID: empPos })) throw userError_('الوظيفة الحالية غير موجودة.');
  f.Employee_Position_ID = f.Is_Employee ? empPos : '';
  f.Language = str_(p.lang) ? f.Language : per.Language;
  if (p.Preferred_Channel !== undefined) f.Preferred_Channel = PREF_CHANNELS_[str_(p.Preferred_Channel)] ? str_(p.Preferred_Channel) : '';   // v0.39.0 (COM-002)
  var cvc = cvCheck_(p.cv, 'ar');
  var cv = cvc ? saveCv_(per.Person_ID, cvc) : null;                                   // Drive upload outside the lock
  if (cv) { f.CV_File_ID = cv.id; f.CV_File_Name = cv.name; f.CV_Updated_At = nowIso_(); }
  var res;
  withLock_(function () {
    res = update_('PERSONS', per.Person_ID, f, ctx.user.User_ID);
    // keep the internal flag of open applications in line with the person
    find_('APPLICATIONS', { Person_ID: per.Person_ID }).forEach(function (a) {
      if (a.Is_Internal !== f.Is_Employee && STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) >= 0)
        update_('APPLICATIONS', a.Application_ID, { Is_Internal: f.Is_Employee }, ctx.user.User_ID);
    });
  });
  auditDiff_(ctx, 'PERSON', per.Person_ID, res.before, res.after, str_(p.reason));
  if (res.before.Mobile_Norm !== res.after.Mobile_Norm || res.before.National_ID !== res.after.National_ID || res.before.Email !== res.after.Email) {
    var m = dupMatches_(res.after, per.Person_ID);
    if (m.length) withLock_(function () {
      update_('PERSONS', per.Person_ID, { Dup_Status: 'PENDING', Dup_Candidates: m.map(function (x) { return x.Person_ID; }).join(',') }, ctx.user.User_ID);
    });
  }
  return personView_(findOne_('PERSONS', { Person_ID: per.Person_ID }), 'FULL');
}

/** FULL access on at least one of the person's applications (or all-access role). */
function requirePersonFull_(ctx, personId) {
  if (!personFullOk_(ctx, personId)) throw userError_('مالكش صلاحية على المرشح ده.');
}

/** Full access to a person: candidate admin, or FULL access to one of his applications' vacancies. */
/**
 * v0.41.0: a match on the name alone must not hand over someone else's contact details — his mobile and e-mail are
 * masked unless the user already has that person on his vacancies (a match on the mobile / ID / e-mail he typed shows them).
 */
function dupMask_(ctx, matches) {
  return matches.map(function (m) {
    if (m.on.some(function (o) { return o !== 'NAME'; }) || personFullOk_(ctx, m.Person_ID)) return m;
    var mob = str_(m.Mobile);
    return { Person_ID: m.Person_ID, Full_Name: m.Full_Name, Mobile: mob ? '•••••••' + mob.slice(-3) : '', Email: '', on: m.on, masked: true };
  });
}

function personFullOk_(ctx, personId) {
  if (candAll_(ctx)) return true;
  return find_('APPLICATIONS', { Person_ID: personId }).some(function (a) {
    return vacancyAccess_(ctx, findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID })) === 'FULL';
  });
}

/** The payload carries the person's mobile, National ID or e-mail exactly (what the duplicate check matched on). */
function personTypedMatch_(per, p) {
  var m = normMobile_(p.Mobile), nid = latinDigits_(p.National_ID).replace(/\D/g, ''), em = str_(p.Email).toLowerCase();
  return (!!m && m === per.Mobile_Norm) || (!!nid && nid === str_(per.National_ID)) || (!!em && em === str_(per.Email).toLowerCase());
}

/** Contact details shown to someone without access to the person: 010•••••123, a•••@x.com */
function maskMobile_(m) { m = str_(m); return m.length < 7 ? (m ? '•••' : '') : m.slice(0, 3) + '•••••' + m.slice(-3); }
function maskEmail_(e) { e = str_(e); var i = e.indexOf('@'); return i < 1 ? (e ? '•••' : '') : e.charAt(0) + '•••' + e.slice(i); }

/** CV as base64 for the viewer. p = { Person_ID, Application_ID? } */
function personCv_(ctx, p) {
  var per = findOne_('PERSONS', { Person_ID: p.Person_ID });
  if (!per || !per.CV_File_ID) throw userError_('مفيش سيرة ذاتية مرفوعة.');
  if (str_(p.Interview_ID)) {
    var iv = ivGet_(p.Interview_ID);
    ivAccess_(ctx, iv);
    if (iv.Person_ID !== per.Person_ID) throw userError_('مالكش صلاحية.');
  } else if (str_(p.Application_ID)) {
    var L = loadApp_(ctx, p.Application_ID, false);
    if (L.app.Person_ID !== per.Person_ID) throw userError_('مالكش صلاحية.');
  } else requirePersonFull_(ctx, per.Person_ID);
  var blob = DriveApp.getFileById(per.CV_File_ID).getBlob();
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'CV_VIEW' });
  return { name: per.CV_File_Name || 'CV', mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/**
 * Resolve a duplicate flag. p = { Person_ID, action: MERGE|DIFFERENT, Target_Person_ID? }
 * MERGE moves this person's applications and activities to the target and fills the target's blanks.
 */
function dupResolve_(ctx, p) {
  var per = findOne_('PERSONS', { Person_ID: p.Person_ID });
  if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
  requirePersonFull_(ctx, per.Person_ID);
  var action = str_(p.action);
  if (action === 'DIFFERENT') {
    withLock_(function () {
      update_('PERSONS', per.Person_ID, { Dup_Status: 'RESOLVED', Notes: (per.Notes ? per.Notes + ' | ' : '') + 'مش مكرر — ' + ctx.user.Full_Name_AR }, ctx.user.User_ID);
      activity_(ctx.user.User_ID, null, 'SYSTEM', { Person_ID: per.Person_ID, Note: 'اتأكد إنه شخص مختلف عن ' + per.Dup_Candidates });
    });
    audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'DUP_DIFFERENT' });
    return { ok: true, Person_ID: per.Person_ID };
  }
  if (action !== 'MERGE') throw userError_('إجراء غير معروف.');
  var target = findOne_('PERSONS', { Person_ID: p.Target_Person_ID });
  if (!target || target.Status !== 'Active' || target.Person_ID === per.Person_ID) throw userError_('اختار المرشح الأصلي.');
  // v0.34.0: the merge writes into the target too — it needs the same access as the source
  if (!personFullOk_(ctx, target.Person_ID)) throw userError_('مالكش صلاحية على المرشح الأصلي — اطلب الدمج من مدير التوظيف.');
  var fill = {};
  ['Mobile', 'Email', 'National_ID', 'Birth_Date', 'Gender', 'Governorate', 'City', 'Education', 'Specialization', 'Graduation_Year',
   'Experience_Years', 'Current_Employer', 'Current_Title', 'Current_Salary', 'Expected_Salary', 'Notice_Period', 'Is_Employee',
   'Employee_ID', 'Employee_Position_ID'].forEach(function (k) {
    // newer application data wins for things that change; blanks are filled either way
    var newer = ['Current_Employer', 'Current_Title', 'Current_Salary', 'Expected_Salary', 'Notice_Period', 'Experience_Years'].indexOf(k) >= 0;
    if (per[k] && (!target[k] || newer)) fill[k] = per[k];
  });
  if (per.CV_File_ID && (!target.CV_File_ID || per.CV_Updated_At > target.CV_Updated_At)) {
    fill.CV_File_ID = per.CV_File_ID; fill.CV_File_Name = per.CV_File_Name; fill.CV_Updated_At = per.CV_Updated_At;
  }
  if (fill.Mobile) fill.Mobile_Norm = per.Mobile_Norm;
  var moved = 0, closedDup = 0;
  withLock_(function () {
    var targetApps = find_('APPLICATIONS', { Person_ID: target.Person_ID });
    find_('APPLICATIONS', { Person_ID: per.Person_ID }).forEach(function (a) {
      var patch = { Person_ID: target.Person_ID };
      var same = targetApps.filter(function (x) { return x.Vacancy_ID === a.Vacancy_ID && ['REJECTED', 'WITHDRAWN'].indexOf(x.Stage) < 0; })[0];
      if (same && ['REJECTED', 'WITHDRAWN'].indexOf(a.Stage) < 0) {
        patch.Stage = 'WITHDRAWN'; patch.Stage_At = nowIso_(); patch.Close_Code = 'DUPLICATE'; patch.Close_Note = 'طلب مكرر لنفس الشاغر (' + same.Application_ID + ')';
        patch.Next_Action = ''; patch.Next_Action_Date = ''; patch.Next_Action_Owner = '';
        closedDup++;
      }
      update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID);
      moved++;
    });
    find_('ACTIVITIES', { Person_ID: per.Person_ID }).forEach(function (x) { update_('ACTIVITIES', x.Activity_ID, { Person_ID: target.Person_ID }, ctx.user.User_ID); });
    find_('INTERVIEWS', { Person_ID: per.Person_ID }).forEach(function (x) { update_('INTERVIEWS', x.Interview_ID, { Person_ID: target.Person_ID }, ctx.user.User_ID); });
    if (Object.keys(fill).length) update_('PERSONS', target.Person_ID, fill, ctx.user.User_ID);
    update_('PERSONS', per.Person_ID, { Status: 'Merged', Merged_Into: target.Person_ID, Dup_Status: 'RESOLVED' }, ctx.user.User_ID);
    if (target.Dup_Status === 'PENDING' && dupMatches_(findOne_('PERSONS', { Person_ID: target.Person_ID }), target.Person_ID).length === 0)
      update_('PERSONS', target.Person_ID, { Dup_Status: 'RESOLVED' }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, null, 'SYSTEM', { Person_ID: target.Person_ID, Note: 'اتدمج معاه ' + per.Person_ID + ' (' + per.Full_Name + ')' });
  });
  audit_(ctx, { entityType: 'PERSON', entityId: per.Person_ID, action: 'MERGE', newValue: target.Person_ID });
  return { ok: true, Person_ID: target.Person_ID, moved: moved, closedDuplicates: closedDup };
}

/** Person search for recruiters. p = { q, dupOnly } */
function candSearch_(ctx, p) {
  var q = norm_(latinDigits_(p.q)), qd = latinDigits_(p.q).replace(/\D/g, '');
  if (!p.dupOnly && q && q.replace(/\s/g, '').length < 3) return [];     // v0.34.0: no browsing with one or two letters
  var all = candAll_(ctx);
  var mine = myTeamVacancies_(ctx);
  var srcs = sources_();
  var rows = find_('PERSONS', { Status: 'Active' }).filter(function (x) {
    if (p.dupOnly && x.Dup_Status !== 'PENDING') return false;
    if (!q) return !!p.dupOnly;
    var hay = norm_([x.Full_Name, x.Email, x.Person_ID].join(' '));
    if (hay.indexOf(q) >= 0) return true;
    return qd.length >= 4 && ((x.Mobile_Norm || '').indexOf(qd) >= 0 || (x.National_ID || '').indexOf(qd) >= 0);
  }).slice(0, 60);
  return rows.map(function (x) {
    var apps = find_('APPLICATIONS', { Person_ID: x.Person_ID }, { sort: '-Applied_At' }).map(function (a) {
      var v = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID }) || {};
      return { Application_ID: a.Application_ID, Stage: a.Stage, Applied_At: a.Applied_At, jobTitle: v.Vacancy_ID ? vacTitle_(v).ar : '',
        locationName: locName_(v.Location_ID), sourceName: srcs[a.Source] || a.Source, canOpen: all || !!mine[a.Vacancy_ID] };
    });
    // v0.34.0: contact details only for people on your own vacancies
    var open = all || apps.some(function (a) { return a.canOpen; });
    return { Person_ID: x.Person_ID, Full_Name: x.Full_Name, Mobile: open ? x.Mobile : maskMobile_(x.Mobile), Email: open ? x.Email : maskEmail_(x.Email),
      Governorate: x.Governorate, Education: x.Education, Experience_Years: x.Experience_Years, dup: x.Dup_Status === 'PENDING',
      hasCv: !!x.CV_File_ID, masked: !open, apps: apps };
  });
}

/* ---------------- tasks ("مهامي") ---------------- */

/** Work queue for a recruiter. Overdue first. */
function candTasks_(ctx) {
  var me = ctx.user.User_ID, today = today_();
  var all = candAll_(ctx), mine = myTeamVacancies_(ctx);
  var vacs = {};
  find_('VACANCIES', { Status: VAC_OPEN_ }).forEach(function (v) { vacs[v.Vacancy_ID] = v; });
  var names = userNames_();
  var titles = {};
  function vt(id) { if (!titles[id]) { var v = vacs[id] || findOne_('VACANCIES', { Vacancy_ID: id }); titles[id] = v ? vacTitle_(v).ar + ' — ' + locName_(v.Location_ID) : id; } return titles[id]; }
  var out = { next: [], fresh: [], rejectMsg: [], dups: [], knockout: [], counts: { overdue: 0, today: 0, fresh: 0, rejectMsg: 0, dups: 0, knockout: 0 } };
  var dupSeen = {};
  find_('APPLICATIONS', {}).forEach(function (a) {
    var onMyVac = !!mine[a.Vacancy_ID];
    var v = vacs[a.Vacancy_ID];
    var activeStage = STAGES_ACTIVE_.concat(['ON_HOLD']).indexOf(a.Stage) >= 0;
    var lead = v && v.Lead_Recruiter_ID === me;
    var per = null;
    function P() { return per || (per = findOne_('PERSONS', { Person_ID: a.Person_ID }) || {}); }
    var owner = a.Owner_User_ID === me || (!a.Owner_User_ID && lead);
    if (activeStage && a.Next_Action_Date && (a.Next_Action_Owner === me || (!a.Next_Action_Owner && owner))) {
      var od = a.Next_Action_Date < today;
      out.next.push({ Application_ID: a.Application_ID, name: P().Full_Name, job: vt(a.Vacancy_ID), Stage: a.Stage,
        what: a.Next_Action, when: a.Next_Action_Date, overdue: od, today: a.Next_Action_Date === today });
      if (od) out.counts.overdue++; else if (a.Next_Action_Date === today) out.counts.today++;
    }
    if (a.Stage === 'NEW' && v && (owner || (onMyVac && !a.Owner_User_ID) || (all && !v.Lead_Recruiter_ID)) && !a.Next_Action_Date) {
      out.fresh.push({ Application_ID: a.Application_ID, name: P().Full_Name, job: vt(a.Vacancy_ID), applied: a.Applied_At,
        ageDays: daysBetween_(a.Applied_At.slice(0, 10), today) });
      out.counts.fresh++;
    }
    if (activeStage && a.Knockout_Flag === 'Y' && a.Knockout_Review !== 'CONTINUE' && (owner || (all && !a.Owner_User_ID))) {
      out.knockout.push({ Application_ID: a.Application_ID, name: P().Full_Name, job: vt(a.Vacancy_ID), detail: a.Knockout_Detail });
      out.counts.knockout++;
    }
    if (a.Reject_Msg_Status === 'PENDING' && (onMyVac || a.Updated_By === me)) {
      out.rejectMsg.push({ Application_ID: a.Application_ID, name: P().Full_Name, job: vt(a.Vacancy_ID), at: a.Stage_At });
      out.counts.rejectMsg++;
    }
    if ((onMyVac || all) && activeStage && !dupSeen[a.Person_ID] && P().Dup_Status === 'PENDING') {
      dupSeen[a.Person_ID] = 1;
      out.dups.push({ Application_ID: a.Application_ID, Person_ID: a.Person_ID, name: P().Full_Name, job: vt(a.Vacancy_ID) });
      out.counts.dups++;
    }
  });
  out.next.sort(function (x, y) { return x.when < y.when ? -1 : x.when > y.when ? 1 : 0; });
  out.fresh.sort(function (x, y) { return x.applied < y.applied ? -1 : 1; });
  out.adsClose = adsToClose_(ctx);
  out.counts.adsClose = out.adsClose.length;
  out.ownerName = names[me];
  return out;
}

/** Small counters for the home page and nav badge. */
function candTodo_(ctx) {
  if (!hasAnyRole_(ctx, candWorkRoles_())) return null;
  var t = candTasks_(ctx);
  return t.counts;
}

/* ---------------- message templates ---------------- */

function templatesList_(ctx) {
  return find_('MESSAGE_TEMPLATES', {}, { sort: 'Sort_Order' }).filter(function (t) { return t.Purpose !== 'AD' && (t.Status === 'Active' || hasAnyRole_(ctx, templateEditRoles_())); });
}

/** p = { Template_ID?, Code, Language, Purpose, Title, Subject, Body, Status } */
function templateSave_(ctx, p) {
  var code = str_(p.Code).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  var lang = str_(p.Language) === 'en' ? 'en' : 'ar';
  var id = str_(p.Template_ID);
  if (!code && !id) throw userError_('اكتب كود الرسالة (حروف إنجليزي).');
  if (str_(p.Title).length < 3 || str_(p.Body).length < 10) throw userError_('اكتب عنوان ونص الرسالة.');
  var purpose = ['CONTACT', 'REJECT', 'OTHER', 'AD', 'INTERVIEW'].indexOf(str_(p.Purpose)) >= 0 ? str_(p.Purpose) : 'OTHER';
  if (purpose === 'AD' && code && code.indexOf('AD_') !== 0) code = 'AD_' + code;
  if (code === 'REJECT') purpose = 'REJECT';
  var fields = { Code: code, Language: lang, Purpose: purpose, Title: str_(p.Title).slice(0, 80), Subject: str_(p.Subject).slice(0, 150),
    Body: str_(p.Body).slice(0, 3000), Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  return withLock_(function () {
    if (!id) {
      id = code + '-' + lang;
      if (findOne_('MESSAGE_TEMPLATES', { Template_ID: id })) throw userError_('في رسالة بنفس الكود واللغة. عدّلها بدل ما تضيف جديدة.');
      fields.Template_ID = id;
      fields.Sort_Order = String((find_('MESSAGE_TEMPLATES', {}).length + 1) * 10);
      var c = insert_('MESSAGE_TEMPLATES', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'TEMPLATE', entityId: id, action: 'CREATE' });
      return c;
    }
    var cur = findOne_('MESSAGE_TEMPLATES', { Template_ID: id });
    if (!cur) throw userError_('الرسالة غير موجودة.');
    delete fields.Code; delete fields.Language;
    if (cur.Code === 'REJECT') fields.Purpose = 'REJECT';
    var res = update_('MESSAGE_TEMPLATES', id, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'TEMPLATE', id, res.before, res.after, '');
    return res.after;
  });
}

/** Lookups the candidate screens need. */
function candOptions_(ctx) {
  var s = sources_();
  return {
    sources: Object.keys(s).map(function (k) { return { code: k, name: s[k] }; }),
    stages: STAGES_ALL_.map(function (k) { return { code: k, name: STAGE_AR_[k] }; }),
    actTypes: activityTypes_(),
    agencies: find_('AGENCIES', { Status: 'Active' }).map(function (x) { return { id: x.Agency_ID, name: x.Name_AR }; }),
    sourceKinds: (function () { var m = {}; find_('RECRUITMENT_SOURCES', {}).forEach(function (x) { m[x.Source_Code] = x.Kind; }); return m; })(),
    hasEmployees: find_('EMPLOYEES', {}).length > 0,
    canEditTemplates: hasAnyRole_(ctx, templateEditRoles_()),
    canAll: candAll_(ctx)
  };
}
