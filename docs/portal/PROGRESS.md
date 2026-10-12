# Connected HR portal — first working milestone

Goal: replace the prototype's simulated interactions with personal-session, permission-checked Frappe operations on the isolated synthetic site at localhost:8102. Keep the approved Arabic/English design. Frappe HR and the Kandil app remain the HR backend; Odoo and other departments are outside this milestone.

**Status: first connected milestone complete locally. HR acceptance and production readiness remain pending.**

## Current Sprint 1 update

Pending quantity changes now work through the AR/EN custom portal with a reviewed delta and retained input on denial. See the [current checkpoint](../roadmap/S1_CHECKPOINT.md) for source identity, final browser evidence and remaining work. The first-milestone results below remain historical.

## Work and evidence

| Step | Output | Status |
|---|---|---|
| 1. Inspect and reuse | Review existing commands, permissions, versions, headcount and synthetic environment | Completed; adapter gaps identified |
| 2. Connect the design | React + TypeScript portal, real login, session bootstrap and scoped projections | Complete; built and connected on port 8102 |
| 3. Finish one journey | Create/edit/submit → independent manager and HR approval or return/revise → vacancies per location → recruiter assignment | Complete; real multi-account browser journey passed |
| 4. Verify | Ordinary roles, forbidden actions, stale changes, duplicate actions, headcount; AR/EN desktop/mobile | Complete; 10 native + 31 HTTP + 24 browser checks pass |
| 5. Handover | Local URL, private test credentials, exact walkthrough, source/evidence manifest | Complete; see README.md and evidence/source-manifest.json |

Completion requires observed saved records and server-enforced negative tests, not only screenshots. Prototype checks and previous native Frappe test totals do not count as connected portal acceptance.

## Scope and safety

- Only synthetic site `kandil-parity.localhost` at port 8102 is changed/tested. Existing 8100/8101 data and older unfinished source are preserved.
- Build output is served from the same Frappe origin. Personal session cookies and CSRF protection; no browser service key, client role switching, stored HR records or passwords.
- Reuse the existing transactional command/version/replay model. Add bounded field projections and idempotent draft save.
- This milestone does not prove 1,000 simultaneous users, production readiness, attendance, payroll, candidate/interview parity or Odoo integration. These need later milestones and measured capacity/security gates.

## Delivered — how to review

Open `/hr-portal` on localhost:8102; sign in as a synthetic requester, submit a two-location request, complete separate manager/HR approvals, then assign a recruiter as HR. A second request covers Return → revise → resubmit.


## Full HR delivery goal

The first connected milestone below is complete. The new active goal and remaining work are tracked in [the full sprint plan](../roadmap/SPRINT_PLAN.md) and [tracker](../roadmap/tracker.json). Their statuses supersede the following earlier next-milestone outline.

## Earlier next-milestone outline

| Milestone | Next outcome | Completion gate |
|---|---|---|
| HR review | Record corrections to the connected journey | HR validates ordinary-role approvals and screens |
| Next reference workflows | Candidates/interviews, then offers/joining | Agreed field/workflow parity plus role-specific acceptance |
| Real staff pilot preparation | Secure hosting, migration, backups, monitoring and operating ownership | Restore rehearsal, access review, security assessment and signed pilot checklist |
| Capacity verification | Defined workload for 1,000+ accounts | Measured concurrent workload, latency and error targets |

The portal source, built assets, tests and evidence are included in the repository publication checkpoint described in `../SOURCE_CONTROL.md`. The original evidence manifest records the working-tree state at test time and is retained unchanged. Older unfinished headcount files are also preserved; their remaining cases are not claimed complete by this portal milestone.
