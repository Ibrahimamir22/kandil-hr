# قنديل | Company platform blueprint

Design draft 01 · 11 October 2026 · Prepared for Ibrahim and departmental review.

**الهدف:** بوابة واحدة للعمل اليومي تربط الإدارات، مع استمرار Odoo في مسؤولياته، واستخدام Frappe للموارد البشرية، وتطوير الوظائف الخاصة بقنديل في وحدات مستقلة.

This is an internal company platform. It is not a proposal to replace Odoo, rebuild every ERP function, or launch a SaaS/RaaS product. The accompanying clickable prototype contains synthetic data and runs entirely in the browser. Its role switcher demonstrates proposed experiences; it is not authentication or security. No live records or integrations are changed.

## 1. What is decided, proposed, and still unknown

| Status | Item |
|---|---|
| Confirmed by Ibrahim | One company experience alongside Odoo; HR, delivery and estimator are in the intended scope; Frappe is for HR only; Ibrahim develops with AI assistance. |
| Existing evidence | Local recruitment pilot, custom `kandil_hr` app, synthetic tests and browser checks. HR acceptance is still pending. |
| Recommended here | A custom portal and modular custom backend; Frappe retains HR rules/data; existing Odoo remains authoritative for its agreed records. |
| Proposed first release | Portal + a complete recruitment request/approval/joining journey, retaining native Frappe administration. |
| Needs discovery | Actual Odoo modules, version, hosting, API entitlement, record owners, delivery operations, identity provider, employee access, and production budget. |
| Separate acceptance | Egypt payroll, attendance devices, full privacy controls, restore tests, production workload and HR sign-off. |

The older business brief describes Odoo implementation in progress. The latest conversation says Kandil uses Odoo. This design follows that current direction but does not infer which individual workflows are operational.

## 2. Product structure / شكل المنصة

Navigation is organized around work, with departmental destinations:

```text
قنديل
├── Overview / نظرة عامة                 role-specific tasks and exceptions
├── My approvals / الاعتمادات             one inbox, decisions owned by each module
├── People / الموارد البشرية
│   ├── My services / خدماتي              letters, leave, requests (phased)
│   ├── Recruitment / التوظيف             request → approvals → openings → candidates
│   └── HR administration                native Frappe initially
├── Delivery / التوصيل                   dispatch → progress → proof → exceptions
├── Cost estimator / تقدير التكلفة       brief → engineering → quantities → costing
└── Administration / الإدارة             permissions, integrations, audit; restricted
```

The prototype adds an **Architecture** tab for the design review only; it is not intended for ordinary employee navigation. Odoo links should point to the relevant record when the destination and access rules are confirmed. A shared portal does not automatically grant Odoo access or avoid licensing obligations.

Do not add every possible department to release one. Complaints, projects, maintenance and other workstreams are candidates for discovery. Reuse configured Odoo workflows when they fit; add bespoke modules where an actual gap is established.

## 3. Users and scope / المستخدمون والصلاحيات

| Persona | Primary experience | Data scope and restrictions to implement |
|---|---|---|
| Employee | Own requests, documents, balances, status | Own records; no colleagues' salaries or applications. Confirm access for staff without work email. |
| Department manager | Team requests, assigned decisions, headcount | Effective department/site scope; cannot approve own requests through delegation. |
| HR recruiter | Recruitment queues, candidates, joining | Relevant company/site; compensation and personal documents require separate grants. |
| Sector authority | Justified headcount exceptions | Assigned authority and effective dates; not automatic access to all HR data. |
| Operations/dispatcher | Assigned deliveries, exceptions, proof | Branch/route scope; driver/customer contacts only as needed. |
| Estimator/engineer | Design revisions, reviewed quantities, costs | Assigned projects; rate changes and commercial approval are distinct permissions. |
| Executive | Aggregated operating performance and escalation | Aggregate first; role does not automatically expose payroll or candidate documents. |
| Platform administrator | Accounts, integration failures, configuration | Separate from business approval authority. Emergency access must be logged. |

These are proposed roles, not Kandil's signed organization chart. The production API must enforce scope on every list, detail, search, export, attachment and action. Hiding a navigation item is insufficient.

## 4. Architecture and recommended stack

```text
Employee / Manager / HR / Operations / Engineer
                       │
         Custom responsive portal (React + TypeScript)
                       │ HTTPS session
         Company API (Django, modular application)
         ├─ identity mapping, scoped navigation, audit, inbox projection
         ├─ delivery domain ─────────────── PostgreSQL
         ├─ estimating domain ───────────── PostgreSQL
         ├─ HR adapter ── Frappe HR + kandil_hr ── MariaDB
         └─ Odoo adapter ── existing Odoo (its managed database)
                       │
        background jobs / outbox / retry and reconciliation
```

**Recommendation, not an installed stack:** React + TypeScript for the portal; Django + a REST API for the custom business modules; PostgreSQL for custom transactional data. Use one modular custom application initially, not a fleet of microservices. It is easier for one developer to operate and keeps delivery and estimator transactions understandable. React build tooling and supported dependency versions should be pinned during implementation, not guessed in this design.

Frappe HR stays on its tested Frappe/Python + MariaDB stack with `kandil_hr` extensions. **Frappe is not Django.** The proposed Django service is separate. The ERPNext dependency in the HR installation is not a plan to move Odoo finance/inventory into ERPNext.

PostgreSQL is a database choice; Supabase is a possible managed PostgreSQL/service offering to evaluate against operations, network access, backup, residency and recurring cost. We do not need two competing authentication systems or a Supabase subscription for this prototype. Keep existing Frappe storage compatible; do not swap its database to unify branding.

Begin with one worker for integration jobs; choose its queue during implementation. Use object storage for custom delivery proofs/drawings with access-controlled URLs, while HR documents remain under Frappe's permissions unless a deliberate migration is approved. Never make private files accessible through an unprotected shared bucket.

The portal calls server APIs; it never holds Odoo/Frappe administrator secrets or writes directly to their databases. Frappe supports document and method APIs. For business transitions, call domain actions that enforce authority and invariants; do not bypass them with generic field updates. [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest)

Odoo's published external API documentation ties API availability to Custom pricing plans. Kandil's actual edition, hosting, version, contract and access must be checked with its implementation partner. Do not promise a free or working connector from a screenshot. Choose the API appropriate to its installed version. [Odoo external API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)

Technology background: [Django](https://www.djangoproject.com/) and [PostgreSQL](https://www.postgresql.org/about/). The architecture above is our recommendation; these sources do not establish suitability or capacity for Kandil.

## 5. Ownership of records / مصدر كل معلومة

| Record | Proposed authority | Other systems may hold | Writes |
|---|---|---|---|
| Employee, recruitment, leave | Frappe HR after acceptance/migration | Minimal ID/name/active status projection | HR actions go to Frappe; no second editable employee master. |
| Login/account | Identity service selected at identity spike | Immutable identity-to-employee mappings | Account removal and business employee status are coordinated, not assumed identical. |
| Customer, product, sales order, invoice, stock | Odoo where these workflows are configured | External IDs + read projections + sync timestamp | No portal duplication of authoritative stock/finance balances. |
| Delivery route, operational event, proof | Custom delivery module | Odoo reference and approved summary | Proof receipt does not silently validate an Odoo stock picking or invoice. |
| Estimate revision, quantity review, calculation snapshot | Custom estimator | Linked Odoo product/rate references | Approved costing may later create a draft quotation through an explicit approved command. |
| Rate master | Odoo or estimator: owner to be agreed | Dated/versioned cost snapshot in each estimate | Never overwrite old estimates when rates change. |
| Approval decision | Owning module | Central inbox projection/link | Inbox delegates the command; it is not another independent approval engine. |
| Source files in Google Drive | Transitional archive where permissions permit | Source ID, import batch, original upload date | Import reviewed records once, reconcile, then close that editing path. |

The group/company/branch identifiers need an agreed crosswalk. Avoid matching employees by name or candidates by phone alone across systems. No direct cross-database foreign keys: retain explicit external IDs, version, last-synced-at and reconciliation status.

## 6. First complete journey: recruitment

1. Requester selects job and one or more sites, quantities and reason.
2. Server validates effective department, capacity and authority. Above-capacity requests require the policy HR signs off; the current pilot uses an exception gate.
3. Submit reserves capacity; routing excludes self-approval. Assigned department and HR decisions follow the approved sequence.
4. All required approvals produce one opening per site line; reserved becomes open.
5. HR records candidates, including phone-only applicants; interview and offer stay in native Frappe initially.
6. HR confirms actual joining. Exactly one employee/onboarding record is created; open becomes occupied. Offer acceptance alone does not create occupied headcount.
7. No-show leaves the opening available; cancellation releases unfilled capacity. Every action records actor and authority.

Custom portal screens in release one: request list, multi-site request, detail/status and assigned decision. Retain Frappe for route configuration, candidate administration, interviews and offers. Design amendments, reduced quantities, shared phones, corrections, exits and transfers before exposing those actions.

Employee letters are a later, small self-service flow: verified identity → allowed template and fields → required approval/signature policy → generated document. Use the Cairo generation date for a newly generated download. Preserve an already-issued document's original date and audit trail; a later generation creates a new version. Never silently relabel an old signed document. Original uploaded files retain their upload date separately.

## 7. Delivery journey / التوصيل

Proposed pending operations discovery: order reference → dispatch planning → assignment → departure → arrival → proof captured → review → delivery outcome. Model partial delivery, refused items, rescheduling, damaged goods and return as distinct outcomes. Drivers only see assigned stops; offline retry must not create duplicate events.

First delivery slice should test one branch and one agreed delivery type. Start with manual event updates and reviewed proof. GPS/continuous live maps, route optimization, automated customer messages and Odoo stock updates are later decisions, not demonstrated capabilities. The prototype's delivery timeline is a simulation, not live location.

Required before build: dispatcher/driver/receiver roles, actual order source, dispatch fields, proof requirements, customer contact permission, partial/return policy, device/offline conditions and exception escalation.

## 8. Estimator journey / تقدير التكلفة

Use the 28 September discovery: intake and dimensions → materials/finish → engineer-reviewed design → 3D/unfolding/material takeoff → component pricing → accessories/electrical scope → production/outsourcing/tooling → overhead → commercial treatment.

The first estimator build should accept a reviewed component quantity list and versioned rates. It must show unit, quantity, waste convention, source and reviewer for each line. The prototype demonstrates a simple allowance convention, `quantity × (1 + waste%) × rate`; this is **not** proof of the actual cutting/yield, nesting, purchasing allocation or CAD rules. Validate those per component.

For review, the demo adds labor and outside work, then applies an explicit overhead percentage on that subtotal. This base is illustrative and requires approval. Markup, margin, tax, quote generation and image-to-quantity AI are not included in its material-cost result. EGP values are synthetic and are not extracted from client historical prices.

Use a fully documented historical product to reconcile quantities and cost lines before commercial totals. Historical listed prices alone cannot validate the model. Freeze each approved revision; changed inputs produce a new revision rather than silently recalculating an approved result.

## 9. Identity, integrations and failure handling

- **Identity spike before integration:** determine employee login method, factory shared-device restrictions, recovery, manager MFA and termination handling. Staff may lack company email. A shared login is a target, not delivered by the mockup.
- **Frappe actor binding:** choose a supported per-user delegation/token approach or a narrowly scoped custom endpoint that validates a trusted mapped actor. Test spoofing, privilege escalation and revoked access. Never forward an arbitrary `employee_id` with an all-powerful service token.
- **Reliable writes:** each command carries an idempotency key and expected record version. Each owning module validates authority/state and commits its action atomically. A retry of joining or approval must not duplicate a result.
- **Events:** commit a transactional outbox with the source action, then deliver in the background. Consumers deduplicate by event ID. Retry temporary outages; quarantine invalid messages for review. Cross-system work is not one shared database transaction.
- **Visible failures:** show last successful sync, pending/failed status and a safe retry. If Frappe is down, cached read views are labeled stale; do not claim a pending approval succeeded. Odoo disconnection must not disable independent HR functions.
- **Reconciliation:** scheduled comparisons identify missing mappings, lost events and count differences. Decisions must revalidate live state even if inbox data is cached. Logs link actor, command, source event and external record without dumping personal data/secrets.
- **Files and sessions:** private files, scoped downloads, secure cookies/CSRF protection, least privilege, audit and retention rules. Separate development/staging/production; backups plus actual restore drill are release gates.

AI comes after stable domain actions. It can later draft requests, summarize exceptions or explain cost differences, but must use the same scoped APIs and approval rules. An agent is not a source of authority or a replacement for deterministic cost calculations.

## 10. Build sequence and exit criteria

| Stage | Deliverable | Exit evidence |
|---|---|---|
| Now: design review | This blueprint, navigation and clickable prototype | Ibrahim agrees boundaries and initial journey; HR/operations/engineering identify changes. |
| 1: acceptance + integration spikes | HR reviews existing pilot; identity and Odoo access documented; Frappe actor mapping tested | HR rules signed off; own/other user tests; exact Odoo access/ownership confirmed. |
| 2: portal + recruitment vertical slice | Real role-scoped portal → Frappe request and approval; native HR admin links | Multi-site submit, exception, denial, concurrency, stale version, retry and audit pass in staging. |
| 3: delivery pilot | One branch, events, proof, exception handling; read-only Odoo link first | Operations completes realistic delivery, refusal, partial and offline/retry cases. |
| 4: estimator pilot | Reviewed quantities, rate versions and reproducible snapshots | Engineering reconciles one complete reference item; no unexplained quantity/cost differences. |
| 5: controlled production | Migration rehearsal, operator runbook, monitoring and rollback | Permissions review, restore drill, agreed workload test and named business owners approve. |

Stages are a proposed sequence, not calendar or price commitments. Run delivery/estimator discovery alongside the HR slice, but do not build all departments simultaneously. One thousand employees is a population, not a concurrency estimate: measure active sessions, punches/events per day, file volumes and peak approval activity before sizing infrastructure.

## 11. Decisions for the next review

1. Is recruitment the first portal release, or is delivery more urgent? Proposed default: recruitment because the technical pilot exists.
2. Who signs the HR routes, headcount exceptions, delegation, offer authority and joining rules?
3. Which Odoo records are operational and who owns their integration contract?
4. How will factory employees authenticate without email, and which devices will they use?
5. What is the exact first delivery outcome and required proof?
6. Which engineer owns quantity/rate approval and the first documented estimator reference case?

## 12. Evidence and review limits

Read on 11 October 2026:

- [Pilot engineering notes](../Frappe_HR_Pilot_2026-10-11/Engineering_Notes.md) — implemented recruitment boundary and limitations.
- [HR acceptance checklist](../Frappe_HR_Pilot_2026-10-11/HR_Review_Checklist_AR_EN.md) — human review remains pending.
- [Pilot report](../Frappe_HR_Pilot_2026-10-11/Kandil_HR_Pilot_Results.html) — earlier test evidence, not rerun for this visual design.
- [Estimator discovery](../../03_Projects/Kandil_Projects_Costing/Workflow_Discovery_2026-09-28.md) — engineering/quantity-first sequence.
- [Business brief](../../01_Business_Context/Business_Brief.md) — historical Odoo/partner context; latest user directions take precedence.

Delivery details, identity method and broader stack are proposals. This artifact does not claim live Odoo, Frappe or Drive connectivity, actual employee permissions, completed HR acceptance, production capacity, or an approved estimate.
