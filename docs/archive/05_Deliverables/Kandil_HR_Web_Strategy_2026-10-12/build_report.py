"""Build the internal strategy report and traceability files; never touch the HR site."""
from pathlib import Path
import collections
import csv
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parent
APP = ROOT.parents[1] / '06_Prototypes/Kandil_HR_Dev/development/frappe-bench/apps/kandil_hr'
baseline = json.loads((APP / 'docs/phases_0_3/requirements-baseline.json').read_text())
results = json.loads((APP / 'docs/sprints/acceptance-results.json').read_text())

# Each sprint has independently reviewable outputs, dependencies and exit evidence.
SPRINTS = [
('W0', 'Scope, decisions and threat model / تثبيت النطاق', 'None; begin with the pinned reference and current checkpoint.',
 'Lead: inventory all 98 IDs, 16 supplemental packages, source decisions and current unfinished changes. HR: approve personas, legal entities, authority, headcount interpretation, contract-template owner and source-of-truth mapping. UX: observe five reference tasks and record baseline completion/time. Security: classify pay, identity documents and candidate data; draw trust boundaries and attack cases. Operations: identify account volumes, peak patterns, retention, identity provider and recovery owner.',
 'A: inventory reusable endpoints and Frappe coupling. B: estimate missing domain services and data migration. Both: create an architecture decision record, backlog and decision register without modifying production.',
 'Approved scope/must-have list; every reference ID has a delivery owner and sprint; every unknown has a decision owner/date. Threat model and load assumptions recorded. HR agrees which source behavior is preserved or deliberately replaced.',
 'UX research, source mapping and infrastructure discovery run in parallel; HR policy decisions constrain dependent implementation.'),
('W1', 'Design system and complete prototype / التصميم وتجربة الاستخدام', 'W0 personas and scope; synthetic data only.',
 'UX/frontend: Kandil design tokens, branded login, AR/EN switch, RTL/LTR layouts, role sidebar, task inbox, request wizard, approval detail and vacancy view. Include loading, empty, error, forbidden, stale-version and session-expired states. QA: keyboard, mobile, zoom and low-connectivity walkthroughs. Backend: define typed request/response contracts and meaningful fixture names.',
 'Same frontend work for both choices. Keep backend-neutral domain terminology; do not expose Frappe DocType labels as the information architecture.',
 'Ibrahim and HR review five linked screens and one complete clickable journey in both languages. Prototype meets the agreed navigation and usability criteria. Record changes and unresolved issues; a mock prototype is not API or security proof.',
 'Frontend components, translation review and API contract drafting can overlap; freeze accepted contracts before separate implementations.'),
('W2', 'Connected proof and architecture decision / تجربة فعلية وحسم المسار', 'W1 screen review and W0 identity/authority decisions for the proof.',
 'Build a thin real journey: requester submits multi-location request, manager/HR review a version, approved vacancies appear with correct capacity. Use ordinary role sessions, same-origin security, private document access, scoped search and denied-action UI. QA: duplicate click, replay, stale edit, revoked user and cross-company tests. Operations: staging configuration, logs and basic metrics.',
 'A: connect selected existing commands through reviewed adapters and fix API gaps; isolate unverified headcount changes. B: if selected early, prove a minimal authenticated command/transaction spike and use B1–B4 to complete its foundation. Never label a mocked B journey as integrated. Decision record compares implementation effort, security, upgrade impact and measured latency.',
 'A may proceed only if the complete real flow stays in the portal and all critical permission/ledger cases pass. Otherwise document a fixable gap or choose B. B must repeat the full real journey at B4 before W3 feature expansion. User/HR approves experience; lead approves backend evidence.',
 'Frontend and API work can overlap on stable contracts; integrated DB mutation tests are serialized. This is the first product decision gate, not the first security discussion.'),
('W3', 'Organization, positions and job descriptions / الهيكل والأوصاف', 'W2 successful A proof, or B4 successful B proof.',
 'Build organization tree, stable Job/Position/Employee separation, branch allocations, effective-dated assignments, unit coding and controlled imports. Deliver full structure snapshots/date comparisons, closed-position history and company-specific authority roots. Add versioned JD editing, manager review, weighted KPIs, approved outputs and worker cards. Reconcile occupied baseline against employees.',
 'A: reuse eligible organization services and file generation, expose custom screens and close source-deferred gaps. B: implement equivalent relational models, migrations and command services. Both: consistent codes and no silent overwrite during import.',
 'HR approves imported synthetic examples and JD layouts. Cross-company hierarchy access is denied. Invalid CSV remains reviewable without partial silent writes; history, PDF/Arabic layout and capacity reconciliation pass.',
 'Organization UI, JD documents and import validation can proceed independently once entity IDs/schema are fixed.'),
('W4', 'Hiring requests, authority and headcount / الطلبات والاعتمادات', 'W3 position model and agreed authority/headcount rules.',
 'Implement all HR-REC-F02 fields, multi-location quantities, replacements, skills and terms. Deliver drafts, immutable submission versions, route previews, self-interest handling, vacant authority rules, dated delegation, CEO/board evidence, returns, rejection, cancellation and approved amendments. Finish exact pending-quantity revision and durable denial audit. Record requested versus approved values and reasoned changes.',
 'A: revalidate existing commands behind portal APIs; test direct native/resource entry points too. B: implement transactional state machines and row locks, with the same frozen case intent. Neither frontend may decide authority or reserve seats itself.',
 'Independent authority matrix passes. Own reservation is not double-counted; simultaneous attempts reconcile exactly. Material revision follows approved reapproval policy, old approval history persists, denial is retained without business mutation, and UI preserves entered values.',
 'Request wizard and approval inbox can be built in parallel; shared capacity/approval schema and migrations have one integrator.'),
('W5', 'Vacancy operations and communications / تشغيل الشواغر', 'W4 approved-request and capacity contracts.',
 'Deliver per-location vacancies; assigned lead/team, unassigned queue, bulk reassignment, priority score and reasoned pinning; pause/resume/close/cancel and partial fill status. Add role home counts, search, timeline and action inbox. Implement reliable scheduled reminders, business calendar, in-app notices, email templates, local test capture and delivery monitoring.',
 'A: retain reviewed vacancy/outbox logic; expose purpose-built read models. B: build equivalent lifecycle/outbox and state projections. Provider sending remains gated to approved test recipients until release authorization.',
 'Requester sees accurate progress; team changes preserve private history. Parallel assignment/retry does not duplicate work or notices. Restarted workers recover; daily reminders run without a user opening the site. Disabled recruiter work is reassigned safely.',
 'Vacancy UI, template design and job operations can overlap; queue integration tests share controlled fixtures.'),
('W6', 'Candidates, sourcing and public intake / المرشحون والمصادر', 'W5 vacancy API; approved privacy/retention and public-domain boundary.',
 'Build Person master plus Applications, duplicate review, former-employee flag and internal candidate process. Add ads/apply links/source attribution, agency/referral records, subscription-credit tracking, 50–100-row imports, consent versions, talent pool and recruiter-on-behalf history. Deliver private activity log, next-action queue and explicit rejection communications. Add token-scoped candidate uploads and self-service.',
 'A: extend HRMS applicant-related records where appropriate without losing Person/Application separation. B: create native domain models and private storage services. Both: do not copy a generic applicant list and call it full parity.',
 'Shared phone does not auto-merge people. Guessed tokens/IDs, other-company records and unsafe uploads are denied. Consent, retention holds, deletion/export and source attribution tests pass. Recruiter cannot expose internal rejection notes to candidates.',
 'Public intake, recruiter workspace, sourcing and import tools can overlap after data/privacy contracts are stable.'),
('W7', 'Interviews and selection / المقابلات والاختيار', 'W6 candidate identity/application and scoped access.',
 'Add manager-confirmed slots, invitations, reminders, reconfirmation, candidate check-in and waiting timer. Build interview plans, panel roles, waivers, assessments, JD/question-bank view and independent structured feedback. Deliver comparison, decision readiness, reserve candidates and consented reference-check records; track SLA/escalation.',
 'A: assess standard Interview support, extend only needed behavior through server services. B: build equivalent scheduling/evaluation modules. Scheduling/provider operations must be retry-safe in both.',
 'Unconfirmed interview cannot send an invitation. Interviewer cannot read others’ blind evaluations before permitted release through any API/export. Timezone, reschedule, no-show, conflicts and late feedback pass. HR accepts comparison and decision evidence.',
 'Scheduler UI, feedback forms and assessment library can proceed in parallel with contract-based integration.'),
('W8', 'Compensation and offers / العروض والصلاحيات المالية', 'W7 selection and approved grade/compensation policy; supplied reviewed templates.',
 'Implement restricted grade/pay/benefit tables, optional salary disclosure states and the approved five-figure salary trail. Build guided offer calculations, authority thresholds, negotiation/reapproval, versioning, expiry/extension, decline reasons and reserve-candidate handling. Deliver branded AR/EN offers and preliminary contract/print templates with controlled audience.',
 'A: review Job Offer mapping and reuse valid models while enforcing Kandil-specific authority. B: implement monetary precision, model constraints and versioned calculation services. Both: keep calculation rules and effective dates versioned; do not infer legal formulas from a prototype.',
 'HR/payroll reviewers sign off reference examples and authority boundaries. No unauthorized compensation exposure. Expired or superseded offers cannot be accepted; concurrent offer revisions cannot overwrite decisions. Printed outputs match approved templates.',
 'Offer UX, calculation tests and document templates can overlap; HR policy approval blocks real financial use.'),
('W9', 'Joining, employee file and onboarding / المباشرة والملف', 'W8 accepted-offer rules and document policy.',
 'Build agreed start-date history, actual joining confirmation, no-show/reason and seat release policy. Create Employee/Assignment/Onboarding once, with replay-safe commands. Add document upload/review/version/expiry, physical receipts, approved deferrals and follow-up notices. Deliver orientation checklists, HR/manager tasks, welcome gift, confidential day-7/day-30 voice and social-insurance case tracking. Include BioTime enrollment task; real device sync is separate.',
 'A: reuse narrowly tested joining behavior after portal integration; implement the remaining lifecycle. B: implement cross-record transactions and durable task creation. Both: missing documents must not trigger wage withholding or payroll actions.',
 'Concurrent joining creates one effect set. No-show does not count as occupied. Private files and survey records respect roles; deferred documents alert only. Required case checklists, receipts, AR/EN outputs and employee mapping reconcile.',
 'Document service, onboarding views and survey confidentiality tests can overlap after employee/joining contracts are fixed.'),
('W10', 'Probation, transfers and lifecycle corrections / المتابعة والنقل', 'W9 employee/assignment and document foundation.',
 'Add probation checkpoints, reminders, observations, final evaluation and confidential follow-ups; medical-insurance case after approved outcome. Build internal transfer approvals, target-capacity checks, effective-date updates, source/target history and replacement prompts. Specify controlled void/correction and exit/deactivation handling, including session revocation and assigned-work reassignment.',
 'Both choices must implement lifecycle side effects as audited transactions. Integrate standard modules only after authority and scope tests. Broader exit settlement and payroll remain separately scoped.',
 'Future-dated transfer does not move today’s headcount; actual effective transfer updates both sides once. Probation privacy, no premature medical case, authorized corrections, duplicate event/retry and disabled-account handling pass.',
 'Probation and transfer UI can overlap; shared assignment/headcount mutations are integrated by one owner.'),
('W11', 'Reports, assisted review and connected services / التقارير والربط', 'W6–W10 stable events/data; identity/email/appraisal test access.',
 'Deliver request status, funnel/source yield, bottlenecks, interviewer calibration and hiring forecast with defined metrics. Add guided process map and role guides. Integrate selected identity/appraisal SSO and real email in a sandbox; complete payroll-sheet import mapping for occupied baselines. Prove privacy-safe search/export. Implement SCR-001 assisted CV evidence only if approved provider and budget exist; otherwise record the unmet core requirement explicitly.',
 'A: use bounded read models/report queries and reviewed adapters. B: equivalent reporting projections/adapters. Neither option treats copying WhatsApp text as API sending, or an enrollment task as BioTime synchronization.',
 'Reports reconcile with source transactions and maintain small-group/privacy protections under filters/exports. Provider timeout/outage never grants access. AI has consent/purpose controls, cost caps, redaction, prompt-injection tests and human decision ownership. All 98 IDs have a tested outcome or explicit unresolved gate.',
 'Reporting, guides and integration adapters can overlap; third-party outages must not block independent report work.'),
('W12', 'Full assurance and migration rehearsal / الاختبار الشامل', 'Feature-complete W3–W11, approved policies/templates and production-like staging.',
 'Freeze release candidate; run unchanged original acceptance tests plus full portal/full-reference and negative cases. Perform specified load, contention and soak tests; profile queries and queues. Complete independent penetration assessment and retest. Rehearse clean install/upgrade, data import, file reconciliation, encrypted backups, recovery and rollback. Validate AR/EN/mobile/accessibility, support runbooks and alert routing.',
 'A: include upstream compatibility rehearsal, custom API and native bypass tests. B: include schema migration, object/list permissions and imported audit provenance. Both: benchmark final topology, not a developer laptop.',
 'No unapproved critical/high security findings; zero data/authority/ledger corruption; accepted performance and recovery targets met; all mandatory parity cases pass, or release scope is explicitly revised with deferred items visible. HR completes real-role UAT; release candidate and evidence hashes agree.',
 'Security, browser and performance reviews use isolated environments where needed. Schema/source freeze is required for a single release claim; fixes trigger affected retests.'),
('W13', 'Staged release, hypercare and handover / التشغيل والتسليم', 'W12 evidence; named HR/IT approval, operating budget and trained support.',
 'Finalize cutover journal, backup, legacy write freeze and reconciled delta import. Roll out to named HR/department pilot, then 50/200/full approved cohorts with monitoring and stop criteria. Train roles; publish user/admin guides and incident contacts. Tag/publish release, archive evidence and hand over secrets through approved private channels. Run at least ten business days of hypercare and a restore drill follow-up.',
 'Same release discipline for both. Transition ownership explicitly; do not retire the legacy write path until reconciliation and rollback decision are agreed. Additional defects may extend hypercare beyond one sprint.',
 'HR signs acceptance; IT accepts restore/monitoring/on-call ownership; users complete agreed tasks; no open critical incidents or unexplained reconciliation variance. Known issues have owners/dates, operating review is scheduled and final handover is recorded.',
 'Training and documentation can overlap final preparation; actual cutover has one commander and controlled write window.')
]

BACKEND = [
('B1', 'Identity, project and secure API foundation', 'W2 decision selects B.',
 'Create Django/DRF project, PostgreSQL schema baseline, environments, authentication/provider adapter, MFA/recovery policy, session/CSRF protection, secrets and CI. Implement role/company/unit scopes and protected admin access; avoid public generic CRUD for consequential records.',
 'Ordinary-account login/logout/revocation and cross-company/list/object/create negative tests pass. Repeat tests against real HTTP, not only mocked permissions.'),
('B2', 'Domain model and durable state changes', 'B1 identity and database foundation.',
 'Build Job/Position/Assignment/Capacity, request/approval/version records, generic business-command infrastructure, row-lock ordering, idempotency receipts and reviewed-version conflicts. Implement independent authority and transactional audit/outbox. Define import IDs and audit provenance.',
 'Atomic last-seat reservation, repeated commands, failed audit/outbox rollback and stale-update tests pass. No direct ORM/admin route bypasses domain invariants.'),
('B3', 'Files, jobs, administration and migration tools', 'B1; B2 event/identity contracts.',
 'Implement private document metadata/storage, quarantine scanner, authorized downloads, workers/scheduler, retry/dead-letter monitoring, approved operator corrections, backup/restore scripts and import validation. Establish deletion/retention and protected audit integrity design.',
 'Unsafe file/revoked-download tests, worker restart/replay, isolated restore with files/keys and import rollback pass. No dependency on a browser being open for scheduled tasks.'),
('B4', 'Backend parity bridge and full portal proof', 'B2/B3 plus W1 frontend contracts.',
 'Connect actual requester/approver/vacancy screens to the new backend. Translate original case intent without copying Frappe-specific test internals. Run reconciliation against synthetic reference examples; validate API schema, permissions, replay, file access and performance baseline. Re-estimate remaining domain work.',
 'Repeat the W2 complete real journey successfully. Lead and HR approve proceeding to W3; migration map and retained/missing functionality are explicit. Passing this bridge does not certify all 98 requirements.')
]

def main_sprint(r):
    i, title, deps, tasks, options, gate, parallel = r
    return {'id':i,'title':title,'duration_weeks':2,'status':'planned','dependencies':deps,'work':tasks,'option_specific_work':options,'exit_gate':gate,'parallel_work':parallel}

plan = {'report_date':'2026-10-12','status':'proposed_not_started','reference_commit':baseline['reference']['commit'],
        'option_A_sequence':[r[0] for r in SPRINTS],
        'option_B_sequence':['W0','W1','W2']+[r[0] for r in BACKEND]+[r[0] for r in SPRINTS[3:]],
        'sprints':[main_sprint(r) for r in SPRINTS],
        'option_B_foundation':[{'id':i,'title':t,'duration_weeks':2,'status':'planned','dependencies':d,'work':w,'exit_gate':g} for i,t,d,w,g in BACKEND],
        'notes':'Estimates, not commitments. Original implementation tracker and goal are unchanged. Extensions E1–E4 are separately estimated in Report.md.'}
(ROOT/'sprint-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')

parts=['## 11 — Detailed sprints / خطة التنفيذ التفصيلية\n',
       '**A sequence:** W0 → W1 → W2 decision gate → W3–W11 feature delivery → W12 release assurance → W13 rollout/handover.\n',
       '**B sequence:** W0 → W1 → W2 decision → B1 → B2/B3 coordinated foundation → B4 real integration gate → W3–W11 → W12 → W13. The estimate conservatively budgets all four B sprints; possible B2/B3 overlap is not pre-credited.\n']
for i,title,deps,tasks,options,gate,parallel in SPRINTS:
    parts += [f'### {i} — {title}', '**Timebox:** two weeks · **Status:** Planned.',f'**Dependencies:** {deps}',f'**Work and owners:** {tasks}',f'**A / B differences:** {options}',f'**Exit evidence:** {gate}',f'**Parallel work:** {parallel}']
parts += ['### Additional foundation for B / بناء الـBackend المخصص', 'These are explicit additional sprints; a custom backend is not a database swap.']
for i,title,deps,work,gate in BACKEND:
    parts += [f'#### {i} — {title}',f'**Timebox:** two weeks · **Owner:** backend lead with security/QA review · **Dependency:** {deps}',f'**Work:** {work}',f'**Exit evidence:** {gate}']

phase_to_sprint={'P1':'W2','P2':'W3','P3':'W4','P4':'W6','P5':'W7','P6':'W8','P7':'W9','P8':'W10','P9':'W11','P10':'W11'}
overrides={'UX-001':'W1','ORG-005':'W4','ORG-006':'W4','HC-007':'W9','PRI-001':'W5','REQ-007':'W5','WAG-001':'W9','ORG-004':'W8'}
all_rows=[]
for r in baseline['requirements']:
    rid=r['id']; sprint=overrides.get(rid, 'W5' if rid.startswith('VAC-') else phase_to_sprint[r['phase']])
    rr=[x for x in results if x['requirement_id']==rid]
    counts=collections.Counter(x['status'] for x in rr)
    old='; '.join(f'{v} {k}' for k,v in sorted(counts.items())) if rr else 'Not assessed in old 80-case checkpoint'
    all_rows.append({'id':rid,'requirement':r['requirement'],'source_phase':r['phase'],'source_claim':r['source_status'],'primary_sprint':sprint,'existing_scoped_evidence':old,'new_portal_status':'Planned; unverified','owner':'HR + technical lead','final_gate':'W12 tests + W13 HR acceptance'})
assert len(all_rows)==98 and len({r['id'] for r in all_rows})==98
with (ROOT/'requirements-traceability.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(all_rows[0]));w.writeheader();w.writerows(all_rows)

appendix=['## 17 — Full reference mapping / تتبع المتطلبات الـ98',
 'Every item below is planned for the new portal. Existing evidence counts describe only the old scoped checkpoint; they do not promote a new screen to passed. A primary sprint owns delivery, with W12 verification and W13 acceptance across all items. Security starts in W0/W2 and continues throughout; it is not deferred to W12.',
 'Reference wording is retained for traceability, including historical salary-disclosure wording. Resolve contradictions using dated decisions and HR approval—for example optional expected salary versus older mandatory-salary text. Neither table labels nor source claims certify current behavior.',
 '| ID | Reference requirement | Source claim | Primary sprint | Existing scoped evidence |','|---|---|---|---|---|']
for r in all_rows:
    appendix.append('| '+' | '.join(str(r[k]).replace('|','/') for k in ['id','requirement','source_claim','primary_sprint','existing_scoped_evidence'])+' |')
appendix += ['### Supplemental packages / حزم الاستكمال',
             'The 16 packages below capture source details that the 98 short labels alone do not fully describe. They remain part of planning and need their own acceptance tests.',
             '| Package | Scope | Delivery |','|---|---|---|']
xmap={'X01':'W2 + W12','X02':'W4','X03':'W6 + W12','X04':'W2 + W12–W13','X05':'W5','X06':'W7','X07':'W3/W8/W9','X08':'W8','X09':'W6','X10':'W11','X11':'W9–W11','X12':'W1 + every feature sprint','X13':'W12–W13','X14':'W11','X15':'W3 + W11','X16':'W2/W6 + W12'}
for x in baseline['supplemental_packages']:
    appendix.append(f"| {x['id']} — {x['title']} | {x['scope'].replace('|','/')} | {xmap[x['id']]} |")

draft=(ROOT/'Report.md').read_text()
full=draft.replace('<!-- SPRINT_DETAILS -->','\n\n'.join(parts)).replace('<!-- REQUIREMENTS_APPENDIX -->','\n\n'.join(appendix[:4])+'\n'+ '\n'.join(appendix[4:]))
(ROOT/'Kandil_HR_Web_Strategy.md').write_text(full)

assets=ROOT/'assets';assets.mkdir(exist_ok=True)
images=[('NSIRD_screencaptureui_xg3V4I','5.12.40','01-reference-portal.png'),('NSIRD_screencaptureui_cbVK2E','5.14.53','02-current-pilot.png'),('NSIRD_screencaptureui_icHkGS','5.15.01','03-native-frappe-list.png')]
for folder,t,name in images:
    target=assets/name
    if not target.exists():
        source=Path('/var/folders/c7/pf771lqs55sgl14ysvdfsthr0000gn/T/TemporaryItems')/folder/f'Screenshot 2026-10-12 at {t}\u202fPM.png'
        shutil.copyfile(source,target)

counts=collections.Counter(r['status'] for r in results)
manifest={'date':'2026-10-12','reference_commit':baseline['reference']['commit'],'reference_requirements':len(all_rows),'supplemental_packages':len(baseline['supplemental_packages']),'old_checkpoint_cases':len(results),'old_checkpoint_statuses':dict(counts),'new_roadmap_sprints':len(SPRINTS),'extra_B_sprints':len(BACKEND),'implementation_tests_run_for_report':False,'assets':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in assets.glob('*.png')}}
(ROOT/'report-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
