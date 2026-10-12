// Phase 3B-1: sources, subscriptions (credits, usage, alerts), advertisements (text, statuses, credits, attribution, copy).
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const T = '\t';
const day = n => { const d = new Date(Date.now() + 3 * 3600000 + n * 864e5); return d.toISOString().slice(0, 10); };
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); const recM = user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة', '', ['RECRUITER']); user('rec2@t.com', 'علي', '', ['RECRUITER']);
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), rec2: login('rec2@t.com') };
const rq = must(api('req.submit', t.acc, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Experience_Years: '2',
  lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] }), 'request');
must(api('req.action', t.cfo, { Request_ID: rq.Request_ID, action: 'APPROVE' }), 'cfo');
const vacId = must(api('req.action', t.hr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }), 'hr').vacancies[0];
must(api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec }), 'assign');
must(api('vac.update', t.rm, { Vacancy_ID: vacId, action: 'OPEN' }), 'open vacancy');

// ---- sources
let L = must(api('src.list', t.rec, {}), 'src.list');
ok(L.sources.length === 13 && L.sources.some(s => s.Source_Code === 'WUZZUF' && s.Uses_Credits === 'Y'), 'sources seeded');
ok(L.adTemplates.length === 8, 'ad templates seeded: ' + L.adTemplates.length);
ok(L.canEdit === false, 'recruiter cannot edit sources');
bad(api('src.save', t.rec, { Source_Code: 'TIKTOK', Name_AR: 'تيك توك', isNew: true }), null, 'recruiter cannot add source');
must(api('src.save', t.rm, { Source_Code: 'tiktok', Name_AR: 'تيك توك', Name_EN: 'TikTok', Kind: 'SOCIAL', Has_Link: 'Y', isNew: true }), 'add source');
bad(api('src.save', t.rm, { Source_Code: 'TIKTOK', Name_AR: 'x', isNew: true }), /بنفس الكود/, 'duplicate source');
bad(api('src.save', t.rm, { Source_Code: 'CAREER_PAGE', Name_AR: 'x', Status: 'Inactive' }), /أساسي/, 'core source cannot stop');
fresh(); ok(ctx.sources_().TIKTOK === 'تيك توك', 'sources_ reads the table');

// ---- subscription
bad(api('sub.save', t.rm, { Source_Code: 'WUZZUF', Start_Date: day(10), End_Date: day(1) }), /قبل البداية/, 'end before start');
const sub = must(api('sub.save', t.rm, { Source_Code: 'WUZZUF', Package: 'باقة 2 إعلان', Start_Date: day(-30), End_Date: day(60), Ad_Credits: '2', CV_Credits: '50', Cost: '6000', Owner_User_ID: recM }), 'subscription');
L = must(api('src.list', t.rm, {}), 'list 2'); let S1 = L.subscriptions.find(s => s.Subscription_ID === sub.Subscription_ID);
ok(S1.live && S1.adLeft === 2 && S1.cvLeft === 50 && !S1.expiring, 'credits left');

// ---- ads
const adFb = must(api('ad.create', t.rec, { Vacancy_ID: vacId, Source_Code: 'FACEBOOK', Language: 'ar' }), 'ad facebook');
ok(/محاسب تكاليف/.test(adFb.Body) && /بكالوريوس تجارة/.test(adFb.Body) && /خبرة 2 سنين/.test(adFb.Body), 'ad text from request: ' + adFb.Body.slice(0, 80));
ok(adFb.Body.indexOf('&ad=' + adFb.Ad_ID) > 0 && /src=FACEBOOK/.test(adFb.Body), 'ad link in text');
ok(adFb.Status === 'DRAFT' && /^AD-\d{4}-\d{4}$/.test(adFb.Ad_ID), 'draft id');
const adEn = must(api('ad.create', t.rec, { Vacancy_ID: vacId, Source_Code: 'LINKEDIN', Language: 'en' }), 'ad linkedin en');
ok(/Kandil Egypt is hiring|Kandil Egypt/.test(adEn.Body) && /Bachelor of Commerce/.test(adEn.Body) && /At least 2 years/.test(adEn.Body), 'English ad text: ' + adEn.Body.slice(0, 120));
bad(api('ad.list', t.rec2, { Vacancy_ID: vacId }), null, 'other recruiter has no access');
bad(api('ad.status', t.rec, { Ad_ID: adFb.Ad_ID, to: 'PUBLISHED' }), /افتح التقديم/, 'publish needs open applications');
must(api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'Y' }), 'open apply');
const pFb = must(api('ad.status', t.rec, { Ad_ID: adFb.Ad_ID, to: 'PUBLISHED', Post_URL: 'https://facebook.com/x', Cost: '500' }), 'publish fb');
ok(pFb.Status === 'PUBLISHED' && pFb.Published_At && !pFb.Usage_ID, 'free platform: no credit');
bad(api('ad.status', t.rec, { Ad_ID: adFb.Ad_ID, to: 'DRAFT' }), /للحالة دي/, 'invalid move');
bad(api('ad.save', t.rec, { Ad_ID: adFb.Ad_ID, Post_URL: 'javascript:x' }), /http/, 'bad url');
const v2 = must(api('ad.save', t.rec, { Ad_ID: adFb.Ad_ID, Body: pFb.Body + '\nمواعيد العمل 8–4.' }), 'edit published');
ok(v2.Version === '2', 'published edit raises version');
// paid platform: credits
const w1 = must(api('ad.create', t.rec, { Vacancy_ID: vacId, Source_Code: 'WUZZUF', Language: 'ar' }), 'w1');
const w2 = must(api('ad.create', t.rec, { Vacancy_ID: vacId, Source_Code: 'WUZZUF', Language: 'en' }), 'w2');
const w3 = must(api('ad.create', t.rec, { Vacancy_ID: vacId, Source_Code: 'WUZZUF', Language: 'ar', Campaign: 'تجربة' }), 'w3');
const pw1 = must(api('ad.status', t.rec, { Ad_ID: w1.Ad_ID, to: 'PUBLISHED' }), 'publish w1');
ok(pw1.Subscription_ID === sub.Subscription_ID && pw1.Usage_ID, 'credit used');
must(api('ad.status', t.rec, { Ad_ID: w2.Ad_ID, to: 'READY' }), 'ready');
must(api('ad.status', t.rec, { Ad_ID: w2.Ad_ID, to: 'PUBLISHED' }), 'publish w2');
bad(api('ad.status', t.rec, { Ad_ID: w3.Ad_ID, to: 'PUBLISHED' }), /مفيش اشتراك/, 'no credits left');
const pw3 = must(api('ad.status', t.rec, { Ad_ID: w3.Ad_ID, to: 'PUBLISHED', noCredit: 'Y' }), 'publish without subscription');
ok(pw3.warn === 'noCredit' && /من غير اشتراك/.test(pw3.Status_Note), 'flagged');
must(api('ad.status', t.rec, { Ad_ID: w1.Ad_ID, to: 'PAUSED' }), 'pause');
const re = must(api('ad.status', t.rec, { Ad_ID: w1.Ad_ID, to: 'PUBLISHED' }), 'republish');
fresh(); ok(ctx.find_('SOURCE_USAGE', { Ref_ID: w1.Ad_ID }).length === 1, 'republish uses no extra credit');
L = must(api('src.list', t.rm, {}), 'list 3'); S1 = L.subscriptions.find(s => s.Subscription_ID === sub.Subscription_ID);
ok(S1.usedAds === 2 && S1.adLeft === 0, 'used 2 / left 0');
// attribution
fresh(); const code = ctx.find_('VACANCIES', { Vacancy_ID: vacId })[0].Apply_Code;
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3' };
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'أحمد علي حسن', Mobile: '01011112222', src: 'FACEBOOK', ad: adFb.Ad_ID })), 'apply via ad');
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'منى سامي', Mobile: '01022223333', src: 'WUZZUF', ad: 'AD-1999-0001' })), 'apply with unknown ad');
fresh(); const apps = ctx.find_('APPLICATIONS', { Vacancy_ID: vacId });
const a1 = apps.find(a => a.Ad_ID === adFb.Ad_ID); const a2 = apps.find(a => !a.Ad_ID);
ok(a1 && a1.Source === 'FACEBOOK', 'application attributed to the ad');
ok(a2 && a2.Source === 'WUZZUF', 'unknown ad ignored, source kept');
const AL = must(api('ad.list', t.rec, { Vacancy_ID: vacId }), 'ad.list');
const fbRow = AL.ads.find(a => a.Ad_ID === adFb.Ad_ID);
ok(fbRow.apps === 1 && fbRow.costPerApp === 500, 'ad applications and cost per application');
ok(AL.sources.some(s => s.code === 'WUZZUF' && s.creditsLeft === 0) && AL.applyOpen, 'platforms with credits left');
// copy
const cp = must(api('ad.copy', t.rec, { Ad_ID: adFb.Ad_ID, Source_Code: 'WHATSAPP' }), 'copy');
ok(cp.Status === 'DRAFT' && cp.Copied_From === adFb.Ad_ID && cp.Body.indexOf('&ad=' + cp.Ad_ID) > 0 && cp.Body.indexOf('&ad=' + adFb.Ad_ID) < 0, 'copy gets its own link');
fresh(); ok(ctx.find_('ADVERTISEMENTS', { Ad_ID: adFb.Ad_ID })[0].Status === 'PUBLISHED', 'original unchanged');
// manual usage + void
const u1 = must(api('usage.add', t.rec, { Subscription_ID: sub.Subscription_ID, Kind: 'CV_SEARCH', Units: '10', Note: 'بحث محاسبين' }), 'cv usage');
bad(api('usage.add', t.rec, { Subscription_ID: sub.Subscription_ID, Kind: 'CV_SEARCH', Units: '0', Note: 'xx x' }), /أكبر من صفر/, 'zero units');
bad(api('usage.void', t.rec, { Usage_ID: u1.Usage_ID, reason: 'غلط' }), null, 'recruiter cannot void');
must(api('usage.void', t.rm, { Usage_ID: u1.Usage_ID, reason: 'اتسجل غلط' }), 'void');
L = must(api('src.list', t.rm, {}), 'list 4'); S1 = L.subscriptions.find(s => s.Subscription_ID === sub.Subscription_ID);
ok(S1.cvLeft === 50, 'voided usage not counted');
// tasks: published ads on a vacancy that stopped applications
must(api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'N' }), 'close apply');
const tk = must(api('cand.tasks', t.rec, {}), 'tasks');
ok(tk.counts.adsClose === 4 && tk.adsClose.some(x => x.Ad_ID === adFb.Ad_ID), 'ads to take down: ' + tk.counts.adsClose);
must(api('ad.status', t.rec, { Ad_ID: adFb.Ad_ID, to: 'CLOSED', note: 'اتشال من فيسبوك' }), 'close ad');
bad(api('ad.save', t.rec, { Ad_ID: adFb.Ad_ID, Body: 'نص جديد طويل كفاية للتجربة' }), /مقفول/, 'closed ad not editable');
// daily check: expiring alert once, expired
const sub2 = must(api('sub.save', t.rm, { Source_Code: 'LINKEDIN', Package: 'Recruiter Lite', Start_Date: day(-300), End_Date: day(5), Ad_Credits: '0', CV_Credits: '30' }), 'sub2');
const sub3 = must(api('sub.save', t.rm, { Source_Code: 'WUZZUF', Package: 'قديم', Start_Date: day(-400), End_Date: day(30), Ad_Credits: '5' }), 'sub3');
fresh(); ctx.update_('SOURCE_SUBSCRIPTIONS', sub3.Subscription_ID, { End_Date: day(-1) }, 'x');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('SRC_DAILY','')", ctx);
mails.length = 0; must(api('todo', t.rm, {}), 'trigger daily');
fresh();
ok(ctx.find_('SOURCE_SUBSCRIPTIONS', { Subscription_ID: sub3.Subscription_ID })[0].Status === 'Expired', 'ended subscription expired');
const notes = ctx.find_('NOTIFICATIONS', { User_ID: recM }).filter(n => /LinkedIn/.test(n.Title));
ok(notes.length === 1 && /فاضل 0 إعلان و30 بحث/.test(notes[0].Body), 'expiry alert with unused credits');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('SRC_DAILY','')", ctx);
must(api('todo', t.rm, {}), 'trigger daily 2'); fresh();
ok(ctx.find_('NOTIFICATIONS', { User_ID: recM }).filter(n => /LinkedIn/.test(n.Title)).length === 1, 'alert sent once');
// audit
fresh(); ok(ctx.find_('AUDIT_LOG', { Entity_Type: 'AD' }).length >= 8, 'ads audited');

console.log('\n' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
