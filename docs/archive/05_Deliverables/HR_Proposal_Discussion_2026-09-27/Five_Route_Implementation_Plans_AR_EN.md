# خمس خطط تنفيذ لكنديل / Five implementation routes

Discussion draft · 27 September 2026. These are proposed delivery plans, not approved scope, staffing commitments or fixed-price offers. Kandil owns the proposed original product and commercial business. Third-party software retains its existing ownership/licence.

## القرار الحقيقي / What we are choosing

The routes can be combined. Google, a vendor platform, open source or a custom database can hold the HR records. A reusable agentic layer can execute approved workflows against any suitable foundation. SaaS is a delivery model; RaaS is a commercial model with defined completed outcomes. Neither AI nor multi-tenancy automatically creates customers or profit.

**التوصية المبدئية:** تجربة أساس HR مناسب، بالتوازي مع تصميم طبقة تنفيذ مملوكة لكنديل. نبدأ بإجراءات محددة، ونثبت الجودة والتكلفة داخليًا، ثم نختبر البيع لعملاء آخرين. لا نبني كل خصائص HR من الصفر في أول نسخة.

## مرحلة مشتركة قبل أي مسار / Shared discovery

Proposed planning allowance: 2–3 weeks with access to HR owners and representative data. This is an estimate for scope planning, not a delivery promise.

1. HR process owner maps employee categories, sites, managers, shifts, payroll preparation, approvals and common requests. Record monthly volumes and handling time from actual cases.
2. Data owner inventories Sheets, employee IDs, duplicate records, balances, payroll source files and letter templates. Agree which source controls each field.
3. Technical lead checks attendance-device exports/APIs, identity access, employee phone/email availability and required integrations. Use anonymized or appropriately controlled samples.
4. Product owner documents mandatory versus later features and separates the internal operating need from external commercial hypotheses.
5. Finance and delivery leads produce a scope-based estimate: effort by role × rate, one-time external charges, recurring operations and contingency tied to identified risks.

**Deliverables:** process maps, data dictionary, cleaned sample, integration inventory, requirements, demonstration script, cost model and approved pilot acceptance criteria. **Exit:** the team can trace a request from identity and source data through approval to a recorded result. Unresolved payroll rules have an assigned HR/payroll owner.

## Route 1 — Google Workspace Automation / تنظيم النظام الحالي

**Purpose:** improve daily HR service quickly while preserving a migration path.

| Phase | Work and deliverable | Acceptance / owner |
|---|---|---|
| 1. Structure | Define employee IDs, controlled master tables, approved policy/template folders, access groups and retention rules | HR validates records; IT tests employee-specific visibility |
| 2. Requests | Build authenticated forms or a small portal, case IDs, manager routing and request status | Employee can submit and track a request without seeing another employee's data |
| 3. Automation | Generate dated letters, record leave decisions, import attendance exceptions; use jobs with retry/error handling | Repeated submission does not duplicate outcomes; failures enter an owned queue |
| 4. Pilot | Start with a representative cohort across roles/sites; measure processing time and corrections | HR verifies results and recovery; payroll remains with its designated owner |
| 5. Rollout/exit | Roll out only proven workflows, train HR, export versioned records and document maintenance | Full export and recovery tested; move to stronger data storage if complexity/concurrency demands it |

**Planning envelope:** 4–8 weeks after discovery for a bounded service workflow pilot. Existing data quality and employee identity access can extend it.

**People:** HR owner, automation engineer, Workspace administrator, QA/change coordinator; roles can be combined but responsibilities remain assigned.

**Cost model:** build/configuration + Workspace/low-code licences for the actual billable users + storage/messaging + monitoring/support. Do not assume every employee already has a paid account or that a low-code portal avoids per-user charges. Current Google edition/quote must be checked before costing.

**Pros:** familiar tools, smaller immediate migration, fast process learning, useful interim operations. **Cons:** access controls across spreadsheets can become fragile; schema changes and manual edits break automations; concurrency and recovery need engineering; not an ideal long-term payroll ledger without substantial controls.

**Commercial potential:** repeatable implementation and managed operations can generate revenue. A collection of Kandil-specific scripts is difficult to onboard/support for many customers. **Choose when:** fast operational relief is the priority. **Stop/upgrade when:** audit, reliability or cross-site complexity costs more to maintain than a structured HR backend.

## Route 2 — Buy & Configure / شراء نظام جاهز

**Purpose:** acquire supported HR/payroll capability and configure Kandil's processes around verified product strengths.

| Phase | Work and deliverable | Acceptance / owner |
|---|---|---|
| 1. Shortlist | Demonstrate Mawared HR, HITS, bluworks and selected regional alternatives against the same scenarios | HR scores evidence, not sales slides; finance compares matched scopes |
| 2. Commercial design | Obtain headcount/module/implementation/renewal/API/export quotes and responsibility matrix | Contract scope resolves Egypt payroll ownership, support and exit rights |
| 3. Configuration | Clean/import records, configure roles, sites, shifts, leave and approved letters | Reconciled migration totals and sample employee records |
| 4. Integration | Connect devices, payroll/accounting outputs and any permitted agentic layer | Traceable data flow, duplicate protection and recoverable failures |
| 5. Parallel run | Pilot self-service and reconcile at least two full payroll cycles before payroll cutover | HR/payroll signs off calculations and exceptions; rollback/export available |
| 6. Operate | Train owners, establish vendor escalation and scheduled upgrades | Named service owner and agreed service measures |

**Planning envelope:** 8–16 weeks for a reasonably standard deployment after selection; complex payroll/interfaces may require several additional months. Vendor discovery must replace this indicative range.

**People:** HR/payroll lead, vendor implementation consultant, IT/integration owner, finance/procurement and QA/change lead.

**Cost model:** subscription + implementation/localization + migration + devices/connectors + training + support + renewal uplifts. Include employee records and self-service populations, not just HR administrators.

**Pros:** established functions and an accountable supplier; potentially the fastest route to maintained local payroll. **Cons:** recurring vendor costs, configuration limits, contract dependence, API/AI access charges and migration costs on exit. Purchasing does not automatically grant source code or resale rights.

**Commercial potential:** Kandil can sell its own integration/service layer or permitted reseller services. **Choose when:** reliable internal HR/payroll takes precedence over owning the whole stack. **Reject a finalist if:** it cannot demonstrate required payroll/shift rules or provide usable exports/integration rights.

## Route 3 — Open-source Foundation / تخصيص أساس مفتوح المصدر

**Purpose:** reuse existing HR functions while retaining more control over deployment and extensions.

| Phase | Work and deliverable | Acceptance / owner |
|---|---|---|
| 1. Proof of fit | Compare Frappe HR, Horilla and OrangeHRM on identical sample workflows; keep Odoo Community as a distinct reference if desired | Gap log separates configuration, missing functions and Egypt localization |
| 2. Licence/architecture | Select exact versions/modules, inspect dependencies and define Kandil-owned extensions and upgrade strategy | Original IP and third-party obligations are documented before commercialization |
| 3. Deploy/configure | Establish staging/production, roles, backups, restore, data import, leave and document workflows | Isolation and restore verified; no dependency on a developer's personal accounts |
| 4. Localize/integrate | Arabic/RTL as needed, attendance imports, approved payroll rules or external payroll connection | Egyptian payroll ownership explicit; representative calculation reconciliation |
| 5. Pilot and operate | Test upgrades, workload, permissions and HR processes; document support | HR acceptance plus named maintenance/on-call responsibility |

**Planning envelope:** 8–14 weeks for a bounded HR/self-service pilot. A complete validated payroll replacement can exceed this substantially and requires parallel cycles.

**People:** HR/payroll specialist, platform engineer, integration engineer, QA and DevOps/support owner; access to a competent implementation partner can substitute for some roles.

**Cost model:** no software licence fee for the selected community code + configuration/localization engineering + hosting/database/backup + support + upgrades + optional vendor services. Compare three-year ownership cost; do not put “free” in the total-cost column.

**Pros:** existing functions, inspectable code and flexible hosting; useful foundation for reusable work. **Cons:** Kandil/its partner must own security updates, statutory changes, reliability and compatibility. Heavy source modifications can make every upgrade expensive. Open-source licences do not grant exclusive ownership of upstream code.

**Commercial potential:** managed deployments, support and a differentiated agentic layer, subject to exact licences. GPL/AGPL allow commercial activity but impose conditions; source-available IceHrm and Anuko must not be treated as equivalent licences. See the GitHub catalogue.

**Choose when:** there is a long-term technical/support owner and the proof-of-fit gaps are reasonable. **Stop or change foundation when:** required localization and rewrites approach the cost/risk of a custom core.

## Route 4 — Custom HR Web System / نظام مخصص لكنديل

**Purpose:** build workflows that existing products cannot economically satisfy.

| Phase | Work and deliverable | Acceptance / owner |
|---|---|---|
| 1. Define boundary | Select exact core records, workflows and integrations; document deferred modules | Sponsor approves measurable scope and change-control process |
| 2. Build foundation | Identity, permissions, employee records, audit history, import/export and recovery | HR validates data; QA tests access boundaries and recovery |
| 3. Deliver vertical slices | Complete letters, leave and attendance exception flows end-to-end | Each flow produces a persistent authorized result and understandable status |
| 4. Extend deliberately | Add payroll preparation, reports and other modules only against proven needs | New requirements have cost/benefit and acceptance criteria |
| 5. Rollout/maintain | Pilot, train, release by cohort, maintain documentation and upgrade budget | Product owner accepts service levels and continuing backlog |

**Planning envelope:** 12–20 weeks for a bounded core HR and self-service pilot with an experienced team. Full payroll, recruitment, performance and learning are separate increments; “all HR” has no credible fixed date yet.

**People:** product/HR owner, technical lead, backend/frontend developers, QA and DevOps/support. Payroll expertise is additional if calculations are included.

**Cost model:** design/development effort + QA + infrastructure + integration + ongoing maintenance and rule changes. Small initial licence costs can hide a large engineering and support liability.

**Pros:** precise fit, source/control ownership under contract, choice of integration/data model; can remain useful for many years with maintenance. **Cons:** slower start, every missed HR edge case becomes Kandil's problem, key-person risk and long-term opportunity cost.

**Commercial potential:** a custom system can be sold, licensed or converted to SaaS without AI. Reuse becomes harder when organization IDs, policies and workflows are hardcoded. **Choose when:** proven product gaps justify development. **Do not justify this route by claiming:** “a custom system becomes useless” or “custom software cannot generate revenue.”

## Route 5 — Agentic HR Platform + RaaS / منتج ينفّذ نتائج

**Purpose:** create a Kandil-owned product that completes agreed HR processes, first internally and then for external customers. It can use Route 2 or 3 underneath; it does not require rebuilding their functions.

| Phase | Work and deliverable | Acceptance / owner |
|---|---|---|
| 1. Service catalogue | Define initial outcomes, eligibility, approval rules, exceptions, completion evidence and measurement | HR signs off policies; product owner identifies paying-customer hypotheses |
| 2. Foundation/connectors | Clean authoritative employee data; authenticated portal; narrowly permitted tools for underlying HR systems | Each action enforces identity/role/tenant rules independently of AI text |
| 3. Controlled execution | Start with dated letters, leave and attendance investigation; deterministic rules calculate dates/balances | Tasks persist once, audit trail is complete, failed actions recover or escalate |
| 4. Pilot | Run representative cases and employee cohort; compare baseline time and costs | Measure correctness, human touch time, completion, reopen rate and cost per result |
| 5. External validation | Test onboarding and willingness to pay with 2–3 potential design partners | At least one paid external pilot is a proposed gate before broad product investment |
| 6. Commercial operations | Tenant isolation, configurable policies, onboarding, metering, support, billing and release operations | Isolated customer data, repeatable deployment and a positive delivery-margin path |

**Planning envelope:** 10–16 weeks for a narrow internal pilot using an existing/structured backend. External productization is a separate proposed 3–6+ month stage after evidence from that pilot. These bands are not additive to every other route and are not a promised launch date.

**People:** product/commercial owner, HR process specialist, workflow/backend engineer, AI/integration engineer, frontend/UX, QA/evaluation and DevOps/support. External sales, onboarding and customer success require assigned capacity.

**Cost model:** underlying HR system + product engineering + model calls + hosting + messaging + connectors + monitoring + human exception handling + customer support. Measure cost per completed valid workflow, including failed attempts and corrections.

**Pros:** directly fits Kandil's ownership and sales objective; reusable domain workflows and Egyptian/Arabic operational expertise can differentiate it. **Cons:** highest operational responsibility; poor data creates wrong outcomes; AI mistakes/retries and human exceptions consume margin; vendors already offer agents, so “has AI” is weak differentiation.

**Choose when:** Kandil funds both internal delivery and an actual software/service business. **Narrow/pause expansion when:** the pilot cannot improve service quality/cost or external buyers will not pay enough to cover delivery and support.

## Confirmed letter workflow / الخطابات الذاتية

Employee opens **Generate new HR letter / إصدار خطاب جديد**, selects an approved type/recipient and confirms the request. The system verifies identity, reads approved current employee data, applies the template, inserts **the generation/download date using Africa/Cairo time**, issues a unique document ID, archives it and makes it immediately downloadable.

**Normal cases:** automatic issuance if Kandil has pre-approved that template and signing/issuance policy. **Exceptions:** changed/unverified salary details, unusual wording, recipient restrictions or approval/signature requirements go to HR. Automatic access is not permission for an employee to edit certified salary data.

The main generation/download action creates a fresh letter dated that day. A separate **Download archived copy** retrieves the original issued document with its original date; it must not silently rewrite the historical record. Log issue date, download timestamp, data/template version and approval where applicable. Same-day repeated downloads should not create duplicate billable outcomes.

## Finance: two separate cases / الجدوى المالية

**Confirmed ownership:** Kandil owns and sells the original product. Separate the following budgets and measures:

| Internal value / التشغيل الداخلي | External business / البيع |
|---|---|
| Baseline request volume and HR handling minutes | Paying customers, onboarding pace and retention |
| Correctness, service time and employee access | Subscription/outcome revenue and realized collections |
| Released HR capacity; actual avoidable cash costs separately | AI, hosting, integrations, support and exception-handling cost |
| Investment and ongoing operations allocated internally | Acquisition cost, onboarding effort, engineering and overhead |

Internal capacity value = monthly eligible requests × minutes saved ÷ 60 × loaded hourly cost. Deduct increased supervision/correction effort. This is not automatically a headcount reduction or cash saving.

External monthly contribution = recurring platform revenue + valid outcome fees − direct service delivery costs. Company profit additionally deducts sales, product development and overhead. Break-even customers = monthly fixed external-business costs ÷ average contribution per customer, only when contribution is positive. Shared engineering costs need an explicit allocation to avoid counting them twice.

**Illustrative measurement targets, to agree after baseline:** no unauthorized data access in acceptance tests; every issued document reconciles to approved source fields; every completed action has an audit trail; material reduction in measured HR touch time. Do not promise a “90-second letter” SLA before testing. Financial/payroll decisions and release remain with authorized staff.

## Before the proposal PDF

The letter date, five routes and Kandil ownership are confirmed. Still to settle: first two or three workflows, exact employee/site counts, source data/payroll owner, funding ceiling, delivery team, internal pilot criteria and first external buyer segment. These can be discussed from this content draft before designing the PDF.
