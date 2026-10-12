# قنديل | HR Web Platform

## 01 — القرار المقترح / Executive decision

**Architecture options, experience review and delivery plan · 12 October 2026 · Internal discussion draft v1.0**

**المطلوب:** بوابة موارد بشرية مخصصة لقنديل، بالعربية والإنجليزية، تحافظ على وظائف المستودع المرجعي وتطور تجربة الاستخدام والأمان والاعتمادية، وتخدم أكثر من 1,000 مستخدم. يجب أن يجد الموظف والمدير مسار عمل واضحًا داخل بوابة واحدة.

**التوصية:** نبدأ بواجهة مخصصة متصلة بمنطق Frappe HR وتخصيصات قنديل، بشرط نجاح تجربة كاملة مبكرة. إذا أثبتت التجربة أن الربط أو نموذج البيانات يقيّدان المتطلبات الأساسية، نختار واجهة مخصصة مع Backend جديد. شكل الشاشات وحده لا يحسم اختيار قاعدة البيانات أو الـBackend.

The recommended direction is **a dedicated Kandil HR web application**, with its own coherent navigation, branded login and role-specific workflows. It must preserve the reference portal's business behavior, with approved improvements. It is an internal company system alongside Odoo; this report does not assume a SaaS/RaaS business or replace Odoo.

Two choices are evaluated throughout:

- **A — Custom portal + Frappe HR backend:** retain useful HR models and tested Kandil rules; replace the daily staff interface with a purpose-built web application.
- **B — Custom portal + custom backend:** build the same user experience using a new Django/PostgreSQL business system; migrate or reimplement the existing rules and records.

Recommend **A provisionally**, because of potential reuse and lower reimplementation risk. This is conditional on the S2 demonstration and security checks—not a decision based on sunk development effort. B remains a credible choice if A fails that gate. Neither option is production-ready today, and neither framework guarantees security or capacity by itself.

**What this report delivers:** an explanation of the three screenshots; a critical comparison; recommended stacks; data and API boundaries; measurable security and 1,000+ user targets; detailed delivery sprints for both choices; migration, testing, release and support gates; and a mapping of all 98 reference requirement IDs. This report is a plan, not a claim that the proposed work has been implemented.

## 02 — ماذا تقول الصور؟ / Screenshot assessment

### Screenshot 1 — The reference experience

![Reference Kandil recruitment portal](assets/01-reference-portal.png)

The reference presents an Arabic-first recruitment portal with a persistent right sidebar, Kandil red accents, greeting, language switch, search and an action-focused home page. “المطلوب منك” makes pending decisions visible; interviews and vacancy cards help users understand today's work. The navigation groups recruitment, candidates/interviews, organization/employees, reports and administration.

**Keep:** recognizable branding; clear role-based inbox; meaningful Arabic labels; grouped navigation; status and next action; contextual forms rather than raw database tables. Preserve useful details such as browser Back behavior and approved filters.

**Improve:** accessible contrast and keyboard use; mobile flow; empty/loading/error states; readable dates and amounts; permissions on search results; concise task descriptions; persistent filters; confirmation and recovery for important actions. A warning about a stopped daily job is visible in the screenshot: routine users should see a service-impact message, while the technical diagnosis and repair instructions belong in an administrator health screen. Build real scheduled jobs with monitoring.

The screenshot is visual evidence of the displayed interface only. It does not prove successful triggers, security, or handling of 1,000 users. The repository's “Built” labels are source claims, not independent production certification.

### Screenshot 2 — Our pilot shortcuts

![Current pilot shortcuts](assets/02-current-pilot.png)

This screen is a directory of links to HR tools. It exposes the implementation rather than the employee's task. Arabic and English appear together in each card, the page is long, and it gives little indication of urgency, ownership or what to do next. The visible account is Administrator, so this is also not a representative ordinary-user permission demonstration.

**Disposition:** retain it only as a temporary technical review page. It should not be the final employee or manager home screen. Replace it with a selected-language dashboard, role-specific tasks and direct actions. Testing notices belong in a compact environment badge, not large blocks of implementation text in normal production workflows.

### Screenshot 3 — Native Frappe recruitment list

![Native recruitment list with synthetic test records](assets/03-native-frappe-list.png)

This is a native administrative Job Opening list. It offers structured filters and record access, but technical fixture names such as REC/CONC/BROWSER dominate the displayed data. A user cannot easily see a readable job title, branch, recruiter, age, remaining seats and next action together. The native navigation also exposes functionality beyond the focused workflow being demonstrated.

**Disposition:** keep native administration available to authorized operators where useful. Build a custom vacancy view for daily work, with readable synthetic examples during demonstrations and real approved data after migration. Do not delete test history just to make the screen attractive; isolate presentation/demo fixtures from regression data.

**Conclusion / الاستنتاج:** The primary demonstrated problem is product experience and task organization. A new frontend can address it with either backend. Cosmetic restyling alone will not deliver the guided workflows shown in the reference.

*Images supplied by Ibrahim on 12 October 2026. They include browser/account context and are retained unaltered for internal review. Prepare a separately reviewed, redacted copy before external distribution.*

## 03 — Current evidence and scope boundaries / الوضع الحالي

The inspected reference checkout is [mohamedomara-hr/kandil-recruitment-portal](https://github.com/mohamedomara-hr/kandil-recruitment-portal/tree/7824be24292c4743b4005e14e2df540786cfe167), commit `7824be24292c4743b4005e14e2df540786cfe167`, version v0.50.0. The local source declares **98 requirements: 94 Built, 3 Partial and 1 Later**. This report uses that pinned snapshot; it does not assert it is the latest remote revision.

The existing custom-app checkpoint records **70 passed / 6 partial / 4 blocked** for **80 cases covering 40 selected requirements**. It also records 31 passing regression suites at tested source `1ea28738982841adf475681f03bbf349b28c6ef7`; metadata commit is `dd3b7598da0e198037322e9c3a479e9b649b1197`. The current working tree contains newer unfinished headcount changes. Those changes are not covered by that checkpoint. Earlier browser evidence has its own dates and source revisions.

Existing work can inform architecture, rules and tests. Reuse requires a code/API review and new interface acceptance. **70/80 is not a completion percentage for the full HR product or the proposed portal.** Native UI tests do not automatically certify a replacement frontend. The original 80 cases remain unchanged; new portal, security and full-scope cases must be added.

| Delivery boundary | Included in the core plan | Important limit |
|---|---|---|
| Reference parity | All 98 requirements and the 16 supplemental packages already identified in the baseline | Resolve source contradictions and deferred items explicitly; preserve traceability |
| User experience | Custom AR/EN portal, RTL/LTR, mobile layouts, role home, guided journeys, public candidate surface | Public candidates require a different permission boundary from employees |
| HR lifecycle | Organization, hiring, candidates, interviews, compensation approvals, offers, joining, documents, onboarding, probation, transfers and reports | Each module requires its own acceptance; existing isolated joining code is not full lifecycle delivery |
| Security and operations | Identity, permissions, private files, audit, queues, monitoring, migration, recovery and release | No production readiness without evidence and named operators |
| Standard HR extensions | Employee self-service, leave, attendance and letters have a separate extension plan below | These are additional requirements, not automatically covered by recruitment parity |
| Odoo / wider company | Define ownership and future integration seams | No delivery tracking, estimator or Odoo implementation in this HR release |
| Payroll | Compensation records, approved offer calculations and follow-up notices only | No wage withholding or payroll action from missing documents; payroll engine and Egypt localization require a separate approved project |

“Same as the repo and better” means measurable improvements in usability, privacy, correctness, performance, recovery and maintainability. It does not mean copying every historical security exception or treating preliminary contract language as approved legal policy.

## 04 — Two choices / مقارنة المسارين

| Dimension | A — Custom portal + Frappe HR | B — Custom portal + custom backend |
|---|---|---|
| User-facing design | Fully custom; staff need not use native Desk for agreed journeys | Fully custom; same design scope |
| Existing code | Reuse eligible records, validations, approval rules and tests after review | Reuse requirements, designs and expected outcomes; Frappe-specific code needs porting |
| Standard HR | Can configure and extend existing HRMS capabilities | Build required capabilities or deliberately integrate another service |
| Workflow freedom | High through custom commands, but subject to Frappe models, hooks and upgrade constraints | High with models and services designed directly for Kandil |
| Integration work | Adapter/read-model APIs, authentication, file authorization and direct-API bypass review | Entire API/service layer, state machines, migrations and permissions |
| Security burden | Framework features help; custom endpoints, permissions and exposure still require proof | Framework features help; more application infrastructure and domain controls to build |
| Scale | Tune MariaDB queries, worker concurrency, web capacity and shared storage | Tune PostgreSQL queries, worker concurrency, web capacity and shared storage |
| Maintenance | Maintain custom frontend, extension and compatible upstream upgrade path | Maintain frontend, backend, domain modules, admin tools and dependency upgrades |
| Database | MariaDB for the current tested Frappe HR stack | PostgreSQL; managed hosting optional |
| Delivery risk | Hidden coupling to Desk/session hooks; careless generic APIs may bypass business rules | Rebuilding mature behavior, migration omissions and underestimated operational work |
| Vendor/framework dependence | Frappe ecosystem and its supported dependency combinations | Django ecosystem plus selected infrastructure providers; not dependence-free |
| Cost pattern | Less potential domain rebuild; infrastructure, testing, updates and support remain | More implementation/revalidation; infrastructure still required |
| Best fit | The existing domain behavior works through secure APIs and future HR modules benefit from HRMS | Core requirements repeatedly fight the Frappe model or a custom platform is strategically justified |

**A must pass before wider investment:** an ordinary requester creates a multi-location request; an independent approver reviews the exact version; one vacancy per location is created; capacity remains correct; a second user cannot access private data; the entire journey stays in the branded portal in both languages. Confirm session expiry, logout, stale updates, duplicate clicks, file authorization and upgrade compatibility. Measure API latency and query count. Record any upstream patch required and reject unexplained core modifications.

**Choose B if:** critical behavior needs recurring core forks, secure session/API integration cannot meet requirements, or measured whole-life maintenance is worse after the spike. A failed screen layout is not an A-backend failure. Any choice must record reasons, effort estimates, migration impact and HR sign-off.

## 05 — Recommended technology / التقنية المقترحة

### Shared frontend for A and B

| Layer | Proposed selection | Reason and responsibility |
|---|---|---|
| Web application | React + TypeScript + Vite; React Router | Interactive internal portal with explicit routes; no initial requirement for server-rendered staff pages |
| Server data | TanStack Query | Deliberate loading/error states, invalidation and per-session caching; clear cache on logout/account change |
| Forms | React Hook Form + Zod | Reusable forms and immediate feedback; server revalidates every consequential field |
| UI | Tailwind CSS + selected accessible Radix/shadcn components | Kandil-owned design tokens; test RTL, focus and keyboard behavior rather than assuming component accessibility |
| Languages | i18next; Arabic and English catalogs; CSS logical properties | One active UI language; mixed names and identifiers rendered with correct direction |
| Tests | Vitest, Testing Library, Playwright, axe checks | Domain-aware component tests plus real role-based browser journeys |

This is a proposed engineering selection, not a dependency installation. Pin supported compatible versions at S1 and keep lockfiles. React's documentation identifies the extra routing and data-fetching work needed in a client application; this stack names those responsibilities explicitly. [React documentation](https://react.dev/learn/build-a-react-app-from-scratch)

Do not add a second Node business backend simply because React is used. If a public careers page later needs search-engine rendering, assess a separate public rendering layer without duplicating the private HR business system. A PWA shell is optional; offline storage of sensitive HR records is disabled by default.

### A — Backend and deployment

- **Application:** the compatible pinned Frappe Framework + ERPNext dependency + HRMS stack, with Kandil rules in `kandil_hr`. Keep the upstream repositories separate. Review dependency and distribution obligations before changing packaging.
- **API:** a versioned, documented portal contract over authenticated Frappe methods. Reads return only the fields allowed for the current role; commands enforce the same domain invariants as other entry points. Do not grant broad write access to bypass workflows.
- **Data:** MariaDB owns the HR business records. Redis provides the required cache/queue services; Frappe workers process jobs. A scheduler must actually be deployed, monitored and tested; a web-only local container is insufficient for production.
- **Deployment:** static frontend and API under one HTTPS origin via a reverse proxy; production application servers, workers and scheduler separated logically. Native Desk restricted to appropriate operators. Use production processes rather than development `bench serve`.
- **Files:** private durable storage through a reviewed Frappe-compatible file integration, or protected shared storage with backups. S3-compatible storage is a deployment option to prove, not a completed connector.

Frappe documents authenticated API calls and custom methods, background workers and production deployment. These are available mechanisms; our complete portal integration still needs implementation. [API](https://docs.frappe.io/framework/user/en/api/rest), [jobs](https://docs.frappe.io/framework/user/en/api/background_jobs), [production](https://docs.frappe.io/framework/user/en/production-setup).

### B — Backend and deployment

- **Application:** Django + Django REST Framework, organized as a **modular monolith**: identity/access, organization, recruitment, interviews, offers, employee lifecycle, documents, reporting and audit. One deployable domain system initially; avoid premature microservices.
- **Data:** PostgreSQL, explicit migrations, relational constraints and transactional locking for headcount and joining. Redis + Celery for background work, with one coordinated scheduler and an outbox for durable events.
- **API:** documented OpenAPI schema; role- and scope-filtered queries; explicit commands for approvals, reservations, joining and transfers; optimistic version checks and idempotency keys.
- **Administration:** Django Admin for controlled support operations, not unrestricted bypass of HR workflow; privileged corrections call audited business services.
- **Files/deployment:** private S3-compatible storage with authorization checks; same-origin HTTPS frontend/API; separate workers and database; durable backup and recovery automation.

Django provides security mechanisms, but configuration and application-level authorization remain our responsibility. DRF object permissions do not automatically filter every list or enforce every create rule; those paths need explicit controls. [Django security](https://docs.djangoproject.com/en/5.2/topics/security/), [DRF permissions](https://www.django-rest-framework.org/api-guide/permissions/).

### Database decision and Supabase

For **A**, retain MariaDB for compatibility with the existing tested HRMS stack. Replacing it solely for a preferred hosting brand would introduce a separate migration/compatibility project.

For **B**, Supabase is a possible managed PostgreSQL provider: its database is PostgreSQL, not a different database engine. Hosting, authentication and storage are separate decisions. Keep one identity authority and execute privileged HR commands through the backend; do not put service-role credentials in the browser or duplicate approvals in client code. Evaluate connection pooling, region, backups, recovery, operational limits and total cost before selecting a plan. [Supabase database documentation](https://supabase.com/docs/guides/database/overview)

There is no evidence in the current requirements that a document database or a microservices architecture is necessary. The main data relationships—positions, assignments, approvals and capacity—fit a relational design.

## 06 — Architecture and ownership / توزيع المسؤوليات

```text
Employee / Manager / Recruiter / HR / Executive
                  │
         Kandil AR/EN web portal
                  │ HTTPS + personal session + CSRF protection
         Versioned HR API / permission boundary
                  │
       Domain commands + filtered read models
          ├── HR database (one owner)
          ├── Private documents
          ├── Transactional outbox → workers → email/in-app notices
          └── Business audit → protected external integrity evidence

Odoo ── explicit future integration contract ── HR API
Public candidates ── restricted intake/self-service API ── HR domain
```

**Records and invariants:** Person and Application are distinct; shared phone numbers do not justify automatic merging. Job, Position, Employee, Assignment and Vacancy remain separate. Capacity is keyed by stable position/allocation and location, with explicit occupied/reserved/open amounts. Effective dates matter. Keep reviewed approval snapshots, original actor, delegated principal, reason and timestamps. A material revision must trigger the approved reapproval policy. Joining and transfers update related records atomically; replay cannot create duplicate employees or headcount.

**No duplicate HR database:** the frontend stores transient UI state, not a second authoritative employee register. Dashboards and reports are derived views. Odoo remains authoritative for its existing commercial/accounting scope; overlapping identifiers and data ownership need a signed contract before synchronization.

**Proposed API behavior:** every mutation carries a unique command ID and reviewed record version. Return a documented success, business denial, version conflict or authorization error. UI preserves entered values on recoverable failure. HTTP status and error envelope must be consistent; frontend must never equate every HTTP 200 with business success. Prevent retries from duplicating notifications or reservations. Validate field-level output on search, lists, exports, PDFs, realtime events and direct file access—not only detail pages.

**Identity:** same-origin secure personal sessions for staff, server-enforced idle/absolute expiry and logout revocation. Choose native MFA or an approved external identity provider during S0/S2; do not run two unrelated password stores accidentally. Public candidate links have narrow purpose, expiry, revocation and independent authorization. Administrator API keys must never be embedded in the frontend.

## 07 — 1,000+ users / السعة والأداء

**أكثر من 1,000 حساب لا يعني أن 1,000 شخص يضغطون زر الاعتماد في نفس اللحظة.** We need both the registered population and a measured peak workload. The figures below are **proposed acceptance targets**, not observed production performance or a hardware guarantee.

| Profile | Proposed test | Purpose |
|---|---|---|
| Data volume | 1,500 enabled synthetic users, 2,000 employees, 100,000 applications, 1 million audit events and representative document metadata | Test indexes, pagination, permission filtering and reporting against multi-year data; revise to actual forecasts |
| Normal peak | 100 active virtual users for 60 minutes with realistic 5–20 second think time | Model ordinary mixed daily work |
| Shift/busy peak | 300 active users for 30 minutes, including login, search and independent submissions | Exercise shared dependencies and request bursts |
| Population burst | 1,000 concurrent authenticated sessions, ramped over 10 minutes, held 15 minutes with realistic think time | Prove session handling and a plausible simultaneous staff population; not 1,000 writes/sec |
| Arrival-rate test | Sustained 50 requests/sec for 30 minutes; 100 requests/sec for 5 minutes | Detect queuing under a fixed offered load; record dropped iterations and achieved throughput |
| Contention | 50 simultaneous attempts on one last seat in BLOCK mode; separately test approved WARN/exception behavior and duplicate approval/join/transfer commands | Prove business correctness under collisions, not just throughput |
| Soak / resilience | Eight-hour mixed run, worker interruption, provider outage and database recovery rehearsal | Detect leaks, stuck jobs, duplicate delivery and recovery errors |

Initial mix: 70% scoped reads/search, 20% validated commands and 10% job submission/status. Exercise document uploads/downloads separately at 20 parallel transfers with an initial 10 MB limit. Measure file storage and bandwidth rather than embedding large binaries in every load test. Public-candidate abuse and employee shift-check-in spikes are separate scenarios. Record browser network/CPU profile, test topology, dataset, commit and measurement interval with every result.

**Target gates:** API p95 ≤500 ms for indexed normal reads and ≤1 second for transactional commands under the accepted normal-peak profile; browser key-page p95 ≤3 seconds on the agreed office/mobile profile; unexpected server/network failure rate <0.5%; no authorization leak, lost committed command or duplicate business effect. Under higher stress, apply bounded queues and controlled backpressure; no silent corruption. Expected business denials are counted separately from infrastructure failures. Load generators must have enough capacity and report scheduled versus achieved request rate. k6 supports separate open/arrival-rate and closed/concurrent-user models. [k6 workload models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)

**Provisional benchmark topology, not a purchase recommendation:** two application instances, initially 4 vCPU/8 GB each; a separate 4 vCPU/8 GB worker tier; an 8 vCPU/16–32 GB database with SSD storage; separate queue/cache capacity and private durable file storage. Tune or reduce this after measurements. Database connection limits, slow queries, lock wait time, CPU, memory and queue age determine changes—not user count alone. Budget the production standby/backup topology separately; two web instances do not remove a single database failure point.

**Candidate service objectives:** 99.9% monthly availability, database recovery-point objective ≤15 minutes and recovery-time objective ≤4 hours, subject to IT approval and funded infrastructure. File recovery must be consistent with database recovery. Verify backups, binlogs/WAL or equivalent recovery mechanism, encryption keys, file versions and restore steps together. A weekly dump alone cannot satisfy these targets. Measure recovery on a clean environment before rollout.

## 08 — Security requirements / الأمان كشرط قبول

**Security is a tested release condition.** Use OWASP ASVS v5.0.0 Level 2 as the proposed assessment baseline, confirming the published requirement set at W0, with additional controls for confidential pay, identity documents and executive authority. Map applicable requirements, justify exclusions and commission independent review; this is not a certification claim. [OWASP ASVS](https://owasp.org/projects/asvs)

The following controls are proposed Kandil requirements. They require implementation evidence in either option:

| Control area | Required behavior | Acceptance evidence |
|---|---|---|
| Identity | Individual accounts; MFA for privileged access and agreed staff policy; no automatic CEO exemption; controlled recovery; disabled-user session revocation | Enrolled real-role login, expired sessions, lost-device recovery and direct API denial |
| Session/browser | HTTPS, Secure/HttpOnly cookies, suitable SameSite policy, CSRF defense, restrictive CORS/CSP, server idle and absolute timeout | Cross-origin attacks, stale session, logout, shared-device and token leakage tests |
| Authorization | Server role + company + unit + record + field checks; separate employee, recruiter, interviewer, manager and executive visibility | Horizontal/vertical access tests across UI, API, search, export, files and events |
| Approval authority | No self-approval; dated delegation; independence for controlled changes; reviewed version; reasoned overrides | Actor/principal matrix, simultaneous approvals, revoked delegation and stale-role tests |
| Candidate/pay privacy | Minimum data, purpose-bound access, hidden compensation and private interview notes | Blind feedback, shared candidate across companies, field redaction and filtered-count tests |
| Files | Private-by-default storage, type/size checks, malware quarantine, authorized downloads and upload ownership | Guessed IDs/URLs, malicious file, expired links and access revocation tests |
| Application attacks | Validated input, escaped output, parameterized queries, SSRF restrictions, safe imports/PDF rendering | Injection/XSS/SSRF tests, malicious CSV formulas and hostile document URLs |
| Audit | Actor, principal, time, reviewed input and outcome; protected audit access; independent tamper evidence | Alteration/deletion detection, denied access, key rotation and restore verification |
| Background jobs | Durable outbox, bounded retries, deduplication, dead-letter handling and ownership | Restart during delivery, provider outage, replay and no-user-login scheduled execution |
| Deployment | Private DB/Redis; secret manager; least-privilege services; separate environments and credentials | Network scan, secret scan, backup access and deployment configuration review |
| Supply chain | Locked dependencies, vulnerability/license review, protected branches, reviewed changes and reproducible build | CI artifacts, dependency inventory, reviewed exceptions and release digest |
| Operations | Alerts, incident owner, recovery drill, access reviews, retention and deletion procedure | Tabletop incident, actual restore, revoked staff access and deletion replay after restore |

Private data must not enter analytics trackers, logs or error-reporting payloads. Sensitive screens must not be cached by shared proxies or service workers. A local immutable record does not prevent a database administrator from changing storage; independent integrity evidence and key custody remain distinct requirements.

Company/entity separation must be enforced even when one HR team manages several entities. Test transfers, shared candidates and delegated authority explicitly. Convenience features such as “who is online” require an approved purpose and minimum data; they are not a reason to collect detailed employee activity histories.

Preserve business intent while reviewing source security choices. An email OTP or a device/PIN shortcut must not silently substitute for stronger required authentication. Approved alternatives need a documented parity decision and user training.

Contract, insurance, retention and payroll-related templates require Kandil HR/legal approval. This report makes no legal compliance assertion and does not adopt legal statements from the prototype as verified law.

## 09 — Product experience and measurable improvements / أفضل من المرجع

The portal home should answer: **What needs my action? What changed? What can I do next?** Select language once; keep navigation and forms consistent. Use Kandil branding without sacrificing contrast or readability.

| Surface | Required experience | Proposed quality target |
|---|---|---|
| Role home | Action inbox, urgency, upcoming interviews, owned vacancies and clear next step | ≥90% unassisted completion across five agreed representative tasks in a moderated pilot |
| Hiring request | Guided steps, multi-location lines, headcount explanation, draft recovery and route preview | ≥20% lower median task time than measured reference for the same task; no unsupported improvement claim before benchmark |
| Approvals | Reviewed version, change summary, capacity/exception evidence and reasoned actions | No lost input after denial/conflict; no duplicate decision after retry |
| Vacancies | Readable titles, branch, approved/filled/remaining seats, team, age and next action | Scoped search and filters; keyboard and mobile alternatives to drag-and-drop |
| Candidate file | Person/application separation, timeline, next action, consent and restricted tabs | No unauthorized pay, interview feedback or document disclosure |
| Offers and joining | Guided calculations and approvals, versioned offer, document checklist and actual start confirmation | Agreed financial test examples pass; joining happens once and no-show does not fill a seat |
| Reports | Explain KPI numerator/denominator, reporting period and data freshness | Reconciles with source records; privacy thresholds also apply to exports and filters |
| Accessibility | Keyboard flow, visible focus, labels, sensible reading order, zoom and screen-reader checks | Target WCAG 2.2 AA; automated scans plus manual testing, not an automatic compliance claim |

Keep notifications actionable and avoid duplicate reminders. **Proposed letter-date clarification for approval:** satisfy the requested generation/download-date behavior by issuing a newly numbered version dated today in Cairo when the employee requests a fresh letter. Re-downloading a previously issued version preserves that version's issue date and records a download. The portal must clearly distinguish these actions so historical documents are not silently rewritten.

AI may later assist with document extraction, drafting and evidence summaries. It must operate through scoped tools with human approval for consequential HR actions. CVs and uploaded documents are untrusted input; test prompt injection and data leakage. No automated hiring rejection, salary change or access grant is implied by an “AI” feature.

## 10 — Delivery method and schedule / طريقة التنفيذ

The sprint IDs below are **a new proposed portal roadmap**, distinct from the existing S0–S4 Frappe implementation tracker. Use prefix **W** to avoid rewriting history. All new sprint statuses begin **Planned**; existing evidence is input, not automatic completion.

Assumption: one primary developer (Ibrahim) using AI agents, with scheduled HR decisions and access to an independent security/QA reviewer and an infrastructure operator. Agents can accelerate bounded tasks, but do not replace human business approval or independent security accountability. A person may cover multiple roles; unresolved ownership remains a release risk.

**Planning units:** 14 two-week sprints for A, giving a nominal 28-week sequence. Allow roughly 25–40% contingency for source gaps, review and integration: about **35–40 weeks** as an initial solo-led planning envelope. For B, add four two-week backend-foundation sprints and allow wider rebuild contingency: **36 nominal weeks, approximately 45–54 weeks**. These are preliminary estimates, not fixed commitments or staffing quotes. Re-estimate after W2 from actual throughput. More contributors may shorten independent work; shared domain dependencies still constrain the schedule. External approvals or unavailable integration sandboxes can extend either path.

**Parallel lanes:** UX/frontend; domain/API; security/infrastructure; QA/data. At most one owner edits a shared schema or contract at a time. Mock API contracts unblock UI work; only real API tests provide integration acceptance. Run database-mutating tests on independent disposable databases or serialize them. Review and merge small changes; keep unfinished work behind feature flags. Do not claim all sprints can run simultaneously.

**Common definition of done:** reviewed code; requirement IDs mapped; tests with ordinary roles and denied cases; AR/EN screen evidence; migration/rollback reviewed; no unapproved severe security issue; updated operating documentation and tracker. Business acceptance and technical pass are separate fields.

## 11 — Detailed sprints / خطة التنفيذ التفصيلية


**A sequence:** W0 → W1 → W2 decision gate → W3–W11 feature delivery → W12 release assurance → W13 rollout/handover.


**B sequence:** W0 → W1 → W2 decision → B1 → B2/B3 coordinated foundation → B4 real integration gate → W3–W11 → W12 → W13. The estimate conservatively budgets all four B sprints; possible B2/B3 overlap is not pre-credited.


### W0 — Scope, decisions and threat model / تثبيت النطاق

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** None; begin with the pinned reference and current checkpoint.

**Work and owners:** Lead: inventory all 98 IDs, 16 supplemental packages, source decisions and current unfinished changes. HR: approve personas, legal entities, authority, headcount interpretation, contract-template owner and source-of-truth mapping. UX: observe five reference tasks and record baseline completion/time. Security: classify pay, identity documents and candidate data; draw trust boundaries and attack cases. Operations: identify account volumes, peak patterns, retention, identity provider and recovery owner.

**A / B differences:** A: inventory reusable endpoints and Frappe coupling. B: estimate missing domain services and data migration. Both: create an architecture decision record, backlog and decision register without modifying production.

**Exit evidence:** Approved scope/must-have list; every reference ID has a delivery owner and sprint; every unknown has a decision owner/date. Threat model and load assumptions recorded. HR agrees which source behavior is preserved or deliberately replaced.

**Parallel work:** UX research, source mapping and infrastructure discovery run in parallel; HR policy decisions constrain dependent implementation.

### W1 — Design system and complete prototype / التصميم وتجربة الاستخدام

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W0 personas and scope; synthetic data only.

**Work and owners:** UX/frontend: Kandil design tokens, branded login, AR/EN switch, RTL/LTR layouts, role sidebar, task inbox, request wizard, approval detail and vacancy view. Include loading, empty, error, forbidden, stale-version and session-expired states. QA: keyboard, mobile, zoom and low-connectivity walkthroughs. Backend: define typed request/response contracts and meaningful fixture names.

**A / B differences:** Same frontend work for both choices. Keep backend-neutral domain terminology; do not expose Frappe DocType labels as the information architecture.

**Exit evidence:** Ibrahim and HR review five linked screens and one complete clickable journey in both languages. Prototype meets the agreed navigation and usability criteria. Record changes and unresolved issues; a mock prototype is not API or security proof.

**Parallel work:** Frontend components, translation review and API contract drafting can overlap; freeze accepted contracts before separate implementations.

### W2 — Connected proof and architecture decision / تجربة فعلية وحسم المسار

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W1 screen review and W0 identity/authority decisions for the proof.

**Work and owners:** Build a thin real journey: requester submits multi-location request, manager/HR review a version, approved vacancies appear with correct capacity. Use ordinary role sessions, same-origin security, private document access, scoped search and denied-action UI. QA: duplicate click, replay, stale edit, revoked user and cross-company tests. Operations: staging configuration, logs and basic metrics.

**A / B differences:** A: connect selected existing commands through reviewed adapters and fix API gaps; isolate unverified headcount changes. B: if selected early, prove a minimal authenticated command/transaction spike and use B1–B4 to complete its foundation. Never label a mocked B journey as integrated. Decision record compares implementation effort, security, upgrade impact and measured latency.

**Exit evidence:** A may proceed only if the complete real flow stays in the portal and all critical permission/ledger cases pass. Otherwise document a fixable gap or choose B. B must repeat the full real journey at B4 before W3 feature expansion. User/HR approves experience; lead approves backend evidence.

**Parallel work:** Frontend and API work can overlap on stable contracts; integrated DB mutation tests are serialized. This is the first product decision gate, not the first security discussion.

### W3 — Organization, positions and job descriptions / الهيكل والأوصاف

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W2 successful A proof, or B4 successful B proof.

**Work and owners:** Build organization tree, stable Job/Position/Employee separation, branch allocations, effective-dated assignments, unit coding and controlled imports. Deliver full structure snapshots/date comparisons, closed-position history and company-specific authority roots. Add versioned JD editing, manager review, weighted KPIs, approved outputs and worker cards. Reconcile occupied baseline against employees.

**A / B differences:** A: reuse eligible organization services and file generation, expose custom screens and close source-deferred gaps. B: implement equivalent relational models, migrations and command services. Both: consistent codes and no silent overwrite during import.

**Exit evidence:** HR approves imported synthetic examples and JD layouts. Cross-company hierarchy access is denied. Invalid CSV remains reviewable without partial silent writes; history, PDF/Arabic layout and capacity reconciliation pass.

**Parallel work:** Organization UI, JD documents and import validation can proceed independently once entity IDs/schema are fixed.

### W4 — Hiring requests, authority and headcount / الطلبات والاعتمادات

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W3 position model and agreed authority/headcount rules.

**Work and owners:** Implement all HR-REC-F02 fields, multi-location quantities, replacements, skills and terms. Deliver drafts, immutable submission versions, route previews, self-interest handling, vacant authority rules, dated delegation, CEO/board evidence, returns, rejection, cancellation and approved amendments. Finish exact pending-quantity revision and durable denial audit. Record requested versus approved values and reasoned changes.

**A / B differences:** A: revalidate existing commands behind portal APIs; test direct native/resource entry points too. B: implement transactional state machines and row locks, with the same frozen case intent. Neither frontend may decide authority or reserve seats itself.

**Exit evidence:** Independent authority matrix passes. Own reservation is not double-counted; simultaneous attempts reconcile exactly. Material revision follows approved reapproval policy, old approval history persists, denial is retained without business mutation, and UI preserves entered values.

**Parallel work:** Request wizard and approval inbox can be built in parallel; shared capacity/approval schema and migrations have one integrator.

### W5 — Vacancy operations and communications / تشغيل الشواغر

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W4 approved-request and capacity contracts.

**Work and owners:** Deliver per-location vacancies; assigned lead/team, unassigned queue, bulk reassignment, priority score and reasoned pinning; pause/resume/close/cancel and partial fill status. Add role home counts, search, timeline and action inbox. Implement reliable scheduled reminders, business calendar, in-app notices, email templates, local test capture and delivery monitoring.

**A / B differences:** A: retain reviewed vacancy/outbox logic; expose purpose-built read models. B: build equivalent lifecycle/outbox and state projections. Provider sending remains gated to approved test recipients until release authorization.

**Exit evidence:** Requester sees accurate progress; team changes preserve private history. Parallel assignment/retry does not duplicate work or notices. Restarted workers recover; daily reminders run without a user opening the site. Disabled recruiter work is reassigned safely.

**Parallel work:** Vacancy UI, template design and job operations can overlap; queue integration tests share controlled fixtures.

### W6 — Candidates, sourcing and public intake / المرشحون والمصادر

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W5 vacancy API; approved privacy/retention and public-domain boundary.

**Work and owners:** Build Person master plus Applications, duplicate review, former-employee flag and internal candidate process. Add ads/apply links/source attribution, agency/referral records, subscription-credit tracking, 50–100-row imports, consent versions, talent pool and recruiter-on-behalf history. Deliver private activity log, next-action queue and explicit rejection communications. Add token-scoped candidate uploads and self-service.

**A / B differences:** A: extend HRMS applicant-related records where appropriate without losing Person/Application separation. B: create native domain models and private storage services. Both: do not copy a generic applicant list and call it full parity.

**Exit evidence:** Shared phone does not auto-merge people. Guessed tokens/IDs, other-company records and unsafe uploads are denied. Consent, retention holds, deletion/export and source attribution tests pass. Recruiter cannot expose internal rejection notes to candidates.

**Parallel work:** Public intake, recruiter workspace, sourcing and import tools can overlap after data/privacy contracts are stable.

### W7 — Interviews and selection / المقابلات والاختيار

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W6 candidate identity/application and scoped access.

**Work and owners:** Add manager-confirmed slots, invitations, reminders, reconfirmation, candidate check-in and waiting timer. Build interview plans, panel roles, waivers, assessments, JD/question-bank view and independent structured feedback. Deliver comparison, decision readiness, reserve candidates and consented reference-check records; track SLA/escalation.

**A / B differences:** A: assess standard Interview support, extend only needed behavior through server services. B: build equivalent scheduling/evaluation modules. Scheduling/provider operations must be retry-safe in both.

**Exit evidence:** Unconfirmed interview cannot send an invitation. Interviewer cannot read others’ blind evaluations before permitted release through any API/export. Timezone, reschedule, no-show, conflicts and late feedback pass. HR accepts comparison and decision evidence.

**Parallel work:** Scheduler UI, feedback forms and assessment library can proceed in parallel with contract-based integration.

### W8 — Compensation and offers / العروض والصلاحيات المالية

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W7 selection and approved grade/compensation policy; supplied reviewed templates.

**Work and owners:** Implement restricted grade/pay/benefit tables, optional salary disclosure states and the approved five-figure salary trail. Build guided offer calculations, authority thresholds, negotiation/reapproval, versioning, expiry/extension, decline reasons and reserve-candidate handling. Deliver branded AR/EN offers and preliminary contract/print templates with controlled audience.

**A / B differences:** A: review Job Offer mapping and reuse valid models while enforcing Kandil-specific authority. B: implement monetary precision, model constraints and versioned calculation services. Both: keep calculation rules and effective dates versioned; do not infer legal formulas from a prototype.

**Exit evidence:** HR/payroll reviewers sign off reference examples and authority boundaries. No unauthorized compensation exposure. Expired or superseded offers cannot be accepted; concurrent offer revisions cannot overwrite decisions. Printed outputs match approved templates.

**Parallel work:** Offer UX, calculation tests and document templates can overlap; HR policy approval blocks real financial use.

### W9 — Joining, employee file and onboarding / المباشرة والملف

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W8 accepted-offer rules and document policy.

**Work and owners:** Build agreed start-date history, actual joining confirmation, no-show/reason and seat release policy. Create Employee/Assignment/Onboarding once, with replay-safe commands. Add document upload/review/version/expiry, physical receipts, approved deferrals and follow-up notices. Deliver orientation checklists, HR/manager tasks, welcome gift, confidential day-7/day-30 voice and social-insurance case tracking. Include BioTime enrollment task; real device sync is separate.

**A / B differences:** A: reuse narrowly tested joining behavior after portal integration; implement the remaining lifecycle. B: implement cross-record transactions and durable task creation. Both: missing documents must not trigger wage withholding or payroll actions.

**Exit evidence:** Concurrent joining creates one effect set. No-show does not count as occupied. Private files and survey records respect roles; deferred documents alert only. Required case checklists, receipts, AR/EN outputs and employee mapping reconcile.

**Parallel work:** Document service, onboarding views and survey confidentiality tests can overlap after employee/joining contracts are fixed.

### W10 — Probation, transfers and lifecycle corrections / المتابعة والنقل

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W9 employee/assignment and document foundation.

**Work and owners:** Add probation checkpoints, reminders, observations, final evaluation and confidential follow-ups; medical-insurance case after approved outcome. Build internal transfer approvals, target-capacity checks, effective-date updates, source/target history and replacement prompts. Specify controlled void/correction and exit/deactivation handling, including session revocation and assigned-work reassignment.

**A / B differences:** Both choices must implement lifecycle side effects as audited transactions. Integrate standard modules only after authority and scope tests. Broader exit settlement and payroll remain separately scoped.

**Exit evidence:** Future-dated transfer does not move today’s headcount; actual effective transfer updates both sides once. Probation privacy, no premature medical case, authorized corrections, duplicate event/retry and disabled-account handling pass.

**Parallel work:** Probation and transfer UI can overlap; shared assignment/headcount mutations are integrated by one owner.

### W11 — Reports, assisted review and connected services / التقارير والربط

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W6–W10 stable events/data; identity/email/appraisal test access.

**Work and owners:** Deliver request status, funnel/source yield, bottlenecks, interviewer calibration and hiring forecast with defined metrics. Add guided process map and role guides. Integrate selected identity/appraisal SSO and real email in a sandbox; complete payroll-sheet import mapping for occupied baselines. Prove privacy-safe search/export. Implement SCR-001 assisted CV evidence only if approved provider and budget exist; otherwise record the unmet core requirement explicitly.

**A / B differences:** A: use bounded read models/report queries and reviewed adapters. B: equivalent reporting projections/adapters. Neither option treats copying WhatsApp text as API sending, or an enrollment task as BioTime synchronization.

**Exit evidence:** Reports reconcile with source transactions and maintain small-group/privacy protections under filters/exports. Provider timeout/outage never grants access. AI has consent/purpose controls, cost caps, redaction, prompt-injection tests and human decision ownership. All 98 IDs have a tested outcome or explicit unresolved gate.

**Parallel work:** Reporting, guides and integration adapters can overlap; third-party outages must not block independent report work.

### W12 — Full assurance and migration rehearsal / الاختبار الشامل

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** Feature-complete W3–W11, approved policies/templates and production-like staging.

**Work and owners:** Freeze release candidate; run unchanged original acceptance tests plus full portal/full-reference and negative cases. Perform specified load, contention and soak tests; profile queries and queues. Complete independent penetration assessment and retest. Rehearse clean install/upgrade, data import, file reconciliation, encrypted backups, recovery and rollback. Validate AR/EN/mobile/accessibility, support runbooks and alert routing.

**A / B differences:** A: include upstream compatibility rehearsal, custom API and native bypass tests. B: include schema migration, object/list permissions and imported audit provenance. Both: benchmark final topology, not a developer laptop.

**Exit evidence:** No unapproved critical/high security findings; zero data/authority/ledger corruption; accepted performance and recovery targets met; all mandatory parity cases pass, or release scope is explicitly revised with deferred items visible. HR completes real-role UAT; release candidate and evidence hashes agree.

**Parallel work:** Security, browser and performance reviews use isolated environments where needed. Schema/source freeze is required for a single release claim; fixes trigger affected retests.

### W13 — Staged release, hypercare and handover / التشغيل والتسليم

**Timebox:** two weeks · **Status:** Planned.

**Dependencies:** W12 evidence; named HR/IT approval, operating budget and trained support.

**Work and owners:** Finalize cutover journal, backup, legacy write freeze and reconciled delta import. Roll out to named HR/department pilot, then 50/200/full approved cohorts with monitoring and stop criteria. Train roles; publish user/admin guides and incident contacts. Tag/publish release, archive evidence and hand over secrets through approved private channels. Run at least ten business days of hypercare and a restore drill follow-up.

**A / B differences:** Same release discipline for both. Transition ownership explicitly; do not retire the legacy write path until reconciliation and rollback decision are agreed. Additional defects may extend hypercare beyond one sprint.

**Exit evidence:** HR signs acceptance; IT accepts restore/monitoring/on-call ownership; users complete agreed tasks; no open critical incidents or unexplained reconciliation variance. Known issues have owners/dates, operating review is scheduled and final handover is recorded.

**Parallel work:** Training and documentation can overlap final preparation; actual cutover has one commander and controlled write window.

### Additional foundation for B / بناء الـBackend المخصص

These are explicit additional sprints; a custom backend is not a database swap.

#### B1 — Identity, project and secure API foundation

**Timebox:** two weeks · **Owner:** backend lead with security/QA review · **Dependency:** W2 decision selects B.

**Work:** Create Django/DRF project, PostgreSQL schema baseline, environments, authentication/provider adapter, MFA/recovery policy, session/CSRF protection, secrets and CI. Implement role/company/unit scopes and protected admin access; avoid public generic CRUD for consequential records.

**Exit evidence:** Ordinary-account login/logout/revocation and cross-company/list/object/create negative tests pass. Repeat tests against real HTTP, not only mocked permissions.

#### B2 — Domain model and durable state changes

**Timebox:** two weeks · **Owner:** backend lead with security/QA review · **Dependency:** B1 identity and database foundation.

**Work:** Build Job/Position/Assignment/Capacity, request/approval/version records, generic business-command infrastructure, row-lock ordering, idempotency receipts and reviewed-version conflicts. Implement independent authority and transactional audit/outbox. Define import IDs and audit provenance.

**Exit evidence:** Atomic last-seat reservation, repeated commands, failed audit/outbox rollback and stale-update tests pass. No direct ORM/admin route bypasses domain invariants.

#### B3 — Files, jobs, administration and migration tools

**Timebox:** two weeks · **Owner:** backend lead with security/QA review · **Dependency:** B1; B2 event/identity contracts.

**Work:** Implement private document metadata/storage, quarantine scanner, authorized downloads, workers/scheduler, retry/dead-letter monitoring, approved operator corrections, backup/restore scripts and import validation. Establish deletion/retention and protected audit integrity design.

**Exit evidence:** Unsafe file/revoked-download tests, worker restart/replay, isolated restore with files/keys and import rollback pass. No dependency on a browser being open for scheduled tasks.

#### B4 — Backend parity bridge and full portal proof

**Timebox:** two weeks · **Owner:** backend lead with security/QA review · **Dependency:** B2/B3 plus W1 frontend contracts.

**Work:** Connect actual requester/approver/vacancy screens to the new backend. Translate original case intent without copying Frappe-specific test internals. Run reconciliation against synthetic reference examples; validate API schema, permissions, replay, file access and performance baseline. Re-estimate remaining domain work.

**Exit evidence:** Repeat the W2 complete real journey successfully. Lead and HR approve proceeding to W3; migration map and retained/missing functionality are explicit. Passing this bridge does not certify all 98 requirements.

## 12 — Additional standard HR modules / توسعات الموارد البشرية

The 98-item source is predominantly recruitment and employment lifecycle. “Full HR” also needs an explicit scope agreement for attendance, leave, employee requests, performance and payroll. Do not imply that installing HRMS or finishing recruitment covers these.

| Extension sprint | Scope and prerequisites | Choice A | Choice B | Exit gate |
|---|---|---|---|---|
| E1 — Employee self-service, 2–3 weeks | Own profile, change requests, letters, documents, balance views; after core identity and employee master | Configure suitable HRMS features and expose controlled portal APIs | Build employee request/letter services and approval models | Own-data isolation, approved edits, dated document versions and AR/EN acceptance |
| E2 — Leave, 2–4 weeks | Approved leave types, holidays, shifts, balances, carryover and delegation | Configure and validate HRMS leave behavior | Build accrual, ledger and policy evaluation | Reference calculation cases, overlapping requests, cancellation and year boundary pass |
| E3 — Attendance, 3–5 weeks | Device/export sample, employee matching, shifts, overnight work, delayed punches and corrections | Prove HRMS import and portal exception workflow | Build importer, shift rules and exception workflow | Idempotent reimport, delayed events, discrepancy queue and reconciliation; no automatic pay deductions |
| E4 — Performance / appraisal integration, 2–4 weeks | Confirm whether existing appraisal system remains owner; shared identity provider available | Integrate or configure after ownership decision | Integrate or build only the agreed scope | Correct SSO/logout, scoped appraisal access and no duplicated authoritative ratings |

These are provisional effort ranges beyond the core roadmap. They can be selectively scheduled after their dependencies if capacity exists. Payroll calculation/disbursement is a separately estimated project with approved Egypt-specific rules, parallel payroll reconciliation and financial controls. E3 does not authorize attendance-to-payroll deductions. Core W11 includes the reference appraisal SSO contract; E4 expands performance functionality only if requested.

## 13 — Migration, rollout and recovery / النقل والتشغيل

1. **Inventory:** owners, Sheets/Drive files, reference records, attachments, users, legal entities, current requests and open offers. Confirm source permissions and retention; do not migrate everything indiscriminately.
2. **Map:** preserve source IDs, original dates, approval evidence and provenance. Resolve identities, shared phones, duplicate people and effective position assignments with HR. Keep a reviewed mapping journal.
3. **Dry run:** import into isolated staging; reconcile counts, required fields, file checksums, vacancies and occupied/reserved/open capacity. List exceptions for human review; never silently discard rejected rows.
4. **Rehearse:** time the migration and restore on a clean target; validate encrypted fields, files, keys and deletion replay. Prove rollback or forward-repair strategy after new writes.
5. **Pilot:** a named HR group and one department, then approximately 50 → 200 → full approved population. Define stop criteria at each wave. These are rollout cohort sizes, not performance certification.
6. **Cutover:** freeze the legacy write path, take verified backups, apply final deltas, reconcile and switch the entry point. Nominate one writer per process during transition. Retain controlled read-only legacy access for the agreed period.
7. **Observe:** reconciliation and error/queue checks daily during hypercare. Severe data exposure, incorrect authority or inconsistent capacity stops expansion; record affected writes before any restoration.

Do not restore an older database blindly after production writes: that loses accepted work. Use a write fence, capture the delta, identify the authoritative history and execute the rehearsed recovery method with the incident owner.

Go-live requires product-owner acceptance, HR policy/template approval, IT/security evidence, an operating owner, monitoring, restore proof and approved infrastructure funding. The report does not authorize deploying or processing real staff data now.

## 14 — Tracking, responsibilities and evidence / المتابعة

Use requirement → story → API/UI → test → evidence → release links. A requirement is complete only when all relevant approved outcomes pass. Keep original reference labels and source phase alongside the new sprint assignment. Add improvement IDs rather than renaming the original 98. The accompanying traceability file includes all 98 and their existing scoped evidence counts; “not assessed” means outside the old 80-case checkpoint, not necessarily absent code.

Track each item as Planned, In progress, In review, Technically verified, HR accepted, Blocked or Deferred with signed reason. Store owner, dependency, acceptance criteria, evidence path, tested commit, check date, decision owner and next action. The new plan must not overwrite the old acceptance history.

| Owner | Accountable decisions |
|---|---|
| Ibrahim / technical lead | Architecture, source review, integration, estimates, branch/release discipline |
| Kandil HR product owner | Workflow policy, authority, terminology, data mapping, acceptance and training |
| UX/frontend owner | Interaction design, accessibility, AR/EN and real-role usability |
| Backend/data owner | Domain correctness, APIs, migrations and reconciliation |
| Security reviewer | Threat model, permission tests, independent penetration assessment and retest |
| IT/operations owner | Identity, infrastructure, keys, backups, monitoring and incident response |
| Kandil legal/payroll reviewers | Approved templates, retention and any compensation/calculation policy inputs |

Weekly review: show one complete user journey, current defects, requirement coverage, decisions due, security findings and next sprint scope. Keep a test-quality view separate from progress: 500 narrow tests do not equal 500 business requirements. No spreadsheet or dashboard checkbox may promote a test without evidence.

## 15 — Cost drivers, risks and decision register

No live vendor quotes or subscription price comparison is included in this architecture report. “Open source” is not zero operating cost. Budget production and staging hosting, database redundancy, backups, private files, network traffic, email/identity services, monitoring, independent testing, upgrades and support. Optional AI adds model usage, evaluation and data-control work. Paid Google Workspace is not an assumed prerequisite; the final identity/email choice must work with Kandil's actual accounts and budget.

| Risk | Mitigation / decision gate |
|---|---|
| Beautiful interface hides incomplete rules | End-to-end W2 proof; preserve original cases; require business-state assertions |
| Rebuilding everything increases time and defects | Compare B foundation effort before commitment; carry over test intent and explicit migration map |
| A is tightly coupled to Frappe internals | Isolate APIs, avoid core edits, pin versions and rehearse upgrades |
| Source contradictions are copied into the new system | HR decision register; precedence per dated decision; tests for approved interpretation |
| Solo-led project has no support cover | Named backup operator, reproducible setup, runbooks and independent release review |
| 1,000-user claim is based on account count | Separate session, concurrent-action, arrival-rate and data-volume tests |
| Data migration changes authority/capacity | Signed mappings, reconciliation and staged cutover |
| Public uploads or AI leak personal information | Separate public boundary, quarantine, scoped data, redaction and explicit human review |
| Schedule expands into the entire company | Keep recruitment/lifecycle core, standard HR extensions and other departments as separate deliverables |

Decisions before implementation commitment: A or B after spike; HR product owner; employee population and realistic peaks; identity/MFA/recovery; headcount WARN/BLOCK and exception authority; company separation; retention/audit custody; supplied contract templates; infrastructure region/budget; email provider; legacy migration source; required standard HR extensions. Decide early enough to avoid rework; UI prototyping with synthetic data can proceed while nondependent decisions are pending.

## 16 — Final recommendation / التوصية النهائية

**Approve the desired product experience first, then validate the backend choice with evidence.** Both paths must deliver the same coherent Kandil portal, complete approved reference behavior, security controls and measured performance.

For A, keep proven domain work, build a focused API boundary, and deliver the custom interface. For B, use the same interface and acceptance contracts, with an explicitly funded backend rebuild. Keep the wider all-in-one company architecture independent from this HR choice.

**الخطوة الأولى:** W0 لتثبيت المتطلبات والقرارات، ثم W1 لتصميم الشاشات الأساسية، ثم W2 لتجربة متصلة كاملة. بعدها نثبت المسار ونكمل بقية الدورة حتى الاختبار، نقل البيانات، التشغيل التدريجي والتسليم. النجاح هو أن ينجز المستخدم عمله بأمان ووضوح، مع دليل على صحة النتائج واستمرارية الخدمة.

## 17 — Full reference mapping / تتبع المتطلبات الـ98

Every item below is planned for the new portal. Existing evidence counts describe only the old scoped checkpoint; they do not promote a new screen to passed. A primary sprint owns delivery, with W12 verification and W13 acceptance across all items. Security starts in W0/W2 and continues throughout; it is not deferred to W12.

Reference wording is retained for traceability, including historical salary-disclosure wording. Resolve contradictions using dated decisions and HR approval—for example optional expected salary versus older mandatory-salary text. Neither table labels nor source claims certify current behavior.

| ID | Reference requirement | Source claim | Primary sprint | Existing scoped evidence |
|---|---|---|---|---|
| ACC-001 | OTP login, personal Gmail; spreadsheets owner-only | Built | W2 | 1 blocked; 1 passed |
| ACC-002 | AuthService swappable for Workspace identity | Built | W2 | 2 blocked |
| ACC-003 | Role and scope resolved on the server only | Built | W2 | 2 passed |
| ACC-004 | One login shared with the Performance Appraisal portal | Later | W11 | Not assessed in old 80-case checkpoint |
| UX-001 | Same design and spirit as the Performance Appraisal portal | Built | W1 | Not assessed in old 80-case checkpoint |
| ORG-001 | Job, Position, Employee, Vacancy as separate entities | Built | W3 | 2 passed |
| ORG-002 | Versioned organization; closed positions kept | Partial | W3 | 2 passed |
| ORG-003 | Structured, versioned JD with view / print / PDF / email | Built | W3 | 3 passed |
| ORG-004 | Only HR Sector Manager changes grade, salary, benefits, conditions | Built | W8 | Not assessed in old 80-case checkpoint |
| ORG-005 | Delegation / acting authority with dates and history | Built | W4 | 1 partial; 2 passed |
| ORG-006 | Structural change: chain, HR review, CEO approval, Position ID on approval | Built | W4 | 2 passed |
| ORG-007 | Structure maintained from the portal | Built | W3 | 2 passed |
| ORG-008 | Coding of units and jobs, automatic codes | Built | W3 | 2 passed |
| ORG-009 | Multi-company (4 legal entities + sister companies) | Partial | W3 | 2 passed |
| HC-001 | Structural HC = 1 per position until a manpower plan | Built | W3 | 2 passed |
| HC-002 | Occupied HC by HR; payroll-sheet import later | Partial | W3 | 2 passed |
| HC-003 | Current / available HC shown as guidance; any number requestable | Built | W4 | 2 passed |
| HC-004 | HC exception approved by the HR Sector Manager only (CHG-40/2) | Built | W4 | 2 passed |
| HC-005 | Available = Structural − Occupied − Open; no double counting | Built | W4 | 1 partial; 2 passed |
| HC-006 | HC checks warn-only until switched to block | Built | W4 | 1 partial; 1 passed |
| HC-007 | Filled HC counts actual joiners only | Built | W9 | 2 passed |
| REQ-001 | Manager requests only positions in his scope, server-side | Built | W4 | 2 passed |
| REQ-002 | Current form fields kept (HR-REC-F02) | Built | W4 | 2 passed |
| REQ-003 | One request, several locations via request lines | Built | W4 | 2 passed |
| REQ-004 | Chain from structure; missing level skipped; self-approval blocked | Built | W4 | 2 passed |
| REQ-005 | CEO by HR routing, dated CEO rules, Sector Manager → CEO | Built | W4 | 2 passed |
| REQ-006 | HR Manager approve / reject / return / edit / send to CEO | Built | W4 | 2 passed |
| REQ-007 | Requester notified of every step, rejection and HR edit | Built | W5 | 2 passed |
| REQ-008 | Return for revision with timestamps and versions | Built | W4 | 2 passed |
| REQ-009 | Approval snapshot of what each approver saw | Built | W4 | 2 passed |
| REQ-010 | Request timeline and My Requests | Built | W4 | 2 passed |
| REQ-011 | Change request and reapproval for material post-approval changes | Built | W4 | 2 passed |
| PRI-001 | Requested priority / HR classification / dynamic score / override | Built | W5 | 2 passed |
| BRD-001 | Board approval (Chairman or Vice) after the CEO | Built | W4 | 2 passed |
| VAC-001 | One vacancy per location line | Built | W5 | 1 passed |
| VAC-002 | Partial fill; request closes fully or partially | Built | W5 | 2 passed |
| VAC-003 | Several recruiters per vacancy; lead; one owner per application | Built | W5 | 2 passed |
| VAC-004 | Missing recruitment roles skipped with record | Built | W5 | 1 passed |
| VAC-005 | Unassigned work queue and bulk reassignment | Built | W5 | 2 passed |
| VAC-006 | Recruitment screen listing all approved requests / vacancies | Built | W5 | 1 passed |
| ADV-001 | Ads per platform from JD templates, copyable | Built | W6 | Not assessed in old 80-case checkpoint |
| ADV-002 | Apply link per ad with automatic source | Built | W6 | Not assessed in old 80-case checkpoint |
| SRC-001 | Source mandatory per application, with sub-source | Built | W6 | Not assessed in old 80-case checkpoint |
| SRC-002 | Subscriptions: credits, usage, expiry, unused-credit alerts | Built | W6 | Not assessed in old 80-case checkpoint |
| SRC-003 | Referral attribution lock; agency terms | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-001 | Person master; candidate ≠ application; duplicate warning, no auto-merge | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-002 | Hybrid journey; recruiter acts on behalf with audit | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-003 | Online application intake | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-004 | Privacy notice acceptance stored with version | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-005 | Salaries required with disclosure states; never zero | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-006 | National ID optional at application | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-007 | Bulk import of 50–100 rows with duplicate review and batch ID | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-008 | Hybrid talent pool | Built | W6 | Not assessed in old 80-case checkpoint |
| CAN-009 | Former employee detection and hiring restriction | Built | W6 | Not assessed in old 80-case checkpoint |
| SCR-001 | Knockout flags for human review; AI evidence-only | Built | W11 | Not assessed in old 80-case checkpoint |
| SCR-002 | Coded rejection reasons; internal reason separate from message | Built | W6 | Not assessed in old 80-case checkpoint |
| ACT-001 | Activity log: calls, manager discussions, no silent edits | Built | W6 | Not assessed in old 80-case checkpoint |
| ACT-002 | Action queue with next action per application | Built | W6 | Not assessed in old 80-case checkpoint |
| COM-001 | Message templates; copy for WhatsApp | Built | W6 | Not assessed in old 80-case checkpoint |
| COM-002 | Rejection message by WhatsApp or email as an explicit step | Built | W6 | Not assessed in old 80-case checkpoint |
| MOV-001 | Vacancy fill method recorded (external / internal transfer) | Built | W9 | Not assessed in old 80-case checkpoint |
| MOV-002 | Internal candidates (source Internal); manager told before first interview | Built | W6 | Not assessed in old 80-case checkpoint |
| ASM-001 | Practical / technical assessment stage | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-001 | Invite blocked until the manager confirms | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-002 | Manager screen of interview dates and locations | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-003 | Reminders and optional reconfirmation | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-004 | Check-in, waiting timer, evidence trail | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-005 | Interview plan, panel roles, waiver with reason | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-006 | Interviewer workspace shows the JD | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-007 | Question bank; HR standard questions in the HR interview | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-008 | Structured, independent evaluations (HR, direct, higher manager) | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-009 | Live comparison; continuous pipeline; decision readiness | Built | W7 | Not assessed in old 80-case checkpoint |
| INT-010 | SLA on confirmation and evaluation with escalation | Built | W7 | Not assessed in old 80-case checkpoint |
| OFF-001 | Offer sent by email from the system or printed | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-002 | Offer authority by salary band; HR Manager above max | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-003 | Basic + allowances; incentives in the system, not in the offer | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-004 | Offer versions and negotiation with reapproval | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-005 | Valid Until and audited extension | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-006 | Five-figure salary trail | Built | W8 | Not assessed in old 80-case checkpoint |
| OFF-007 | Decline reasons, over-hiring warning, reserve candidates | Built | W8 | Not assessed in old 80-case checkpoint |
| JOI-001 | Joining date agreed after acceptance, with history | Built | W9 | Not assessed in old 80-case checkpoint |
| JOI-002 | Did-not-join tracked with reasons | Built | W9 | Not assessed in old 80-case checkpoint |
| DOC-001 | Upload by employee or HR, HR review, physical receipt | Built | W9 | Not assessed in old 80-case checkpoint |
| DOC-002 | Deferred documents with approver and due date; HR alerts only | Built | W9 | Not assessed in old 80-case checkpoint |
| FIL-001 | Electronic employee file with document versions and expiry | Built | W9 | Not assessed in old 80-case checkpoint |
| ONB-001 | Orientation with separate manager and HR screens | Built | W9 | Not assessed in old 80-case checkpoint |
| ONB-002 | First-day welcome gift | Built | W9 | Not assessed in old 80-case checkpoint |
| ONB-003 | 30-day New Hire Voice with confidentiality | Built | W9 | Not assessed in old 80-case checkpoint |
| INS-001 | Social insurance case within the first month | Built | W9 | Not assessed in old 80-case checkpoint |
| MOV-003 | Transfer process with approvals and HC check on the target | Built | W10 | Not assessed in old 80-case checkpoint |
| MOV-004 | On the effective date: positions / HC move, vacancy updated, history, replacement offered | Built | W10 | Not assessed in old 80-case checkpoint |
| PRB-001 | Probation checkpoints, log, final evaluation, reminders | Built | W10 | Not assessed in old 80-case checkpoint |
| INS-002 | Medical insurance after successful probation | Built | W10 | Not assessed in old 80-case checkpoint |
| RPT-001 | Status report per request; log of calls, appointments, no-shows | Built | W11 | Not assessed in old 80-case checkpoint |
| RPT-002 | Role dashboards; drill-down KPIs | Built | W11 | Not assessed in old 80-case checkpoint |
| AUD-001 | Audit: who, what, when, before, after | Built | W2 | 1 blocked; 1 passed |
| AUD-002 | Controlled overrides instead of admin bypass | Built | W2 | 2 partial |
| WAG-001 | No wage or payroll action anywhere | Built | W9 | 1 partial; 1 passed |
### Supplemental packages / حزم الاستكمال
The 16 packages below capture source details that the 98 short labels alone do not fully describe. They remain part of planning and need their own acceptance tests.
| Package | Scope | Delivery |
|---|---|---|
| X01 — Account lifecycle and strong authentication | MFA/recovery, server idle expiry, remembered sessions, device alerts, dormant accounts, usage-policy versions, consultant restrictions and access review; CEO mobile/PIN route requires an explicit threat model and approved alternative if standard MFA is chosen. | W2 + W12 |
| X02 — Privileged changes and CEO/board evidence | CEO/board appointment and delegation queues, two-person reset/termination controls, board-on-behalf proof, monthly exception report. Demo wipe/impersonation remains confined to disposable test environments. | W4 |
| X03 — Privacy, consent and retention | Purpose/version/channel consent, relatives/conflict declarations, optional photos/accommodations, minors path, restricted background/reference evidence, access/export/deletion cases, retention holds, purge of files/AI results/search projections and a restore-time deletion replay policy. | W6 + W12 |
| X04 — Operational security and recovery | Incident workflow, backup/restore evidence, audit integrity checks, secret rotation and readiness signals. Alerts are test-captured locally; no regulatory deadline is certified by this plan. | W2 + W12–W13 |
| X05 — Scheduled jobs and communication | Versioned templates, priorities/budgets, in-app notices, outbox, daily digest, five-working-day approval policy after confirmation, Cairo timezone, business calendar, retries, duplicate suppression and failed-job visibility. | W5 |
| X06 — Selection and reference evidence | Selection snapshot, reserve candidates, consented reference checks and follow-up, interviewer/approver conflict declarations; blind feedback must survive exports and APIs. | W7 |
| X07 — Forms and legal-template register | Catalogue every printed form: JD/worker card, request/org chart, interview kit, offer, contract, receipts, onboarding/probation, data copy and salary notice. Version supplied templates; record required fields and audience; compare page breaks and Arabic text. | W3/W8/W9 |
| X08 — Compensation presentation | Grade minimum rule versus older around-minimum wording; gross/net estimates, payroll review, separate contribution/comprehensive/fixed/variable amounts, working hours/rest and private internal printout. Validate example calculations with approved reference cases. | W8 |
| X09 — Candidate public/private surfaces | Branded application page and token-scoped self-service, consent, interview response, offer response, uploads and recruiter-on-behalf audit. Hash tokens, expiry/revocation, rate limits, file validation and no access through guessed record IDs. | W6 |
| X10 — AI CV provider and evidence boundary | Explicit user action, minimum payload, redacted identifiers, human review, cost cap, usage history, key management, malformed/timeout handling, document prompt-injection tests and no automatic hiring/rejection decision. | W11 |
| X11 — Employee voice and confidentiality | Day-7/day-30 and stay surveys, follow-up cases, appropriate owner visibility, small-group suppression including filtered/exported results; prepare schema now even if reporting ships P9. | W9–W11 |
| X12 — Complete native HR experience and guides | Role home/inbox, candidates tabs/board, guided offer steps, global scoped search, back navigation, admin grouping, presence where agreed, branded login, interactive process map and manager/admin/employee guides. Build usable screens in each phase; P10 is final polish, not first UI delivery. | W1 + every feature sprint |
| X13 — Migration, imports and production transition | Dry-run and reconciliation for org, employees, open requests, candidates, offers and files. Preserve old IDs/timestamps/source IDs, keep recoverable migration journal, rehearse rollback, train roles and define a limited parallel run. Do not wipe current sites. | W12–W13 |
| X14 — Real external connections | Email provider, identity/appraisal SSO, payroll-file column mapping and optional branded public domain. BioTime enrollment task is part of parity; actual device synchronization and Odoo are separate integrations unless explicitly added. WhatsApp copying does not imply WhatsApp API sending. | W11 |
| X15 — Source-deferred business completeness | Full organization snapshots, complete company isolation, payroll import and appraisal SSO stay visible with independent dependencies. Manager JD review awaits source interview content; build the workflow with synthetic content first. | W3 + W11 |
| X16 — Auditable corrections and data minimization | Separate immutable business facts from personal-data payloads. Define authorized redaction/erasure, audit seal verification, external anchors, key rotation and reconciliation. Immutable through application APIs does not mean tamper-proof against database administrators. | W2/W6 + W12 |

## 18 — Sources and evidence register / المصادر

- Reference snapshot: [repository](https://github.com/mohamedomara-hr/kandil-recruitment-portal/tree/7824be24292c4743b4005e14e2df540786cfe167), [requirements status](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/7824be24292c4743b4005e14e2df540786cfe167/docs/blueprint/requirements-status.md), [blueprint](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/7824be24292c4743b4005e14e2df540786cfe167/docs/blueprint/blueprint-v2.3.md). Inspected locally; source declarations are distinguished from independent verification.
- Existing implementation: private [kandil-hr repository](https://github.com/Ibrahimamir22/kandil-hr), local `docs/sprints/CHECKPOINT.md`, `acceptance-results.json`, `docs/phases_0_3/requirements-baseline.json`. Read for this report; implementation tests were not rerun during report preparation.
- Official framework and testing documentation linked beside the relevant claims, consulted 12 October 2026. Version compatibility must be confirmed when implementation begins.
- Three user-provided screenshots, copied into the report's assets folder without alteration. Visual observations are limited to what is shown.
- Proposed stacks, numerical targets, sprint lengths, hardware starting points and decision gates are engineering recommendations and estimates. They are not vendor promises, measured capacity, legal conclusions or completed work.
