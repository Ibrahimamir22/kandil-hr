# مراجعة نظام قنديل — Persistent local review

Open **http://kandil-review.localhost:8112/hr-portal** on the development Mac. Use this dedicated hostname: browser cookies are not isolated by port, so using `localhost` for both sites can interrupt login sessions. The browser treats `*.localhost` as a local address. Nothing is published to the internet.

This is the connected custom Arabic/English portal over Frappe HR and `kandil_hr`. It is a **synthetic review environment**, with a visible label after login. It is not a production deployment or a statement that the full HR specification is finished.

## الدخول والصلاحيات / Login and roles

Ibrahim's personal account is `ibrahimamiir22@gmail.com`. Its existing private review password is preserved. The bootstrap does not reset the old account or fall back to the earlier rejected weak password.

Credentials are deliberately excluded from GitHub. On this development bench, the existing personal login is in `sites/kandil-parity.localhost/private/ibrahim-review-login.json`; the new role accounts and example IDs are in `sites/kandil-review.localhost/private/kandil-review-accounts.json`. These files are private, mode 0600. Open them locally; do not paste them into issues, reports or screenshots.

| Account | What to review |
|---|---|
| Personal account | Create/edit own drafts; view scoped requests, vacancies and candidates; enter/correct basic profiles; recover own unfinished actions. It is a recruiter/requester, not Administrator. |
| `review-manager@example.invalid` | Department approval of the pending example. |
| `review-hr@example.invalid` | Configured HR approval, vacancy team management and reviewed linking of the legacy candidate example. |
| `review-ceo@example.invalid` | Sector/CEO authority when a workflow actually requires it; do not use it as a substitute for HR approval. |
| `review-outsider@example.invalid` | Negative access demonstration: no company grant and no candidate access. |

Use separate browser profiles or private windows to compare roles simultaneously. Signing out and signing in as another role in one window is also supported. Do not share accounts in a real deployment.

## جرّب بالترتيب / Suggested walkthrough

1. **Dashboard / الرئيسية:** sign in with the personal account. Confirm the synthetic-data banner and switch Arabic/English. Three hiring examples start as draft, pending approval and approved. Counts reflect the records available to your permissions.
2. **Draft request / طلب تجريبي قابل للتعديل:** open the draft, inspect its position and capacity, change the reason/details and save. Submitting starts its actual approval route; it does not automatically approve itself.
3. **Pending approval / طلب ينتظر الاعتماد:** use the manager account, review and approve. Then sign in as configured HR for the next approval. Self-approval and arbitrary role substitution remain blocked.
4. **Open vacancy / توظيف فني تشغيل:** the approved request has an open vacancy with HR as lead and Ibrahim on its recruitment team. The example has two approved openings; candidate applications do not consume headcount as if candidates had already joined.
5. **Candidates / المرشحون:** inspect the three synthetic person-linked candidates and one unlinked legacy record. Search, open a person/application, and review which details belong to the person versus the original application. Shared example phone numbers are intentional; there is no automatic merge.
6. **New application / إضافة طلب ترشح:** select the open vacancy, enter made-up details only, review possible matches, then explicitly choose an existing person or a new one and confirm. Review the returned application. Do not enter real CVs, national IDs or sensitive salary information.
7. **Profile correction:** open a person-linked candidate, review the correction fields, give a reason and confirm the before/after values. The original application snapshot and correction history remain distinguishable.
8. **Unfinished actions / إجراءات غير مكتملة:** one initial prepared action is available to the personal account. Opening it does not execute it. Review the saved request and explicitly resume, or discard it. A completed action can be acknowledged. It is deliberately not recreated once you finish it. The default recovery lifetime is seven days; an expired example cannot be resumed.
9. **Legacy review:** sign in as configured HR and use the legacy-review screen. Review the proposed person and preservation checks before applying. This changes a real synthetic record and leaves an audit history. The personal recruiter account cannot perform this HR-only action.
10. **Arabic/mobile:** switch to Arabic and try the same primary screens in a narrow browser window. Record any wording, navigation or workflow difference from HR's expected process.

These examples persist. Completing or editing one changes what you see next time. No automated reset is provided, and the review site is not a disposable test fixture. Record the application/request ID and expected versus actual result when reporting an issue.

## التشغيل والإيقاف / Start and stop

From the installed custom application repository:

```sh
python3 deployment/review.py status
python3 deployment/review.py start
python3 deployment/review.py stop
```

`start` and `stop` affect only the `kandil-hr-review` Compose project. Stopping preserves its database and queue volumes. Never run `down -v` or delete site folders/volumes as routine troubleshooting.

For a **fresh development bench with no review site**, `python3 deployment/review.py provision` creates this environment once. It requires the pinned Frappe/ERPNext/HRMS development installation and the previously created personal login. It generates separate database/admin secrets, creates the new site, installs the apps and seeds synthetic examples through normal workflow commands. It refuses an existing or partially initialized site. Inspect private provisioning diagnostics before any repair; do not delete data and retry blindly.

This is a development-bench extension, not a standalone clean install on an arbitrary server. The general pinned installer remains under `deployment/`; production packaging is a later gate.

## What is isolated, and what is still shared

| Resource | Persistent review | Automated parity testing |
|---|---|---|
| Site | `kandil-review.localhost` | `kandil-parity.localhost` |
| URL | `http://kandil-review.localhost:8112/hr-portal` | `http://localhost:8102/hr-portal` |
| Database and Redis | Dedicated `kandil-hr-review` services/volumes | Existing development services |
| Candidate mode | Enabled for this synthetic review | Temporary test leases; normally disabled |
| Automated fixture access | `allow_tests=0`; parity fixture guards reject this site | Explicit opt-in and exact-site guards |
| Source and bench files | Shared pinned app code/development bench | Same code; changes therefore affect both after restart |

The dedicated web process selects the review site explicitly. There are no shared workers or queue flushing operations. The 8100 company-data site and 8101 older pilot are not modified by this setup.

## Current limits

- Outgoing email is muted. Scheduler and background workers are deliberately stopped; scheduled reminders, outbox delivery and automatic expiry cleanup are not running here. Their separate engineering rehearsals do not mean background delivery is active on this review site. Synchronous expiry checks still prevent an expired recovery from executing.
- Scope is the implemented recruitment/candidate increment. Full profiles, private files, consent, ownership/follow-up/activity, sourcing/imports, interviews, offers, joining/lifecycle and reporting remain tracked in S5–S12.
- The shared development filesystem, HTTP loopback server and local credentials are not a production security boundary. MFA/session policy, independent security assessment, real-role HR UAT, 1,000+ capacity proof, backup/operations and production release remain open.
- The organization policy remains HR + CEO approval for individual position changes. This review setup does not weaken that route or claim all organization acceptance is complete.
