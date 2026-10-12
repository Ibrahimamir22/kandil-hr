/**
 * JdReview.gs — v0.45.0 (CHG-96): manager review rounds for draft job descriptions.
 *   HR (owner, HR Sector Manager, HR Manager) opens a round on the drafts (all, or one family) with a due date; each
 *   job's reviewers are the holders of the position its positions report to. Each manager gets one e-mail listing his
 *   jobs (within the internal e-mail budget; the rest go with the next daily run) and an inbox item, reads each draft
 *   (never the grade — D-21) and answers «agree» or «notes». One reminder 2 working days before the due date.
 *   Managers never edit a JD; approval stays with HR.
 */
var JDR_DUE_WORKDAYS_ = 10, JDR_REMIND_WORKDAYS_ = 2, JDR_NOTE_MAX_ = 2000;

function jdrAddWorkDays_(ymd, n) {
  var ms = ymdMs_(ymd), off = weekendDays_();
  while (n > 0) { ms += 86400000; if (off.indexOf(new Date(ms).getUTCDay()) < 0) n--; }
  return new Date(ms).toISOString().slice(0, 10);
}

/** { users: [User_ID], missing: [title of a manager position with no account] } for one job. */
function jdrReviewers_(code) {
  var users = {}, missing = {};
  find_('POSITIONS', { Job_Code: code, Status: ['Active', 'Frozen'] }).forEach(function (p) {
    var up = probUp_(p.Position_ID);
    if (!up) return;
    var us = find_('USERS', { Position_ID: up, Status: 'Active' }).filter(function (u) { return !isDemoUser_(u); });
    if (us.length) { us.forEach(function (u) { users[u.User_ID] = 1; }); return; }
    var mp = get_('POSITIONS', up) || {}, mj = get_('JOBS', mp.Job_Code) || {}, mu = get_('ORG_UNITS', mp.Org_Unit_ID) || {};
    missing[up] = (str_(mp.Position_Title) || str_(mj.Job_Title_AR) || up) + (mu.Name_AR ? ' — ' + mu.Name_AR : '');
  });
  return { users: Object.keys(users), missing: Object.keys(missing).map(function (k) { return missing[k]; }) };
}

function jdrOpenRounds_() {
  var m = {};
  find_('JD_REVIEW_ROUNDS', { Status: 'OPEN' }).forEach(function (r) { m[r.Round_ID] = r; });
  return m;
}

/** p = { all: 'Y' | family: code, due: 'yyyy-mm-dd', preview: true } */
function jdrStart_(ctx, p) {
  var today = today_(), due = str_(p.due) || jdrAddWorkDays_(today, JDR_DUE_WORKDAYS_);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due <= today) throw userError_('آخر ميعاد للرد لازم يكون بعد النهارده.');
  var family = str_(p.family);
  if (!family && str_(p.all) !== 'Y') throw userError_('اختار كل المسودات أو عائلة وظيفية.');
  var drafts = {};
  find_('JOB_DESCRIPTIONS', { Status: 'Draft' }).forEach(function (d) {
    var j = get_('JOBS', d.Job_Code);
    if (!j || j.Status === 'Inactive' || (family && j.Job_Family !== family)) return;
    if (!drafts[d.Job_Code] || num_(d.Version, 0) > num_(drafts[d.Job_Code].Version, 0)) drafts[d.Job_Code] = d;
  });
  var open = jdrOpenRounds_(), already = {};
  where_('JD_REVIEWS', function (r) { return open[r.Round_ID] && r.Status === 'PENDING'; }).forEach(function (r) { already[r.JD_ID + '|' + r.Reviewer_User_ID] = 1; });
  var rows = [], reviewers = {}, noReviewer = [], skipped = 0, jobs = 0;
  Object.keys(drafts).sort().forEach(function (code) {
    var d = drafts[code], rv = jdrReviewers_(code), j = get_('JOBS', code), added = 0;
    if (!rv.users.length) { noReviewer.push({ code: code, title: j.Job_Title_AR, missing: rv.missing }); return; }
    rv.users.forEach(function (u) {
      if (already[d.JD_ID + '|' + u]) { skipped++; return; }
      rows.push({ Job_Code: code, JD_ID: d.JD_ID, JD_Version: d.Version, Reviewer_User_ID: u, Status: 'PENDING', Comment: '', Responded_At: '', Mailed_At: '', Reminded_At: '' });
      reviewers[u] = 1; added++;
    });
    if (added) jobs++;
  });
  var names = userNames_();
  var out = { drafts: Object.keys(drafts).length, jobs: jobs, reviewers: Object.keys(reviewers).length, rows: rows.length, skipped: skipped, due: due,
    noReviewer: noReviewer, reviewerNames: Object.keys(reviewers).map(function (u) { return names[u] || u; }).sort() };
  if (p.preview) return out;
  if (!rows.length) throw userError_('مفيش مسودات جديدة تتبعت للمراجعة' + (noReviewer.length ? ' — الوظايف الباقية مديرها مالوش حساب على البوابة.' : '.'));
  var roundId;
  withLock_(function () {
    roundId = nextId_('JDR_ROUND');
    insert_('JD_REVIEW_ROUNDS', { Round_ID: roundId, Scope: family ? 'FAMILY:' + family : 'ALL', Due_Date: due, Status: 'OPEN',
      Jobs: String(jobs), Reviewers: String(out.reviewers), Closed_At: '', Closed_By: '' }, ctx.user.User_ID);
    var ids = nextIds_('JD_REVIEW', rows.length);
    rows.forEach(function (r, i) { r.Review_ID = ids[i]; r.Round_ID = roundId; });
    insertMany_('JD_REVIEWS', rows, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'JD_REVIEW', entityId: roundId, action: 'START', newValue: jobs + ' jobs, ' + out.reviewers + ' reviewers, due ' + due });
  notify_(Object.keys(reviewers), 'أوصاف وظيفية مستنية مراجعتك', 'اقرا مسودات الوصف الوظيفي لوظايف إدارتك وقول رأيك قبل ' + due + '.', 'JDR', roundId, false);
  out.Round_ID = roundId;
  out.mailed = jdrMail_(false);
  return out;
}

/** Due e-mails: the first one per manager (within the budget), and one reminder 2 working days before the due date. */
function jdrMail_(remind) {
  var open = jdrOpenRounds_(), today = today_(), sent = 0;
  if (!Object.keys(open).length || !cfg_('EMAIL_APPROVALS', true)) return 0;
  var by = {};
  where_('JD_REVIEWS', function (r) {
    if (!open[r.Round_ID] || r.Status !== 'PENDING') return false;
    if (!remind) return !r.Mailed_At;
    var due = open[r.Round_ID].Due_Date;
    return !!r.Mailed_At && !r.Reminded_At && due >= today && workDaysBetween_(today, due) <= JDR_REMIND_WORKDAYS_;
  }).forEach(function (r) { (by[r.Reviewer_User_ID] = by[r.Reviewer_User_ID] || []).push(r); });
  var stamp = nowIso_();
  Object.keys(by).forEach(function (u) {
    var usr = get_('USERS', u);
    if (!usr || usr.Status !== 'Active' || !usr.Email) return;
    if (!mailOk_()) return;
    var list = by[u], lang = userLang_(usr), due = list.map(function (r) { return open[r.Round_ID].Due_Date; }).sort()[0];
    var items = list.map(function (r) { var j = get_('JOBS', r.Job_Code) || {}; return '<li>' + escHtml_(j.Job_Title_AR || r.Job_Code) + ' <span dir="ltr" style="color:#6F7B85">' + escHtml_(r.Job_Code) + '</span></li>'; }).join('');
    var title = remind ? 'تذكير: أوصاف وظيفية مستنية مراجعتك' : 'أوصاف وظيفية مستنية مراجعتك';
    try {
      sendMail_({ to: usr.Email, name: 'Kandil Recruitment Portal', subject: tr_(title + ' — بوابة التوظيف قنديل مصر', lang),
        htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' +
          '<b>' + escHtml_(tr_(title, lang)) + '</b><br>' +
          escHtml_(tr_('دي مسودات الوصف الوظيفي لوظايف إدارتك. اقرا كل وصف على البوابة وقول «موافق» أو «عندي ملاحظات».', lang)) +
          '<ul>' + items + '</ul>' + escHtml_(tr_('آخر ميعاد للرد', lang)) + ': <b dir="ltr">' + escHtml_(due) + '</b>' +
          '<br><br><span style="color:#6F7B85">' + escHtml_(tr_('افتح بوابة التوظيف ← «المطلوب منك».', lang)) + '</span></div>' });
      mailSent_(); sent++;
      withLock_(function () { list.forEach(function (r) { update_('JD_REVIEWS', r.Review_ID, remind ? { Reminded_At: stamp } : { Mailed_At: stamp }, 'SYSTEM'); }); });
    } catch (e) { console.warn('jd review mail: ' + e); }
  });
  return sent;
}
function jdrDaily_() { return { mailed: jdrMail_(false), reminded: jdrMail_(true) }; }

function jdrTodo_(ctx) {
  var open = jdrOpenRounds_(), me = ctx.user.User_ID, n = 0, soon = false, today = today_();
  if (!Object.keys(open).length) return null;
  where_('JD_REVIEWS', function (r) { return r.Reviewer_User_ID === me && r.Status === 'PENDING' && open[r.Round_ID]; }).forEach(function (r) {
    n++; if (workDaysBetween_(today, open[r.Round_ID].Due_Date) <= JDR_REMIND_WORKDAYS_) soon = true;
  });
  return n ? { n: n, soon: soon } : null;
}

/** The manager's own reviews in open rounds. */
function jdrMine_(ctx) {
  var open = jdrOpenRounds_(), me = ctx.user.User_ID;
  var rows = where_('JD_REVIEWS', function (r) { return r.Reviewer_User_ID === me && open[r.Round_ID]; }).map(function (r) {
    var j = get_('JOBS', r.Job_Code) || {};
    return { Review_ID: r.Review_ID, code: r.Job_Code, title: j.Job_Title_AR || r.Job_Code, version: r.JD_Version, status: r.Status,
      comment: r.Comment, at: r.Responded_At, due: open[r.Round_ID].Due_Date };
  });
  rows.sort(function (a, b) { return (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || (a.code < b.code ? -1 : 1); });
  return { rows: rows };
}

function jdrRow_(ctx, id, forAnswer) {
  var r = get_('JD_REVIEWS', str_(id));
  if (!r) throw userError_('المراجعة غير موجودة.');
  var mine = r.Reviewer_User_ID === ctx.user.User_ID;
  if (!mine && (forAnswer || !hasAnyRole_(ctx, HR_ALL_ROLES))) throw userError_('المراجعة دي مش ليك.');
  var round = get_('JD_REVIEW_ROUNDS', r.Round_ID) || {};
  if (mine && round.Status !== 'OPEN') throw userError_('جولة المراجعة دي اتقفلت.');
  return { r: r, round: round };
}

/** One draft for its reviewer — as it stands now, without the grade (D-21) or HR's internal notes. */
function jdrGet_(ctx, p) {
  var x = jdrRow_(ctx, p.Review_ID, false), r = x.r, d = get_('JOB_DESCRIPTIONS', r.JD_ID);
  if (!d) throw userError_('المسودة دي اتشالت.');
  var v = jdView_(d), j = get_('JOBS', r.Job_Code) || {};
  delete v.Confirm_Notes; delete v.Change_Reason;
  var fam = {}; try { fam = JSON.parse(cfg_('JOB_FAMILIES', '{}')); } catch (e) {}
  return { review: { Review_ID: r.Review_ID, status: r.Status, comment: r.Comment, at: r.Responded_At, due: x.round.Due_Date, open: x.round.Status === 'OPEN' },
    job: { Job_Code: r.Job_Code, title: j.Job_Title_AR, familyName: fam[j.Job_Family] || '', sites: jdSites_(r.Job_Code) }, jd: v };
}

/** p = { Review_ID, decision: OK | NOTES, comment } — the reviewer only, while the round is open. */
function jdrAnswer_(ctx, p) {
  var x = jdrRow_(ctx, p.Review_ID, true), dec = str_(p.decision), note = str_(p.comment).slice(0, JDR_NOTE_MAX_ + 1);
  if (dec !== 'OK' && dec !== 'NOTES') throw userError_('اختار «موافق» أو «عندي ملاحظات».');
  if (note.length > JDR_NOTE_MAX_) throw userError_('الملاحظات أطول من ' + JDR_NOTE_MAX_ + ' حرف.');
  if (dec === 'NOTES' && note.length < 5) throw userError_('اكتب ملاحظاتك.');
  var res;
  withLock_(function () { res = update_('JD_REVIEWS', x.r.Review_ID, { Status: dec, Comment: note, Responded_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'JD_REVIEW', entityId: x.r.Review_ID, action: dec, newValue: x.r.Job_Code });
  return { status: res.after.Status };
}

/** HR: the rounds, and one round's rows. */
function jdrStatus_(ctx, p) {
  var rounds = all_('JD_REVIEW_ROUNDS').slice().sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; });
  var id = str_(p.Round_ID) || (rounds[0] ? rounds[0].Round_ID : ''), names = userNames_(), fam = {};
  try { fam = JSON.parse(cfg_('JOB_FAMILIES', '{}')); } catch (e) {}
  var rows = id ? find_('JD_REVIEWS', { Round_ID: id }).map(function (r) {
    var j = get_('JOBS', r.Job_Code) || {};
    return { Review_ID: r.Review_ID, code: r.Job_Code, title: j.Job_Title_AR || r.Job_Code, version: r.JD_Version, reviewer: names[r.Reviewer_User_ID] || r.Reviewer_User_ID,
      status: r.Status, comment: r.Comment, at: r.Responded_At, mailed: r.Mailed_At, reminded: r.Reminded_At };
  }).sort(function (a, b) { return a.code < b.code ? -1 : a.code > b.code ? 1 : (a.reviewer < b.reviewer ? -1 : 1); }) : [];
  var count = { PENDING: 0, OK: 0, NOTES: 0 };
  rows.forEach(function (r) { count[r.status] = (count[r.status] || 0) + 1; });
  return { rounds: rounds.map(function (r) { return { Round_ID: r.Round_ID, scope: r.Scope.indexOf('FAMILY:') === 0 ? fam[r.Scope.slice(7)] || r.Scope.slice(7) : 'كل المسودات',
      due: r.Due_Date, status: r.Status, jobs: r.Jobs, reviewers: r.Reviewers, at: r.Created_At, closedAt: r.Closed_At }; }),
    Round_ID: id, rows: rows, count: count, canRun: hasAnyRole_(ctx, HR_ADMIN_ROLES), defaultDue: jdrAddWorkDays_(today_(), JDR_DUE_WORKDAYS_), families: fam };
}

function jdrClose_(ctx, p) {
  var r = get_('JD_REVIEW_ROUNDS', str_(p.Round_ID));
  if (!r) throw userError_('الجولة غير موجودة.');
  if (r.Status !== 'OPEN') throw userError_('الجولة مقفولة بالفعل.');
  withLock_(function () { update_('JD_REVIEW_ROUNDS', r.Round_ID, { Status: 'CLOSED', Closed_At: nowIso_(), Closed_By: ctx.user.User_ID }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'JD_REVIEW', entityId: r.Round_ID, action: 'CLOSE' });
  return { ok: true };
}
