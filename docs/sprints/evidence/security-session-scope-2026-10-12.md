# Local identity and scoped-register acceptance evidence

Verified on the isolated, email-muted `kandil-parity.localhost` site on 12 October 2026. Synthetic fixtures and private credential manifests were removed after each run. This is local acceptance evidence, not production or whole-release acceptance.

## Sessions — AT-ACC-001-01

`browser/session-security-results.json`: **7/7 grouped real browser/API checks passed**.

- Enabled native UI login and authenticated API succeeded.
- A server-side account-disable operation rolled back to a savepoint, and one fully rolled back, preserved the real authenticated session.
- A committed server-side disable invalidated the existing session: authenticated API returned 401, and a separate browser context retaining the original cookie was redirected from Desk to native login.
- A real native session with controlled expired timestamps in its SQL and Redis records was rejected by API and Desk independently.
- Disabled-account fresh UI and direct login attempts returned 401.
- Cleanup removed all three synthetic accounts and native sessions.

The initial failure remains in `browser/session-security-before-revocation-fix.json`. Upstream `User.check_enable_disable` performs logout only when a login manager exists. Server-side User saves lacked that manager. The custom `User.on_update` hook now registers revocation after the account transaction commits. It rechecks persisted enabled state so a savepoint rollback does not revoke a valid session. Native session deletion commits internally, so invoking it before the business transaction commits would be incorrect. Sessions use `sid`, so the loop checks count rather than `db.exists`, whose null `name` result missed existing rows.

Expiry changes only the synthetic session records; global session policy was unchanged. The rollback proof is server-side/CLI, not a claim about upstream HTTP User validation's pre-commit logout behavior. No provider, MFA, trusted-device, crash-recovery revocation, or production-duration claim is made.

Reproduce from the app directory:

```sh
node docs/sprints/test_session_security.cjs
```

## Equal-looking scope matrix — AT-ACC-003-01 / AT-ORG-009-02

`browser/scope-security-results.json`: **12/12 grouped real HTTP/browser checks passed**.

One enabled Recruiter had a read-only grant to company A, branch A1. Three positions shared the exact title: A/A1, A/A2 and B/B1. Only A/A1 appeared in native lists and report-builder rows. For each exact record ID, the matrix tested native detail, link autocomplete, print HTML, private file download and File metadata. A/A1 was allowed; A/A2 and B/B1 were denied or absent as appropriate. The read-only user could not change the authorized position's title through the native mutation API.

Broad native CSV export remains denied, including the otherwise readable A/A1 record. The separate authorized position register exports only `name, position_code, title, company, department, branch, status`. It uses both scoped `get_list` and individual read permission, fixed fields, spreadsheet formula-prefix escaping, and a private/no-store attachment response. It creates no File record/public URL. Read grants intentionally suffice because these fields are already readable; no manage or sensitive permission is inferred. Requests above 5,000 rows fail visibly and require narrower filters. A filter naming a forbidden company or branch returns only the CSV header.

The actual native Position list button/dialog was clicked and its downloaded CSV checked. Grant revocation removed the formerly permitted row from CSV and blocked direct record/private-file access. Three positions and their files, branches, departments, designation, user and grant were cleaned up.

This proves these surfaces for the position register and attached private files, not every HR DocType, every report or all future exports. The positive export is the narrow register, not unrestricted native export.

```sh
node docs/sprints/test_scope_security.cjs
```

## Shared recipient across companies

`outbox-shared-recipient-2026-10-12.json`: **4/4 native independent-connection gates passed**. Eight workers established independent repeatable-read snapshots and contended on two company-owned Structure Change notifications for one shared recipient. All completed; each reference produced exactly one local receipt; no Email Queue effect occurred; UUID fixtures were removed. Each delivery was a separate transaction, matching `process_pending`. This is not sustained production load or a universal deadlock-freedom claim.

```sh
bench --site kandil-parity.localhost execute kandil_hr.foundation.outbox_company_runner.run
```

All runners require the opted-in synthetic parity environment. Their JSON evidence includes the tested source hashes. New Python files passed Ruff; both browser scripts passed Node syntax checks. Root owns final integrated regressions, translation validation and publication.
