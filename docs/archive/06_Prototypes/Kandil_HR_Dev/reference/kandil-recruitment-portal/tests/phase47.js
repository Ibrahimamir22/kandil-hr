// v0.44.4 (CHG-95): a failed upgrade is never silent — the system owner gets one e-mail per version with the reference
// and the first line of the error, and users see a clear message with that reference instead of «unexpected error».
const { ctx, mails, props, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const VER = vm.runInContext('APP.VERSION', ctx);
const realMig = vm.runInContext('migrate0440_', ctx);

// a deploy whose upgrade breaks (as in production: a migration writing a column the table does not have)
vm.runInContext("migrate0440_ = function () { throw new Error('ONB_TASKS: unknown column Kind\\n    at update_(Repo:540:39)'); };", ctx);
props.SCHEMA_APP_VERSION = '0.44.3'; delete props.UPGRADE_FAIL_MAILED;
mails.length = 0;
let r = pub('auth.requestCode', { email: 'owner@test.com' });
const ref = (/رقم المرجع: ([0-9a-f]{8})/.exec(r.error || '') || [])[1];
ok(!r.ok && /مشكلة في التحديث/.test(r.error) && /مدير النظام اتبلّغ/.test(r.error) && ref, 'the user sees the clear message with a reference: ' + r.error);
ok(!/خطأ غير متوقع/.test(r.error), 'not the generic «unexpected error»');
let alert = mails.filter(m => m.to === 'owner@test.com' && /فشل/.test(m.subject));
ok(alert.length === 1, 'the system owner got one e-mail');
ok(alert[0] && alert[0].subject.indexOf(ref) >= 0 && alert[0].subject.indexOf(VER) >= 0, 'the e-mail names the version and the same reference');
ok(alert[0] && /ONB_TASKS: unknown column Kind/.test(alert[0].htmlBody) && !/Repo:540/.test(alert[0].htmlBody), 'the e-mail carries the first line of the error only');
ok(!mails.some(m => m.to === 'owner@test.com' && /\d{6}/.test(m.htmlBody || '') && /كود/.test(m.subject || '')), 'no sign-in code was sent (the request stopped at the upgrade)');
ok(props.SCHEMA_APP_VERSION === '0.44.3', 'the version is not recorded as upgraded');

// every next request: the same clear message, but no second e-mail for this version
mails.length = 0;
r = pub('auth.requestCode', { email: 'owner@test.com' });
ok(!r.ok && /مدير النظام اتبلّغ/.test(r.error), 'the next request: the same clear message');
ok(!mails.some(m => /فشل/.test(m.subject || '')), 'no second e-mail for the same version');
fresh(); r = ctx.api('me', 'x', {});
ok(!r.ok && /مدير النظام اتبلّغ/.test(r.error), 'signed-in actions get it too');

// a «please wait» style error from the upgrade passes through as it is, with no e-mail
vm.runInContext("migrate0440_ = function () { throw userError_('البوابة بتتحدّث لإصدار جديد دلوقتي — جرّب تاني بعد دقيقة.'); };", ctx);
delete props.UPGRADE_FAIL_MAILED; mails.length = 0;
r = pub('auth.requestCode', { email: 'owner@test.com' });
ok(!r.ok && /بتتحدّث/.test(r.error) && !mails.length, 'a user-facing message passes through, no e-mail');

// the fix is deployed: the upgrade completes and sign-in works
ctx.migrate0440_ = realMig; vm.runInContext('migrate0440_ = this.migrate0440_;', ctx);
mails.length = 0;
r = pub('auth.requestCode', { email: 'owner@test.com' });
ok(r.ok && props.SCHEMA_APP_VERSION === VER, 'after the fix: the upgrade completes and the sign-in code is sent: ' + (r.error || ''));

console.log('\nPhase 47 (failed upgrade alert): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
