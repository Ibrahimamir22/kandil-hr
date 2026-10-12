> Historical pilot snapshot, superseded for the parity site by the root README and sprint tracker.

# Kandil HR recruitment pilot

An opt-in extension of Frappe HRMS 16. It is not the backend for the wider company
platform and does not replace Odoo. The runtime flag `kandil_pilot_enabled` is
currently enabled only on the synthetic local site `kandil-test.localhost`.

## Implemented pilot boundary

- Department-scoped request with multiple capacity/location lines.
- Configurable department approval route, independent exception authority,
  prevention of direct and delegated self-approval, dated/revocable delegation.
- Submitted requests reserve headcount; approval moves reserved to open slots.
  Rejection/cancellation releases the remaining commitment. Actual joining moves
  one open slot to occupied. No-show keeps the vacancy open for another candidate.
- One standard Job Opening per approved line; opening bypass prevention.
- Standard Job Applicant accepts phone-only candidates with generated internal IDs,
  no fabricated email address, and a unique application key per opening/contact.
- Standard Interview/Feedback and Job Offer; explicit joining creates Employee
  and Employee Onboarding with a task. Repeat joining is idempotent.
- Immutable recruitment events and protected joining links.
- Native Frappe forms/actions and a bilingual navigation page at `/kandil-pilot`.

## Deliberate pilot simplifications

The reference portal is the requirements source, not a feature parity claim.
The pilot route is a configured department manager + HR chain, with an optional
exception gate. It does not yet resolve the complete effective-dated organization
hierarchy, CEO rules or compensation authority matrix. Requested quantity equals
approved quantity; approval reductions and return-for-amendment versioning are not
implemented. Application contact uniqueness needs HR agreement for shared phones.
Final joining/no-show outcomes cannot be reversed in this pilot. Transfers, exits,
rehiring and corrections need their own audited workflows before production use.

Recruiter and Sector roles see all pilot records on the enabled site. This is
intentional for the single-company synthetic review, not production multi-company
segregation. Requesters are restricted to their own active employee department.
Requests and audit events have record-level read filtering. Full privacy/field-level
security assessment is still required.

## Transaction design

`pilot/api.py` is the only business transition surface. It checks the actor and
state, locks the request and sorted capacity records, updates all affected records,
and writes an event in one database transaction. Failed requests roll back. Existing
joined employees have unique links to their applicant and offer.

The local MariaDB 11.8.9 default `innodb_snapshot_isolation=ON` caused standard
Frappe numbering conflicts. This Compose project explicitly uses OFF, retaining
REPEATABLE-READ and InnoDB locking; 100 standard writes at concurrency 10 then passed
without retries. This changes the local project's shared server setting, not data
on the main site. See MariaDB's official system-variable documentation.

Custom actions avoid locking empty draft approval ranges and retry only a complete
rolled-back `QueryDeadlockError` transaction, at most three retries, with jitter.
They do not retry authorization or business-validation failures. The response's
`kandil_transaction_retries` metadata exposes successful-action retry counts.
No external emails or APIs occur inside these actions. If external effects are
added, use a transactional outbox; do not add them directly to this retry boundary.

## Source layout

- `kandil_hr/pilot/models.py`: document invariants and immutability.
- `kandil_hr/pilot/api.py`: submission, decisions, cancellation and joining.
- `kandil_hr/pilot/extensions.py`: opt-in standard HRMS adaptations.
- `kandil_hr/pilot/permissions.py`: request/event read restrictions.
- `kandil_hr/pilot/setup.py`: custom fields and optional-email property setters.
- `kandil_hr/kandil_hr/doctype`: versioned DocType schema and native request actions.
- `kandil_hr/www/kandil-pilot.*`: review entry page.

Upstream frappe, erpnext and hrms source remains unmodified. After migration the
optional-email metadata applies across the enabled test site, including standard
applicants. Clearing the runtime flag alone is not a schema rollback. Keep this
pilot isolated; plan migration/rollback and backups before another installation.

## Verification and review

From the parent development workspace, inspect `development/testing` and the
report under `05_Deliverables/Frappe_HR_Pilot_2026-10-11`. The scripts use synthetic
role accounts and real HTTP calls, and retain failure evidence as well as results.
They mutate fixtures: use a fresh test database for a clean full replay. Load tests
are short local batches, not production throughput guarantees or payroll tests.

No real employee data imported, external integrations configured, code pushed, or
production deployment performed. HR's hands-on acceptance remains pending.

Final static validation: Ruff lint and formatting, Python compilation, JavaScript
syntax and Git whitespace checks passed on 11 October 2026.

## Native workspace and company hub

On the enabled synthetic site, open `/kandil` for the company hub and
`/kandil-pilot` for the HR workspace. Both require an authenticated assigned role.
The HR navigation checks each DocType's existing read permission. Native list and
form permissions continue to enforce record scope; the hub does not grant access.
Delivery, estimator and Odoo cards intentionally have no live destination until
those systems and their access rules are confirmed. Hosting this navigation page
in the HR app does not make Frappe the broader company backend.

`pilot/navigation.py` provides read-only action hints. Request forms show submit,
approve/reject and cancellation only when the current actor can perform that step.
The transactional APIs still recheck authority and current state when clicked.
Pilot-linked offers replace the generic Create Employee shortcut with explicit
joining, suppress completed outcomes, and require a reason for no-show/withdrawal.
Standard offers unrelated to pilot openings retain their original workflow.

Page controllers use Frappe's underscore naming (`www/kandil_pilot.py`) even though
the public route is `/kandil-pilot`. This is required for the context/auth guard to
run. No global homepage, core app source, or main-site business data is changed.
The custom app has an opt-in entry on Frappe's apps screen and a small Arabic
translation catalogue for its action labels. This is not a claim of complete
Arabic translation across the upstream HR suite.
