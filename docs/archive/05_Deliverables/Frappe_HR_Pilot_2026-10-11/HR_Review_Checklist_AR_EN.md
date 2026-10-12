# قنديل — HR pilot acceptance / مراجعة تجربة التوظيف

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

- Request: [tc488tee8d](http://localhost:8101/desk/kandil-hiring-request/tc488tee8d) — two locations, approved through the actual browser buttons.
- Candidate: [KJA-ceb4f2919c454b509010](http://localhost:8101/desk/job-applicant/KJA-ceb4f2919c454b509010) — Arabic name and phone, no email.
- Interview: HR-INT-2026-0002 — submitted scored feedback HR-INT-FEED-0002.
- Accepted offer: [HR-OFF-2026-00007](http://localhost:8101/desk/job-offer/HR-OFF-2026-00007) — ready to record Joining Outcome.
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
