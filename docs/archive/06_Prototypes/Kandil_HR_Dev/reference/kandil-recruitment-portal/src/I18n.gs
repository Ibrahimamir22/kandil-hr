/**
 * I18n.gs — interface language (Arabic / English).
 *
 * The interface is written in Arabic. English is a translation layer: I18nDict.gs (generated from
 * i18n/en.json) maps every Arabic text the portal shows to English. The browser translates the screen
 * after it is drawn (same matching rules as i18nTranslator_ below); the server uses the same rules for
 * emails. Master data (units, jobs, locations, roles, reasons, user names) shows its English name when
 * one is filled in, otherwise the Arabic name.
 *
 * Language of a user = USERS.Lang if set (and users may choose), else CONFIG DEFAULT_LANG.
 */

function defaultLang_() {
  var v = str_(cfg_('DEFAULT_LANG', 'ar'));
  return v === 'en' ? 'en' : 'ar';
}

function userLang_(user) {
  var own = user ? str_(user.Lang) : '';
  return own === 'en' || own === 'ar' ? own : defaultLang_();
}

function langChoiceAllowed_(ctx) {
  if (cfg_('USER_LANG_CHOICE', true)) return true;
  return !!(ctx && hasAnyRole_(ctx, HR_ADMIN_ROLES));
}

/** p = { lang: 'ar' | 'en' } — the signed-in user's own interface language. */
function meSetLang_(ctx, p) {
  var lang = str_(p.lang);
  if (['ar', 'en'].indexOf(lang) < 0) throw userError_('لغة غير معروفة.');
  if (!langChoiceAllowed_(ctx)) throw userError_('تغيير اللغة بيتعمل من الموارد البشرية.');
  withLock_(function () { update_('USERS', ctx.user.User_ID, { Lang: lang }, ctx.user.User_ID); });
  return { lang: lang };
}

/** Public: the English dictionary. The browser caches it by version. p = { v } (cached version, optional). */
function i18nDict_(p) {
  // sent as text: google.script.run refuses object keys ending with "_" (e.g. «التقييم: ____»)
  if (p && str_(p.v) === I18N_VERSION) return { v: I18N_VERSION, same: true };
  return { v: I18N_VERSION, json: i18nEnText_() };
}

/** Values the page needs before sign-in: default language, whether users may switch, dictionary version. */
function i18nBoot_() {
  var out = { def: 'ar', choice: true, v: I18N_VERSION };
  try { out.def = defaultLang_(); out.choice = !!cfg_('USER_LANG_CHOICE', true); } catch (e) { /* not installed yet */ }
  return JSON.stringify(out).replace(/</g, '\\u003c');
}

/** Master data names: Arabic name -> English name ('' when no English name is filled in: shown as is). */
function enNames_() {
  var m = {};
  // English names typed in the data win; otherwise the official list (EnNamesDict.gs), matched ignoring أ/ا, ة/ه, ى/ي and spaces
  var off = {}, k;
  if (typeof EN_JOB_NAMES !== 'undefined') { for (k in EN_JOB_NAMES) off[arKey_(k)] = EN_JOB_NAMES[k]; for (k in EN_UNIT_NAMES) off[arKey_(k)] = EN_UNIT_NAMES[k]; }
  function put(ar, en) {
    ar = str_(ar); en = str_(en); if (!ar) return;
    if (!en || en === ar) en = off[arKey_(ar)] || '';
    if (en) m[ar] = en; else if (!(ar in m)) m[ar] = '';
  }
  var jobEn = {};
  all_('ORG_UNITS').forEach(function (u) { put(u.Name_AR, u.Name_EN); });
  all_('LOCATIONS').forEach(function (l) { put(l.Name_AR, l.Name_EN); });
  all_('JOBS').forEach(function (j) { put(j.Job_Title_AR, j.Job_Title_EN); jobEn[j.Job_Code] = m[str_(j.Job_Title_AR)] || ''; });
  all_('POSITIONS').forEach(function (p) { put(p.Position_Title, jobEn[p.Job_Code] || ''); });
  all_('ROLES').forEach(function (r) { put(r.Role_Name_AR, r.Role_Name_EN); });
  all_('REASON_MASTER').forEach(function (r) { put(r.Label_AR, r.Label_EN); });
  all_('USERS').forEach(function (u) { put(u.Full_Name_AR, u.Full_Name_EN); });
  try { all_('COMPETENCIES').forEach(function (c) { put(c.Name_AR, c.Name_EN); }); } catch (e) { /* older install */ }
  try { all_('SCREEN_QUESTIONS').forEach(function (q) { put(q.Text_AR, q.Text_EN); }); } catch (e) { /* older install */ }
  try { all_('INTERVIEW_QUESTIONS').forEach(function (q) { put(q.Text_AR, q.Text_EN); }); } catch (e) { /* older install */ }
  return m;
}

/**
 * Translator shared in spirit with the browser copy in Index.html (keep both in step).
 * Order: exact text → text without trailing punctuation → patterns with {0} slots (slots translated
 * recursively) → known phrases inside the text, accepted only when no Arabic is left.
 */
function i18nTranslator_(dict, names) {
  dict = dict || {};
  /* TRANSLATOR-BODY (identical copy in Index.html makeTranslator) */
  var AR = /[ء-ي]/, D = {}, KNOWN = {}, P = [], frag = [];
  function rx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function words(s) { return s.trim().split(/\s+/).length; }
  Object.keys(dict).forEach(function (k) {
    var v = dict[k]; D[k] = v;
    if (/\{[A-Za-z0-9_]+\}/.test(k)) {
      // "{0}text" / "text{0}" also cover the bare text (the slot is usually an icon or markup)
      var bare = k.replace(/^(\s*\{\d+\}\s*)+|(\s*\{\d+\}\s*)+$/g, '');
      if (bare && !/\{\d+\}/.test(bare) && !(bare in dict)) D[bare] = v.replace(/^(\s*\{\d+\}\s*)+|(\s*\{\d+\}\s*)+$/g, '');
      if (/\{\d+\}/.test(k)) {
        var ids = [];
        var src = '^' + k.split(/(\{\d+\})/).map(function (part) {
          var m = /^\{(\d+)\}$/.exec(part);
          if (m) { ids.push(m[1]); return '([\\s\\S]*?)'; }
          return rx(part);
        }).join('') + '$';
        var lit = k.replace(/\{\d+\}/g, ' ').replace(/[^ء-ي\s]/g, ' ').trim();
        // loose = the fixed Arabic part is distinctive (2+ words): an untranslated short slot (a name) is accepted
        if (ids.length && k.replace(/\{\d+\}/g, '').replace(/\s/g, '').length >= 1) P.push({ re: new RegExp(src), ids: ids, en: v, w: k.length, loose: lit ? words(lit) >= 2 : false });
      }
    } else if (k.length >= 3) frag.push(k);
  });
  // master data: Arabic name -> English name ('' = no English name: keep the Arabic name as data)
  var NK = {};
  function nkey(s) { return s.replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/\u0649/g, '\u064A').replace(/[\u0624\u0626]/g, '\u0621').replace(/\u0640/g, '').replace(/\s+/g, ''); }
  Object.keys(names || {}).forEach(function (k) { KNOWN[k] = 1; if (names[k]) { NK[nkey(k)] = names[k]; if (!D.hasOwnProperty(k)) D[k] = names[k]; } });
  P.sort(function (a, b) { return b.w - a.w; });
  frag.sort(function (a, b) { return b.length - a.length; });
  var FR = frag.length ? new RegExp('(^|[^\\u0621-\\u064A])(' + frag.map(rx).join('|') + ')(?![\\u0621-\\u064A])', 'g') : null;
  var SEP = /(\s+—\s+|\s+·\s+|\s+‹\s+|\s+›\s+|:\s+|\s+\/\s+|،\s+)/;
  var PUN = { '؟': '?', '،': ',', '؛': ';' };
  function slot(g, loose, depth) {
    if (!AR.test(g)) return g;
    var c = g.trim();
    if (!loose && /^[—·‹›،:\/]|[—·‹›،:\/]$/.test(c)) return null;   // a short pattern must not cut a list of parts
    var r = core(c, depth + 1);
    if (r === null) { if (KNOWN[c] || (loose && words(c) <= 6)) r = c; else return null; }
    return g.replace(c, r);
  }
  function core(s, depth) {
    if (!AR.test(s)) return s;
    if (D.hasOwnProperty(s)) return D[s];
    var nk = NK[nkey(s)]; if (nk) return nk;
    if (KNOWN[s] || depth > 5) return null;
    var m = /^([\s\S]*?)([\s:.…*؟?!،,؛;)·]+)$/.exec(s), r;
    if (m && m[1]) { r = core(m[1], depth + 1); if (r !== null) return r + m[2].replace(/[؟،؛]/g, function (c) { return PUN[c]; }); }
    m = /^([\s—–\-·•(«"]+)([\s\S]+)$/.exec(s);
    if (m) { r = core(m[2], depth + 1); if (r !== null) return m[1] + r; }
    for (var i = 0; i < P.length; i++) {
      var x = P[i].re.exec(s);
      if (!x) continue;
      var out = P[i].en, ok = true;
      for (var j = 0; j < P[i].ids.length; j++) {
        var tt = slot(x[j + 1], P[i].loose, depth);
        if (tt === null) { ok = false; break; }
        out = out.split('{' + P[i].ids[j] + '}').join(tt);
      }
      if (ok) return out;
    }
    if (SEP.test(s)) {
      var parts = s.split(SEP), bad = false;
      parts = parts.map(function (p, n) {
        if (n % 2) return p.replace('‹', '›').replace('،', ',');
        var q = slot(p, false, depth); if (q === null) bad = true; return q;
      });
      if (!bad) return parts.join('');
    }
    if (FR) { r = s.replace(FR, function (all, pre, w) { return pre + D[w]; }); if (r !== s && !AR.test(r)) return r; }
    return null;
  }
  return function (s) {
    if (s === null || s === undefined) return s;
    s = String(s);
    if (!AR.test(s)) return s;
    var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    var r = core(s.trim().replace(/\s+/g, ' '), 0);
    return r === null ? s : lead + r.replace(/[«»]/g, '"') + trail;
  };
}

var I18N_SERVER_TR_ = null;
/** Translate one server text for a language (used for emails). */
function tr_(s, lang) {
  if (lang !== 'en') return s;
  if (!I18N_SERVER_TR_) {
    var names = {};
    try { names = enNames_(); } catch (e) { names = {}; }
    I18N_SERVER_TR_ = i18nTranslator_(i18nEn_(), names);
  }
  return I18N_SERVER_TR_(s);
}

/* ---------------- English names for jobs and units (filled only where empty) ---------------- */

function arKey_(s) {
  return str_(s).replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/\u0649/g, '\u064A')
    .replace(/[\u0624\u0626]/g, '\u0621').replace(/\u0640/g, '').replace(/[\s\-\u2013\u2014]+/g, '').toLowerCase();
}
/** Run from setupSystem: Job_Title_EN / Name_EN stay as typed when already filled. */
function enNames071_() {
  if (typeof EN_JOB_NAMES === 'undefined') return;
  var jm = {}, um = {}, k;
  for (k in EN_JOB_NAMES) jm[arKey_(k)] = EN_JOB_NAMES[k];
  for (k in EN_UNIT_NAMES) um[arKey_(k)] = EN_UNIT_NAMES[k];
  var jobs = all_('JOBS').filter(function (j) { return !str_(j.Job_Title_EN) && jm[arKey_(j.Job_Title_AR)]; });
  var units = all_('ORG_UNITS').filter(function (u) { return !str_(u.Name_EN) && um[arKey_(u.Name_AR)]; });
  if (!jobs.length && !units.length) return;
  withLock_(function () {
    jobs.forEach(function (j) { update_('JOBS', j.Job_Code, { Job_Title_EN: jm[arKey_(j.Job_Title_AR)] }, 'SYSTEM'); });
    units.forEach(function (u) { update_('ORG_UNITS', u.Org_Unit_ID, { Name_EN: um[arKey_(u.Name_AR)] }, 'SYSTEM'); });
  });
  console.log('English names filled: ' + jobs.length + ' jobs, ' + units.length + ' units');
}
