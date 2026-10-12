# قنديل — HR portal experience prototype

12 October 2026. Local UX prototype for Option A's design review. This is a separate artifact; Frappe and its data are unchanged.

## Open

Open `dist/index.html` in your browser. All assets, including Arabic fonts, are local. No login credentials or internet connection are required. For HTTP preview, run `python3 -m http.server 8114 --bind 127.0.0.1 --directory dist` in this folder, then open `http://localhost:8114`.

Browser-local demo state is isolated by origin: the file and HTTP entry points may have separate saved samples. Use the profile menu or prototype guide to reset this demo only.

## Try the journey / تجربة الرحلة

1. Enter as **عمر حسن / Omar Hassan**, department manager.
2. Choose **طلب توظيف جديد / New hiring request**.
3. Choose the role and up to three locations. Enter a positive whole-number quantity within the displayed demo capacity.
4. Add a target joining date and a justification of at least ten characters. Review and submit.
5. Choose **تجربة دور المراجع / Continue as HR reviewer**, or switch to **مريم أحمد / Mariam Ahmed** at the top.
6. Review the exact request. Approve and confirm; one vacancy is created per location. Alternatively, return it with a note, switch to Omar, revise and resubmit.
7. Open **الشواغر / Vacancies**, assign a lead recruiter, pause and resume hiring.
8. Switch Arabic/English, search by role/request ID, test on a narrow window, save and reload a draft.

## Implemented surfaces

- Branded role-entry screen representing the login experience.
- Role-oriented dashboard, action lists and sample interview schedule.
- Hiring request list and three-step wizard with saved drafts.
- Approval inbox, detail dialog, version history, review confirmation and returned revisions.
- Vacancy cards, source request, per-location quantities, recruiter assignment and pause/resume.
- Sidebar, global search, language switch, demo notifications, mobile navigation, guide and reset.

The reference's red/gold/off-white palette, Arabic-first navigation and task-focused home informed the design. The layout and implementation are newly authored. IBM Plex Sans Arabic is bundled from Google Fonts with its OFL license under `dist/fonts/`.

## Boundaries — important

**This is not secure authentication or a production HR system.** Role selection is a visible demo control. Sample records and drafts are stored in localStorage under `kandil-hr-portal-prototype-v1`. Do not enter real employee/candidate information. There is no Frappe, email, identity-provider, payroll or other external integration.

The approval route intentionally demonstrates manager → HR → vacancy, not the complete sector/CEO/board/delegation policy. Capacity is a simplified per-location demo allocation; it is not the production position/headcount ledger. Interviews are explicitly labeled sample content. Candidate and interview workflows are not implemented here.

This design artifact is dependency-light HTML/CSS/JavaScript. The proposed production frontend remains React + TypeScript: use the approved components, interactions and copy as its specification, then bind typed API contracts and server-enforced authorization. Native Frappe screens are not embedded and the prototype never writes to their database.

## Review criteria

Ibrahim/HR should review brand, Arabic terminology, navigation, role visibility, request fields, quantity explanation, review information, action confirmations, error wording and mobile use. Record desired changes before building the authenticated frontend.

## Verification

`qa/prototype.spec.cjs` tests actual browser interactions with fresh synthetic state: quantity errors, two-location submission, draft persistence, language preservation, approval, vacancy creation, assignment/pause/resume, return/revision, search, mobile layouts, reset, logout and file entry. `qa/results.json` records the latest run; screenshots are in `qa/`.

This evidence verifies prototype behavior only. It does not certify security, accessibility conformance, 1,000-user capacity, reference parity or production readiness. No application-backend tests were run for this artifact.

## Option A integration handoff

1. Approve the five-screen interaction direction and reconcile omitted reference fields/authority paths.
2. Build React components and typed read/command contracts; retain the real backend's reviewed-version and idempotency semantics.
3. Replace demo entry with the selected personal-session/MFA design, and remove role switching/reset from the production bundle.
4. Enforce record/field/company permissions on every API; never rely on frontend filters.
5. Replace demo capacity and simplified approval with the authoritative Frappe/Kandil domain services. Keep business denials distinct from transport success.
6. Test request → independent approvals → per-location vacancy against the isolated Frappe site with ordinary accounts, then perform denied/stale/replay/RTL/mobile checks.
7. Do not promote existing backend acceptance counts as proof of this new frontend.
