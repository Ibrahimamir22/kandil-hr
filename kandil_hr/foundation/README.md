# Opt-in HR foundation

Both `kandil_pilot_enabled` and `kandil_foundation_enabled` must be true on a
dedicated parity site. No automatic grants are issued. Existing review/main sites
retain their earlier behaviour. Administrator is a documented break-glass bypass;
do not use it as permission-test evidence.

## Scope model

System Managers create immutable Kandil Access Grants with company, optional
department and optional branch, effective dates, reason, and separate manage /
sensitive-data capabilities. Blank department/branch means an explicit broad
grant, not an automatic role entitlement. Revoke and replace instead of editing.
The next command queries current grants, without a cached allow decision.

Grants constrain native permissions; they never confer native roles. Every line
of a multi-location hiring request must be covered. A branch-only grant cannot
authorize a company-level organization operation. API command handlers must check
the request scope before entering the internal transition context. Native links,
lists, reports and exports need both query and document hooks.

`hr_permission` follows native recruitment links to the originating request.
Unlinked Applicant/Interview records fail closed. Compensation scope currently
restricts the entire Job Offer document, not selected fields. General per-field
salary/medical/identity redaction and the whole installed HRMS surface are not
certified by these hooks. Native standard reports/raw SQL endpoints require a
separate report-by-report privacy audit.

## Required integration hooks

- Hiring requests and recruitment events already use `pilot.permissions`.
- Capacity/route/delegation and company-bearing organization documents:
  `security.scoped_permission`, `security.validate_scoped_document`, and a
  `security.scope_query(doctype, user)` wrapper. Named pilot wrappers are in
  `foundation.queries`.
- Employee, Opening, Applicant, Offer, Interview, Feedback:
  `security.hr_permission`, `security.validate_hr_document`, and named query
  wrappers in `foundation.queries`.
- User validate: `security.validate_user_security`; on_update:
  `security.user_security_audit`.
- File validate: `security.validate_private_file`; has_permission:
  `security.file_permission`; permission_query_conditions: `security.file_query`
  (keeps native attachment permission checks and limits protected file metadata).
- Employee Onboarding also uses native HR document/validate hooks and the
  `queries.employee_onboarding` list hook, following its linked Employee.
- Optional scheduler: `outbox.process_pending`. This sends no external messages.

The Security Policy Single records authentication decisions and review ownership.
It does **not** switch on MFA, prove enrollment, or implement external identity.
Sensitive User role/enabled/email/IP changes require System Manager and create
application-protected security events without passwords or old/new secret values.
Events remain editable by a database administrator; cryptographic tamper evidence,
privacy-redaction history, retention/backup lifecycle and dual-control account
approval are not implemented.

## Reliable local notifications

`outbox.enqueue(key, recipient, subject, body, reference_doctype, reference_name)`
is server-only. Call inside the business transaction; do not commit separately.
Reusing a key with different content is rejected. A User row serializes first
inserts for a recipient. Workers lock the outbox row, create a Notification Log,
and record completion in the same database transaction. Failed transactions roll
back both; five failed attempts enter Failed state. An already-disabled existing
recipient creates a Suppressed outbox row at enqueue instead of aborting the HR
transaction; a nonexistent recipient remains a configuration error. Disabled recipients or revoked
reference access are Suppressed, never labelled delivered. Content is HTML escaped.
No outbound email, SMS, WhatsApp, provider credentials or external effects exist.
The status deliberately says **Delivered locally**. External adapters and webhook
delivery evidence remain future work. Final failed records currently need an
operator review. System Managers have a reason-required Retry Local Notification
button for Failed records. Suppressed or completed records cannot be resurrected.
Retry requests produce an audit event and increment the operator retry counter.

## Business time

`calendar.add_working_days` accepts an explicit start date, weekend weekdays and
holiday dates. Default Friday/Saturday is an example workweek, not a legal claim.
`business_calendar.company_deadline(company, start, days, calendar_name=None)`
and `company_working_days(company, start, end=None, calendar_name=None)` read the
native company calendar and Holiday List. Both exclude the start date and include
the end date. `None` start/deadline or end/elapsed means the current Cairo date.
An explicit calendar must belong to the supplied company; automatic selection
requires exactly one company calendar. Missing/ambiguous configuration fails
closed. A linked Holiday List must cover the full period; a blank Holiday List is
an explicit weekend-only schedule. Annual rollover is not inferred.

These internal, non-whitelisted helpers assume the calling command has already
authorized the relevant business record. They intentionally do not require a
department-scoped recruiter to read the System Manager-only calendar form.
`models.working_deadline` retains its native calendar read permission check.

`clock.now_cairo()` returns an aware datetime; `today_cairo()` returns a date.
`clock.test_clock(aware_datetime)` supplies a nested, exception-safe test override
only when both site `allow_tests` and server `frappe.flags.in_test` are enabled,
and no HTTP request is active. The flag is request-local server state, never a
form/query parameter. It changes neither audit timestamps nor access-grant
expiry. Tests must explicitly mark their trusted server test context. These
helpers do not enable automatic rejection or any scheduled business action.

## Verification boundary

`test_calendar` is pure Python. `test_security` tests rule decisions with mocks;
it does not establish real HTTP permission boundaries. Run the root parity site's
role, list/detail/file/export and outbox retry tests before claiming acceptance.

## Native bypass controls and conservative policy defaults

Candidate details, lists and exports require current recruiter team membership,
or the configured company HR/sector authority with the matching role and full
request management scope. Offers additionally require sensitive-data access.
Opening metadata remains scope-readable for allocation. Team membership grants
no mutation right by itself; read-only access remains read-only. Only the explicit
company HR/sector authorities may allocate a team. Disabled or unauthorized stored
leads are shown as effectively unassigned without transferring ownership. These
are deployment defaults pending HR acceptance, not claimed source-policy approval.

Native Frappe direct shares can override permission hooks and query conditions.
`files.validate_share` denies new shares for protected HR records, their child
rows, and their files. `files.purge_protected_shares` removes existing bypassing
shares on opted-in parity sites and records only an audit count. This migration
must run before claiming revocation works for legacy shared records.

`FileMixin.is_downloadable` closes the native uploader bypass on private-file
downloads. The HTTP ZIP endpoint requires its separate whitelisted override
because upstream imports the base File class statically. File aliasing across
parents/unattached records is rejected. Existing independent legacy copies of
protected content require a separate inventory; already-downloaded copies cannot
be revoked by the application.

Unaudited HR/Payroll/Kandil Script, Query and Custom Reports are blocked for
non-Administrator accounts on parity sites: raw SQL/get_all bypass row hooks.
The gate covers run/export/controller execution and saved prepared results.
HR prepared snapshots and attached report export files are blocked even for their
uploader/owner; foreground Report Builder lists retain normal scoped ORM access.
Unrelated reports and non-parity sites retain native behavior. A scoped replacement
must be reviewed before an HR script report is re-enabled.

User language remains self-service. Session limits and social-login identities
are administrator-controlled and logged by changed field names only. This does
not configure external identity providers, MFA or cryptographic audit evidence.
