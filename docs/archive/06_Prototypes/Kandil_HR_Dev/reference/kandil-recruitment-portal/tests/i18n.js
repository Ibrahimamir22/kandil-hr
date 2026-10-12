// Interface language: dictionary, translator rules, per-user language, admin controls, English emails.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');

// ---- dictionary + translator rules
const tr = ctx.i18nTranslator_(ctx.i18nEn_());
ok(Object.keys(ctx.i18nEn_()).length > 1800, 'dictionary size');
ok(tr('الطلبات') === 'Requests', 'exact');
ok(tr('  الطلبات \n') === '  Requests \n', 'keeps surrounding spaces');
ok(tr('البريد الإلكتروني:') === 'Email:', 'trailing punctuation');
ok(tr('اتعتمد 3 من 5') === '3 of 5 approved', 'pattern with numbers: ' + tr('اتعتمد 3 من 5'));
ok(tr('صباح الخير') === 'Good morning', 'greeting word');
ok(tr('طلب جديد') === 'New request', 'bare text of an icon pattern: ' + tr('طلب جديد'));
ok(tr('محمد أحمد علي') === 'محمد أحمد علي', 'unknown names untouched');
ok(tr('مدير الإدارة المالية والخزينة') === 'مدير الإدارة المالية والخزينة', 'partial translation rejected (no mixed text)');
ok(tr('POS-000152') === 'POS-000152', 'non-Arabic untouched');
const NAMES = { 'القطاع المالي': 'Finance Sector', 'الحسابات': 'Accounts', 'محاسب تكاليف': '' };
const trN = ctx.i18nTranslator_(ctx.i18nEn_(), NAMES);
ok(trN('اتصلت من الصبح') === 'اتصلت من الصبح', 'free text not mangled by a short pattern: ' + trN('اتصلت من الصبح'));
ok(trN('30 د') === '30 min', 'short unit pattern: ' + trN('30 د'));
ok(trN('— القطاع المالي') === '— Finance Sector', 'leading dash + data name: ' + trN('— القطاع المالي'));
ok(trN('القطاع المالي ‹ الحسابات') === 'Finance Sector › Accounts', 'breadcrumb: ' + trN('القطاع المالي ‹ الحسابات'));
ok(trN('مدير الإدارة — الحسابات') === 'Department manager — Accounts', 'segments: ' + trN('مدير الإدارة — الحسابات'));
ok(trN('متقدم جديد على محاسب تكاليف') === 'New applicant for محاسب تكاليف', 'data name without English kept in pattern: ' + trN('متقدم جديد على محاسب تكاليف'));
ok(trN('تعديل — محاسب تكاليف') === 'Edit — محاسب تكاليف', 'known data in short pattern: ' + trN('تعديل — محاسب تكاليف'));
ok(trN('قسم: الحسابات') === 'Section: Accounts', 'label: value');
ok(trN('من الموقع · وردية ثابتة') === 'On site · Fixed shift', 'list of parts not swallowed by a short pattern: ' + trN('من الموقع · وردية ثابتة'));
ok(trN('انقله لمرحلة «تم التواصل»') === 'Move to "Contacted"', 'guillemets become quotes: ' + trN('انقله لمرحلة «تم التواصل»'));
ok(trN('مشروع تجديد الصالة الكبيرة') === 'مشروع تجديد الصالة الكبيرة', 'unknown sentence untouched: ' + trN('مشروع تجديد الصالة الكبيرة'));
// the browser copy of the translator is identical to the server copy
const fs = require('fs'), path = require('path');
const body = f => { const s = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'); const a = s.indexOf('TRANSLATOR-BODY'); return s.slice(s.indexOf('\n', a), s.indexOf('\n}\n', a)).replace(/\s+/g, ' '); };
ok(body('I18n.gs') === body('Index.html'), 'translator copies identical');
const bad = Object.keys(ctx.i18nEn_()).filter(k => tr(k) === k && ctx.i18nEn_()[k] !== k);
ok(bad.length === 0, 'every key translates: ' + bad.slice(0, 3).join(' | '));

// ---- public dictionary with version cache
const d1 = must(pub('i18n', {}), 'i18n dict');
const d1en = JSON.parse(d1.json);
ok(d1.v === ctx.I18N_VERSION && d1en['الطلبات'] === 'Requests' && d1en['التقييم: ____'], 'dict served as text');
const d2 = must(pub('i18n', { v: d1.v }), 'i18n same');
ok(d2.same === true && !d2.json, 'same version → no body');
const boot = JSON.parse(ctx.i18nBoot_());
ok(boot.def === 'ar' && boot.choice === true && boot.v === d1.v, 'boot values');

// ---- per-user language
let me = must(api('me', tO, {}), 'me');
ok(me.lang === 'ar' && me.langChoice === true && me.defaultLang === 'ar', 'default Arabic');
must(api('me.setLang', tO, { lang: 'en' }), 'set en');
me = must(api('me', tO, {}), 'me 2'); ok(me.lang === 'en', 'user chose English');
ok(!api('me.setLang', tO, { lang: 'fr' }).ok, 'unknown language refused');

// admin sets another user's language; default + switch control
const u = must(api('users.save', tO, { Email: 'm@t.com', Full_Name_AR: 'مستخدم تجربة', Full_Name_EN: 'Test User' }), 'user');
const tU = login('m@t.com');
ok(must(api('me', tU, {}), 'me u').lang === 'ar', 'new user follows default');
must(api('config.update', tO, { Config_Key: 'DEFAULT_LANG', Config_Value: 'en', reason: 'test' }), 'default en');
ok(must(api('me', tU, {}), 'me u2').lang === 'en', 'default English applies');
ok(!api('config.update', tO, { Config_Key: 'DEFAULT_LANG', Config_Value: 'fr', reason: 'test' }).ok, 'default must be ar/en');
must(api('users.save', tO, Object.assign({}, u, { Lang: 'ar', reason: 'x' })), 'admin sets Arabic');
ok(must(api('me', tU, {}), 'me u3').lang === 'ar', 'own setting beats default');
must(api('config.update', tO, { Config_Key: 'USER_LANG_CHOICE', Config_Value: 'N', reason: 'test' }), 'choice off');
const meU = must(api('me', tU, {}), 'me u4');
ok(meU.langChoice === false, 'switch hidden for normal users');
ok(!api('me.setLang', tU, { lang: 'en' }).ok, 'normal user cannot switch when off');
ok(must(api('me', tO, {}), 'me o').langChoice === true, 'HR admin can still switch');

// ---- English master data names
const lk = must(api('lookups', tO, {}), 'lookups'); lk.enNames = JSON.parse(lk.enNamesJson);
ok(lk.enNames['مستخدم تجربة'] === 'Test User', 'user English name in names map');
ok(Object.keys(lk.enNames).some(k => lk.enNames[k] === 'HR manager' || /HR/.test(lk.enNames[k])), 'role English names present');

// ---- emails in the user's language
mails.length = 0; pub('auth.requestCode', { email: 'owner@test.com' });
ok(/Sign-in code/.test(mails[0].subject) && /dir="ltr"/.test(mails[0].htmlBody) && /Valid for 10 minutes/.test(mails[0].htmlBody), 'English sign-in email: ' + mails[0].subject);
mails.length = 0;
fresh(); ctx.notify_([u.User_ID, ctx.findUserByEmail_('owner@test.com').User_ID], 'طلبك اتعتمد 🎉', 'افتح بوابة التوظيف للمتابعة.', 'REQUEST', 'X', true);
const toOwner = mails.filter(m => m.to === 'owner@test.com')[0], toU = mails.filter(m => m.to === 'm@t.com')[0];
ok(toOwner && /Your request was approved/.test(toOwner.subject) && /Kandil Egypt Recruitment Portal/.test(toOwner.subject), 'English notification email: ' + (toOwner && toOwner.subject));
ok(toU && /طلبك اتعتمد/.test(toU.subject) && /dir="rtl"/.test(toU.htmlBody), 'Arabic notification email for Arabic user');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.Title === 'طلبك اتعتمد 🎉'), 'notification stored in Arabic (translated on screen)');

// English names for jobs and units: filled where empty, typed names kept
fresh();
ctx.insert_('JOBS', { Job_Code: 'ACC-901', Job_Title_AR: 'محاسب  تكاليف', Job_Title_EN: '', Job_Family: 'ACC', Status: 'Active' }, 'x');
ctx.insert_('JOBS', { Job_Code: 'ACC-902', Job_Title_AR: 'مدير الإنتاج', Job_Title_EN: 'Head of Production (typed)', Job_Family: 'ACC', Status: 'Active' }, 'x');
ctx.insert_('JOBS', { Job_Code: 'ACC-903', Job_Title_AR: 'رئيس قطاع الموارد البشرية', Job_Title_EN: '', Job_Family: 'HRM', Status: 'Active' }, 'x');
ctx.insert_('ORG_UNITS', { Org_Unit_ID: 'OU-9901', Name_AR: 'الشئون القانونية', Name_EN: '', Unit_Type: 'DEPARTMENT', Status: 'Active' }, 'x');
ctx.enNames071_(); fresh();
ok(ctx.get_('JOBS', 'ACC-901').Job_Title_EN === 'Cost Accountant', 'job English name filled (spacing ignored)');
ok(ctx.get_('JOBS', 'ACC-902').Job_Title_EN === 'Head of Production (typed)', 'typed English name kept');
ok(ctx.get_('JOBS', 'ACC-903').Job_Title_EN === 'Chief Human Resources Officer', 'ة/ه spelling difference matched');
ok(ctx.get_('ORG_UNITS', 'OU-9901').Name_EN === 'Legal Affairs', 'unit English name filled');
// names: official list used even before the data is filled, positions follow their job, spelling variants match
fresh();
ctx.insert_('JOBS', { Job_Code: 'HRM-950', Job_Title_AR: 'رئيس قطاع الموارد البشريه', Job_Title_EN: '', Job_Family: 'HRM', Status: 'Active' }, 'x');
ctx.insert_('POSITIONS', { Position_ID: 'POS-950001', Job_Code: 'HRM-950', Position_Title: 'رئيس قطاع  الموارد البشرية', Status: 'Active' }, 'x');
ctx.insert_('JOBS', { Job_Code: 'HRM-951', Job_Title_AR: 'وظيفة تجربة', Job_Title_EN: 'Trial Job', Job_Family: 'HRM', Status: 'Active' }, 'x');
ctx.insert_('POSITIONS', { Position_ID: 'POS-950002', Job_Code: 'HRM-951', Position_Title: 'وظيفة تجربه خاصة', Status: 'Active' }, 'x');
fresh(); const nm = ctx.enNames_();
ok(nm['رئيس قطاع الموارد البشريه'] === 'Chief Human Resources Officer', 'official list used when data is empty');
ok(nm['رئيس قطاع  الموارد البشرية'] === 'Chief Human Resources Officer', 'position title follows its job');
ok(nm['وظيفة تجربه خاصة'] === 'Trial Job', 'custom position title gets its job English name');
const trM = ctx.i18nTranslator_(ctx.i18nEn_(), { 'اخصائي تطوير مؤسسي': 'Organization Development Specialist' });
ok(trM('أخصائي تطوير مؤسسي') === 'Organization Development Specialist', 'spelling variant matched on screen: ' + trM('أخصائي تطوير مؤسسي'));
// Google's google.script.run refuses any object key that ends with "_": check what the page receives
function badKeys(o, path, out) {
  if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (/_$/.test(k)) out.push(path + '.' + k); badKeys(o[k], path + '.' + k, out); });
  return out;
}
['me', 'lookups', 'req.options', 'todo'].forEach(a => { const r = api(a, tO, {}); ok(r.ok && badKeys(r.data, a, []).length === 0, 'transport-safe keys in ' + a + ': ' + badKeys(r.data, a, []).slice(0, 3).join(', ')); });
ok(badKeys(pub('i18n', {}).data, 'i18n', []).length === 0, 'transport-safe keys in i18n');
console.log('\n' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
