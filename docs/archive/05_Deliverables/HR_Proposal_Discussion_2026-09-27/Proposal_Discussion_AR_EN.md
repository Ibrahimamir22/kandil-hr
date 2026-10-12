# Kandil Agentic HR — مسودة اتجاه المشروع للمناقشة

27 September 2026. Discussion draft only. No PDF, approved specification, commercial offer or implementation commitment.

## الفكرة المقترحة / Proposed direction

إنشاء منصة Agentic HR مملوكة لكنديل، تبدأ بحل مشكلات الموارد البشرية داخل الشركة، ثم تُجهّز للبيع لشركات أخرى. هدف النسخة الأولى هو إنجاز عمليات محددة وقابلة للقياس، وبعد إثبات فائدتها نوسّع المنتج تدريجيًا.

**Confirmed by Ibrahim:** Kandil owns the product and sells it to other companies. Kandil has more than 1,000 employees and currently uses Google Drive/Sheets for HR. Odoo HR has not been explored and remains comparison-only because of the stated licensing concern.

This creates two investment cases: internal operational improvement and an external software/service business. Neither success nor external revenue is assumed. Kandil’s own deployment is a design partnership and pilot; it does not alone prove product-market fit.

## تصحيح المقارنة / Compare the right choices

Google Workspace, an existing HR platform and a custom database are technology foundations. SaaS describes software delivery; RaaS describes a commercial promise around agreed results. An agentic layer can work with any suitable foundation. The choices are therefore composable, not strictly exclusive.

| Route | What Kandil gets | Strength | Cost / limitation | Revenue possibility |
|---|---|---|---|---|
| 1. Google Workspace Automation — تنظيم وأتمتة النظام الحالي | Structured employee data, requests, templates, approvals and reports | Limited migration and a familiar starting point | Permissions, data quality, concurrency and maintenance need deliberate design; low-code licences may add per-user costs | Implementation and managed-service revenue possible if standardized; not automatically a full HR product |
| 2. Buy & Configure — شراء نظام جاهز | A vendor HR/payroll platform adapted to Kandil | Existing functionality, support and maintained country rules where verified | Subscription, migration, vendor dependence, API/AI restrictions | Reseller or service revenue only where contractually permitted; product IP generally stays with vendor |
| 3. Open-source Foundation — تخصيص أساس مفتوح المصدر | Configure a product such as Frappe HR, then add workflows/integrations | Reuses established functions and may reduce licence costs | Hosting, localization, support, upgrades and licence obligations still cost money | A managed/product offering may be possible subject to the licence; do not promise exclusive ownership of third-party code |
| 4. Custom HR Web System — نظام ويب مخصص | Exactly defined workflows and data control | Can fit Kandil closely and remain valuable long term | Build and maintenance responsibility; one-client assumptions can make reuse expensive | Can generate implementation, support, licence or subscription revenue if designed and contracted accordingly |
| 5. Reusable Agentic HR Platform + RaaS — منتج ينفّذ عمليات الموارد البشرية | Configurable workflows, employee interface, approved actions and measurable completion | Matches the desired internal and commercial direction | Adds AI evaluation, connectors, exception handling, service operations and customer-support responsibilities | Recurring platform/service/outcome revenue is possible; demand, margins and support capacity must be validated |

There is also a conventional multi-customer SaaS path without agentic functionality. AI is not a prerequisite for resale. The recommended fifth route can use the first, second or third route as its initial foundation.

## ما الذي نبيعه؟ / The result

Example, not a demonstrated performance claim:

> الموظف: «محتاج HR letter موجّه لبنك مصر.»
>
> الموظف يختار «إصدار خطاب جديد» → النظام يتحقق من هويته وبياناته المعتمدة → يجهز القالب ويضع تاريخ الإصدار يوم التوليد/التحميل بتوقيت القاهرة → يصدر الخطاب حسب سياسة كنديل → يحفظه ويتيحه للتحميل → يسجل العملية.

**Confirmed:** the generation/download date is the new letter's issue date. Standard letters can be immediately available through employee self-service when Kandil has pre-approved the template and issuance/signing policy; exceptions requiring approval go to HR. Downloading an archived original preserves its original issue date. The main generate/download action produces a fresh letter; salary and employment facts come from approved records, not employee-entered claims.

The result is an accurately issued, authorized letter. An answer in a chat is not enough. A similar leave workflow ends with an approved or properly declined request, recorded balance and employee notification. Define which outcomes are billable before selling the service.

Conventional workflow automation may handle many of these steps. Use AI where interpreting requests, retrieving policy evidence or investigating exceptions adds value; use deterministic rules for balances, permissions and financial calculations.

## النسخة الأولى / Pilot scope

Start with a controlled cohort selected by HR, with three candidate workflows: employment letters, leave requests and attendance-exception investigation. Validate volume and data availability before choosing the final two or three. These are proposed priorities, not an approved scope.

Build a small authoritative HR data layer containing employee IDs, department/manager/site, approved policies, relevant balances, document templates, requests, approvals and an audit log. Existing Sheets can be an initial input. Before operational writes, define one authoritative owner/source for each field and reconcile duplicates and conflicts.

The first pilot need not require the purchase of a full replacement HR suite. It does require access control, a reliable record of actions, recoverable writes and clearly assigned HR ownership.

Payroll preparation can follow: validate inputs, reconcile attendance/overtime and flag discrepancies. Authorized payroll staff approve consequential changes and payroll release. A complete Egyptian payroll engine, recruitment, performance management and learning are possible later modules, each requiring its own business case. “All features” is not the V1 promise.

## التقنية والتشغيل / Architecture and responsibilities

Employee / manager → authenticated web interface → request interpretation → policy and permission checks → workflow and approved tools → human approval where required → record update → completion evidence.

For each action: restrict accessible employee records; validate inputs; protect against duplicate submissions/retries; show pending, failed and completed states; log the policy version, approval and resulting change; provide recovery and escalation. Instructions found inside employee documents must not override system permissions.

Payroll adjustments, hiring/rejection decisions, disciplinary actions and termination require authorized human decision-making. Sending salary information requires identity and access checks. HR policies and signed templates must be approved by Kandil before production use.

An AI model is one component. The commercial work also includes HR process design, integrations, support, ongoing tests, monitoring and exception resolution.

## الملكية والبيع / Kandil ownership and commercialization

Proposed contract terms to settle: Kandil owns the commissioned original product code and documentation, brand, customer contracts and its business data. Ownership/licensing of pre-existing components, models and open-source software must be identified separately. Agree who owns cloud accounts, repositories, domains, billing and release access, and who has continuing maintenance obligations.

Prepare the product for multiple customers through tenant isolation, configurable policies/templates/roles, separate audit trails, reusable connectors, onboarding, metering, billing and support. Other customers’ data remains segregated and governed by their contracts. Kandil’s employee data must not become shared demo or training data.

Kandil must appoint both an internal HR process owner and an owner for the external product business. The latter is responsible for product decisions, sales, customer onboarding, support staffing and the roadmap. A sellable codebase alone does not establish a software business.

## نموذج الإيرادات / Suggested commercial model

For external customers, consider an implementation/onboarding fee plus a recurring platform/operations fee with an included outcome allowance. Additional validated completed workflows may be billed separately. This is a proposed model, not an agreed price.

A billable outcome needs a unique case ID, agreed scope, required authorization, a persisted result and delivery evidence. Exclude duplicates, retries, failed runs and mere handoffs unless the contract explicitly defines an approved assisted-service outcome. Define a reopen/correction period and how credits work. Do not bill multiple times for one employee request because several agents or tools ran.

Measure time to completion, correctness, completion rate, human touch time, reopen rate and cost per successfully completed workflow. Separate autonomous completion from completion with human assistance.

External unit economics: revenue minus AI/model, hosting, messaging, connector licences, operational support and exception-handling costs. Then account for sales, product engineering and company overhead to assess profit. AI usage alone is not cost of delivery.

## الجدوى المالية / Two separate cases — confirmed direction

Internal case: baseline monthly request volumes × measured handling time × agreed loaded staff cost. Reduced handling time is released staff capacity, not automatically a cash saving. Count actual subscription reductions separately and only if a product is retired.

External case: prospective customers × realistic recurring price, less acquisition, onboarding, delivery and support costs. Validate willingness to pay with other companies before assuming expansion revenue. Keep scenario assumptions visibly separate from facts and signed commitments.

No credible custom-build price or timeline is fixed yet. Estimate after reviewing real HR workflows, sample data, attendance-device exports, approvals, payroll handoffs, expected request volumes and required service hours.

## هيكل الـ Proposal بعد الاتفاق / Proposed document structure

1. Executive summary — المشكلة والفرصة والقرار المطلوب.
2. Current state and verified requirements — الوضع الحالي وما لم نتحقق منه.
3. Options — البدائل الخمسة ومقارنة عادلة للتكلفة والمسؤوليات.
4. Market comparison — المنتجات المحلية والإقليمية والعالمية، مع shortlist مناسبة.
5. Recommended architecture — كيف تبدأ كنديل وكيف يتطور المنتج.
6. Employee journeys — ثلاثة أمثلة لنتائج مكتملة وموافقاتها.
7. Pilot and expansion gates — نطاق البداية وشروط التوسع.
8. Ownership and operating model — ملكية كنديل ومسؤوليات التطوير والتشغيل.
9. Internal ROI and external business case — جدوى داخلية وفرصة تجارية منفصلتان.
10. Investment, assumptions and decisions — الميزانية بعد الاكتشاف وما نحتاج حسمه.
11. Appendix — full vendor/pricing register, sources and procurement questions.

Use Arabic narrative with English product names and defined technical terms. Do not repeat every paragraph in both languages. Main proposal should stay decision-focused; the complete pricing research belongs in the appendix.

## ما يحتاج حسمه قبل الـ PDF / Open decisions

- The initial two or three workflows, based on actual monthly volumes and staff time.
- The authoritative data source and responsibility for payroll calculations during the pilot.
- Investment ceiling, target pilot date, internal HR owner and commercial product owner.
- The first external segment to target: for example Egyptian organizations with similar attendance and HR-service workflows. This is not decided yet.
- Ownership and maintenance contract details; pilot success thresholds and stop/expand criteria.

Ownership direction is confirmed; these implementation and commercial details remain open. The next deliverable should be an agreed content draft before PDF production.

## Research appendix

[Five route implementation plans](Five_Route_Implementation_Plans_AR_EN.md) include phases, responsibilities, cost drivers, planning ranges and acceptance criteria. [Critical comparison — 53 products](Critical_Comparison_53_Products.md) gives product-specific strengths, weaknesses, evidence gaps and Kandil verdicts. [GitHub catalogue — 25 repositories](GitHub_HR_Catalogue.md) distinguishes suites, components, source-available projects and demos.

[Expanded pricing comparison — 53 products](Pricing_Comparison_53_Products.md) includes the original 44 vendors and Mawared HR, Mawred, People365, Mercans, Zimyo, Sage HR, peopleHum, Darwinbox and Zendesk Employee Service. Official rates, seller marketplaces, procurement schedules, uploaded proposals, secondary estimates and unresolved prices are separated. No vendor has issued a Kandil-specific quotation. This catalogue is broad, not a claim to cover every product worldwide.
