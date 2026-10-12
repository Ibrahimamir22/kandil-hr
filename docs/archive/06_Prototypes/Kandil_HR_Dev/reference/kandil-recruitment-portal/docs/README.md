# Project documents — Kandil Recruitment Portal

Every blueprint, policy, proposal and guide agreed for the portal, kept here so it is versioned with the code.

## Documents exported from claude.ai

Last updated for all rows: **2026-10-07**.

| Document | File(s) in repo | Source (live copy) | What it is |
| --- | --- | --- | --- |
| Kandil Egypt — Recruitment System Master Blueprint v2.3 | [`blueprint/blueprint-v2.3.md`](blueprint/blueprint-v2.3.md) | [claude.ai doc](https://claude.ai/artifact/QSx86CNaV8spDujpJpfZtV) (tab 1) | The master blueprint: scope, processes, roles, rules, phases and change log for the whole system. |
| Blueprint v2.3 — Phase 1 Schema | [`blueprint/blueprint-v2.3-phase1-schema.md`](blueprint/blueprint-v2.3-phase1-schema.md) | [claude.ai doc](https://claude.ai/artifact/QSx86CNaV8spDujpJpfZtV) (tab "Phase 1 Schema") | The Phase 1 data model: 20 tables in 4 spreadsheets, conventions, structure import template. |
| Blueprint v2.3 (PDF snapshot) | [`blueprint/Kandil_Egypt_Recruitment_System_Master_Blueprint_v2.3.pdf`](blueprint/Kandil_Egypt_Recruitment_System_Master_Blueprint_v2.3.pdf) | — | PDF export of the same v2.3 blueprint (2026-10-07), for printing and sharing. |
| سياسة تعيين الأقارب — قنديل مصر (Relatives hiring policy) | [`policies/relatives-hiring-policy.md`](policies/relatives-hiring-policy.md) | [claude.ai doc](https://claude.ai/artifact/K3zNn7Y7Nw4o1FDD2gGjJJ) | Company policy on hiring relatives of employees: definitions, restrictions, disclosure and exceptions. |
| دليل كتابة الوصف الوظيفي (JD writing guide) | [`policies/jd-writing-guide.md`](policies/jd-writing-guide.md) | [claude.ai doc](https://claude.ai/artifact/HcBHmx287gE82DKWqXjJ6V) | How job descriptions and job files are written, with two worked examples and the JD flow on the portal. |
| مؤشرات أداء التوظيف — مقترح (Recruitment KPIs proposal) | [`proposals/recruitment-kpis.md`](proposals/recruitment-kpis.md) | [claude.ai doc](https://claude.ai/artifact/Sfy49Lsw4X3TJmJTwRtesw) | Proposed recruitment KPIs per process, recruiter, recruitment manager, HR site staff and approvers, plus scorecard and open questions. |
| فترة الاختبار — شيك لست مقترحة (Probation checklist proposal) | [`proposals/probation-checklist.md`](proposals/probation-checklist.md) | [claude.ai doc](https://claude.ai/artifact/ByPXRxVePmTPM5gLpUCvRv) | Proposed probation process: 30-60-90 plan, check-ins, PIP, day-75 review, decision, medical insurance, KPIs. |
| مراجعة المراحل 1–3 على الـ Blueprint (Phases 1–3 review) | [`proposals/phases-1-3-review.md`](proposals/phases-1-3-review.md) | [claude.ai doc](https://claude.ai/artifact/UiGi5FkNjAPsaR98QxiwnG) | Item-by-item review of 131 blueprint items in phases 1–3 against the built portal, with decisions taken. |
| دليل المدير — بوابة التوظيف (Manager guide) | [`guides/manager-guide/manager-guide.md`](guides/manager-guide/manager-guide.md) + `guides/manager-guide/images/01–13.png` | [claude.ai doc](https://claude.ai/artifact/W8MySg1PxZ1J7aLf9do7fY) | Step-by-step guide for managers: login, requests, approvals, interviews, onboarding, new jobs, transfers, FAQ (with screenshots). |
| دليل الإدارة — بوابة التوظيف (Admin guide) | [`guides/admin-guide/admin-guide.md`](guides/admin-guide/admin-guide.md) → [`admin-guide.pdf`](guides/admin-guide/admin-guide.pdf) | — | The portal from the administration side (for the consultant): roles, sign-in, layout, set-up before go-live, the daily cycle, every settings screen, controls; screenshots on demo data. Rebuilt by `node tools/admin_guide.js`. |
| خطة اختبار بوابة التوظيف — قنديل مصر (UAT test plan) | [`guides/uat-test-plan.md`](guides/uat-test-plan.md) | [claude.ai doc](https://claude.ai/artifact/9Z2W5XKS12NwPFvCeiVvmK) | User acceptance test plan: preparation, test cases per role (manager, HR, recruitment, CEO, public pages, reports), after-test steps. |
| Kandil Recruitment Portal — New Look (design reference) | [`design/new-look/`](design/new-look/) — `canvas.json`, `Main.dc.html`, `Approvals.dc.html`, `Candidates.dc.html`, `Mobile.dc.html` | [claude.ai design](https://claude.ai/artifact/CsvuLsxYXLnNJvJyUm8TkU) | Proposed visual identity: brand colors, type scale, 6 status color families, tabs/buttons, and sample Approvals, Candidates and Mobile screens. |

Notes on the exports:

- The `.md` files are Markdown exports of the Claude Docs documents. Date and @mention chips are kept as plain text.
- The JD writing guide contains one embedded interactive diagram ("رحلة الوصف الوظيفي على البوابة") that cannot be exported; it appears as a text placeholder. See the live doc for it.
- The design files are the canvas source (`.dc.html` artboards). They need the claude.ai design viewer (`support.js`) to render, so open the live link to view them; the files here are the versioned reference of colors, sizes and layouts (all values are readable in the HTML).

## Other documents already in the repo

| File | What it is |
| --- | --- |
| [`blueprint/requirements-status.md`](blueprint/requirements-status.md) | Status of each Blueprint v2.3 §29 requirement against the actual code, updated per release. |
| [`forms/forms-book.pdf`](forms/forms-book.pdf) | The HR recruitment forms book (paper forms the portal replaces). |
| [`forms/print-book.pdf`](forms/print-book.pdf) | Every document the portal prints (JD, worker card, interview kit, org chart, request, offer letter, no-insurance form, contract, receipt, onboarding, probation letters, salary notice, data copy), filled with demo data, exactly as printed. Rebuilt by `node tools/print_book.js`. |
| [`structure/`](structure/) | Org structure import material: `import.tsv` (import data), `recon.py` (reconciliation script), `source-kornferry-chart.txt` (source chart). `Kandil-Structure-Review.xlsx` and `source-jobs-sheet.csv` are local only (ignored by `.gitignore`). |

## How these stay current

- The **live copies** are the claude.ai docs and pages linked above. People read, comment and edit there.
- After each change to one of them, Claude re-exports it into this folder (same file path) and commits, so every revision is in git history.
- The **repo copy is the reference history**: use `git log -p docs/<file>` to see what changed and when. If the live copy and the repo copy differ, the live copy is newer and should be re-exported.
- When a new document is agreed, add it to the right folder (`blueprint/`, `policies/`, `proposals/`, `guides/`, `design/`) and add a row to the table above.
