/**
 * Presence.gs — v0.45.1 (CHG-98): who is online now and on which screen.
 *   Live only: each signed-in request leaves «user → screen name, time» in the script cache for 10 minutes. Only the
 *   screen's name (never the record inside it) and nothing is written to a sheet or a log, so there is no history.
 *   Seen by the system owner and the HR Sector Manager (and the read-only consultant).
 */
var PRES_TTL_ = 600, PRES_ONLINE_MIN_ = 6, PRES_VIEW_RE_ = /^[a-z][a-z0-9]{0,19}$/;

function presenceRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }

function presenceMark_(ctx, view) {
  try {
    if (!ctx || !ctx.user) return;
    // the page sends the screen only when it changes or once a minute (and with the 5-minute «still here»), so most
    // requests cost no cache call at all; a request without one leaves the last mark as it is
    if (view === undefined || view === null || view === '') return;
    var v = str_(view);
    if (!PRES_VIEW_RE_.test(v)) v = '';
    CacheService.getScriptCache().put('PRES_' + ctx.user.User_ID, JSON.stringify({ v: v, at: nowIso_() }), PRES_TTL_);
  } catch (e) {}
}

function presenceList_(ctx) {
  var users = where_('USERS', function (u) { return u.Status === 'Active'; }), got = {};
  try { got = CacheService.getScriptCache().getAll(users.map(function (u) { return 'PRES_' + u.User_ID; })) || {}; } catch (e) {}
  var cut = addMinutesIso_(-PRES_ONLINE_MIN_), rows = [];
  users.forEach(function (u) {
    var raw = got['PRES_' + u.User_ID], p = null;
    if (!raw) return;
    try { p = JSON.parse(raw); } catch (e) { return; }
    if (!p || !p.at || p.at < cut) return;
    var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null, job = pos ? get_('JOBS', pos.Job_Code) || {} : {};
    rows.push({ User_ID: u.User_ID, name: u.Full_Name_AR, job: pos ? (str_(pos.Position_Title) || str_(job.Job_Title_AR)) : '', view: p.v || '', at: p.at,
      me: u.User_ID === ctx.user.User_ID, demo: isDemoUser_(u) });
  });
  rows.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  return { rows: rows, now: nowIso_(), windowMin: PRES_ONLINE_MIN_ };
}
