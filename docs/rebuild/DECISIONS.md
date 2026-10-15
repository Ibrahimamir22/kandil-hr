# Decisions required before implementing affected workflows

15 October 2026 · Source reference `c54c21b93be4063521d5fc1d69b8909d6ba976b1`.

The latest direct user decision takes precedence over the reference. Otherwise record the conflict and obtain the responsible owner's policy; do not infer approval from code or adopt legal assertions from the repository. Planning and unaffected tasks can continue.

| ID | Evidence / conflict | Proposed handling | Owner and deadline |
|---|---|---|---|
| C01 | CAN-005 short label says salary required; Candidates.gs and CHG-81 allow optional expected range and ask current salary at offer | Model missing/withheld/disclosed explicitly; ask HR to approve current intake/offer field rules; never substitute zero | HR, before N09/N10 |
| C02 | REQ-011 says material changes reapproved; RequestChanges.gs and CHG-68/84 reapprove only HC increase and let HR edit other fields | Produce field-by-field approval matrix including branch, contract type, quantities and accepted commitments; default no silent change to approved evidence | HR + leadership, before N07/N08 |
| C03 | Transfers.gs has managers' opinions then HR decision; user explicitly chose HR + CEO for position changes | User decision adopted: HR + CEO before assign/end/move; decide temporary covers and compensation-impact details within that route | HR confirms operational details before N05/N17 |
| C04 | Reference Daily.gs/CHG-84 automatically rejects unanswered approval after five working days; existing Frappe work kept automatic rejection disabled | Do not enable automatic rejection without explicit policy acceptance; design reminder/escalation/expiry outcomes separately | HR + leadership, before N07 |
| C05 | Reference has Gmail OTP/TOTP, CEO trusted device + PIN and future Workspace/shared appraisal identity | Decide identity provider, privileged MFA, recovery and public links independently; do not port bespoke crypto or weak device exceptions blindly | IT + security + HR, N02/N03; external SSO contract by N21 |
| C06 | INS-001 short label says first month; CHG-80/current open items say day-one insurance with exceptions; legal positions remain unvalidated | Track deadlines as approved versioned policy; legal sign-off for insurance and no-insurance paths before real use | HR/legal, before N14–N18 real-data use |
| C07 | DOC-002 short label says HR alerts only; later code reminds employee then escalates; CHG-103 replaces old pay-stop wording with follow-up notice | Approve recipient/calendar matrix; no wage-stop behavior; avoid legacy STOP/RELEASE enum names in new domain model | HR + IT delivery owner, before N15 |
| C08 | Reference offers draft contracts/compensation prints and identifies 16 unanswered lawyer questions | Build versioned template engine and validations; final contract text, probation appeal and consequential actions remain gated | Kandil legal through HR, before N15/N18 release |
| C09 | Two-year candidate retention, employee service records, audit redaction, consent/holds and incident timers involve different obligations | Define purpose/record retention matrix, holds, deletion evidence, privacy rights and incident ownership; no blanket two-year delete job | HR/legal + IT, before N10 real data |
| C10 | CHG-91 records BioTime enrollment only; broader discussions mention attendance and leave | Include enrollment metadata/stop/license tracking in parity; live attendance, biometric processing, leave and payroll are separate scoped additions | Ibrahim + HR, N00; adapter design only after approval |
| C11 | Source permits AI on test data and has historical cross-border 'start then apply' wording | No real applicant data sent until approved data handling/provider terms; AI suggestions require human review and spending controls | Ibrahim + HR/legal + IT, before N20 real provider use |
| C12 | Source partial/later items: full structure snapshots, per-company approval roots, payroll-HC import, appraisal shared login; source also includes presence and broad consultant test access | Keep gaps in backlog; define production scope and access expressly. Consultant/demo powers cannot flow into production; presence must be transparent/minimal | HR + IT + Ibrahim, N00/N02, acceptance before N24 |

## Source open items to collect

- Current legal-entity/structure/branch file and real authority holders; never assume the historic counts still apply.
- HR recruitment roles, standing CEO/Board rules, priority/SLA settings and calendar.
- Approved JDs, question bank, practical-test criteria and assessors.
- Salary structures/allowances, offer authority, compensation examples reviewed by the responsible specialist.
- Document matrix, signed template wording and approved onboarding/insurance/probation policies.
- Named IT/HR/legal reviewers, identity/appraisal provider details, hosting budget and recovery targets.
- No personal employee data is required to approve the architecture; use synthetic examples.

## Decision record format

For each C/D item: policy owner; source conflict; alternatives and impact; chosen behavior; approval date; affected requirements/tasks; effective date; acceptance examples. A later change creates a new decision version and updates the backlog. Unanswered items block their dependent behavior only, not unrelated planning.
