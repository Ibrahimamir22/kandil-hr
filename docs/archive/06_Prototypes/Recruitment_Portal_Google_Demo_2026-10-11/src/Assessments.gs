/**
 * Assessments.gs — Phase 4B (v0.12.0): practical / technical assessments and the rest of blueprint 11–12.
 *
 *   • Assessment rounds live in the same plan as interviews (type PRACTICAL / WRITTEN / SKILLS / OTHER_TEST) and reuse the
 *     whole interview chain: assessor confirms first, then the candidate is invited, check-in, no-show, reminders.
 *   • Criteria come from the job description: the practical tests of its competencies (COMP_TESTS) and the JD practical test.
 *     Result Pass / Fail / Needs retest, optional score 0–100, comments, evidence files (test sheet, photos of the work).
 *     A failed assessment flags the candidate for a human decision — nothing is rejected automatically.
 *   • Shop-floor tests: the safety checklist (HSE briefing, PPE, supervisor present) is confirmed before the test starts.
 *   • Round templates per job or job family (ROUND_TEMPLATES); without one, a job whose JD has a practical test gets one
 *     after the HR interview. A vacancy freezes its plan at its first interview.
 *   • Reminders: an hourly job tells the panel 2 hours before; the daily job emails the candidate the working day before
 *     and asks the recruiter to call again for rounds that need reconfirmation.
 *   • Interviewer analytics, for calibration only: rating spread vs the company, share of middle ratings, submission delay,
 *     waiting, declines and no-shows.
 */

var ASSESS_TYPES_ = ['PRACTICAL', 'WRITTEN', 'SKILLS', 'OTHER_TEST'];
var ASSESS_RESULTS_ = ['PASS', 'FAIL', 'RETEST'];
var ASSESS_TYPE_AR_ = { PRACTICAL: 'اختبار عملي', WRITTEN: 'اختبار تحريري فني', SKILLS: 'عرض مهارة', OTHER_TEST: 'اختبار آخر' };
var ASSESS_RES_AR_ = { PASS: 'ناجح', FAIL: 'راسب', RETEST: 'محتاج إعادة' };
var SAFETY_ITEMS_ = [['BRIEF', 'المرشح اتشرح له تعليمات السلامة (HSE) قبل البداية'], ['PPE', 'المرشح لابس معدات الوقاية المطلوبة (PPE)'],
  ['SUPERVISOR', 'المقيّم أو مشرف القسم موجود طول الاختبار']];
var EVIDENCE_MIME_ = ['image/jpeg', 'image/png', 'application/pdf'];

function isAssessType_(t) { return ASSESS_TYPES_.indexOf(str_(t)) >= 0; }
function roundTypes_() { return INT_TYPES_.concat(ASSESS_TYPES_); }

/** One plan round, cleaned. Safety is on by default for practical tests (shop floor). */
function cleanRound_(r, id) {
  var type = roundTypes_().indexOf(str_(r.type)) >= 0 ? str_(r.type) : 'OTHER';
  var safety = str_(r.safety) === 'Y' || (r.safety === undefined && type === 'PRACTICAL');
  return { id: id, name: str_(r.name).replace(/\s+/g, ' ').slice(0, 80) || ('جولة ' + id.slice(1)), type: type,
    req: INT_REQ_.indexOf(str_(r.req)) >= 0 ? str_(r.req) : 'REQUIRED',
    reconfirm: str_(r.reconfirm) === 'Y' ? 'Y' : '', safety: isAssessType_(type) && safety ? 'Y' : '' };
}

/* ---------------- round templates ---------------- */

function templateFor_(v) {
  var job = findOne_('JOBS', { Job_Code: v.Job_Code }) || {};
  var list = find_('ROUND_TEMPLATES', { Status: 'Active' });
  return list.filter(function (t) { return t.Scope_Type === 'JOB' && t.Scope_Value === v.Job_Code; })[0] ||
    list.filter(function (t) { return t.Scope_Type === 'FAMILY' && t.Scope_Value === job.Job_Family; })[0] || null;
}

/** The job's practical test from its JD (its own test, or a competency test), '' when none. */
function jdPracticalTest_(jobCode) {
  var d = jdApproved_(jobCode) || jdDraft_(jobCode);
  if (!d) return '';
  if (str_(d.Practical_Test)) return str_(d.Practical_Test);
  var tests = {}; all_('COMP_TESTS').forEach(function (t) { if (t.Status !== 'Inactive') tests[t.Comp_Code] = t; });
  var hit = jsonArr_(d.Competencies_JSON).filter(function (c) { return tests[c.c]; })[0];
  return hit ? tests[hit.c].Test_Name : '';
}

function roundTemplatesList_(ctx) {
  var fams = jobFamilies_(), names = userNames_();
  return { canEdit: hasAnyRole_(ctx, intManageRoles_()), families: fams,
    rows: find_('ROUND_TEMPLATES', {}).map(function (t) {
      var job = t.Scope_Type === 'JOB' ? findOne_('JOBS', { Job_Code: t.Scope_Value }) : null;
      return { Template_ID: t.Template_ID, Scope_Type: t.Scope_Type, Scope_Value: t.Scope_Value, Status: t.Status, Notes: t.Notes,
        scopeName: t.Scope_Type === 'JOB' ? (job ? job.Job_Title_AR + ' (' + t.Scope_Value + ')' : t.Scope_Value) : (fams[t.Scope_Value] || t.Scope_Value),
        rounds: jsonArr_(t.Rounds_JSON), by: names[t.Updated_By || t.Created_By] || '' };
    }),
    jobs: find_('JOBS', {}).filter(function (j) { return j.Status !== 'Inactive'; }).map(function (j) { return { code: j.Job_Code, name: j.Job_Title_AR, family: j.Job_Family }; }) };
}

/** p = { Template_ID?, Scope_Type: JOB|FAMILY, Scope_Value, rounds:[…], Notes, Status } */
function templateRoundsSave_(ctx, p) {
  var id = str_(p.Template_ID), cur = id ? findOne_('ROUND_TEMPLATES', { Template_ID: id }) : null;
  if (id && !cur) throw userError_('القالب غير موجود.');
  var st = str_(p.Scope_Type), sv = str_(p.Scope_Value);
  if (st === 'JOB') { if (!findOne_('JOBS', { Job_Code: sv })) throw userError_('اختار الوظيفة.'); }
  else if (st === 'FAMILY') { if (!jobFamilies_()[sv]) throw userError_('اختار العائلة الوظيفية.'); }
  else throw userError_('القالب لوظيفة ولا لعائلة وظيفية؟');
  var rounds = (Array.isArray(p.rounds) ? p.rounds : []).map(function (r, i) {
    if (str_(r.name).length < 3) throw userError_('اكتب اسم كل جولة.');
    if (roundTypes_().indexOf(str_(r.type)) < 0) throw userError_('اختار نوع الجولة.');
    return cleanRound_(r, 'R' + (i + 1));
  });
  if (!rounds.length) throw userError_('لازم جولة واحدة على الأقل.');
  if (rounds.length > 6) throw userError_('أقصى حاجة 6 جولات.');
  var status = str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active';
  if (status === 'Active' && find_('ROUND_TEMPLATES', { Scope_Type: st, Scope_Value: sv, Status: 'Active' }).some(function (t) { return t.Template_ID !== id; }))
    throw userError_('فيه قالب شغال لنفس ' + (st === 'JOB' ? 'الوظيفة' : 'العائلة') + ' — عدّله بدل ما تعمل جديد.');
  var f = { Scope_Type: st, Scope_Value: sv, Rounds_JSON: JSON.stringify(rounds), Notes: str_(p.Notes).slice(0, 300), Status: status }, out;
  withLock_(function () {
    if (cur) { var r = update_('ROUND_TEMPLATES', id, f, ctx.user.User_ID); auditDiff_(ctx, 'ROUND_TEMPLATE', id, r.before, r.after, ''); out = r.after; }
    else { f.Template_ID = nextId_('ROUND_TEMPLATE'); out = insert_('ROUND_TEMPLATES', f, ctx.user.User_ID); audit_(ctx, { entityType: 'ROUND_TEMPLATE', entityId: out.Template_ID, action: 'CREATE', newValue: st + ':' + sv }); }
  });
  return out;
}

/** The vacancy keeps the plan it had at its first interview (templates may change later). Runs inside a lock. */
function freezePlan_(v, actor) {
  if (str_(v.Plan_JSON)) return;
  update_('VACANCIES', v.Vacancy_ID, { Plan_JSON: JSON.stringify(planOf_(v)) }, actor);
}

/** One-time (v0.12.0): vacancies that already had interviews keep the plan they were using (the 0.11 default). */
function migrate0120_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATE_0120') === 'done') return;
  withLock_(function () {
    var has = {}; find_('INTERVIEWS', {}).forEach(function (iv) { has[iv.Vacancy_ID] = 1; });
    Object.keys(has).forEach(function (vid) {
      var v = findOne_('VACANCIES', { Vacancy_ID: vid });
      if (v && !str_(v.Plan_JSON)) update_('VACANCIES', vid, { Plan_JSON: JSON.stringify(configPlan_().map(function (r, i) { return cleanRound_(r, 'R' + (i + 1)); })) }, 'SYSTEM');
    });
  });
  props.setProperty('MIGRATE_0120', 'done');
}

/* ---------------- assessment guide, result, evidence ---------------- */

function assessGuide_(iv, v) {
  var d = jdApproved_(v.Job_Code) || jdDraft_(v.Job_Code), criteria = [];
  if (d) {
    var tests = {}; all_('COMP_TESTS').forEach(function (t) { if (t.Status !== 'Inactive') tests[t.Comp_Code] = t; });
    jdView_(d).comps.forEach(function (c) {
      if (c.code === 'PR02' && str_(d.Practical_Test)) criteria.push({ k: c.code, name: d.Practical_Test, comp: c.name, level: c.levelName, how: '', duration: '', pass: '', owner: '' });
      else if (tests[c.code]) { var t = tests[c.code]; criteria.push({ k: c.code, name: t.Test_Name, comp: c.name, level: c.levelName, how: t.Method, duration: t.Duration, pass: t.Pass_Criteria, owner: t.Owner }); }
    });
    if (!criteria.length && str_(d.Practical_Test)) criteria.push({ k: 'TEST', name: d.Practical_Test, comp: '', level: '', how: '', duration: '', pass: '', owner: '' });
  }
  return { kind: 'ASSESSMENT', type: iv.Round_Type, typeName: ASSESS_TYPE_AR_[iv.Round_Type] || '', criteria: criteria,
    safety: iv.Safety_Required === 'Y', safetyItems: SAFETY_ITEMS_.map(function (x) { return { k: x[0], t: x[1] }; }),
    comps: [], std: [], reqs: [], reqsRequired: false, jd: d ? { Version: d.Version, Status: d.Status } : null };
}

function evidenceFolder_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('EVIDENCE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ } }
  var f = getOrCreateFolder_().createFolder('Assessment evidence — أدلة الاختبارات');
  props.setProperty('EVIDENCE_FOLDER_ID', f.getId());
  return f;
}

/** Check uploads BEFORE anything is saved. files = [{ name, mime, data(base64) }] */
function evidenceCheck_(files) {
  return (Array.isArray(files) ? files : []).filter(function (x) { return x && x.data; }).map(function (x) {
    var mime = str_(x.mime).toLowerCase();
    if (EVIDENCE_MIME_.indexOf(mime) < 0) throw userError_('الدليل لازم يكون صورة (JPG / PNG) أو PDF.');
    var bytes = Utilities.base64Decode(str_(x.data));
    if (!bytes.length) throw userError_('الملف فاضي.');
    if (bytes.length > CV_MAX_BYTES_) throw userError_('حجم الملف أكبر من 5 ميجا.');
    mime = uploadMime_(bytes, EVIDENCE_MIME_);
    if (!mime) throw userError_('الدليل لازم يكون صورة (JPG / PNG) أو PDF.');
    return { bytes: bytes, mime: mime, name: str_(x.name).slice(0, 80) || 'evidence' };
  });
}
function evidenceSave_(ivId, checked) {
  return checked.map(function (c) {
    var file = evidenceFolder_().createFile(Utilities.newBlob(c.bytes, c.mime, ivId + ' — ' + c.name.replace(/[\\\/:*?"<>|]/g, '_')));
    return { id: file.getId(), name: c.name, mime: c.mime };
  });
}

/** Clean an assessment result against its guide; files carried from the draft + new uploads. */
function assessClean_(p, guide, prev, uploaded) {
  var okK = {}; guide.criteria.forEach(function (c) { okK[c.k] = 1; });
  var crit = (Array.isArray(p.crit) ? p.crit : []).filter(function (x) { return okK[str_(x.k)]; }).map(function (x) {
    var r = str_(x.r);
    if (r && ['PASS', 'FAIL'].indexOf(r) < 0) throw userError_('نتيجة البند: ناجح أو راسب.');
    return { k: str_(x.k), r: r, n: str_(x.n).slice(0, 600) };
  });
  var added = (Array.isArray(p.added) ? p.added : []).filter(function (x) { return str_(x.q); }).slice(0, 10).map(function (x) {
    var r = str_(x.r);
    return { q: str_(x.q).slice(0, 200), r: ['PASS', 'FAIL'].indexOf(r) >= 0 ? r : '', n: str_(x.n).slice(0, 600) };
  });
  var score = latinDigits_(p.Score).trim();
  if (score !== '' && (!/^\d{1,3}$/.test(score) || Number(score) > 100)) throw userError_('الدرجة من 0 لـ 100.');
  var keep = Array.isArray(p.keepFiles) ? p.keepFiles.map(str_) : null;
  var files = (prev.files || []).filter(function (f) { return !keep || keep.indexOf(f.id) >= 0; }).concat(uploaded || []);
  if (files.length > 6) throw userError_('أقصى حاجة 6 ملفات دليل.');
  return { crit: crit, added: added, score: score, files: files };
}

function assessValidate_(data, f, guide) {
  if (ASSESS_RESULTS_.indexOf(f.Recommendation) < 0) throw userError_('اختار نتيجة الاختبار: ناجح، راسب، أو محتاج إعادة.');
  var byK = {}; data.crit.forEach(function (c) { byK[c.k] = c; });
  guide.criteria.forEach(function (c) { if (!byK[c.k] || !byK[c.k].r) throw userError_('حدد نتيجة بند «' + c.name + '».'); });
  if (!guide.criteria.length && !data.added.length && f.Recommendation !== 'RETEST') throw userError_('اكتب على الأقل بند واحد اتقيّم (مفيش بنود في الوصف الوظيفي).');
  if (f.Recommendation !== 'PASS' && str_(f.Summary).length < 10) throw userError_('اكتب سبب ' + (f.Recommendation === 'FAIL' ? 'الرسوب' : 'الإعادة') + ' في الملاحظات.');
  if (f.Recommendation === 'PASS' && str_(f.Summary).length < 3) throw userError_('اكتب ملاحظاتك على أداء المرشح.');
}

/** p = { Interview_ID, File_ID } — an evidence file, for people who can open the interview. */
function intFile_(ctx, p) {
  var iv = ivGet_(p.Interview_ID);
  ivAccess_(ctx, iv);
  var id = str_(p.File_ID), meta = null;
  find_('EVALUATIONS', { Interview_ID: iv.Interview_ID }).forEach(function (e) {
    (evalData_(e).files || []).forEach(function (f) { if (f.id === id) meta = f; });
  });
  if (!meta) throw userError_('الملف غير موجود.');
  var blob = DriveApp.getFileById(id).getBlob();
  audit_(ctx, { entityType: 'INTERVIEW', entityId: iv.Interview_ID, action: 'EVIDENCE_VIEW', newValue: meta.name });
  return { name: meta.name, mime: meta.mime || blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- reminders: hourly job (2 hours before) ---------------- */

var HOURLY_HANDLER_ = 'hourlyTrigger';

function hourlyTrigger(e) {
  requireTriggerOrEditor_(e);
  ensureUpgraded_();
  return hourlyRun_();
}

/** Panel reminder ~2 hours before; the organizer is reminded to message a candidate who has not confirmed. */
function hourlyRun_() {
  if (!PropertiesService.getScriptProperties().getProperty(SS_PROP.CORE)) return { skipped: true };
  // v0.35.0: nothing to remind about at night (interviews are in working hours) — HOURLY_QUIET_HOURS, default 22–6
  var qh = /^(\d{1,2})-(\d{1,2})$/.exec(str_(cfg_('HOURLY_QUIET_HOURS', '22-6'))), hr = Number(nowIso_().slice(11, 13));
  if (qh && (Number(qh[1]) > Number(qh[2]) ? (hr >= Number(qh[1]) || hr < Number(qh[2])) : (hr >= Number(qh[1]) && hr < Number(qh[2])))) return { night: true };
  var today = today_(), now = nowIso_(), out = { reminded: 0 };
  if (isWeekend_(today)) return { weekend: true };
  find_('INTERVIEWS', { Date: today }).forEach(function (iv) {
    if (['MANAGER_CONFIRMED', 'CANDIDATE_PENDING', 'CONFIRMED'].indexOf(iv.Status) < 0 || iv.Reminded_2H_At) return;
    var mins = minutesBetween_(now, ivStart_(iv));
    if (mins === null || mins < 0 || mins > 150) return;
    var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
    var line = per.Full_Name + ' — ' + iv.Round_Name + ' — ' + ivLine_(iv);
    notify_(panelOf_(iv.Interview_ID).map(function (x) { return x.User_ID; }), 'تذكير: ' + (iv.Kind === 'ASSESSMENT' ? 'اختبار' : 'مقابلة') + ' كمان ساعتين', line, 'INTERVIEW', iv.Interview_ID, false);
    if (iv.Status !== 'CONFIRMED' || (iv.Reconfirm_Required === 'Y' && !iv.Reconfirmed_At))
      notify_([iv.Organizer_ID], 'المرشح لسه مأكدش — كلّمه قبل المعاد', line, 'INTERVIEW', iv.Interview_ID, false);
    // v0.39.0 (INT-003): a confirmed candidate gets a short e-mail about two hours before; the organizer is reminded of his preferred channel
    if (iv.Status === 'CONFIRMED') {
      var sent2 = candidateReminder_(iv, true);
      notify_([iv.Organizer_ID], 'فكّر المرشح بالمعاد — كمان ساعتين', line + (per.Preferred_Channel ? ' · يفضّل ' + (PREF_CHANNELS_[per.Preferred_Channel] || '') : '') + (sent2 ? ' · اتبعتله إيميل تذكير' : ''), 'INTERVIEW', iv.Interview_ID, false);
    }
    withLock_(function () { update_('INTERVIEWS', iv.Interview_ID, { Reminded_2H_At: now }, 'SYSTEM'); });
    out.reminded++;
  });
  try { flushAudit_(); } catch (e) { /* nothing */ }
  return out;
}

/** The working day before: an email to the candidate (when he has one), in his language. */
function candidateReminder_(iv, twoHours) {
  if (!cfg_('INTERVIEW_REMIND_CANDIDATE', true) || (twoHours ? iv.Cand_Reminded_2H_At : iv.Cand_Reminded_At)) return false;
  var per = findOne_('PERSONS', { Person_ID: iv.Person_ID }) || {};
  if (!per.Email || !mailOk_('CANDIDATE')) return false;
  var lang = per.Language === 'en' ? 'en' : 'ar';
  var t = findOne_('MESSAGE_TEMPLATES', { Template_ID: 'INTERVIEW_REMINDER-' + lang }) || findOne_('MESSAGE_TEMPLATES', { Template_ID: 'INTERVIEW_REMINDER-ar' });
  if (!t || t.Status !== 'Active') return false;
  var v = findOne_('VACANCIES', { Vacancy_ID: iv.Vacancy_ID }) || {}, title = v.Vacancy_ID ? vacTitle_(v) : { ar: '', en: '' };
  var lead = findOne_('USERS', { User_ID: iv.Lead_User_ID }) || {}, org = findOne_('USERS', { User_ID: iv.Organizer_ID }) || {};
  var map = { name: per.Full_Name, job: lang === 'en' && title.en ? title.en : title.ar, location: locName_(v.Location_ID, lang), company: lang === 'en' ? 'Kandil Egypt' : 'قنديل مصر',
    recruiter: lang === 'en' && org.Full_Name_EN ? org.Full_Name_EN : org.Full_Name_AR || '', date: iv.Date, time: iv.Time, place: ivPlaceText_(iv, lang),
    interviewer: lang === 'en' && lead.Full_Name_EN ? lead.Full_Name_EN : lead.Full_Name_AR || '' };
  function fill(s) { return str_(s).replace(/\{(name|job|location|company|recruiter|date|time|place|interviewer)\}/g, function (m, k) { return map[k] || ''; }); }
  try {
    // v0.35.0: marked «sent» only when the e-mail really left
    if (!sendMail_({ to: per.Email, subject: fill(t.Subject), name: lang === 'en' ? 'Kandil Egypt Careers' : 'قنديل مصر — التوظيف',
      htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' + escHtml_(fill(t.Body)).replace(/\n/g, '<br>') + '</div>' })) return false;
    mailSent_();
  } catch (e) { console.warn('candidate reminder failed: ' + e); return false; }
  withLock_(function () {
    update_('INTERVIEWS', iv.Interview_ID, twoHours ? { Cand_Reminded_2H_At: nowIso_() } : { Cand_Reminded_At: nowIso_() }, 'SYSTEM');
    var a = findOne_('APPLICATIONS', { Application_ID: iv.Application_ID });
    if (a) activity_('SYSTEM', a, 'EMAIL', { Template_Code: 'INTERVIEW_REMINDER', Note: (twoHours ? 'تذكير قبل المقابلة بساعتين بالإيميل: ' : 'تذكير أوتوماتيك بالإيميل: ') + iv.Round_Name + ' — ' + ivLine_(iv) });
  });
  return true;
}

/* ---------------- interviewer analytics (calibration only) ---------------- */

/** p = { from, to } (interview dates) */
function intAnalytics_(ctx, p) {
  p = p || {};
  var from = str_(p.from) || addDaysIso_(-180).slice(0, 10), to = str_(p.to) || today_(), names = userNames_();
  var ivs = {}; find_('INTERVIEWS', {}).forEach(function (iv) { if (iv.Kind !== 'ASSESSMENT' && iv.Date >= from && iv.Date <= to) ivs[iv.Interview_ID] = iv; });
  var by = {}, all = { n: 0, t: 0, mid: 0, cnt: [0, 0, 0, 0, 0], delay: 0, dn: 0 };
  function row(u) { return by[u] = by[u] || { User_ID: u, name: names[u] || u, evals: 0, ratings: 0, sum: 0, mid: 0, dist: [0, 0, 0, 0, 0], recs: {}, delay: 0, dn: 0, late: 0,
    led: 0, declined: 0, noShow: 0, waitSum: 0, waitN: 0 }; }
  find_('EVALUATIONS', { Status: 'SUBMITTED' }).forEach(function (e) {
    var iv = ivs[e.Interview_ID]; if (!iv) return;
    var r = row(e.Evaluator_ID), d = evalData_(e);
    r.evals++; r.recs[e.Recommendation] = (r.recs[e.Recommendation] || 0) + 1;
    if (e.Late === 'Y') r.late++;
    if (iv.Completed_At && e.Submitted_At) { var h = (workMinutesBetween_(iv.Completed_At, e.Submitted_At) || 0) / 60; if (h >= 0) { r.delay += h; r.dn++; all.delay += h; all.dn++; } }
    (d.comps || []).forEach(function (c) {
      var n = num_(c.r, 0); if (n < 1 || n > 5) return;
      r.ratings++; r.sum += n; r.dist[n - 1]++; if (n === 3) r.mid++;
      all.n++; all.t += n; all.cnt[n - 1]++; if (n === 3) all.mid++;
    });
  });
  Object.keys(ivs).forEach(function (id) {
    var iv = ivs[id]; if (!iv.Lead_User_ID) return;
    var r = row(iv.Lead_User_ID);
    r.led++;
    if (iv.Status === 'MANAGER_DECLINED') r.declined++;
    if (iv.Status === 'MANAGER_NO_SHOW') r.noShow++;
    var w = ivEvidence_(iv, eventsFor_('INTERVIEW', id)).filter(function (x) { return x.k === 'WAIT'; })[0];
    if (w && w.min !== null) { r.waitSum += w.min; r.waitN++; }
  });
  var rows = Object.keys(by).map(function (k) {
    var r = by[k];
    return { User_ID: r.User_ID, name: r.name, evals: r.evals, ratings: r.ratings, avg: r.ratings ? Math.round(r.sum / r.ratings * 10) / 10 : null,
      midShare: r.ratings ? Math.round(r.mid / r.ratings * 100) : null, dist: r.dist, recs: r.recs, delayH: r.dn ? Math.round(r.delay / r.dn * 10) / 10 : null, late: r.late,
      led: r.led, declined: r.declined, noShow: r.noShow, waitMin: r.waitN ? Math.round(r.waitSum / r.waitN) : null };
  }).sort(function (a, b) { return b.evals - a.evals || b.led - a.led; });
  return { from: from, to: to, rows: rows,
    company: { ratings: all.n, avg: all.n ? Math.round(all.t / all.n * 10) / 10 : null, midShare: all.n ? Math.round(all.mid / all.n * 100) : null, dist: all.cnt,
      delayH: all.dn ? Math.round(all.delay / all.dn * 10) / 10 : null } };
}
