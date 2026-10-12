# قنديل — native Frappe workspace review

11 October 2026 · local synthetic environment · HR acceptance still pending.

## Open the real application

- Company hub: http://localhost:8101/kandil
- Native HR entry: http://localhost:8101/kandil-pilot
- Request list: http://localhost:8101/desk/kandil-hiring-request

Use the existing local Frappe login. Administrator is suitable for exploration;
it is not a substitute for the assigned requester, approver or recruiter when
checking workflow authority. Separate synthetic role credentials remain in the
private local test-credentials file. They are not part of either repository.

## Reviewed and retained

Native request, applicant, interview, job offer, employee and onboarding screens
were inspected. Their built-in forms, lists and linked records are retained.
The phone-only candidate/interview example prepared for HR is still intact.

## Changes made in the custom app

- A company hub and HR workspace with bilingual headings and role-aware shortcuts.
- A Frappe apps-screen entry for the enabled pilot only.
- Native request forms show only currently authorized submit/decision/cancel
  controls, with a next-approval/status message. The server still validates every
  business action; action hints are not an authorization substitute.
- Status indicators and an HR workspace return button on the native request list.
- Pilot-linked offers remove the misleading generic Create Employee shortcut.
  HR records actual joining explicitly; completed outcomes no longer show a new
  joining button. No-show/withdrawal requires a reason in the prompt and server.
- Selected custom action labels have Arabic translations. The whole upstream
  HR product has not been retranslated or redesigned.
- Corrected the page-controller filename to `kandil_pilot.py`. Frappe maps a dashed
  page URL to an underscored Python controller; the old hyphenated controller was
  not executed. Authentication/site guards and user-specific context now run.

All application changes are in `apps/kandil_hr`. No Frappe, ERPNext or HRMS core
source was edited. The main site's company records were not migrated or changed.

## Browser walkthrough evidence

Twelve grouped checks passed across the actual local application, including
request creation, submission, sequential role approvals, native joining,
permission-aware menus, app launcher, bypass-button removal, completed-action
suppression and mobile hub navigation. Candidate and offer setup used normal
HTTP APIs; submit, approval and actual joining used the real browser buttons.
The native interview screen was reviewed separately using the earlier scored
feedback example; this new case did not recreate that interview workflow.

The walkthrough was resumed on the same fixture after test-harness fixes; it is
not claimed as a single uninterrupted acceptance run. Early failure evidence is
retained locally. The first page import/controller issues were fixed before the
successful navigation checks. Later harness fixes supplied CSRF headers, selected
the joining outcome and used Frappe's displayed date format.

New synthetic case:

| Record | ID |
|---|---|
| Hiring request | 2p0l2avptr |
| Opening | HR-OPN-2026-0010 |
| Applicant | KJA-f7c66cbcbb8d4e83a677 |
| Accepted offer | HR-OFF-2026-00008 |
| Actual joined employee | HR-EMP-01009 |

The original HR-review offer HR-OFF-2026-00007 is still pending actual joining.
All six synthetic capacity ledgers reconciled after the new case. The test-site
employee total is now 1009. This is fixture volume, not a production user count.

Evidence stays under ignored `development/testing/native-ui/`; source test scripts
are versioned. `native-results.json`, `boundary-results.json`, screenshots and the
updated `development/testing/pilot-ledger-audit.json` describe the actual checks.
This is a local prototype and workflow review, not penetration testing, sustained
production load validation, legal payroll validation, or HR business sign-off.

## Source control and remaining decisions

The custom app and local orchestration are committed separately. The source scan
checks the staged indexes against known local passwords, forbidden runtime file
names and private-key headers; it is not a substitute for a full secret-scanning
service. Credentials, databases, runtime configurations, uploads and test output
are excluded. GitHub setup is prepared in `GITHUB_SETUP.md`; no remote repository
has been created, and nothing has been pushed or deployed.

Next business review: actual authority hierarchy, amendments, shared phones,
compensation authority, joining corrections, transfers/exits, and full privacy
scope. Next platform decisions: verified Odoo destination/API contract, employee
identity strategy and the exact delivery/estimator scope. Frappe remains HR-only.
