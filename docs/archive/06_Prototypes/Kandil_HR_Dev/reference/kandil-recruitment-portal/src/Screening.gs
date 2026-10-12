/**
 * Screening.gs — Phase 3B-3 (v0.10.0): screening question library and per-vacancy questions (blueprint 9.3, 10.1).
 *
 *   • SCREEN_QUESTIONS is the library (Arabic + English text, answer type, options).
 *   • A vacancy picks questions (VACANCIES.Questions_JSON): required or not, INFO or KNOCKOUT with its pass rule.
 *     The public form never receives the pass rules.
 *   • Answers are stored on the application with the question text as asked. A failed knockout flags
 *     "mandatory requirement not met" for a person to review — nothing is rejected or hidden automatically.
 */

var Q_TYPES_ = ['YES_NO', 'CHOICE', 'NUMBER', 'TEXT'];

function questionEditRoles_() { return candAllRoles_(); }

function defaultQuestions_() {
  return [
    ['هل عندك استعداد للشغل بنظام الورديات؟', 'Are you willing to work in shifts?', 'YES_NO', []],
    ['هل تقدر تلتزم بالحضور يومياً في مكان العمل المذكور؟', 'Can you commit to working daily at the stated location?', 'YES_NO', []],
    ['كام سنة خبرة عندك في نفس المجال بالظبط؟', 'How many years of experience do you have in this exact field?', 'NUMBER', []],
    ['هل معاك رخصة قيادة سارية؟', 'Do you hold a valid driving licence?', 'YES_NO', []],
    ['موقفك من التجنيد؟', 'Military service status?', 'CHOICE', [['DONE', 'أدّاها', 'Completed'], ['EXEMPT', 'معفى', 'Exempt'], ['POSTPONED', 'مؤجل', 'Postponed'], ['NA', 'لا ينطبق', 'Not applicable']]],
    ['إيه أقرب منطقة لسكنك؟', 'Which area do you live in?', 'TEXT', []]
  ];
}

/** Seed the library once (only when it is empty). */
function seedQuestions_() {
  if (all_('SCREEN_QUESTIONS').length) return;
  var q = defaultQuestions_();
  var ids = nextIds_('SCREEN_Q', q.length);
  insertMany_('SCREEN_QUESTIONS', q.map(function (x, i) {
    return { Question_ID: ids[i], Text_AR: x[0], Text_EN: x[1], Answer_Type: x[2],
      Options_JSON: JSON.stringify(x[3].map(function (o) { return { v: o[0], ar: o[1], en: o[2] }; })), Family: '', Sort_Order: String((i + 1) * 10), Status: 'Active' };
  }), 'SYSTEM');
}

function qOptions_(q) { try { var a = JSON.parse(q.Options_JSON || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function vacQuestions_(v) { try { var a = JSON.parse(v.Questions_JSON || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

/* ---------------- library ---------------- */

function questionsList_(ctx) {
  return { canEdit: hasAnyRole_(ctx, questionEditRoles_()), families: jobFamilies_(),
    rows: find_('SCREEN_QUESTIONS', {}).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); })
      .map(function (q) { q.options = qOptions_(q); return q; }) };
}

/** p = { Question_ID?, Text_AR, Text_EN, Answer_Type, options:[{v,ar,en}], Family, Sort_Order, Status } */
function questionSave_(ctx, p) {
  var id = str_(p.Question_ID), cur = id ? findOne_('SCREEN_QUESTIONS', { Question_ID: id }) : null;
  if (id && !cur) throw userError_('السؤال غير موجود.');
  var ar = str_(p.Text_AR).replace(/\s+/g, ' ');
  if (ar.length < 5) throw userError_('اكتب السؤال بالعربي.');
  var type = cur ? cur.Answer_Type : str_(p.Answer_Type);       // the type never changes: older answers stay readable
  if (Q_TYPES_.indexOf(type) < 0) throw userError_('اختار نوع الإجابة.');
  var opts = [];
  if (type === 'CHOICE') {
    var seen = {};
    (p.options || []).forEach(function (o, i) {
      var oar = str_(o.ar); if (!oar) return;
      var v = str_(o.v).toUpperCase().replace(/[^A-Z0-9_]/g, '') || ('O' + (i + 1));
      if (seen[v]) v = v + '_' + (i + 1);
      seen[v] = 1;
      opts.push({ v: v, ar: oar, en: str_(o.en) });
    });
    if (opts.length < 2) throw userError_('اكتب اختيارين على الأقل.');
  }
  var fam = str_(p.Family);
  if (fam && !jobFamilies_()[fam]) throw userError_('العائلة الوظيفية غير موجودة.');
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  var fields = { Text_AR: ar, Text_EN: str_(p.Text_EN), Answer_Type: type, Options_JSON: JSON.stringify(opts), Family: fam, Status: status };
  if (/^\d{1,4}$/.test(str_(p.Sort_Order))) fields.Sort_Order = str_(p.Sort_Order);
  return withLock_(function () {
    if (!cur) {
      fields.Question_ID = nextId_('SCREEN_Q');
      fields.Sort_Order = fields.Sort_Order || String((all_('SCREEN_QUESTIONS').length + 1) * 10);
      var row = insert_('SCREEN_QUESTIONS', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'SCREEN_QUESTION', entityId: row.Question_ID, action: 'CREATE', newValue: ar });
      return row;
    }
    var res = update_('SCREEN_QUESTIONS', cur.Question_ID, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'SCREEN_QUESTION', cur.Question_ID, res.before, res.after, '');
    return res.after;
  });
}

/* ---------------- per vacancy ---------------- */

/** p = { Vacancy_ID, questions:[{ id, required:'Y'|'N', kind:'INFO'|'KNOCKOUT', pass }] }
 *  pass: YES_NO → 'Y'|'N' · CHOICE → [accepted values] · NUMBER → minimum · TEXT → never a knockout. */
function vacancyQuestionsSet_(ctx, p) {
  var v = findOne_('VACANCIES', { Vacancy_ID: p.Vacancy_ID });
  if (!v) throw userError_('الشاغر غير موجود.');
  requireVacancyFull_(ctx, v);
  var out = [], seen = {};
  (p.questions || []).slice(0, 15).forEach(function (x) {
    var q = findOne_('SCREEN_QUESTIONS', { Question_ID: str_(x.id) });
    if (!q || q.Status !== 'Active' || seen[q.Question_ID]) return;
    seen[q.Question_ID] = 1;
    var kind = str_(x.kind) === 'KNOCKOUT' ? 'KNOCKOUT' : 'INFO', pass = '';
    if (kind === 'KNOCKOUT') {
      if (q.Answer_Type === 'YES_NO') { pass = str_(x.pass) === 'N' ? 'N' : 'Y'; }
      else if (q.Answer_Type === 'CHOICE') {
        var valid = qOptions_(q).map(function (o) { return o.v; });
        pass = (Array.isArray(x.pass) ? x.pass : []).map(str_).filter(function (c) { return valid.indexOf(c) >= 0; });
        if (!pass.length) throw userError_('حدد الإجابات المقبولة في سؤال: ' + q.Text_AR);
      } else if (q.Answer_Type === 'NUMBER') {
        pass = latinDigits_(x.pass).trim();
        if (!/^\d{1,3}(\.\d)?$/.test(pass)) throw userError_('حدد أقل رقم مقبول في سؤال: ' + q.Text_AR);
      } else throw userError_('السؤال المفتوح مايبقاش شرط أساسي: ' + q.Text_AR);
    }
    out.push({ id: q.Question_ID, required: str_(x.required) === 'N' && kind !== 'KNOCKOUT' ? 'N' : 'Y', kind: kind, pass: pass });
  });
  var res;
  withLock_(function () { res = update_('VACANCIES', v.Vacancy_ID, { Questions_JSON: JSON.stringify(out) }, ctx.user.User_ID); });
  auditDiff_(ctx, 'VACANCY', v.Vacancy_ID, res.before, res.after, 'أسئلة الفرز');
  return vacancyQuestionsView_(res.after, true);
}

/** Questions of a vacancy for display. withRules = recruiters (knockout rules); false = the public form. */
function vacancyQuestionsView_(v, withRules) {
  return vacQuestions_(v).map(function (x) {
    var q = findOne_('SCREEN_QUESTIONS', { Question_ID: x.id });
    if (!q) return null;
    var o = { id: q.Question_ID, ar: q.Text_AR, en: q.Text_EN || q.Text_AR, type: q.Answer_Type, options: qOptions_(q), required: x.required === 'Y' };
    if (withRules) { o.kind = x.kind; o.pass = x.pass; }
    return o;
  }).filter(Boolean);
}

/**
 * Check and evaluate answers. answers = { Question_ID: value }. strict = every required question must be answered.
 * Returns { json, failed:[text], missing:[text] }.
 */
function evalAnswers_(v, answers, strict, lang) {
  answers = answers || {};
  var stored = [], failed = [], missing = [];
  vacQuestions_(v).forEach(function (x) {
    var q = findOne_('SCREEN_QUESTIONS', { Question_ID: x.id });
    if (!q) return;
    var raw = answers[x.id], a = str_(Array.isArray(raw) ? raw.join(',') : raw).slice(0, 300);
    if (q.Answer_Type === 'NUMBER' && a !== '') { a = latinDigits_(a).replace(/[^\d.]/g, ''); if (!/^\d{1,3}(\.\d+)?$/.test(a)) a = ''; }
    if (q.Answer_Type === 'YES_NO' && a !== '' && ['Y', 'N'].indexOf(a) < 0) a = '';
    if (q.Answer_Type === 'CHOICE' && a !== '' && !qOptions_(q).some(function (o) { return o.v === a; })) a = '';
    if (a === '') { if (x.required === 'Y') missing.push(lang === 'en' ? (q.Text_EN || q.Text_AR) : q.Text_AR); stored.push({ q: x.id, t: q.Text_AR, a: '', ko: x.kind === 'KNOCKOUT' }); return; }
    var pass = true;
    if (x.kind === 'KNOCKOUT') {
      if (q.Answer_Type === 'YES_NO') pass = a === x.pass;
      else if (q.Answer_Type === 'CHOICE') pass = (x.pass || []).indexOf(a) >= 0;
      else if (q.Answer_Type === 'NUMBER') pass = Number(a) >= Number(x.pass);
      if (!pass) failed.push(q.Text_AR);
    }
    var shown = q.Answer_Type === 'YES_NO' ? (a === 'Y' ? 'نعم' : 'لا')
      : q.Answer_Type === 'CHOICE' ? (qOptions_(q).filter(function (o) { return o.v === a; })[0] || {}).ar : a;
    stored.push({ q: x.id, t: q.Text_AR, a: a, s: shown, ko: x.kind === 'KNOCKOUT', ok: pass });
  });
  if (strict && missing.length) {
    throw userError_((lang === 'en' ? 'Please answer: ' : 'جاوب على: ') + missing.join(lang === 'en' ? ', ' : '، '));
  }
  return { json: stored.length ? JSON.stringify(stored) : '', failed: failed, missing: missing };
}

/** Patch for an application from evaluated answers (keeps a human review already given when nothing new failed). */
function knockoutPatch_(ev, app) {
  var flag = ev.failed.length ? 'Y' : '';
  var patch = { Answers_JSON: ev.json, Knockout_Flag: flag, Knockout_Detail: ev.failed.join(' · ') };
  if (!flag || (app && app.Knockout_Detail !== patch.Knockout_Detail)) { patch.Knockout_Review = ''; patch.Knockout_Reviewed_By = ''; patch.Knockout_Reviewed_At = ''; }
  return patch;
}

/** p = { Application_ID, answers } — the recruiter records the answers (phone call, walk-in). */
function appAnswers_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  var ev = evalAnswers_(L.vac, p.answers || {}, false, 'ar');
  var patch = knockoutPatch_(ev, a), res;
  withLock_(function () {
    res = update_('APPLICATIONS', a.Application_ID, patch, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: 'اتسجلت إجابات أسئلة الفرز' + (ev.failed.length ? ' — شرط أساسي مش متحقق: ' + ev.failed.join('، ') : '') });
  });
  return res.after;
}

/** p = { Application_ID, note } — a person reviewed the failed knockout and decided the candidate continues. */
function knockoutReview_(ctx, p) {
  var L = loadApp_(ctx, p.Application_ID, true), a = L.app;
  if (a.Knockout_Flag !== 'Y') throw userError_('مفيش شرط أساسي محتاج مراجعة.');
  var note = str_(p.note);
  if (note.length < 3) throw userError_('اكتب ليه المرشح يكمّل رغم الشرط.');
  withLock_(function () {
    update_('APPLICATIONS', a.Application_ID, { Knockout_Review: 'CONTINUE', Knockout_Reviewed_By: ctx.user.User_ID, Knockout_Reviewed_At: nowIso_() }, ctx.user.User_ID);
    activity_(ctx.user.User_ID, a, 'SYSTEM', { Note: 'اتراجع الشرط الأساسي (' + a.Knockout_Detail + ') — يكمّل: ' + note });
  });
  audit_(ctx, { entityType: 'APPLICATION', entityId: a.Application_ID, action: 'KNOCKOUT_REVIEW', reason: note });
  return { ok: true };
}

/** Readable answers for the candidate page. */
function answersView_(a) {
  try { var x = JSON.parse(a.Answers_JSON || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}
