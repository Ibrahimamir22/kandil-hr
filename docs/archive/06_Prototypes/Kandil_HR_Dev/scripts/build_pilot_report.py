from pathlib import Path
import json,html,shutil
root=Path(__file__).resolve().parents[1];src=root/'development/testing';out=root.parents[1]/'05_Deliverables/Frappe_HR_Pilot_2026-10-11';out.mkdir(parents=True,exist_ok=True)
load=lambda name:json.loads((src/name).read_text())
checks=load('pilot-results.json')+load('pilot-edge-results.json');volume=load('volume-results.json');demo=load('pilot-demo.json');audit=load('pilot-ledger-audit.json');before=load('concurrency-before.json');after=load('concurrency-after.json')
for name in ['pilot-results.json','pilot-edge-results.json','pilot-first-run.json','pilot-before-retry.json','volume-results.json','concurrency-before.json','concurrency-after.json','pilot-ledger-audit.json','pilot-browser-results.json','pilot-demo.json','pilot-review-browser.json','pilot-review-request.png','pilot-review-offer.png','pilot-review-home.png']:
    if (src/name).exists():shutil.copyfile(src/name,out/name)
esc=lambda value:html.escape(str(value))
rows=''.join('<tr><td>'+esc(r['name'])+'</td><td class="'+r['status']+'">'+r['status']+'</td><td><details><summary>Evidence</summary><pre>'+esc(json.dumps(r['evidence'],ensure_ascii=False,indent=2))+'</pre></details></td></tr>' for r in checks)
metrics=''.join(f'<tr><td>{esc(k.replace("_"," "))}</td><td>{v["operations"]}</td><td>{v["failed"]}</td><td>{v["p95_ms"]} ms</td></tr>' for k,v in volume['metrics'].items())
uat=f'''# قنديل — HR pilot acceptance / مراجعة تجربة التوظيف

Status: **Awaiting HR review. Automated checks are not HR sign-off.**

Open http://localhost:8101/kandil-pilot. All records are synthetic.
The main site at port 8100 is separate. Use a private browser session per role.

## Accounts / الحسابات التجريبية

| Role | Synthetic account |
|---|---|
| Requester / مقدم الطلب | kandil-test-employee_a@example.invalid |
| Department approver / معتمد الإدارة | kandil-test-manager2@example.invalid |
| HR recruiter / الموارد البشرية | kandil-test-manager@example.invalid |
| Sector authority / معتمد استثناء العدد | kandil-test-sector@example.invalid |
| Delegate / المفوض | kandil-test-employee_b@example.invalid |

Passwords are available privately in the local development file
`development/test-credentials.json`. Do not copy them into this review document.
Administrator can inspect setup; it is not a substitute for the assigned approver.

## Ready example / مثال جاهز

- Request: [{demo['request']}](http://localhost:8101/desk/kandil-hiring-request/{demo['request']}) — two locations, approved through the actual browser buttons.
- Candidate: [{demo['applicant']}](http://localhost:8101/desk/job-applicant/{demo['applicant']}) — Arabic name and phone, no email.
- Interview: {demo['interview']} — submitted scored feedback {demo['feedback']}.
- Accepted offer: [{demo['offer']}](http://localhost:8101/desk/job-offer/{demo['offer']}) — ready to record Joining Outcome.
- No employee has yet been created for this review candidate.

## Review scenarios / سيناريوهات المراجعة

| # | Actor and action | Expected result / النتيجة المطلوبة | HR result and notes |
|---|---|---|---|
| 1 | Requester creates one request with quantities for TEST Factory A and B; saves and submits. | Both lines remain in one request; the quantities appear as Reserved in capacity. | Pending |
| 2 | Requester tries to approve their request; HR tries to approve before the department approver. | Both actions rejected; no state or counter changes. | Pending |
| 3 | Department approver approves, then HR approves. | Request Approved; one opening per line; Reserved becomes Open, not Occupied. | Pending |
| 4 | Requester asks for more than Available, first without reason and then with reason. | No-reason submission rejected. Justified request requires independent Sector exception approval before the ordinary route. Cancel the test afterwards. | Pending |
| 5 | Sector creates a dated department delegation; delegate approves, then delegation is revoked. | Actor and original authority recorded. Revoked delegate cannot approve a new request. A requester cannot use delegation to approve their own request. | Pending |
| 6 | HR creates a candidate using phone only, records interview feedback and accepts/submits an offer. | No fabricated email; no Employee and no Occupied increase at offer acceptance. | Pending |
| 7 | HR opens the prepared offer and selects Record Joining Outcome → Joined with actual date, DOB and gender. | Exactly one Employee, one onboarding record/task; Open decreases and Occupied increases by one. Repeat the action: no duplicate. | Pending |
| 8 | A different accepted candidate is recorded as No Show with reason. | No Employee; vacancy stays open for a replacement candidate. Outcome retained in audit. | Pending |
| 9 | Cancel a pending request, then a partially filled request. | Pending reservation released. Unfilled approved balance released, openings closed; actual joiners retained. | Pending |
| 10 | Review request/event lists as requester, unrelated approver and HR. | Requester sees their own records; unassigned approver cannot see another draft. HR sees pilot records. Salary/privacy scope still needs a full separate review. | Pending |

## Decisions HR must confirm / قرارات مطلوبة

- هل مسار اعتماد الإدارة ثم HR مناسب؟ The pilot uses a configured department route; the complete organization hierarchy and CEO rules are not implemented.
- هل نمنع الطلب بدون مبرر عند تجاوز العدد، أم نبدأ بوضع التحذير؟ The pilot currently enforces a justified exception gate; the source blueprint described an initial warning mode.
- هل يوجد مرشحان يستخدمان نفس رقم الهاتف؟ Current duplicate rule is one application per normalized contact and opening. Shared phones need a reviewed alternative.
- كيف يُعتمد تقليل العدد أو إعادة الطلب للتعديل؟ The pilot currently approves the requested quantity unchanged; amendments need design.
- من يؤكد المباشرة الفعلية، وما المستندات المطلوبة؟ Current form collects only the minimum Employee fields. Full document, payroll, contract and offer-authority rules remain outside this pilot.
- كيف نعالج تصحيح مباشرة أو No Show، أو النقل أو الاستقالة؟ Final outcomes and joined assignments are protected; those later workflows are not implemented.

Reviewer: __________  Date: __________  Decision: Accept pilot / Amend / Reject

Blocking findings: __________
'''
(out/'HR_Review_Checklist_AR_EN.md').write_text(uat)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>قنديل | HR Pilot Results</title><style>
body{margin:0;background:#f4f6f8;color:#20333b;font:16px/1.6 system-ui,sans-serif}main{max-width:1150px;margin:auto;padding:42px 28px}h1{font-size:40px;line-height:1.15}h2{margin-top:36px}p{max-width:1000px}.top{color:#657680;font-size:13px;text-transform:uppercase;letter-spacing:.1em}.cards{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}.cards div{background:#fff;border-radius:12px;padding:20px;min-width:180px}.cards strong{display:block;font-size:34px;color:#166e52}table{width:100%;border-collapse:collapse;background:white}td,th{padding:13px;border-bottom:1px solid #e0e5e7;text-align:left;vertical-align:top}th{background:#21343e;color:white}.PASS{color:#097044;font-weight:bold}.FAIL{color:#aa2a37;font-weight:bold}.notice{border-left:4px solid #a72732;background:#fff;padding:20px}pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;color:#3e6f82}a{color:#12647b}img{width:100%;border:1px solid #d9e2e5;border-radius:12px;margin:16px 0}li{margin:9px 0}.flow{padding:20px;background:#20333b;color:white;border-radius:12px;font-size:19px}@media(max-width:650px){main{padding:25px 14px}h1{font-size:30px}td,th{padding:8px}}
</style><main><div class="top">قنديل · Local implementation and verification · 11 October 2026</div><h1>Recruitment pilot built.<br>Ready for HR review.</h1>
<p class="notice"><b>Conclusion:</b> Continue evaluating Frappe as the HR foundation. The three previously confirmed fit gaps now have working pilot implementations, and the original numbering conflict no longer reproduces in the tested workload. HR's business acceptance, production security, deployment, payroll and sustained load validation remain pending. This is not the complete recruitment blueprint or the company-wide platform.</p>
<div class="cards"><div><strong>35 / 35</strong>Custom workflow checks passed</div><div><strong>1,000</strong>Synthetic volume employees</div><div><strong>600 / 600</strong>Mixed volume operations passed</div></div>
<p>In addition: a phone-only candidate completed a standard interview and scored feedback, received an accepted offer, and remained unjoined. Request submission and two approval steps were also completed through the actual browser buttons, without page JavaScript errors or HTTP 5xx responses.</p>
<p><a href="http://localhost:8101/kandil-pilot">Open the pilot</a> · <a href="HR_Review_Checklist_AR_EN.md">Arabic / English HR review checklist</a></p>
<h2>What was built</h2><div class="flow">Request with location lines → Reserve quantities → Independent approvals → Opening per location → Candidate → Interview → Offer → Actual joining / No-show</div>
<ul><li>Versioned custom DocTypes, action endpoints, role rules, form buttons and a bilingual review entry page in <code>kandil_hr</code>.</li><li>Atomic capacity reservations, an exception gate, partial filling, rejection and cancellation without losing actual joiners.</li><li>Phone-only Job Applicants with internal IDs, optional email metadata and an application duplicate constraint. No fabricated email addresses.</li><li>Dated, revocable delegation with principal/actor attribution and prevention of delegated self-approval.</li><li>Accepted offers do not count as hires. Actual joining creates an Employee and an onboarding task; repeated joining creates no duplicate. A no-show retains the vacancy.</li><li>Server controls reject direct status changes, fake audit events, manual pilot openings and employee conversion that bypasses joining.</li></ul>
<h2>The concurrency investigation</h2><p>The local database is MariaDB 11.8.9. Its snapshot-isolation setting was ON with REPEATABLE-READ. Standard Frappe numbering locks conflicted under that setting. MariaDB documents the changed default and the record-changed error behavior in its <a href="https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables#innodb_snapshot_isolation">official system-variable reference</a>.</p>
<table><tr><th>Controlled probe</th><th>Concurrency</th><th>Result</th></tr><tr><td>Original setting</td><td>5</td><td>2 of 10 writes saved; 8 failed</td></tr><tr><td>Snapshot isolation OFF, row locking retained</td><td>10</td><td>100 of 100 saved; 100 distinct record IDs; no retries</td></tr></table>
<p>The compatibility setting is persisted in this local Compose project's MariaDB command. It affects the shared local server used by both local sites; main-site business records were not migrated or populated by this work. No global Docker setting or unrelated project was changed.</p>
<p>A separate custom-pilot deadlock involved locking an empty approval-step range. The pilot now avoids that unnecessary draft lock and has at most three retries of a fully rolled-back transaction for transient database deadlocks. Authorization and validation errors are not retried. No external effects are performed in those transactions.</p>
<table><tr><th>Pilot race</th><th>Observed result</th></tr><tr><td>Two requests for one seat</td><td>One reservation; one controlled exception-required rejection.</td></tr><tr><td>Twenty simultaneous requests for five seats</td><td>Exactly five reservations and fifteen controlled rejections. No HTTP 500. Successful submissions reported zero retries in this run.</td></tr><tr><td>Two simultaneous joining submissions</td><td>Both returned the same Employee; only one occupied-headcount increment.</td></tr><tr><td>Ledger reconciliation</td><td>All six fixture capacities balanced against pending/approved request lines and actual employees. Earlier failed-run requests remain as labeled synthetic history; their reservations are accounted for.</td></tr></table>
<h2>Volume test: what the numbers mean</h2><p>1,000 additional synthetic Employee records were created through normal validation. The test site then contained 1,008 employees in total. Ten authenticated sessions performed a short batch of 600 business operations, using 700 HTTP requests: 300 individual reads, 200 paginated list reads, and 100 attendance create-and-submit pairs.</p>
<table><tr><th>Operation</th><th>Count</th><th>Failures</th><th>95th percentile</th></tr>'''+metrics+'''</table>
<p>The batch took '''+esc(volume['duration_seconds'])+''' seconds on this Mac's local Docker development environment. The 95th percentile means 95% of measured operations completed within that time. These figures exclude network travel to a production server, login storms, 1,000 simultaneous users, payroll runs, biometric history, notifications and sustained soak testing. They are evidence for this pilot dataset, not an SLA or a hosting specification.</p>
<h2>Actual screens</h2><img src="pilot-review-home.png" alt="Bilingual pilot entry page"><img src="pilot-review-request.png" alt="Approved multi-location hiring request"><p>Native Frappe forms are functional review surfaces. This is not the final Kandil design; broader Arabic translation and UX work remain.</p>
<h2>Where this pilot differs from the full requirements</h2><ul><li><b>Approval routing:</b> a configurable department route with an independent exception approver. Full organization hierarchy resolution, effective-dated CEO rules and compensation authority are not implemented.</li><li><b>Quantities:</b> approved quantity equals requested quantity. Reductions, return-for-amendment versions and changing an approved position need further workflow work.</li><li><b>Capacity:</b> the pilot enforces a justification/exception gate; HR must decide whether the first operational phase should use the blueprint's warning mode. Baseline occupied values are setup inputs. Transfers, exits and ongoing reconciliation/imports remain to be designed.</li><li><b>Identity:</b> one normalized contact per opening prevents the tested duplicate. Shared phone numbers, alternative country formats, identity correction and reapplication rules need HR review.</li><li><b>Security:</b> requester scope, unrelated-reader rejection, selected employee restrictions and action authorization were tested. Recruiter/Sector roles see all pilot records. This is not a full field-level or multi-company privacy audit.</li><li><b>Joining:</b> final outcomes and employee assignments are protected. Reversals, rehire, approved transfers and exits require new audited flows.</li><li><b>Readiness:</b> no Egypt payroll validation, Odoo/BioTime/Sheets integration, backup restoration, external notification delivery or production deployment.</li></ul>
<h2>HR review is the remaining human step</h2><p>I can run automated scenarios and prepare the system, but cannot provide HR's approval of their policies or working experience. The linked bilingual checklist has ten hands-on scenarios, named synthetic role accounts and a blank result column. Its decisions are marked Pending.</p>
<p>The prepared example is request <a href="http://localhost:8101/desk/kandil-hiring-request/'''+esc(demo['request'])+'''">'''+esc(demo['request'])+'''</a>, with accepted offer <a href="http://localhost:8101/desk/job-offer/'''+esc(demo['offer'])+'''">'''+esc(demo['offer'])+'''</a>. HR can review it and record actual joining with synthetic details. No employee has yet been created for that example candidate.</p>
<h2>Acceptance checks</h2><table><tr><th>Scenario</th><th>Result</th><th>Evidence</th></tr>'''+rows+'''</table>
<h2>Validation and change boundaries</h2><p>Six existing checks were rerun for own-record access, colleague-record denial, recruitment access denial, leave balance enforcement, PDF export and colleague leave-balance denial; all passed. Python compilation, JavaScript syntax checks and diff whitespace checks passed. Ruff lint and formatting checks also passed.</p>
<p>Upstream Frappe, ERPNext and HRMS source remains unmodified. The new application code is local and uncommitted. Runtime flags and optional-email metadata were applied only to <code>kandil-test.localhost</code>; no real data was imported or external service connected. The original baseline report is preserved as historical evidence, not the current pilot result.</p>
<h2>Evidence files</h2><p><a href="pilot-results.json">26 workflow checks</a> · <a href="pilot-edge-results.json">9 edge checks</a> · <a href="volume-results.json">Volume timings</a> · <a href="concurrency-before.json">Before probe</a> · <a href="concurrency-after.json">After probe</a> · <a href="pilot-ledger-audit.json">Ledger audit</a> · <a href="pilot-browser-results.json">Browser approvals</a> · <a href="pilot-demo.json">Phone-only interview and review example</a> · <a href="Engineering_Notes.md">Engineering notes</a></p></main></html>'''
(out/'Kandil_HR_Pilot_Results.html').write_text(page)
shutil.copyfile(root/'development/frappe-bench/apps/kandil_hr/README.md',out/'Engineering_Notes.md')
print(out/'Kandil_HR_Pilot_Results.html')
