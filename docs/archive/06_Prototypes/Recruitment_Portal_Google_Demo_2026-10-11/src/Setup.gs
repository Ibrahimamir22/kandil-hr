/**
 * Setup.gs — run ONCE from the Apps Script editor (and again safely after upgrades).
 *   1) Fill OWNER_EMAIL / OWNER_NAME_AR below.
 *   2) Run setupSystem()  → creates the 4 spreadsheets, sheets, headers and seed data.
 *   3) Run bootstrapOwner() → creates your user with SYS_OWNER + HR_SECTOR_MANAGER.
 * Re-running setupSystem() never deletes data: it adds missing sheets, appends missing
 * columns at the far right, and inserts missing seed rows only.
 */

var OWNER_EMAIL = 'ibrahimamiir22@gmail.com';
var OWNER_NAME_AR = 'Ibrahim Amir';
var DATA_FOLDER_NAME = 'Kandil Recruitment — Ibrahim Private Demo — 2026-10-11';

/**
 * Run from the Apps Script editor after editing a sheet BY HAND: the portal keeps copies of the sheets in its cache
 * for up to 6 hours (v0.32.0) and only notices changes made through the portal itself.
 */
function clearPortalCache() { requireEditor_(); tcResetAll_(); Logger.log('Portal cache cleared — the next screen reads the sheets again.'); }

/**
 * Full setup (from the editor) or, with auto = true, the upgrade that runs inside the first request after a deploy.
 * v0.32.1: the upgrade only touches sheets whose columns changed (SCHEMA_SIG), leaves the ID-counter repair to the
 * scheduled daily job, and keeps the cached copies of every table it did not change.
 */
function setupSystem() { requireEditor_(); return setupSystem_(false); }

function setupSystem_(auto) {
  auto = auto === true;
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('AUTH_PEPPER')) props.setProperty('AUTH_PEPPER', Utilities.getUuid() + Utilities.getUuid());

  var folder = getOrCreateFolder_();
  Object.keys(SS_PROP).forEach(function (group) {
    var id = props.getProperty(SS_PROP[group]);
    if (!id) {
      var ss = SpreadsheetApp.create(SS_TITLES[group]);
      id = ss.getId();
      DriveApp.getFileById(id).moveTo(folder);
      props.setProperty(SS_PROP[group], id);
    }
  });
  REPO_.ss = {};
  REPO_.tables = {};
  REPO_.heads = {};

  var sigs = schemaSigs_(), had = auto ? schemaSigsSaved_() : {}, changed = [];
  // first upgrade with signatures: 0.32.0 had every sheet checked and 0.32.1 adds no column, so its sheets count as current
  if (auto && !props.getProperty('SCHEMA_SIG') && props.getProperty('SCHEMA_APP_VERSION') === '0.32.0') had = sigs;
  Object.keys(SCHEMA).forEach(function (table) {
    if (auto && had[table] === sigs[table]) return;         // columns unchanged since the last upgrade: sheet left alone
    ensureSheet_(table); changed.push(table);
  });
  // v0.44.3: a sheet that just got new columns is read from the sheet, never from the shared cache taken before the
  // upgrade (old headers) — else a migration writing a new column fails («unknown column») and every request re-runs it.
  if (auto) changed.forEach(function (t) { DIRTY_[t] = 1; });
  if (!auto) Object.keys(SS_PROP).forEach(function (group) { removeDefaultSheet_(ss_(group)); });

  seedAll_();
  if (!auto) repairSequences_();                            // the upgrade leaves it to the scheduled daily job
  cleanup031_();
  reapplyHrSelfRule033_();
  locations041_();
  mergeProjectsFactory042_();
  grades050_();
  sourcing080_();
  enNames071_();
  migrate081_();
  migrate090_();
  seedQuestions_();
  seedInterviewQuestions_();
  migrate0120_();
  seedOffers_();
  pay0131_();
  seedDocTypes_();
  privacy0141_();
  migrate0340_();
  migrate0370_();
  migrate0380_();
  migrate0390_();
  migrate0400_();
  migrate0401_();
  migrate0410_();
  migrate0440_();
  migrate0451_();
  migrate0462_();
  migrate0500_();
  tryInstallTriggers_();
  // new columns / seeds / migrations: nothing cached from before the upgrade is served again
  flushPending_();
  SpreadsheetApp.flush();
  if (auto) { changed.forEach(function (t) { if (tcOn_(t)) DIRTY_[t] = 1; }); tcRetire_(); }   // only what changed (writes retire on their own)
  else tcResetAll_();
  props.setProperty('SCHEMA_SIG', JSON.stringify(sigs));
  props.setProperty('SCHEMA_APP_VERSION', APP.VERSION);
  spropsReset_();
  Logger.log('Setup complete. Data folder: ' + folder.getUrl());
  return folder.getUrl();
}

/** A short signature of each table's columns: the upgrade re-checks a sheet only when its signature changed. */
function schemaSigs_() {
  var out = {};
  Object.keys(SCHEMA).forEach(function (t) {
    var s = SCHEMA[t].ss + ':' + tableHeaders_(t).join('|'), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    out[t] = h.toString(36) + s.length.toString(36);
  });
  return out;
}
function schemaSigsSaved_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SCHEMA_SIG') || '{}') || {}; } catch (e) { return {}; }
}

function getOrCreateFolder_() {
  var props = PropertiesService.getScriptProperties();
  var fid = props.getProperty('DATA_FOLDER_ID');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* recreate */ } }
  var f = DriveApp.createFolder(DATA_FOLDER_NAME);
  props.setProperty('DATA_FOLDER_ID', f.getId());
  return f;
}

/** Create the sheet if missing; append any missing headers at the far right. Never reorders.
 *  v0.12.1: an existing sheet with all its headers is left alone (the upgrade runs inside a user's request — keep it fast). */
function ensureSheet_(table) {
  var ss = ss_(SCHEMA[table].ss);
  var sh = ss.getSheetByName(table);
  var wanted = tableHeaders_(table), fromCol = 1, created = false;
  if (!sh) {
    sh = ss.insertSheet(table);
    sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    created = true;
  } else {
    var lastCol = sh.getLastColumn();
    var have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_) : [];
    var missing = wanted.filter(function (h) { return have.indexOf(h) < 0; });
    if (!missing.length) return;
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    fromCol = have.length + 1;
  }
  var cols = sh.getLastColumn();
  sh.getRange(1, fromCol, sh.getMaxRows(), cols - fromCol + 1).setNumberFormat('@');   // plain text everywhere
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#e8eef7');
  sh.setFrozenRows(1);
  if (created) protectSheet_(sh);
}

/** Warn the owner before any hand edit in the sheet (the portal itself writes as usual). */
function protectSheet_(sh) {
  try {
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length)
      sh.protect().setDescription('بيانات بوابة التوظيف — التعديل من البوابة بس / Portal data — edit from the portal only').setWarningOnly(true);
  } catch (e) { console.warn('sheet protection: ' + e); }
}

/** Protection of the existing sheets: once, from the daily job or the editor — never inside a user's request. */
function protectAllSheets_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEETS_PROTECTED') === 'Y') return;
  Object.keys(SCHEMA).forEach(function (table) {
    var sh = ss_(SCHEMA[table].ss).getSheetByName(table);
    if (sh) protectSheet_(sh);
  });
  props.setProperty('SHEETS_PROTECTED', 'Y');
}

function removeDefaultSheet_(ss) {
  ['Sheet1', 'ورقة1', 'Feuille 1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}

function seedRows_(table, rows) {
  var key = SCHEMA[table].key;
  var missing = rows.filter(function (r) { return !get_(table, r[key]); });
  if (missing.length) insertMany_(table, missing, 'SYSTEM');
}

function seedAll_() {
  seedRows_('ID_SEQUENCES', [
    ['USER', 'USR', 'N', 4], ['USER_ROLE', 'URL', 'N', 5], ['ORG_UNIT', 'OU', 'N', 4],
    ['LOCATION', 'LOC', 'N', 2], ['JOB', 'JOB', 'N', 4], ['JOB_VERSION', 'JBV', 'N', 5],
    ['JD', 'JD', 'N', 4], ['POSITION', 'POS', 'N', 6], ['POSITION_HISTORY', 'PH', 'N', 6],
    ['DELEGATION', 'DLG', 'Y', 4], ['RULE', 'RUL', 'N', 4], ['REASON', 'RSN', 'N', 4],
    ['SESSION', 'SES', 'N', 7], ['USER_DEVICE', 'DEV', 'N', 6], ['LOGIN_CODE', 'LC', 'N', 7], ['AUDIT', 'AUD', 'N', 8],
    ['REQUEST', 'REQ', 'Y', 4], ['REQ_LINE', 'RQL', 'N', 6], ['REPLACEMENT', 'RPL', 'N', 5], ['SKILL', 'RSK', 'N', 6],
    ['REQ_VERSION', 'RQV', 'N', 6], ['APPROVAL', 'APR', 'N', 7], ['EVENT', 'EVT', 'N', 8], ['NOTIFICATION', 'NTF', 'N', 7],
    ['VACANCY', 'VAC', 'Y', 4], ['VAC_RECRUITER', 'VRC', 'N', 6], ['PRIORITY_HISTORY', 'PRH', 'N', 6], ['PCR', 'PCR', 'Y', 4], ['VAC_FILL', 'VFL', 'N', 6], ['ORG_UNIT_HISTORY', 'OUH', 'N', 6],
    ['PERSON', 'CND', 'N', 6], ['APPLICATION', 'APP', 'Y', 5], ['ACTIVITY', 'ACT', 'N', 7],
    ['SUBSCRIPTION', 'SUB', 'N', 4], ['SOURCE_USAGE', 'USG', 'N', 6], ['AD', 'AD', 'Y', 4],
    ['EMP_HISTORY', 'EMH', 'N', 7], ['COMP_QUESTION', 'CQ', 'N', 5], ['REFERRAL', 'REF', 'Y', 4], ['AGENCY', 'AGY', 'N', 3],
    ['SCREEN_Q', 'SQ', 'N', 4], ['POOL', 'TP', 'N', 5], ['BATCH', 'IMB', 'Y', 4], ['RESTRICTION', 'HRS', 'N', 4],
    ['INTERVIEW', 'INT', 'Y', 5], ['PANEL', 'IVP', 'N', 6], ['EVALUATION', 'EVL', 'N', 6], ['INT_QUESTION', 'IQ', 'N', 4], ['ROUND_TEMPLATE', 'RTP', 'N', 4],
    ['SELECTION', 'SEL', 'N', 6], ['REFERENCE', 'RFC', 'N', 5], ['SALARY_STRUCTURE', 'SAL', 'N', 4], ['OFFER', 'OFR', 'Y', 4], ['OFFER_AUTH', 'OAU', 'N', 3], ['ALLOW_GRADE', 'ALG', 'N', 4], ['JOB_NATURE', 'JNR', 'N', 4], ['TEMP_TRANSPORT', 'TTR', 'N', 4],
    ['JOINING', 'JON', 'N', 5], ['CAND_DOC', 'CDC', 'N', 7], ['PAYROLL_NOTICE', 'PRN', 'N', 5], ['DOC_RECEIPT', 'RCP', 'Y', 5],
    ['CONSENT', 'CNS', 'N', 7], ['LEGAL_ENTITY', 'LE', 'N', 2], ['DATA_REQUEST', 'DSR', 'Y', 4],
    ['FEEDBACK', 'FB', 'Y', 4], ['CEO_APPROVAL', 'CEA', 'Y', 4], ['CEO_DEVICE', 'CED', 'N', 4], ['DUAL', 'DUL', 'Y', 4], ['INCIDENT', 'INC', 'Y', 3], ['ONBOARDING', 'ONB', 'Y', 4], ['ONB_CUSTODY', 'CUS', 'N', 5], ['ONB_TASK', 'OBT', 'N', 7], ['ONB_ITEM', 'OTI', 'N', 4], ['ONB_TEMPLATE', 'ONT', 'N', 3], ['INS_CASE', 'INS', 'N', 5], ['NHV', 'NHV', 'N', 6], ['TRANSFER', 'TRF', 'Y', 4],
    ['PROBATION', 'PRB', 'Y', 4], ['PROB_REVIEW', 'PRV', 'N', 6], ['PROB_NOTE', 'PNT', 'N', 6], ['MED_CASE', 'MED', 'N', 5], ['CV_AI_RUN', 'CVA', 'N', 6], ['ATT_ENROLL', 'ATE', 'N', 5], ['JDR_ROUND', 'JRR', 'Y', 3], ['JD_REVIEW', 'JRV', 'N', 6]
  ].map(function (a) { return { Entity: a[0], Prefix: a[1], Year_Scoped: a[2], Year: '', Last_Number: '0', Pad_Length: String(a[3]) }; }));
  invalidate_('ID_SEQUENCES');

  seedRows_('CONFIG', [
    ['HC_ENFORCEMENT_MODE', 'WARN', 'TEXT', 'WARN = HC checks only warn; BLOCK = requests above available HC are blocked'],
    ['SESSION_DAYS', '14', 'NUMBER', 'Not used since v0.37.0 (see SESSION_HOURS / REMEMBER_DAYS)'],
    ['SESSION_HOURS', '12', 'NUMBER', 'A sign-in lasts this many hours (one working day)'],
    ['REMEMBER_DAYS', '7', 'NUMBER', 'A sign-in with «remember me on this device» lasts this many days'],
    ['NOTIF_KEEP_DAYS', '365', 'NUMBER', 'Read notifications older than this many days are removed by the daily job (0 = keep all). Unread ones always stay'],
    ['OTP_MINUTES', '10', 'NUMBER', 'Login code validity in minutes'],
    ['OTP_MAX_ATTEMPTS', '5', 'NUMBER', 'Wrong code attempts before the code is locked'],
    ['EMAIL_DAILY_BUDGET', '80', 'NUMBER', 'Max system emails per day (alerts + daily digest). Login codes always go, within the Gmail quota'],
    ['DIGEST_TIME', '08:00', 'TEXT', 'Time of the daily job (reminders, escalation, digest email), Cairo time HH:00 — run installTriggers after changing it'],
    ['DEFAULT_STRUCTURAL_HC', '1', 'NUMBER', 'Structural HC given to imported positions when blank'],
    ['ORG_VERSION_ACTIVE', 'ORGV-2026.01', 'TEXT', 'Active organization version'],
    ['IDLE_MINUTES', '30', 'NUMBER', 'Auto-lock after this many idle minutes — the page locks, and the server ends a session with no call for this long'],
    ['EMAIL_APPROVALS', 'Y', 'BOOL', 'Email approvers when a request reaches them (Y/N); in-app notifications always on'],
    ['JOB_FAMILIES', '{"ACC":"مالية ومحاسبة","ITS":"تكنولوجيا المعلومات","ADM":"شؤون إدارية وخدمات","HRM":"موارد بشرية","SLS":"مبيعات ومعارض","MKT":"تسويق","INS":"تجهيز وتركيبات","LOG":"نقل","PRD":"إنتاج وتصنيع","DSN":"تصميم وعينات","MNT":"صيانة","QLT":"جودة","PLN":"تخطيط","PUR":"احتياجات ومشتريات","WHS":"مخازن","SCH":"قيادة سلسلة الإمداد","RDV":"بحث وتطوير","OSH":"سلامة وصحة مهنية","IAU":"مراجعة داخلية","LGL":"شؤون قانونية","EXE":"الإدارة العليا"}', 'JSON', 'Job families: code -> Arabic name. New job codes = FAMILY-NNN'],
    ['CANDIDATE_SOURCES', '{"CAREER_PAGE":"لينك التقديم المباشر","WUZZUF":"Wuzzuf","LINKEDIN":"LinkedIn","FACEBOOK":"Facebook","WHATSAPP":"واتساب","EMAIL":"إيميل","REFERRAL":"ترشيح من موظف","WALK_IN":"حضور شخصي","AGENCY":"مكتب توظيف","OTHER":"أخرى"}', 'JSON', 'Candidate sources: code -> Arabic name. Apply link ?src=CODE'],
    ['PRIVACY_VERSION', '1', 'TEXT', 'Privacy notice version shown on the apply page (change it when the text changes)'],
    ['PRIVACY_TEXT_AR', PRIVACY_NEW_AR_, 'TEXT', 'Privacy notice (Arabic) on the apply page'],
    ['PRIVACY_TEXT_EN', PRIVACY_NEW_EN_, 'TEXT', 'Privacy notice (English) on the apply page'],
    ['APPLY_CV_REQUIRED', 'N', 'BOOL', 'Y = CV upload required on the apply page (N suits jobs where many applicants have no CV)'],
    ['APPLY_MAX_PER_HOUR', '3', 'NUMBER', 'Max applications from the same mobile number per hour (spam protection)'],
    ['DEFAULT_LANG', 'ar', 'TEXT', 'Interface language for users who did not choose one: ar (Arabic) or en (English)'],
    ['USER_LANG_CHOICE', 'Y', 'BOOL', 'Y = every user can switch the interface language for themselves; N = only HR admins set it per user'],
    ['OCCUPIED_FROM_EMPLOYEES', 'N', 'BOOL', 'Y = occupied HC of every position is counted from the employees list (set automatically after the first employees import)'],
    ['APPROVAL_REMIND_DAYS', '2', 'NUMBER', 'A step waiting this many days gets an in-app reminder, repeated every N days (0 = off)'],
    ['APPROVAL_ESCALATE_DAYS', '3', 'NUMBER', 'A step waiting this many days is escalated once to the HR Sector Manager and HR Manager (0 = off)'],
    ['APPROVAL_EXPIRE_DAYS', '5', 'NUMBER', 'A step left without a decision this many working days counts as rejected (0 = off; decision 48: 5 working days)'],
    ['APPROVAL_EXPIRY_WARN_DAYS', '1', 'NUMBER', 'Warn the approver and requester this many days before the automatic rejection'],
    ['DIGEST_ENABLED', 'Y', 'BOOL', 'Y = one daily email to each user who has approvals waiting or a request returned'],
    ['REFERRAL_PRIOR_DAYS', '180', 'NUMBER', 'A referred candidate who applied in the last N days goes to HR review for the referral bonus'],
    ['REFERRAL_RELATIONSHIP_REQUIRED', 'N', 'BOOL', 'Y = the referring employee\'s relationship to the candidate must be recorded'],
    ['INTERVIEW_DEFAULT_PLAN', '[{"name":"مقابلة الموارد البشرية","type":"HR","req":"REQUIRED"},{"name":"مقابلة فنية مع المدير المباشر","type":"MANAGER","req":"REQUIRED"},{"name":"مقابلة نهائية مع الإدارة العليا","type":"SENIOR","req":"OPTIONAL"}]', 'JSON', 'Interview rounds a new vacancy starts with (type HR / MANAGER / SENIOR / OTHER; req REQUIRED / CONDITIONAL / OPTIONAL). Each vacancy can change its own'],
    ['INTERVIEW_DURATION_MIN', '45', 'NUMBER', 'Default interview length in minutes'],
    ['INTERVIEW_CONFIRM_HOURS', '24', 'NUMBER', 'An interview not confirmed by the lead interviewer after this many hours gets a reminder (daily job)'],
    ['EVAL_SLA_HOURS', '24', 'NUMBER', 'An evaluation is due this many hours after the interview ends: later = late, reminder; twice as late = escalated to recruitment managers'],
    ['INTERVIEW_REMIND_CANDIDATE', 'Y', 'BOOL', 'Y = the candidate gets a reminder email (if he has an email) the working day before an interview or assessment'],
    ['WEEKEND_DAYS', 'FRI,SAT', 'TEXT', 'Weekly days off (SUN MON TUE WED THU FRI SAT, comma separated): no reminders, escalations or digest on these days, and they do not count as waiting time'],
    ['APPLY_MAX_PER_VACANCY_HOUR', '60', 'NUMBER', 'Max online applications per vacancy per hour (protection against bots; 0 = no limit). The lead recruiter is told when it is reached'],
    ['OFFER_VALID_DAYS', '7', 'NUMBER', 'Days an offer stays valid by default (the team can pick another date; HR can extend with a reason). Expired offers close by themselves in the daily job'],
    ['PAY_CONTRIB_RATIO', '60', 'NUMBER', 'Contribution wage (أجر الاشتراك) = this % of the full agreed wage'],
    ['PAY_CONTRIB_MIN', '5500', 'NUMBER', 'Minimum contribution wage (أجر الاشتراك) for the year'],
    ['PAY_CONTRIB_MAX', '16700', 'NUMBER', 'Maximum contribution wage (أجر الاشتراك) for the year'],
    ['PAY_CONTRIB_ROUND', '500', 'NUMBER', 'The contribution wage is rounded to the nearest multiple of this (an indicative figure the payroll officer may adjust)'],
    ['PAY_COMPREHENSIVE_MIN', '7000', 'NUMBER', 'Minimum comprehensive wage (الأجر الشامل — the tax base): a lower contribution wage is topped up to it (the national minimum wage)'],
    ['PAY_EMP_INS_RATE', '11', 'NUMBER', 'Employee social insurance share, % of the contribution wage'],
    ['PAY_TAX_EXEMPTION', '20000', 'NUMBER', 'Annual personal tax exemption (EGP)'],
    ['PAY_TAX_BRACKETS', '[[40000,0],[55000,10],[70000,15],[200000,20],[400000,22.5],[1200000,25],[0,27.5]]', 'JSON', 'Annual salary tax brackets after the exemption: [upper limit, rate %] … the last [0, rate] has no limit. Confirm with payroll every year'],
    ['PAY_MARTYR_RATE', '0.05', 'NUMBER', 'Martyrs fund contribution, % of the full wage — borne by the company (not deducted from the employee)'],
    ['PAYROLL_CUTOFF_DAY', '25', 'NUMBER', 'Monthly payroll cut-off day — deferred hiring documents still missing are flagged to payroll before it'],
    ['PAYROLL_ALERT_DAYS', '7', 'NUMBER', 'Days before the payroll cut-off when the list of missing deferred documents opens'],
    ['PRIVACY_FULL_AR', '', 'TEXT', 'Full privacy notice (Arabic) opened from the apply page — publish after legal review'],
    ['PRIVACY_FULL_EN', '', 'TEXT', 'Full privacy notice (English)'],
    ['DOCS_PRIVACY_AR', DOCS_PRIVACY_AR_, 'TEXT', 'Privacy notice (Arabic) on the hiring-documents upload page'],
    ['DOCS_PRIVACY_EN', DOCS_PRIVACY_EN_, 'TEXT', 'Privacy notice (English) on the hiring-documents upload page'],
    ['DOCS_PRIVACY_VERSION', '1', 'TEXT', 'Version of the hiring-documents notice (raised automatically when the text changes)'],
    ['PRIVACY_EMAIL', '', 'TEXT', 'Email where people send requests about their personal data'],
    ['DPO_TITLE', 'مشرف الأجور', 'TEXT', 'Person / job responsible for personal-data protection'],
    ['RETENTION_ENABLED', 'Y', 'BOOL', 'Y = the daily job deletes candidates due by the retention rules (CHG-80: 2 years; only after go-live); N = list only'],
    ['RETENTION_REJECTED_MONTHS', '24', 'NUMBER', 'Months a closed (rejected / withdrawn) candidate is kept after the last application closed'],
    ['RETENTION_DNJ_MONTHS', '24', 'NUMBER', 'Months a candidate who accepted but did not join is kept'],
    ['RETENTION_POOL_MONTHS', '24', 'NUMBER', 'Months a talent-pool consent lasts'],
    ['DSR_DAYS', '30', 'NUMBER', 'Days to answer a personal-data request (CHG-80)'],
    ['CONSENT_LINK_DAYS', '7', 'NUMBER', 'A candidate consent link works this many days (once)'],
    ['SURVEY_MIN_ANSWERS', '5', 'NUMBER', 'Survey averages are shown only for groups with at least this many answers'],
    ['USAGE_POLICY_REQUIRED', 'Y', 'BOOL', 'Every user accepts the usage policy once before using the portal'],
    ['USAGE_POLICY_VERSION', '1', 'TEXT', 'Usage policy version — change it when the text changes (everyone accepts again)'],
    ['USAGE_POLICY_AR', USAGE_POLICY_AR_, 'TEXT', 'Usage policy accepted by every user (Arabic)'],
    ['USAGE_POLICY_EN', USAGE_POLICY_EN_, 'TEXT', 'Usage policy (English)'],
    ['NO_INS_BASES', '["عمل جزئي (أقل من الحد القانوني)","صاحب معاش","متدرب","أجنبي (تأمين في بلده)","أخرى (بالسند القانوني في الملاحظة)"]', 'JSON', 'Legal bases offered for a contract without social insurance (lawyer to confirm)'],
    ['DOC_LINK_DAYS', '7', 'NUMBER', 'Validity in days of the private link a new hire uses to upload hiring documents (CHG-82: 7)'],
    ['SELF_LINK_DAYS', '7', 'NUMBER', 'Validity in days of the candidate\'s own page link (CHG-83)'],
    ['NET_REVIEW_REQUIRED', 'Y', 'BOOL', 'Y = the payroll reviewer confirms an offer\'s estimated net before it is presented (CHG-84)'],
    ['PAYROLL_REVIEW_USERS', '', 'TEXT', 'Payroll reviewers (e-mails or user IDs, comma separated); empty = the HR managers'],
    ['DOC_RENEW_NOTICE_DAYS', '30', 'NUMBER', 'Tell the team and the employee this many days before a hiring document expires (FIL-001)'],
    ['DOC_DEFER_ESCALATE_DAYS', '7', 'NUMBER', 'A deferred document still missing this many days after its due date goes to the HR manager (DOC-002)'],
    ['ONB_IT_USERS', '', 'TEXT', 'Information technology people who own the IT onboarding tasks (e-mails or user IDs, comma separated; empty = the HR site specialist) — CHG-85'],
    ['ONB_ADMIN_USERS', '', 'TEXT', 'Administration people (ID card, desk, custody) who own those onboarding tasks; empty = the HR site specialist'],
    ['ONB_SAFETY_USERS', '', 'TEXT', 'Occupational safety people (safety induction, protective equipment) who own those onboarding tasks; empty = the HR site specialist'],
    ['ATT_MOBILE_LICENSES', '150', 'NUMBER', 'Mobile punch licences on ZKBioTime; «mobile + machines» is refused when all are in use — CHG-91'],
    ['TRF_TEMP_MAX_DAYS', '180', 'NUMBER', 'Longest temporary transfer (cover) in days; longer becomes a permanent transfer — CHG-85'],
    ['TRF_HANDOVER_ITEMS', '', 'JSON', 'Handover list given to every transfer (JSON list of texts); empty = the built-in four items'],
    ['RESTRICTION_MAX_YEARS', '2', 'NUMBER', 'Longest time to the review of a hiring restriction — no permanent restriction without review (CHG-84)'],
    ['PROB_LINK_DAYS', '7', 'NUMBER', 'Validity in days of the employee\'s probation page link (a new link can be sent any time)'],
    ['TOTP_REQUIRED_ROLES', 'ALL', 'TEXT', 'Roles that must sign in with an authenticator app (Google Authenticator) from their first sign-in, comma separated; ALL = every user (CHG-82)'],
    ['TOTP_EXEMPT_ROLES', 'CEO', 'TEXT', 'Roles never asked for the authenticator app (the CEO approves from his trusted device + PIN)'],
    ['TOTP_AFTER_EMAIL_LOGINS', '0', 'NUMBER', 'Everyone else must turn on the authenticator app after this many sign-ins by email code (0 = never forced)'],
    ['TOTP_ISSUER', 'Kandil Recruitment', 'TEXT', 'Account name shown in the authenticator app'],
    ['TOTP_MAX_FAILS', '5', 'NUMBER', 'Wrong authenticator codes in a row before sign-in with the app pauses for TOTP_LOCK_MINUTES'],
    ['CONSULTANT_MAX_DAYS', '180', 'NUMBER', 'Longest access period for a consultant (view-only) account, in days'],
    ['CONSULTANT_NDA_AR', CONSULTANT_NDA_AR_, 'TEXT', 'Confidentiality acknowledgement a consultant accepts at the first sign-in (Arabic) — final text after legal review'],
    ['CONSULTANT_NDA_EN', CONSULTANT_NDA_EN_, 'TEXT', 'Confidentiality acknowledgement (English)'],
    ['SECTOR_COLORS', '{}', 'JSON', 'Org chart colour per sector: {"<unit code or OU id>":"#rrggbb"}. Sectors not listed get a fixed palette in sector order'],
    ['WELCOME_GIFTS', '["شنطة ترحيب (أجندة + قلم + مج بشعار قنديل)"]', 'JSON', 'Welcome gift choices shown when recording the gift on an onboarding program'],
    ['INSURANCE_START_RULE', 'DAY_ONE', 'TEXT', 'Social insurance start for a new hire: DAY_ONE (first working day) / NEXT_MONTH (first day of the next month) / DOCS_COMPLETE (when the documents receipt is issued)'],
    ['INSURANCE_SUBMIT_DAYS', '7', 'NUMBER', 'Days after the insurance start date to submit the registration before it shows as late (confirm with the insurance officer)'],
    ['INSURANCE_OFFICES', '[]', 'JSON', 'Social insurance offices the company deals with: ["مكتب ...", ...] — each location picks its office'],
    ['NHV_ENABLED', 'Y', 'BOOL', 'Y = New Hire Voice survey after joining'],
    ['NHV_DAYS', '7,30', 'TEXT', 'Days after joining when the New Hire Voice survey goes out (comma separated)'],
    ['NHV_LINK_DAYS', '7', 'NUMBER', 'Days the survey link stays valid (CHG-82: 7)'],
    ['NHV_ALERT_SCORE', '2', 'NUMBER', 'An answer at or below this score (1–5) alerts the HR site specialist and HR managers'],
    ['PROBATION_ENABLED', 'Y', 'BOOL', 'Y = a probation period opens for every new hire when he joins'],
    ['PAY_DAY', '', 'NUMBER', 'Day of the following month by which the monthly wage is paid — printed in the employment contract (CHG-101); empty = the contract cannot be printed'],
    ['WORK_HOURS_DEFAULT', '8', 'NUMBER', 'Daily working hours an offer starts with (changed per offer; printed in the contract and the salary details) — CHG-107'],
    ['WEEKLY_REST_DEFAULT', 'FRI', 'TEXT', 'Weekly rest an offer starts with: FRI, SAT, FRI_SAT or ROSTER (a day a week by the shift roster) — CHG-107'],
    ['DORMANT_DAYS', '60', 'NUMBER', 'An account with no sign-in for this many days is stopped by the daily job (owner, CEO and board excepted); 0 = off (CHG-105)'],
    ['PAY_DETAILS_TERMS', '', 'TEXT', 'Terms printed on «مفردات الراتب عند بداية التعيين», one per line ({probation_days}, {pay_day}, {work_hours}, {weekly_rest} are filled in); empty = the default terms reviewed by the legal session (CHG-102)'],
    ['HR_HEAD_NAME', '', 'TEXT', 'Name of the head of HR who approves the salary-details form (printed under «اعتمد»)'],
    ['CONTRACT_MONTHS_DEFAULT', '12', 'NUMBER', 'Default length in months of a fixed-term employment contract (changed per person on the joining card)'],
    ['PROBATION_DAYS', '90', 'NUMBER', 'Length of the probation period in days — one period only, never more than 90 (no extension)'],
    ['PROB_CHECKPOINTS', '30,60,75', 'TEXT', 'Days of the two follow-up reviews and the final evaluation (three numbers)'],
    ['PROB_DECISION_DAY', '80', 'NUMBER', 'The confirm / end decision is due by this day of the period'],
    ['PROB_REMIND_DAYS', '30,15,7', 'TEXT', 'Reminders to the manager and HR site this many days before the decision is due'],
    ['PROB_ESCALATE_DAYS', '3,7', 'TEXT', 'A late review goes to the manager\'s manager and HR site after the first number of days, to HR managers and the HR sector after the second'],
    ['PROB_WEIGHTS', '{"PROD":35,"QUAL":25,"V1":10,"V2":10,"V3":10,"V4":10}', 'JSON', 'Weights of the final evaluation items: productivity, quality, and the four core values (sum 100)'],
    ['PROB_PASS_AVG', '3', 'NUMBER', 'Weighted score (1–5) at or above which the evaluation supports confirming'],
    ['PROB_VALUE_MIN', '2', 'NUMBER', 'No core value may score below this for the evaluation to support confirming'],
    ['MEDICAL_ADD_DAYS', '14', 'NUMBER', 'Days after confirmation to add the employee to the medical insurance before it shows as late'],
    ['MEDICAL_PROVIDERS', '[]', 'JSON', 'Medical insurance companies: ["…", …]'],
    ['KPI_TARGETS', '{}', 'JSON', 'Recruitment KPI targets that differ from the defaults: {"PROB_PASS":85,"OFFER_ACCEPT":85,…} (codes in the KPI screen)'],
    ['KPI_TTF_TARGETS', '{"LABOR":21,"TECH":30,"ADMIN":45,"LEAD":60}', 'JSON', 'Target days to fill a vacancy by job class (labour / technical / administrative / leaders)'],
    ['KPI_JOB_CLASS', '{}', 'JSON', 'Job class per grade: {"5":"TECH","9":"LEAD"} — empty = by grade number (≤4 labour, 5–6 technical, 7–8 administrative, 9+ leaders)'],
    ['KPI_WEIGHTS_RECRUITER', '{"TTF_ON_TIME":25,"PROB_PASS":25,"TASKS_ON_TIME":15,"FIRST_CONTACT":10,"SCREEN_PASS":10,"OFFER_ACCEPT":10,"CLOSE_MSG":5}', 'JSON', 'Weights of the recruiter scorecard (sum 100)'],
    ['KPI_WEIGHTS_SITE', '{"ONB_ON_TIME":25,"DOCS_COMPLETE":20,"INS_ON_TIME":20,"MED_ON_TIME":15,"NHV_FOLLOW":10,"GOALS_WEEK1":10}', 'JSON', 'Weights of the HR site specialist scorecard (sum 100)'],
    ['KPI_WEIGHTS_LEAD', '{"TTF_ON_TIME":25,"PROB_PASS":25,"AGING":15,"ASSIGN_DAYS":10,"OFFER_APPROVE_ON_TIME":10,"EARLY_LEAVE":10,"MGR_SAT":5}', 'JSON', 'Weights of the recruitment supervisor / manager scorecard (sum 100)'],
    ['KPI_MIN_CASES', '3', 'NUMBER', 'Fewer cases than this in the period → the KPI shows "not enough data" and stays out of the score'],
    ['KPI_MONTHLY_EMAIL', 'Y', 'BOOL', 'Y = on the 1st of each month the recruitment manager, HR manager and HR sector manager get last month\'s KPIs by e-mail'],
    ['INSIGHT_STEP_DAYS', '{}', 'JSON', 'Bottlenecks: days each step may take before it counts as overdue, when different from the defaults: {"REQ_APPROVAL":3,"IV_CONFIRM":2,"EVAL":1,"OFFER_APPROVAL":2,"JOINING":21,…}'],
    ['INSIGHT_REFERRAL_BONUS', '0', 'NUMBER', 'Source return: referral bonus per eligible / paid referral, in EGP, counted in the referral source cost (an estimate — the portal pays nothing)'],
    ['CVAI_ENABLED', 'N', 'BOOL', 'Y = recruiters can read CVs with AI (Claude) on the candidate page — needs the API key saved in the settings screen'],
    ['CVAI_MODEL', 'claude-haiku-4-5', 'TEXT', 'AI model for reading CVs: claude-haiku-4-5 (about 1 US cent per CV) or claude-sonnet-5-5 (about twice that)'],
    ['CVAI_MONTH_CAP_USD', '10', 'NUMBER', 'AI CV reading stops for the rest of the month once the estimated spend reaches this many US dollars'],
    ['CVAI_RESERVE_USD', '0.03', 'NUMBER', 'Booked against the monthly cap before each AI call and corrected to the real cost after (parallel calls cannot pass the cap)'],
    ['CVAI_AGAIN_PER_DAY', '5', 'NUMBER', '«Read again» calls each user may make per day'],
    ['LOGIN_CODES_HOURLY_MAX', '40', 'NUMBER', 'Login codes the whole portal sends per hour at most (protects the daily e-mail limit from someone asking codes for staff addresses)'],
    ['TOTP_LOCK_MINUTES', '5', 'NUMBER', 'Pause after TOTP_MAX_FAILS wrong authenticator codes (recovery codes still work during the pause)'],
    ['HOURLY_QUIET_HOURS', '22-6', 'TEXT', 'Hours when the hourly reminder job rests (from-to, Cairo time); NONE = never'],
    ['MAIL_LOGIN_RESERVE', '10', 'NUMBER', 'E-mails of Google\'s daily quota kept for login codes only'],
    ['MAIL_CANDIDATE_RESERVE', '15', 'NUMBER', 'Part of EMAIL_DAILY_BUDGET kept for candidate e-mails (approvals and internal mails stop before it)'],
    ['APPLY_MAX_PER_HOUR_ALL', '300', 'NUMBER', 'Online applications the whole portal accepts per hour (a flood spread over every vacancy stops here)'],
    ['LOG_ARCHIVE_MONTHS', '12', 'NUMBER', 'Audit and timeline rows older than this many months move to the archive spreadsheet on the 1st of each month (0 = never)'],
    ['CEO_DEVICE_DAYS', '90', 'NUMBER', 'Days the CEO\'s trusted phone works for approvals (renewed by signing in on it again); the owner is reminded at 14, 7 and 1 day'],
    ['BACKUP_WEEKDAY', 'FRI', 'TEXT', 'Day of the weekly backup copy of the spreadsheets (SAT … FRI); NONE = off'],
    ['BACKUP_KEEP_WEEKS', '8', 'NUMBER', 'Weekly backup folders older than this many weeks go to the bin'],
    ['RESTORE_TEST_LAST', '', 'TEXT', 'Date of the last restore test of a backup (recorded on the readiness screen)'],
    ['DPO_USER_ID', '', 'TEXT', 'User ID of the data protection officer (someone outside HR) — decides on personal-data incidents'],
    ['CVAI_KEY_ROTATE_DAYS', '180', 'NUMBER', 'Remind the owner to rotate the Anthropic key after this many days'],
    ['ACCESS_REVIEW_LAST', '', 'TEXT', 'Date of the last quarterly access review (set by the review screen)'],
    ['GOLIVE_AT', '', 'TEXT', 'Set once by the go-live step: demo data and the wipe are locked from then on'],
    ['GOLIVE_CHECKS', '{}', 'JSON', 'Go-live checklist: manual items ticked on the readiness screen (date, who, note) — kept by the screen'],
    ['NHV_QUESTIONS', '', 'JSON', 'Survey questions [{"id":"Q1","axis":"JOB","ar":"…","en":"…"}] — axis: JOB, WELCOME, MANAGER, TEAM, STAY, OTHER; empty = the 5 default questions'],
    ['PRIORITY_WEIGHTS', '{"NORMAL":20,"IMPORTANT":40,"CRITICAL":60,"AGE_16_30":10,"AGE_31_60":25,"AGE_60_PLUS":40,"DUE_OVERDUE":30,"DUE_7":20,"DUE_30":10,"PIN":100}', 'JSON', 'Dynamic priority score weights (test before changing)']
  ].map(function (a) { return { Config_Key: a[0], Config_Value: a[1], Value_Type: a[2], Description: a[3] }; }));

  seedOnboarding_();
  seedRows_('ROLES', [
    ['SYS_OWNER', 'مالك النظام', 'System Owner', 'Full technical administration'],
    ['HR_SECTOR_MANAGER', 'مدير قطاع الموارد البشرية', 'HR Sector Manager', 'Sole authority over grade, salary, benefits, working conditions'],
    ['HR_MANAGER', 'مدير الموارد البشرية', 'HR Manager', 'Approves requests, HC exceptions, priority classification'],
    ['HR_STAFF', 'أخصائي موارد بشرية', 'HR Staff', 'HR operations'],
    ['RECRUITMENT_MANAGER', 'مدير التوظيف', 'Recruitment Manager', 'Leads recruitment team'],
    ['RECRUITMENT_SUPERVISOR', 'مشرف التوظيف', 'Recruitment Supervisor', 'Supervises recruiters'],
    ['RECRUITER', 'أخصائي توظيف', 'Recruiter', 'Works vacancies and candidates'],
    ['CEO', 'الرئيس التنفيذي', 'CEO', 'Rule-based approvals'],
    ['BOARD', 'مجلس الإدارة (الرئيس / النائب)', 'Board', 'Chairman or Vice Chairman — either one approves for the board'],
    ['VIEWER', 'مشاهدة فقط', 'Viewer', 'Read-only access'],
    ['CONSULTANT', 'استشاري (عرض فقط)', 'Consultant (view only)', 'Sees every screen and figure, changes nothing; account ends on a set date']
  ].map(function (a) { return { Role_Code: a[0], Role_Name_AR: a[1], Role_Name_EN: a[2], Description: a[3], Status: 'Active' }; }));

  var reasons = [
    ['REQUEST_REJECT', 'NOT_JUSTIFIED', 'المبرر غير كافي', 'Insufficient justification', 'N'],
    ['REQUEST_REJECT', 'NO_BUDGET', 'لا توجد ميزانية', 'No budget', 'N'],
    ['REQUEST_REJECT', 'STRUCTURE_CHANGE_NEEDED', 'يحتاج تعديل هيكلي', 'Structural change needed', 'N'],
    ['REQUEST_REJECT', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['REQUEST_RETURN', 'CLARIFY_JUSTIFICATION', 'توضيح المبرر', 'Clarify justification', 'N'],
    ['REQUEST_RETURN', 'ADJUST_HC', 'مراجعة العدد', 'Adjust headcount', 'N'],
    ['REQUEST_RETURN', 'REQUIREMENTS', 'مراجعة المتطلبات', 'Review requirements', 'N'],
    ['REQUEST_RETURN', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['HC_EXCEPTION', 'WORKLOAD', 'زيادة حجم العمل', 'Increased workload', 'N'],
    ['HC_EXCEPTION', 'NEW_PROJECT', 'مشروع جديد', 'New project', 'N'],
    ['HC_EXCEPTION', 'EXPANSION', 'توسع', 'Expansion', 'N'],
    ['HC_EXCEPTION', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['OVERRIDE', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['CANDIDATE_REJECT', 'NOT_QUALIFIED', 'المؤهل أو التخصص غير مطابق', 'Qualification does not match', 'N'],
    ['CANDIDATE_REJECT', 'EXPERIENCE', 'الخبرة غير كافية أو غير مناسبة', 'Experience not sufficient', 'N'],
    ['CANDIDATE_REJECT', 'SALARY_GAP', 'المرتب المتوقع أعلى من المتاح', 'Expected salary above range', 'N'],
    ['CANDIDATE_REJECT', 'LOCATION', 'مكان السكن بعيد عن موقع العمل', 'Lives too far from the work location', 'N'],
    ['CANDIDATE_REJECT', 'NO_RESPONSE', 'لم يرد بعد أكثر من محاولة تواصل', 'No response after several attempts', 'N'],
    ['CANDIDATE_REJECT', 'SCREENING', 'لم يجتز الفرز المبدئي', 'Did not pass initial screening', 'N'],
    ['CANDIDATE_REJECT', 'POSITION_FILLED', 'الشاغر اكتمل', 'Vacancy already filled', 'N'],
    ['CANDIDATE_REJECT', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['CANDIDATE_REJECT', 'VACANCY_CANCELLED', 'الشاغر اتلغى', 'Vacancy cancelled', 'N'],
    ['CANDIDATE_WITHDRAW', 'OTHER_OFFER', 'قبل عرض تاني', 'Accepted another offer', 'N'],
    ['CANDIDATE_WITHDRAW', 'SALARY', 'المرتب غير مناسب له', 'Salary not acceptable', 'N'],
    ['CANDIDATE_WITHDRAW', 'LOCATION', 'مكان العمل غير مناسب له', 'Work location not suitable', 'N'],
    ['CANDIDATE_WITHDRAW', 'NOT_INTERESTED', 'غير مهتم بالوظيفة', 'Not interested', 'N'],
    ['CANDIDATE_WITHDRAW', 'PERSONAL', 'ظروف شخصية', 'Personal reasons', 'N'],
    ['CANDIDATE_WITHDRAW', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['CANDIDATE_WITHDRAW', 'TRANSFERRED', 'اتنقل لشاغر تاني', 'Moved to another vacancy', 'N'],
    ['CANDIDATE_WITHDRAW', 'DATA_DELETED', 'اتحذفت بياناته بطلبه', 'Data deleted at the person\'s request', 'N'],
    ['CANDIDATE_WITHDRAW', 'DID_NOT_JOIN', 'قبل العرض وماستلمش', 'Accepted the offer but did not join', 'N'],
    ['EMPLOYEE_EXIT', 'RESIGNATION', 'استقالة', 'Resignation', 'N'],
    ['EMPLOYEE_EXIT', 'TERMINATION', 'إنهاء خدمة من الشركة', 'Termination', 'N'],
    ['EMPLOYEE_EXIT', 'CONTRACT_END', 'انتهاء العقد وعدم التجديد', 'Contract ended', 'N'],
    ['EMPLOYEE_EXIT', 'ABSENCE', 'انقطاع عن العمل', 'Job abandonment', 'N'],
    ['EMPLOYEE_EXIT', 'RETIREMENT', 'بلوغ سن المعاش', 'Retirement', 'N'],
    ['EMPLOYEE_EXIT', 'DEATH', 'وفاة', 'Death', 'N'],
    ['EMPLOYEE_EXIT', 'TRANSFER_GROUP', 'نقل لشركة تانية في المجموعة', 'Transfer to a group company', 'N'],
    ['EMPLOYEE_EXIT', 'OTHER', 'أخرى', 'Other', 'Y'],
    ['ACTIVITY_TYPE', 'CALL', 'مكالمة', 'Call', 'N'],
    ['ACTIVITY_TYPE', 'WHATSAPP', 'واتساب', 'WhatsApp', 'N'],
    ['ACTIVITY_TYPE', 'EMAIL', 'إيميل', 'Email', 'N'],
    ['ACTIVITY_TYPE', 'MEETING', 'مقابلة / لقاء', 'Meeting', 'Y'],
    ['ACTIVITY_TYPE', 'NOTE', 'ملاحظة', 'Note', 'Y'],
    ['HIRING_RESTRICTION', 'MISCONDUCT', 'فصل تأديبي / مخالفة جسيمة', 'Disciplinary dismissal / gross misconduct', 'N'],
    ['HIRING_RESTRICTION', 'DISHONESTY', 'خيانة أمانة', 'Breach of trust', 'N'],
    ['HIRING_RESTRICTION', 'ABANDONMENT', 'انقطاع عن العمل من غير إخطار', 'Job abandonment without notice', 'N'],
    ['HIRING_RESTRICTION', 'PERFORMANCE', 'أداء ضعيف موثّق', 'Documented poor performance', 'N'],
    ['HIRING_RESTRICTION', 'OTHER', 'أخرى', 'Other', 'Y']
  ];
  // Insert any reason (Process + Code) that is missing — safe for upgrades.
  var haveReason = {};
  all_('REASON_MASTER').forEach(function (r) { haveReason[r.Process + '|' + r.Code] = 1; });
  var newReasons = [];
  reasons.forEach(function (a, i) { if (!haveReason[a[0] + '|' + a[1]]) newReasons.push({ a: a, order: (i + 1) * 10 }); });
  if (newReasons.length) {
    var rIds = nextIds_('REASON', newReasons.length);
    insertMany_('REASON_MASTER', newReasons.map(function (x, i) {
      return { Reason_ID: rIds[i], Process: x.a[0], Code: x.a[1], Label_AR: x.a[2], Label_EN: x.a[3],
        Requires_Note: x.a[4], Sort_Order: String(x.order), Status: 'Active' };
    }), 'SYSTEM');
  }

  seedRows_('MESSAGE_TEMPLATES', defaultTemplates_().map(function (a, i) {
    return { Template_ID: a[0] + '-' + a[1], Code: a[0], Language: a[1], Purpose: a[2], Title: a[3], Subject: a[4], Body: a[5],
      Sort_Order: String((i + 1) * 10), Status: 'Active' };
  }));

  if (!all_('AUTHORITY_RULES').length) {
    var rules = [
      ['RECRUITMENT_REQUEST', 'HC_EXCEPTION_APPROVER', 'ALL', '', 'HR_MANAGER', 'HC exception approvers: HR Manager or CEO'],
      ['RECRUITMENT_REQUEST', 'HC_EXCEPTION_APPROVER', 'ALL', '', 'CEO', 'HC exception approvers: HR Manager or CEO'],
      ['RECRUITMENT_REQUEST', 'FALLBACK', 'UNIT_TYPE', 'SECTOR', 'HR_MANAGER', 'Vacant Sector Manager → HR Manager'],
      ['RECRUITMENT_REQUEST', 'CEO_REQUIRED', 'TARGET_HEAD_OF', 'SECTOR', 'CEO', 'Requests for a Sector Manager position go to CEO']
    ];
    var ruleIds = nextIds_('RULE', rules.length);
    insertMany_('AUTHORITY_RULES', rules.map(function (a, i) {
      return { Rule_ID: ruleIds[i], Process: a[0], Rule_Type: a[1], Scope_Type: a[2], Scope_Value: a[3],
        Authority: a[4], Effective_From: today_(), Effective_To: '', Active: 'Y', Notes: a[5] };
    }), 'SYSTEM');
  }

  // Board approval for positions reporting directly to the CEO (added v0.2.3; inserted once if missing)
  if (!where_('AUTHORITY_RULES', function (r) { return r.Rule_Type === 'BOARD_REQUIRED' && r.Scope_Type === 'TARGET_REPORTS_TO'; }).length) {
    insert_('AUTHORITY_RULES', { Rule_ID: nextId_('RULE'), Process: 'RECRUITMENT_REQUEST', Rule_Type: 'BOARD_REQUIRED',
      Scope_Type: 'TARGET_REPORTS_TO', Scope_Value: 'COMPANY_HEAD', Authority: 'BOARD', Effective_From: today_(), Effective_To: '',
      Active: 'Y', Notes: 'قاعدة أساسية: الوظايف التابعة للرئيس التنفيذي مباشرة بتروح لمجلس الإدارة' }, 'SYSTEM');
  }

  seedRows_('ORG_VERSIONS', [{ Org_Version_ID: 'ORGV-2026.01', Effective_Date: today_(), Approval_Date: '',
    Approved_By: '', Change_Request_ID: '', Description: 'Initial structure load', Status: 'Active' }]);
}

/** Phase 5A: pay components and the offer authority matrix (only when empty — HR edits them from «الرواتب والعروض»). */
function seedOffers_() {
  seedRows_('PAY_COMPONENTS', PAY_ITEMS_0131_.map(function (a) { return { Component_Code: a[0], Name_AR: a[1], Name_EN: a[2], Kind: a[3], Show_On_Offer: a[4], Sort_Order: String(a[5]), Status: 'Active' }; }));
  invalidate_('PAY_COMPONENTS');
  if (!all_('OFFER_AUTHORITY').length) {
    var rows = [['RECRUITER', 'MIN', '0'], ['RECRUITMENT_SUPERVISOR', 'MID', '0'], ['RECRUITMENT_MANAGER', 'MAX', '0'], ['HR_MANAGER', 'ANY', '0'], ['HR_SECTOR_MANAGER', 'ANY', '0']];
    var ids = nextIds_('OFFER_AUTH', rows.length);
    insertMany_('OFFER_AUTHORITY', rows.map(function (r, i) { return { Authority_ID: ids[i], Role_Code: r[0], Limit_Point: r[1], Limit_Pct: r[2], Sort_Order: String((i + 1) * 10), Status: 'Active' }; }), 'SYSTEM');
  }
}

/** v0.13.1: Kandil's allowance table per grade (2026), job-nature rates per unit / department (2026), the offer pay items. */
var ALLOW_2026_ = [
  // grade, collar, transport at Inshas, extra elsewhere, meal, phone, cost of living, job nature
  [15, 'W', 5000, 0, 1000, 1200, 800, 'N'], [14, 'W', 4000, 0, 1000, 1200, 800, 'N'], [13, 'W', 3000, 0, 1000, 700, 800, 'N'],
  [12, 'W', 2000, 600, 1000, 600, 800, 'N'], [11, 'B', 1400, 600, 1000, 600, 800, 'Y'], [10, 'W', 1200, 600, 1000, 400, 800, 'N'],
  [9, 'W', 1000, 500, 1000, 400, 800, 'N'], [8, 'W', 900, 500, 1000, 200, 800, 'N'], [7, 'B', 800, 400, 1000, 200, 800, 'Y'],
  [6, 'B', 800, 400, 1000, 200, 800, 'Y'], [5, 'W', 800, 400, 1000, 200, 800, 'N'], [4, 'B', 800, 400, 1000, 200, 800, 'Y'],
  [3, 'B', 800, 200, 1000, 200, 800, 'Y'], [2, 'G', 1000, 0, 1000, 200, 800, 'Y'], [1, 'B', 800, 0, 1000, 200, 800, 'N']];
var JOB_NATURE_2026_ = {
  'Obour|المصنع النمطي': [['التصنيع', 300], ['التربيط', 250], ['الطلاء', 500], ['الفرشه', 600], ['الصناعات', 300], ['التجميع', 300], ['الجودة', 300], ['العينات', 300],
    ['الصيانه', 300], ['السلامه والصحه المهنيه', 250], ['هندسة العمليات', 300], ['المخازن', 200], ['التبتين', 400], ['الورنيش', 500], ['الأمن', 150], ['العزل', 300],
    ['التجهيز', 250], ['الامن الليلي', 500], ['النظافة', 200], ['الفنية', 300], ['تجهيز الورنيش', 300], ['الرش', 500], ['الاداره الفنيه', 300]],
  'Showrooms|المعارض': [['البوفيه', 200], ['التجهيز', 300], ['المخازن', 200], ['الامن', 250], ['التركيبات', 400], ['المعارض', 300], ['سائق', 250], ['التجميع', 300], ['الصيانه', 300], ['التغليف', 300]],
  'LeChateau|لو شاتوه': [['التركيبات', 400], ['المخازن', 200], ['البوفيه', 200], ['سائق', 250], ['التجهيز', 300]],
  'Enarat|انارات': [['المخازن', 200], ['التجميع', 300], ['التركيبات', 400], ['التغليف', 300], ['البوفيه', 200], ['التجهيز', 300], ['سائق', 250]],
  'Group|المجموعة': [['السلامه والصحه المهنيه', 250]],
  'Sales|المبيعات': [['المخازن', 200], ['التركيبات', 400], ['الصيانه', 300], ['سائق', 250], ['البوفيه', 200], ['الكريستال', 200], ['الجودة', 300], ['التجهيز', 250], ['ارض الجولف', 200], ['المعرض', 300]],
  'Projects|المشروعات': [['الجودة', 300], ['البوفيه', 200], ['التركيبات', 400], ['التصنيع', 300], ['التجميع', 300], ['المخازن', 200], ['التغليف', 300], ['التجهيز', 250], ['الفرشه', 600], ['الأمن', 250], ['الرش', 500]],
  'EFFC|انشاص': [['النماذج', 300], ['الفريزة', 300], ['التجميع', 300], ['اللحام', 300], ['الشمع', 400], ['السبك', 500], ['الصيانه', 300], ['الدايكاست', 400], ['السكينة', 400],
    ['التوضيب', 300], ['الامن الليلي', 500], ['الزجاج', 300], ['البوفيه', 200], ['الأمن', 200], ['التغليف', 300], ['الفرشه', 600], ['الجودة', 300], ['الخراطة', 400],
    ['الفنيات', 300], ['سائق', 250], ['المخازن', 200], ['النظافة', 200], ['البرادة', 300], ['الإنتاج', 300], ['التبتين', 250], ['الرش', 500], ['المعمل', 400]]
};
var PAY_ITEMS_0131_ = [
  ['BASIC', 'الأساسي', 'Basic salary', 'BASIC', 'Y', 10], ['TRANSPORT', 'بدل انتقالات', 'Transportation allowance', 'FIXED', 'Y', 20],
  ['MEAL', 'بدل غذاء', 'Meal allowance', 'FIXED', 'Y', 30], ['PHONE', 'بدل تليفون', 'Phone allowance', 'FIXED', 'Y', 40],
  ['COST_OF_LIVING', 'بدل غلاء معيشة', 'Cost of living allowance', 'FIXED', 'Y', 50], ['REPRESENTATION', 'بدل تمثيل', 'Representation allowance', 'FIXED', 'Y', 60],
  ['JOB_NATURE', 'بدل طبيعة عمل', 'Job nature allowance', 'FIXED', 'Y', 70], ['OTHER_ALLOW', 'بدلات أخرى', 'Other allowances', 'FIXED', 'Y', 80],
  ['NET_ALLOWANCE', 'Net allowance', 'Net allowance', 'FIXED', 'Y', 90], ['INCENTIVE', 'حافز', 'Incentive', 'VARIABLE', 'N', 100]];

function pay0131_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('PAY_0131') === 'done') return;
  withLock_(function () {
    PAY_ITEMS_0131_.forEach(function (a) {
      var f = { Component_Code: a[0], Name_AR: a[1], Name_EN: a[2], Kind: a[3], Show_On_Offer: a[4], Sort_Order: String(a[5]), Status: 'Active' };
      if (get_('PAY_COMPONENTS', a[0])) update_('PAY_COMPONENTS', a[0], f, 'SYSTEM'); else insert_('PAY_COMPONENTS', f, 'SYSTEM');
    });
    ['HOUSING', 'OTHER_FIXED', 'COMMISSION', 'BONUS'].forEach(function (c) { if (get_('PAY_COMPONENTS', c)) update_('PAY_COMPONENTS', c, { Status: 'Inactive' }, 'SYSTEM'); });
    if (!all_('ALLOWANCE_GRADES').length) {
      var ids = nextIds_('ALLOW_GRADE', ALLOW_2026_.length);
      insertMany_('ALLOWANCE_GRADES', ALLOW_2026_.map(function (r, i) {
        return { Row_ID: ids[i], Grade_Code: String(r[0]), Version: '1', Collar: r[1], Transport_Inshas: String(r[2]), Transport_Other_Add: String(r[3]), Meal: String(r[4]),
          Phone: String(r[5]), Representation: '', Cost_Of_Living: String(r[6]), Job_Nature_Eligible: r[7], Effective_From: '2026-01-01', Status: 'Active', Notes: 'جدول البدلات 2026' };
      }), 'SYSTEM');
    }
    if (!all_('JOB_NATURE_RATES').length) {
      var rows = [];
      Object.keys(JOB_NATURE_2026_).forEach(function (k) { JOB_NATURE_2026_[k].forEach(function (d) { rows.push([k.split('|')[0], k.split('|')[1], d[0], d[1]]); }); });
      var rid = nextIds_('JOB_NATURE', rows.length);
      insertMany_('JOB_NATURE_RATES', rows.map(function (r, i) { return { Rate_ID: rid[i], Unit_Group: r[0], Group_Name: r[1], Department: r[2], Amount: String(r[3]), Year: '2026', Status: 'Active' }; }), 'SYSTEM');
    }
    all_('LOCATIONS').forEach(function (l) {
      if (str_(l.Transport_Zone)) return;
      update_('LOCATIONS', l.Location_ID, { Transport_Zone: /[إا]نشاص/.test(l.Name_AR) || /inshas/i.test(l.Name_EN) ? 'INSHAS' : 'OTHER' }, 'SYSTEM');
    });
  });
  props.setProperty('PAY_0131', 'done');
}

/** Ready-made candidate messages. Placeholders: {name} {job} {location} {company} {recruiter} */
function defaultTemplates_() {
  return [
    ['ACK', 'ar', 'CONTACT', 'تأكيد استلام الطلب', 'استلمنا طلبك — {job}',
     'مرحباً {name}،\nشكراً لتقديمك على وظيفة {job} في {company}. استلمنا طلبك، وسيقوم فريق التوظيف بمراجعة بياناتك والتواصل معك في حال التوافق مع متطلبات الوظيفة.\nمع تحيات فريق التوظيف — {company}'],
    ['ACK', 'en', 'CONTACT', 'Application received', 'We received your application — {job}',
     'Hello {name},\nThank you for applying for the {job} position at {company}. We have received your application, and our recruitment team will review it and contact you if your profile matches the job requirements.\nRecruitment Team — {company}'],
    ['NO_ANSWER', 'ar', 'CONTACT', 'محاولة تواصل بدون رد', 'بخصوص وظيفة {job}',
     'مرحباً {name}،\nمعك {recruiter} من فريق التوظيف في {company}. حاولنا التواصل معك بخصوص طلبك لوظيفة {job}. برجاء الرد على هذه الرسالة أو إبلاغنا بالوقت المناسب للاتصال بك.\nشكراً لك.'],
    ['NO_ANSWER', 'en', 'CONTACT', 'Tried to reach you', 'About the {job} position',
     'Hello {name},\nThis is {recruiter} from the recruitment team at {company}. We tried to reach you about your application for the {job} position. Please reply to this message or let us know a good time to call you.\nThank you.'],
    ['INFO_REQUEST', 'ar', 'CONTACT', 'طلب استكمال بيانات', 'استكمال بيانات طلبك — {job}',
     'مرحباً {name}،\nلاستكمال مراجعة طلبك لوظيفة {job} في {company}، برجاء إرسال سيرتك الذاتية (CV) المحدثة، مع ذكر المرتب الحالي والمتوقع وموعد إمكانية الالتحاق بالعمل.\nمع تحيات فريق التوظيف.'],
    ['INFO_REQUEST', 'en', 'CONTACT', 'Request for more information', 'Completing your application — {job}',
     'Hello {name},\nTo complete the review of your application for the {job} position at {company}, please send us your updated CV, your current and expected salary, and when you could start.\nRecruitment Team.'],
    ['REJECT', 'ar', 'REJECT', 'اعتذار عن عدم الاستمرار', 'بخصوص طلبك لوظيفة {job}',
     'مرحباً {name}،\nنشكرك على اهتمامك بوظيفة {job} في {company} وعلى الوقت الذي خصصته لنا. بعد مراجعة الطلبات، قررنا الاستمرار مع مرشحين آخرين أقرب لمتطلبات هذه الوظيفة في الوقت الحالي.\nقد نتواصل معك مستقبلاً إذا توفرت فرصة مناسبة. نتمنى لك كل التوفيق.\nفريق التوظيف — {company}'],
    ['REJECT', 'en', 'REJECT', 'Regret message', 'Your application for {job}',
     'Hello {name},\nThank you for your interest in the {job} position at {company} and for the time you gave us. After reviewing the applications, we have decided to continue with other candidates whose profiles more closely match the current requirements of this role.\nWe may contact you in the future if a suitable opportunity comes up. We wish you every success.\nRecruitment Team — {company}'],
    ['INTERVIEW_INVITE', 'ar', 'INTERVIEW', 'دعوة لمقابلة', 'دعوة لمقابلة — {job}',
     'مرحباً {name}،\nيسعدنا دعوتك لمقابلة شخصية لوظيفة {job} في {company}.\nالموعد: {date} الساعة {time}\nالمكان: {place}\nمع: {interviewer}\nبرجاء تأكيد الحضور بالرد على هذه الرسالة، وإحضار صورة البطاقة والسيرة الذاتية.\nللاستفسار: {recruiter}\nفريق التوظيف — {company}'],
    ['INTERVIEW_INVITE', 'en', 'INTERVIEW', 'Interview invitation', 'Interview invitation — {job}',
     'Hello {name},\nWe are pleased to invite you to an interview for the {job} position at {company}.\nDate: {date} at {time}\nPlace: {place}\nWith: {interviewer}\nPlease confirm your attendance by replying to this message, and bring your ID card and CV.\nContact: {recruiter}\nRecruitment Team — {company}'],
    ['INTERVIEW_RESCHEDULE', 'ar', 'INTERVIEW', 'تغيير معاد المقابلة', 'معاد جديد لمقابلتك — {job}',
     'مرحباً {name}،\nنعتذر عن تغيير موعد مقابلتك لوظيفة {job}. الموعد الجديد: {date} الساعة {time}\nالمكان: {place}\nبرجاء تأكيد الحضور بالرد على هذه الرسالة.\nفريق التوظيف — {company}'],
    ['INTERVIEW_REMINDER', 'ar', 'INTERVIEW', 'تذكير بالمعاد (إيميل أوتوماتيك)', 'تذكير بمعادك بكرة — {job}',
     'مرحباً {name}،\nبنفكّرك بمعادك لوظيفة {job} في {company}.\nالموعد: {date} الساعة {time}\nالمكان: {place}\nلو حصل أي ظرف، برجاء إبلاغنا بالرد على هذه الرسالة.\nفريق التوظيف — {company}'],
    ['INTERVIEW_REMINDER', 'en', 'INTERVIEW', 'Appointment reminder (automatic email)', 'Reminder of your appointment — {job}',
     'Hello {name},\nThis is a reminder of your appointment for the {job} position at {company}.\nDate: {date} at {time}\nPlace: {place}\nIf anything comes up, please let us know by replying to this message.\nRecruitment Team — {company}'],
    ['OFFER_LETTER', 'ar', 'OFFER', 'خطاب العرض الوظيفي', 'عرض وظيفي — {job} — قنديل مصر',
     'التاريخ: {date}\nرقم العرض: {offer_no}\n\nالسيد/ة {name}،\nيسعدنا في {company} أن نعرض عليك وظيفة {job} في {location}، بعد المقابلات والتقييم.\n\nالراتب الشهري:\n{salary_table}\nتاريخ الاستلام المقترح: {joining}\n{terms}\n\nهذا العرض صالح حتى {valid_until}. برجاء تأكيد قبولك بالتوقيع على هذا الخطاب أو بالرد على الرسالة.\nالعرض مشروط باستكمال أوراق التعيين والكشف الطبي.\n\nمع خالص التحية،\nإدارة الموارد البشرية — {company}'],
    ['OFFER_LETTER', 'en', 'OFFER', 'Offer letter', 'Job offer — {job} — Kandil Egypt',
     'Date: {date}\nOffer no.: {offer_no}\n\nDear {name},\nFollowing your interviews and assessment, {company} is pleased to offer you the position of {job} in {location}.\n\nMonthly salary:\n{salary_table}\nProposed joining date: {joining}\n{terms}\n\nThis offer is valid until {valid_until}. Please confirm your acceptance by signing this letter or replying to this message.\nThe offer is subject to completing the hiring documents and the medical check.\n\nKind regards,\nHuman Resources — {company}'],
    ['INTERVIEW_RESCHEDULE', 'en', 'INTERVIEW', 'Interview rescheduled', 'New time for your interview — {job}',
     'Hello {name},\nWe apologise for changing the time of your interview for the {job} position. The new time is {date} at {time}\nPlace: {place}\nPlease confirm your attendance by replying to this message.\nRecruitment Team — {company}']
  ];
}

/**
 * One-time fix (v0.3.1): on 2026-10-04 the send button was pressed repeatedly while the server was slow,
 * which created 12 copies of one request (REQ-2026-0001..0012). Cancel those copies once, with a note.
 */
function cleanup031_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLEANUP_031')) return;
  var ids = [];
  for (var i = 1; i <= 12; i++) ids.push('REQ-2026-' + ('000' + i).slice(-4));
  var reason = 'نسخة مكررة اتعملت بالضغط على «إرسال» أكتر من مرة — اتلغت تلقائياً في تحديث 0.3.1';
  ids.forEach(function (id) {
    var r = get_('RECRUITMENT_REQUESTS', id);
    if (!r || r.Created_At.slice(0, 10) !== '2026-10-04' || ['DRAFT', 'RETURNED'].concat(REQ_OPEN_).indexOf(r.Status) < 0) return;
    withLock_(function () {
      find_('APPROVAL_INSTANCES', { Entity_Type: 'REQUEST', Entity_ID: id }).forEach(function (a) {
        if (a.Status === 'PENDING' || a.Status === 'WAITING') update_('APPROVAL_INSTANCES', a.Approval_ID, { Status: 'CANCELLED' }, 'SYSTEM');
      });
      update_('RECRUITMENT_REQUESTS', id, { Status: 'CANCELLED', Decided_At: nowIso_() }, 'SYSTEM');
    });
    event_(null, 'REQUEST', id, 'CANCELLED', reason, null);
  });
  props.setProperty('CLEANUP_031', 'done');
}

/**
 * One-time (v0.3.3): requests the HR Sector Manager sent BEFORE his "my approval is enough" rule existed
 * were routed to the CEO. Re-apply the rule to those still open — unless the job needs the CEO/board anyway.
 */
function reapplyHrSelfRule033_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('REAPPLY_033')) return;
  find_('RECRUITMENT_REQUESTS', { Status: ['IN_APPROVAL', 'HR_REVIEW', 'PENDING_CEO'] }).forEach(function (req) {
    if (!isHrSectorUser_(req.Requester_User_ID)) return;
    var chain = chainOf_('REQUEST', req.Request_ID, req.Version);
    var hr = chain.filter(function (a) { return a.Step_Type === 'HR'; })[0];
    if (!hr || hr.Status !== 'SKIPPED' || chain.some(function (a) { return a.Step_Type === 'BOARD'; })) return;
    var lines = reqChildren_('REQUEST_LINES', req.Request_ID);
    var fresh = requestChain_(req, lines);
    if (fresh.some(function (s) { return s.Step_Type === 'CEO' || s.Step_Type === 'BOARD'; })) return;   // CEO still required by a rule
    var ctx = { user: get_('USERS', req.Requester_User_ID), sessionId: 'SYSTEM' };
    var note = 'اعتماد مدير قطاع الموارد البشرية — تطبيق قاعدة «اعتماده كافي» على طلب اتبعت قبلها';
    var snap = applyHrReview_(ctx, req, { HR_Classification: req.Requested_Priority || 'NORMAL' });
    withLock_(function () {
      update_('APPROVAL_INSTANCES', hr.Approval_ID, { Status: 'APPROVED', Decision_By: req.Requester_User_ID, Decision_At: nowIso_(),
        Comment: note, Skip_Reason: '', Snapshot_JSON: JSON.stringify(snap) }, 'SYSTEM');
      chain.forEach(function (a) {
        if (a.Step_Type === 'CEO' && (a.Status === 'WAITING' || a.Status === 'PENDING'))
          update_('APPROVAL_INSTANCES', a.Approval_ID, { Status: 'SKIPPED', Skip_Reason: 'مش مطلوب — اعتماد مدير قطاع الموارد البشرية كافي' }, 'SYSTEM');
      });
    });
    event_(ctx, 'REQUEST', req.Request_ID, 'APPROVED_STEP', note, { step: hr.Label });
    finalizeRequest_(ctx, req.Request_ID);
  });
  props.setProperty('REAPPLY_033', 'done');
}

/**
 * One-time (v0.4.1): the owner's list of factories, offices and the 15 branches (each branch its own location).
 * Existing locations are renamed in place (positions keep their links); «الفروع» becomes the BRANCH_GROUP.
 */
function locations041_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LOCATIONS_041')) return;
  if (!all_('LOCATIONS').length) { props.setProperty('LOCATIONS_041', 'skip'); return; }   // fresh install: added from the screen
  var byName = function (n) { return where_('LOCATIONS', function (l) { return norm_(l.Name_AR) === norm_(n); })[0] || null; };
  function upsert(oldNames, name, type, gov, address) {
    var cur = null;
    oldNames.concat([name]).some(function (n) { cur = byName(n); return !!cur; });
    withLock_(function () {
      if (cur) update_('LOCATIONS', cur.Location_ID, { Name_AR: name, Location_Type: type, Governorate: gov, Address: address, Status: 'Active' }, 'SYSTEM');
      else insert_('LOCATIONS', { Location_ID: nextId_('LOCATION'), Name_AR: name, Name_EN: '', Location_Type: type, Company_Org_Unit_ID: '',
        Governorate: gov, Status: 'Active', Address: address }, 'SYSTEM');
    });
  }
  upsert(['العبور'], 'مصنع العبور', 'FACTORY', 'القليوبية', 'قطعة 11 - بلوك 13007 - المنطقة الصناعية الأولى - مدينة العبور - القليوبية');
  upsert(['إنشاص', 'انشاص'], 'مصنع إنشاص', 'FACTORY', 'الشرقية', 'جمعية المهندسين العرب - بساتين الإسماعيلية - مركز بلبيس - الشرقية');
  upsert(['مصنع المنتج الخاص', 'المنتج الخاص'], 'مصنع المشروعات', 'FACTORY', 'القاهرة', 'شارع ثلاجة الزهراء - جسر السويس - ك18 - السلام - القاهرة');
  upsert(['ألماظة', 'الماظة'], 'مبنى إداري ألماظة', 'OFFICE', 'القاهرة', 'شارع عمر بن الخطاب - ألماظة - القاهرة');
  upsert([], 'الفروع', 'BRANCH_GROUP', '', 'وظايف المعارض — الطلب بيحدد الفرع');
  [
    ['فرع السندباد', 'القاهرة', 'شارع جوزيف تيتو بجوار السندباد'],
    ['فرع النزهة', 'القاهرة', '29 شارع النزهة - مدينة نصر'],
    ['فرع التجمع الخامس', 'القاهرة', 'مول 311 شارع التسعين الشمالي - التجمع الخامس'],
    ['فرع ميجا', 'القاهرة', 'ميجا بايت مول - القطامية - التجمع الخامس'],
    ['فرع المعادي', 'القاهرة', 'بلوك 2/1 شارع اللاسلكي - المعادي'],
    ['فرع مصطفى النحاس', 'القاهرة', '28 شارع مصطفى النحاس - مدينة نصر'],
    ['فرع العبور', 'القليوبية', 'قطعة 11 - بلوك 13007 - المنطقة الصناعية الأولى - مدينة العبور - القليوبية'],
    ['فرع مدينتي', 'القاهرة', 'إيست هب مول - مدينتي'],
    ['فرع الطاقة', 'القاهرة', '15 شارع الطاقة - بجوار النادي الأهلي - مدينة نصر'],
    ['فرع مول مصر', 'الجيزة', 'مول مصر - 6 أكتوبر'],
    ['فرع أجورا مول', 'القاهرة', 'أجورا مول - التجمع'],
    ['فرع الإسكندرية', 'الإسكندرية', 'العطارين - شارع سيدي المتولي - الإسكندرية'],
    ['فرع ألماظة', 'القاهرة', 'شارع عمر بن الخطاب - ألماظة - القاهرة'],
    ['فرع المنصورة', 'الدقهلية', 'شارع جابر الأشقر - المشاية السفلية - المنصورة'],
    ['فرع ووتر واي', 'القاهرة', 'ووتر واي مول - التجمع الخامس']
  ].forEach(function (b) { upsert([], b[0], 'SHOWROOM', b[1], b[2]); });
  props.setProperty('LOCATIONS_041', 'done');
}

/**
 * One-time (v0.4.2): «مصنع المشروعات» IS the Gesr El-Suez factory (owner, 4 Oct 2026).
 * Give it the address and close the separate «مصنع جسر السويس» added by v0.4.1 (nothing uses it).
 */
function mergeProjectsFactory042_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MERGE_042')) return;
  var addr = 'شارع ثلاجة الزهراء - جسر السويس - ك18 - السلام - القاهرة';
  var proj = where_('LOCATIONS', function (l) { return l.Name_AR === 'مصنع المشروعات'; })[0];
  var dup = where_('LOCATIONS', function (l) { return l.Name_AR === 'مصنع جسر السويس'; })[0];
  withLock_(function () {
    if (proj) update_('LOCATIONS', proj.Location_ID, { Governorate: 'القاهرة', Address: addr }, 'SYSTEM');
    if (dup && proj) {
      // anything that points at the duplicate moves to the real factory
      where_('POSITIONS', function (x) { return x.Location_ID === dup.Location_ID; })
        .forEach(function (x) { update_('POSITIONS', x.Position_ID, { Location_ID: proj.Location_ID }, 'SYSTEM'); });
      where_('VACANCIES', function (v) { return v.Location_ID === dup.Location_ID; })
        .forEach(function (v) { update_('VACANCIES', v.Vacancy_ID, { Location_ID: proj.Location_ID }, 'SYSTEM'); });
      update_('LOCATIONS', dup.Location_ID, { Name_AR: 'مصنع جسر السويس (مكرر — اتدمج في مصنع المشروعات)', Status: 'Inactive' }, 'SYSTEM');
    }
  });
  props.setProperty('MERGE_042', 'done');
}

/**
 * One-time (v0.8.1): HC exceptions are approved by the HR Sector Manager only (CHG-40/2). The two seeded
 * "HR Manager or CEO" approver rules are stopped and one HR Sector Manager rule recorded; setting texts updated.
 */
function migrate081_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATE_081') === 'done') return;
  withLock_(function () {
    where_('AUTHORITY_RULES', function (r) { return r.Rule_Type === 'HC_EXCEPTION_APPROVER' && r.Active === 'Y' && r.Authority !== ROLE.HR_SECTOR; })
      .forEach(function (r) {
        update_('AUTHORITY_RULES', r.Rule_ID, { Active: 'N', Effective_To: yesterday_(), Notes: 'Stopped in 0.8.1: HC exceptions are approved by the HR Sector Manager only (CHG-40)' }, 'SYSTEM');
      });
    if (!where_('AUTHORITY_RULES', function (r) { return r.Rule_Type === 'HC_EXCEPTION_APPROVER' && r.Active === 'Y'; }).length) {
      insert_('AUTHORITY_RULES', { Rule_ID: nextId_('RULE'), Process: 'RECRUITMENT_REQUEST', Rule_Type: 'HC_EXCEPTION_APPROVER', Scope_Type: 'ALL',
        Scope_Value: '', Authority: ROLE.HR_SECTOR, Effective_From: today_(), Effective_To: '', Active: 'Y',
        Notes: 'HC exceptions: separate approval by the HR Sector Manager only (CHG-40)' }, 'SYSTEM');
    }
    [['DIGEST_TIME', 'Time of the daily job (reminders, escalation, digest email), Cairo time HH:00 — run installTriggers after changing it'],
     ['EMAIL_DAILY_BUDGET', 'Max system emails per day (alerts + daily digest). Login codes always go, within the Gmail quota']].forEach(function (c) {
      if (get_('CONFIG', c[0])) update_('CONFIG', c[0], { Description: c[1] }, 'SYSTEM');
    });
  });
  props.setProperty('MIGRATE_081', 'done');
}

/** Create the owner user with SYS_OWNER + HR_SECTOR_MANAGER. Safe to re-run. */
function bootstrapOwner() {
  requireEditor_();
  if (!OWNER_EMAIL || !OWNER_NAME_AR) throw new Error('Fill OWNER_EMAIL and OWNER_NAME_AR at the top of Setup.gs first.');
  var email = normEmail_(OWNER_EMAIL);
  var user = findUserByEmail_(email);
  withLock_(function () {
    if (!user) {
      user = insert_('USERS', { User_ID: nextId_('USER'), Email: email, Full_Name_AR: OWNER_NAME_AR, Full_Name_EN: '',
        Employee_ID: '', Position_ID: '', Mobile: '', Status: 'Active', Last_Login_At: '' }, 'SYSTEM');
    }
    [ROLE.OWNER, ROLE.HR_SECTOR].forEach(function (code) {
      var has = activeRoles_(user.User_ID).some(function (r) { return r.Role_Code === code; });
      if (!has) {
        insert_('USER_ROLES', { User_Role_ID: nextId_('USER_ROLE'), User_ID: user.User_ID, Role_Code: code,
          Scope_Type: 'ALL', Scope_Org_Unit_ID: '', Include_Children: '', Effective_From: today_(),
          Effective_To: '', Granted_By: 'SYSTEM' }, 'SYSTEM');
      }
    });
  });
  audit_(null, { userId: 'SYSTEM', entityType: 'USER', entityId: user.User_ID, action: 'BOOTSTRAP_OWNER', newValue: email });
  flushAudit_();
  Logger.log('Owner ready: ' + user.User_ID + ' ' + email);
  return user.User_ID;
}

/**
 * Automatic upgrade: after a new version is deployed, the first call runs setupSystem() once
 * (adds new sheets / columns / seeds; never deletes). Only on an installed system.
 */
function ensureUpgraded_() {
  if (sprop_('SCHEMA_APP_VERSION') === APP.VERSION) return;      // the usual case: one properties read per request
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_APP_VERSION') === APP.VERSION) return;
  if (!props.getProperty(SS_PROP.CORE)) return;            // not installed yet: run setupSystem() by hand
  // one upgrade at a time; everyone else gets a clear message instead of queueing behind it
  var started = props.getProperty('UPGRADE_STARTED') || '';
  var running = started && started.split('|')[0] === APP.VERSION && (Date.now() - Number(started.split('|')[1] || 0)) < 6 * 60 * 1000;
  if (running) throw userError_('البوابة بتتحدّث لإصدار جديد دلوقتي — جرّب تاني بعد دقيقة.');
  if (LOCK_HELD_) { setupSystem_(true); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('البوابة بتتحدّث لإصدار جديد دلوقتي — جرّب تاني بعد دقيقة.');
  LOCK_HELD_ = true;
  try {
    if (props.getProperty('SCHEMA_APP_VERSION') === APP.VERSION) return;
    props.setProperty('UPGRADE_STARTED', APP.VERSION + '|' + Date.now());
    try { setupSystem_(true); } catch (eUp) { upgradeFailed_(eUp); }
    console.log('Auto-upgraded schema to ' + APP.VERSION);
  } finally {
    props.deleteProperty('UPGRADE_STARTED');
    try { flushPending_(); }
    finally {
      LOCK_HELD_ = false;
      try { SpreadsheetApp.flush(); tcRetire_(); } finally { lock.releaseLock(); }
    }
  }
}

/**
 * v0.44.4 (CHG-95): a failed upgrade is never silent — the system owner gets one e-mail per version (reference and the
 * first line of the error, no personal data) and users see a clear message instead of «unexpected error». Uses no
 * table (the tables may be what failed). A user-facing error (e.g. «upgrade running») passes through as it is.
 */
function upgradeFailed_(e) {
  if (e && e.userFacing) throw e;
  var ref = Utilities.getUuid().slice(0, 8);
  var line = String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300);
  console.error('[' + ref + '] upgrade to ' + APP.VERSION + ': ' + (e && e.stack ? e.stack : e));
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('UPGRADE_FAIL_MAILED') !== APP.VERSION && MailApp.getRemainingDailyQuota() > 0) {
      props.setProperty('UPGRADE_FAIL_MAILED', APP.VERSION);
      sendMail_({ to: OWNER_EMAIL, name: 'Kandil Recruitment Portal',
        subject: 'بوابة التوظيف — تحديث الإصدار ' + APP.VERSION + ' فشل (رقم المرجع ' + ref + ')',
        htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' +
          '<p>تحديث قاعدة البيانات للإصدار <b>' + APP.VERSION + '</b> فشل، والبوابة مش هتشتغل لحد ما يتصلّح.</p>' +
          '<p>رقم المرجع: <b dir="ltr">' + ref + '</b><br>الخطأ: <code dir="ltr">' + line.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</code></p>' +
          '<p>التفاصيل الكاملة في Apps Script ← Executions، في السطر اللي بيبدأ برقم المرجع. الإيميل ده بيتبعت مرة واحدة لكل إصدار.</p></div>' });
    }
  } catch (eMail) { console.warn('upgrade alert: ' + eMail); }
  throw userError_('البوابة فيها مشكلة في التحديث لإصدار جديد — مدير النظام اتبلّغ. رقم المرجع: ' + ref);
}

/** v0.34.0: people deleted before 0.34 kept their AI readings and photo — remove them once. */
var USAGE_POLICY_AR_ = 'سياسة استخدام بوابة التوظيف: البوابة لشغل الشركة بس. بيانات المرشحين والموظفين سرية — ماتنسخهاش ولا تبعتها برّه البوابة ولا تصوّرها، وماتشاركش حسابك أو كود الدخول مع حد. كل عملية بتتسجل باسمك. البوابة بتحسب مؤشرات خدمة لكل مستخدم (سرعة الاعتماد، تسليم تقييمات المقابلات، الالتزام بالمواعيد) وبتظهر لمديرك وللموارد البشرية. ومدير النظام ومدير قطاع الموارد البشرية يقدروا يشوفوا مين فاتح البوابة دلوقتي وعلى أنهي شاشة (اسم الشاشة بس، من غير أي سجل جواها، ومن غير ما يتحفظ تاريخ). والبوابة بتسجّل الأجهزة اللي حسابك بيدخل منها (نوع المتصفح والجهاز ووقت أول وآخر دخول)، وبتبعتلك تنبيه لو حسابك اتفتح من جهاز جديد. أي تسريب أو شك فيه بلّغ عنه فوراً مدير قطاع الموارد البشرية.';
var USAGE_POLICY_AR_0451_ = 'سياسة استخدام بوابة التوظيف: البوابة لشغل الشركة بس. بيانات المرشحين والموظفين سرية — ماتنسخهاش ولا تبعتها برّه البوابة ولا تصوّرها، وماتشاركش حسابك أو كود الدخول مع حد. كل عملية بتتسجل باسمك. البوابة بتحسب مؤشرات خدمة لكل مستخدم (سرعة الاعتماد، تسليم تقييمات المقابلات، الالتزام بالمواعيد) وبتظهر لمديرك وللموارد البشرية. ومدير النظام ومدير قطاع الموارد البشرية يقدروا يشوفوا مين فاتح البوابة دلوقتي وعلى أنهي شاشة (اسم الشاشة بس، من غير أي سجل جواها، ومن غير ما يتحفظ تاريخ). أي تسريب أو شك فيه بلّغ عنه فوراً مدير قطاع الموارد البشرية.';
var USAGE_POLICY_AR_0440_ = 'سياسة استخدام بوابة التوظيف: البوابة لشغل الشركة بس. بيانات المرشحين والموظفين سرية — ماتنسخهاش ولا تبعتها برّه البوابة ولا تصوّرها، وماتشاركش حسابك أو كود الدخول مع حد. كل عملية بتتسجل باسمك. البوابة بتحسب مؤشرات خدمة لكل مستخدم (سرعة الاعتماد، تسليم تقييمات المقابلات، الالتزام بالمواعيد) وبتظهر لمديرك وللموارد البشرية. أي تسريب أو شك فيه بلّغ عنه فوراً مدير قطاع الموارد البشرية.';
var USAGE_POLICY_EN_ = 'Recruitment portal usage policy: the portal is for company work only. Candidate and employee data is confidential — do not copy it, send it outside the portal or photograph it, and do not share your account or sign-in code. Every action is recorded under your name. The portal computes service indicators for each user (approval speed, interview feedback, timeliness), shown to your manager and HR. The system administrator and the HR Sector Manager can see who is using the portal right now and on which screen (the screen name only, never the record in it, and no history is kept). The portal records the devices your account signs in from (browser and system type, first and last sign-in) and alerts you when your account is opened from a new device. Report any leak or suspicion at once to the HR Sector Manager.';
var USAGE_POLICY_EN_0451_ = 'Recruitment portal usage policy: the portal is for company work only. Candidate and employee data is confidential — do not copy it, send it outside the portal or photograph it, and do not share your account or sign-in code. Every action is recorded under your name. The portal computes service indicators for each user (approval speed, interview feedback, timeliness), shown to your manager and HR. The system administrator and the HR Sector Manager can see who is using the portal right now and on which screen (the screen name only, never the record in it, and no history is kept). Report any leak or suspicion at once to the HR Sector Manager.';
var USAGE_POLICY_EN_0440_ = 'Recruitment portal usage policy: the portal is for company work only. Candidate and employee data is confidential — do not copy it, send it outside the portal or photograph it, and do not share your account or sign-in code. Every action is recorded under your name. The portal computes service indicators for each user (approval speed, interview feedback, timeliness), shown to your manager and HR. Report any leak or suspicion at once to the HR Sector Manager.';

/** v0.39.0 (CHG-82): private links 7 days — old default values change (values the owner set stay). */
/**
 * v0.40.0 (CHG-84): approval deadline 10 working days (warning 3 before); the recruiter's offer authority is the grade
 * minimum exactly; no permanent hiring restriction — each gets a review date (2 years from when it was made, or a month
 * from today when that already passed).
 */
/**
 * v0.40.1 (decision 48 corrected by the owner): the approval deadline is 5 working days — reminder on day 2, escalation
 * to HR on day 3, warning on day 4 (1 day before), rejected on day 5. Old default values only; a value someone chose stays.
 */
/**
 * v0.41.0 (CHG-85): onboarding templates get the IT / administration / safety owners — the safety induction goes to
 * SAFETY, «e-mail and system accounts» to IT, and every template gets the administration item (ID card, desk, custody).
 * Only items still as seeded are changed; running programs keep their tasks.
 */
/** v0.44.0 (CHG-91): the day-one «ID card and fingerprint» task becomes the ZKBioTime enrolment task (templates and open tasks). */
function migrate0440_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0440')) return;
  withLock_(function () {
    all_('ONB_TEMPLATE_ITEMS').forEach(function (i) {
      if (i.Kind !== 'BIO' && i.Title_AR === ONB_BIO_OLD_) update_('ONB_TEMPLATE_ITEMS', i.Item_ID, { Kind: 'BIO', Title_AR: ONB_BIO_TITLE_, Details: ONB_BIO_DETAILS_ }, 'SYSTEM');
    });
    where_('ONB_TASKS', function (t) { return t.Status === 'OPEN' && t.Title === ONB_BIO_OLD_; }).forEach(function (t) {
      update_('ONB_TASKS', t.Task_ID, { Kind: 'BIO', Title: ONB_BIO_TITLE_, Details: ONB_BIO_DETAILS_ }, 'SYSTEM');
    });
  });
  props.setProperty('MIG_0440', '1');
}

function migrate0410_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0410')) return;
  if (!all_('ONB_TEMPLATES').length) { props.setProperty('MIG_0410', '1'); return; }
  withLock_(function () {
    all_('ONB_TEMPLATE_ITEMS').forEach(function (i) {
      if (i.Owner_Role === 'HR_SITE' && i.Title_AR === 'تدريب السلامة والصحة المهنية وتسليم مهمات الوقاية') update_('ONB_TEMPLATE_ITEMS', i.Item_ID, { Owner_Role: 'SAFETY' }, 'SYSTEM');
      if (i.Owner_Role === 'HR_SITE' && i.Title_AR === 'تجهيز الإيميل وحسابات الأنظمة') update_('ONB_TEMPLATE_ITEMS', i.Item_ID, { Owner_Role: 'IT', Phase: 'BEFORE', Day_Offset: '-2' }, 'SYSTEM');
    });
    var title = 'تجهيز الكارنيه والمكتب وتسليم العهدة';
    find_('ONB_TEMPLATES', { Status: 'Active' }).forEach(function (t) {
      if (find_('ONB_TEMPLATE_ITEMS', { Template_ID: t.Template_ID, Title_AR: title }).length) return;
      insert_('ONB_TEMPLATE_ITEMS', { Item_ID: nextId_('ONB_ITEM'), Template_ID: t.Template_ID, Phase: 'BEFORE', Day_Offset: '-1', Owner_Role: 'ADMIN', Title_AR: title,
        Details: 'كل حاجة بتتسلّم تتسجل في سجل العهدة بتوقيعه.', Needs_Ack: 'N', Sort_Order: '25', Status: 'Active' }, 'SYSTEM');
    });
  });
  props.setProperty('MIG_0410', '1');
}

function migrate0401_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0401')) return;
  withLock_(function () {
    [['APPROVAL_EXPIRE_DAYS', ['30', '10'], '5'], ['APPROVAL_EXPIRY_WARN_DAYS', ['5', '3'], '1'], ['APPROVAL_REMIND_DAYS', ['3'], '2'],
     ['APPROVAL_ESCALATE_DAYS', ['7'], '3']].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && x[1].indexOf(str_(r.Config_Value)) >= 0) update_('CONFIG', x[0], { Config_Value: x[2] }, 'SYSTEM');
    });
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0401', '1');
}

function migrate0400_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0400')) return;
  withLock_(function () {
    [['APPROVAL_EXPIRE_DAYS', '30', '10'], ['APPROVAL_EXPIRY_WARN_DAYS', '5', '3']].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && str_(r.Config_Value) === x[1]) update_('CONFIG', x[0], { Config_Value: x[2] }, 'SYSTEM');
    });
    find_('OFFER_AUTHORITY', { Role_Code: 'RECRUITER', Status: 'Active' }).forEach(function (r) {
      if (r.Limit_Point !== 'MIN' || str_(r.Limit_Pct) !== '0') update_('OFFER_AUTHORITY', r.Authority_ID, { Limit_Point: 'MIN', Limit_Pct: '0' }, 'SYSTEM');
    });
    var day = today_();
    find_('HIRING_RESTRICTIONS', { Status: 'Active' }).forEach(function (r) {
      if (r.Permanent !== 'Y' && r.Review_Date) return;
      var rev = addDaysYmd_(str_(r.Created_At).slice(0, 10) || day, 730);
      if (rev <= day) rev = addDaysYmd_(day, 30);
      update_('HIRING_RESTRICTIONS', r.Restriction_ID, { Permanent: 'N', Review_Date: rev }, 'SYSTEM');
    });
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0400', '1');
}

/** v0.45.1 (CHG-98): the usage policy now says who-is-online exists — the default text is updated and its version raised
 *  (everyone accepts again); a policy the owner wrote himself is left as it is. */
function migrate0451_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0451')) return;
  withLock_(function () {
    var changed = false;
    [['USAGE_POLICY_AR', USAGE_POLICY_AR_0440_, USAGE_POLICY_AR_], ['USAGE_POLICY_EN', USAGE_POLICY_EN_0440_, USAGE_POLICY_EN_]].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && str_(r.Config_Value) === x[1]) { update_('CONFIG', x[0], { Config_Value: x[2] }, 'SYSTEM'); changed = true; }
    });
    var v = get_('CONFIG', 'USAGE_POLICY_VERSION');
    if (changed && v) update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: String(num_(v.Config_Value, 1) + 1) }, 'SYSTEM');
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0451', '1');
}

/** v0.46.2 (CHG-100): the no-insurance acknowledgement becomes a joining document — its type, and the open joinings' rows (an
 *  acknowledgement already uploaded on the offer moves onto its row, so the file is kept in one place). */
function migrate0462_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0462')) return;
  withLock_(function () {
    noInsAckEnsure_();
    where_('JOININGS', function (j) { return j.No_Insurance === 'Y' && j.Status !== 'DID_NOT_JOIN'; }).forEach(function (j) {
      if (noInsAckDoc_(j.Joining_ID)) return;
      var row = noInsAckRow_(nextId_('CAND_DOC'), j), o = j.Offer_ID ? get_('OFFERS', j.Offer_ID) : null;
      if (o && o.No_Ins_Form_File) {
        row.Files_JSON = JSON.stringify([{ id: o.No_Ins_Form_File, name: 'إقرار عدم التأمين (موقّع)', mime: '', at: nowIso_(), by: 'SYSTEM' }]);
        row.Status = 'UPLOADED'; row.Uploaded_By = 'SYSTEM'; row.Uploaded_At = nowIso_();
        update_('OFFERS', o.Offer_ID, { No_Ins_Form_File: '' }, 'SYSTEM');
      }
      insert_('CANDIDATE_DOCS', row, 'SYSTEM');
    });
  });
  props.setProperty('MIG_0462', '1');
}

/** v0.50.0 (CHG-108): the default usage policy also says that the devices an account signs in from are recorded (CHG-104); a
 *  policy the owner wrote himself is left as it is. A changed text raises the version, so everyone accepts it again. */
function migrate0500_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0500')) return;
  withLock_(function () {
    var changed = false;
    [['USAGE_POLICY_AR', USAGE_POLICY_AR_0451_, USAGE_POLICY_AR_], ['USAGE_POLICY_EN', USAGE_POLICY_EN_0451_, USAGE_POLICY_EN_]].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && str_(r.Config_Value) === x[1]) { update_('CONFIG', x[0], { Config_Value: x[2] }, 'SYSTEM'); changed = true; }
    });
    var v = get_('CONFIG', 'USAGE_POLICY_VERSION');
    if (changed && v) update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: String(num_(v.Config_Value, 1) + 1) }, 'SYSTEM');
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0500', '1');
}

function migrate0390_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0390')) return;
  withLock_(function () {
    [['DOC_LINK_DAYS', '30'], ['NHV_LINK_DAYS', '14']].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && str_(r.Config_Value) === x[1]) update_('CONFIG', x[0], { Config_Value: '7' }, 'SYSTEM');
    });
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0390', '1');
}

/** v0.38.0 (CHG-80): retention 2 years — old default values become 24 months and deletion on (it acts only after go-live). */
function migrate0380_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0380')) return;
  withLock_(function () {
    [['RETENTION_REJECTED_MONTHS', '6'], ['RETENTION_DNJ_MONTHS', '3'], ['RETENTION_POOL_MONTHS', '12'], ['RETENTION_ENABLED', 'N']].forEach(function (x) {
      var r = get_('CONFIG', x[0]);
      if (r && str_(r.Config_Value) === x[1]) update_('CONFIG', x[0], { Config_Value: x[0] === 'RETENTION_ENABLED' ? 'Y' : '24' }, 'SYSTEM');
    });
  });
  invalidate_('CONFIG');
  // the signed consent for the criminal-record check, before the check itself
  if (all_('DOC_TYPES').length && !get_('DOC_TYPES', 'CRIMINAL_CONSENT')) withLock_(function () {
    var crim = get_('DOC_TYPES', 'CRIMINAL');
    insert_('DOC_TYPES', { Doc_Code: 'CRIMINAL_CONSENT', Name_AR: 'إقرار موافقة على الكشف الجنائي (موقّع)', Name_EN: '', Keep: 'ORIGINAL', Copies: '0', Digital: 'Y',
      Scope: 'ALL', Scope_Value: '', Insured_Only: 'N', Deferrable: 'N', Max_Defer_Days: '0', Has_Expiry: 'N',
      Sort_Order: String(Math.max(1, num_(crim && crim.Sort_Order, 50) - 5)), Status: 'Active', Sensitive: 'Y' }, 'SYSTEM');
  });
  props.setProperty('MIG_0380', '1');
}

/** v0.37.0 (CHG-82): the authenticator for everyone — an old default list becomes ALL (a list the owner changed stays). */
function migrate0370_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0370')) return;
  var old = 'SYS_OWNER,HR_SECTOR_MANAGER,HR_MANAGER,HR_STAFF,RECRUITMENT_MANAGER,RECRUITMENT_SUPERVISOR,RECRUITER,CONSULTANT';
  withLock_(function () {
    var r = get_('CONFIG', 'TOTP_REQUIRED_ROLES');
    if (r && str_(r.Config_Value).replace(/\s+/g, '') === old) update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'ALL' }, 'SYSTEM');
    var f = get_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS');
    if (f && str_(f.Config_Value) === '3') update_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS', { Config_Value: '0' }, 'SYSTEM');
  });
  invalidate_('CONFIG');
  props.setProperty('MIG_0370', '1');
}

function migrate0340_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_0340_PURGE')) return;
  withLock_(function () {
    all_('PERSONS').forEach(function (per) {
      if (per.Status !== 'Purged') return;
      cvaiPurge_('SYSTEM', per.Person_ID);
      photoPurge_('SYSTEM', per.Person_ID);
    });
  });
  props.setProperty('MIG_0340_PURGE', '1');
}
