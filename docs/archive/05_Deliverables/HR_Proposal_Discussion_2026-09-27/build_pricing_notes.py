from pathlib import Path
import json

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'HR_Research_2026-09-27/src/data.json'
rows = json.loads(OLD.read_text())['queries']['vendors']['rows']
for r in rows:
    r['priceStatus'] = 'U'
    r['priceEvidence'] = 'No current numeric price verified in this research; obtain a scoped quotation. This does not prove the vendor never publishes prices.'
    r['annual1000'] = 'Not calculable from verified evidence'
    r['priceSource'] = r['source']

def update(name, status, price, annual, source):
    r = next(r for r in rows if r['vendor'] == name)
    r.update(priceStatus=status, priceEvidence=price, annual1000=annual, priceSource=source)

update('Nidham HR','P','Starter EGP 750/month for 25; Pro EGP 2,500/month for 100; Business EGP 6,000/month for 500. Enterprise on-premise also advertised.','No extrapolation: published packages stop at 500 employees.','https://www.nidhamhr.com/')
update('ZenHR','P','From USD 8/user/month, annual billing; volume discounts. Implementation/training fee applies at 100+ full-time employees.','USD 96,000 list-rate illustration; volume quote and implementation extra.','https://www.zenhr.com/en/faqs')
update('Zoho People','P','Annual billing: Essential HR USD 1.25; Professional 2; Premium 3; Enterprise 4.50 per user/month. People Plus USD 8 shown separately.','USD 15,000 / 24,000 / 36,000 / 54,000 respectively. People Plus: 96,000. Egyptian payroll not established by these prices.','https://www.zoho.com/people/zohopeople-pricing.html')
update('BambooHR','P','Core USD 10; Pro 17; Elite 25 per employee/month starting rates. Volume discounts; payroll and benefits add-ons shown as US-only.','USD 120,000 / 204,000 / 300,000 before automatic volume discounts and extras.','https://www.bamboohr.com/pricing/')
update('Factorial','P','From USD 8/user/month; tailored module package.','USD 96,000 starting-rate illustration; full scope requires quote.','https://factorialhr.com/pricing-plans')
update('Rippling','P*','Earlier official small-business source advertised from USD 8/user/month; direct re-fetch failed during this update. Full-suite quote required; some products add base fees.','USD 96,000 historical/current-page-lead arithmetic only; reconfirm rate before proposal.','https://www.rippling.com/solutions/small-businesses')
update('greytHR','P','GCC page: Essential USD 50/month includes 10, then USD 2/additional employee; Growth USD 60 includes 10, then USD 3. Premium quote. Page labels figures as estimates; Egypt applicability unverified.','Essential USD 24,360; Growth USD 36,360. Add-ons and country scope extra/unverified.','https://www.greythr.com/middle-east/pricing/')
update('Palm HR','P','Starter AED 1,000/year up to 15 employees, without payroll. Core/Professional/Enterprise need scoped pricing.','Not calculable: small-team package cannot be multiplied into a 1,000-person offer.','https://palmhr.net/en/pricing')
update('Daftra','P','Annual-billing base plans: Basic USD 20/month; Advanced 41.25; Premium 50. HR employee slots: 1/2/3 included respectively, then USD 2.20/employee/month. Extra full users USD 7/month.','Premium illustration: (50 + 997 × 2.20) × 12 = USD 26,920.80; confirm employee definition, modules, branch/API charges and volume terms.','https://www.daftra.com/en/plans')
update('Odoo Enterprise HR','P','Comparison only, excluded by client. USD page shows annual Standard 24.90/user/month (31.10 reference), Custom 49 (61 reference), first-12-month discount; Light User 8.90. Retrieved older/newer page versions differ on chargeable employee records.','No single Kandil total: confirm Egyptian pricing, existing contract, regular/light users, record billing and renewal terms. Do not assume HR records are free.','https://www.odoo.com/pricing')
update('Frappe HR','P','Free/open-source software. Managed cloud sites advertised from USD 5/month; server offerings from USD 20/month. Hosting, implementation and support are separate.','No enterprise total; entry hosting is not a 1,000-employee capacity or support quote.','https://frappe.io/hr/pricing')
update('OrangeHRM','P*','Starter free/open-source in earlier research; Advanced requires quotation. Hosting, migration, support and payroll localization are separate.','No usable full-deployment total.','https://orangehrm.com/orangehrm-starter-open-source-software')
update('Deel','P','Talent USD 14/worker/month; contractors 49/contractor/month; EOR 599/employee/month; Contractor of Record 325; US PEO 125. These are different products, not one HRMS price.','Talent-only USD 168,000 illustration. No like-for-like Kandil HR/payroll total; EOR service fees must not be compared as HR software licences.','https://www.deel.com/pricing/')
update('Remote','P','HRIS USD 12/employee/month on official Global HR page. EOR and payroll are separate products; earlier standard EOR support rate was USD 699/month and needs current term verification.','HRIS-only USD 144,000; excludes any separately priced payroll/EOR services.','https://remote.com/global-hr/automate-hr-workflows')
update('Jisr','Q','Official pricing page requests quotation for People, Talent and Spend. No numeric Kandil offer.','Quote required.','https://www.jisr.net/en/pricing')
update('Bayzat','Q','Official site describes pricing based on company size, modules and requirements. No normalized Egypt offer. An AWS listing has ambiguous units and is excluded from calculations.','Quote required.','https://www.bayzat.com/')
update('Leena AI','Q','Custom quotation according to employee count, use cases and usage; distinguish assistant deployment from autonomous-colleague usage.','Quote required.','https://leena.ai/pricing')

def add(name, group, category, modules, payroll, fit, status, price, annual, source, price_source=None):
    rows.append(dict(vendor=name,group=group,market=group,category=category,modules=modules,egyptPayroll=payroll,kandilFit=fit,integration='Scope and commercial API entitlement require verification',diligence='Demo with Kandil scenarios, verify Egypt payroll, security, 1,000+ employee references, integration and support.',source=source,reviewed='2026-09-27',priceStatus=status,priceEvidence=price,annual1000=annual,priceSource=price_source or source))

add('Mawared HR (mawaredhr.com / mawared-hr.com)','Egypt-local','HR, attendance and payroll','Employee profiles/documents/assets; GPS and facial-recognition attendance; policies and penalties; payroll, allowances, deductions, loans and expenses. Vendor markets AI.','Egypt deployment and statutory calculations require demonstration; payroll marketing alone is not validation.','Add to priority local demos','U','Current numeric public rate not verified. Older customer proposals on Scribd are unverified commercial documents, not a current tariff.','Obtain a fresh 1,000+ employee quotation.','https://mawaredhr.com/')
add('Mawred (mawredhr.com)','Middle East-regional','HR and payroll suite','HR, payroll, attendance, self-service, ATS, performance; FAQ describes an AI HR chatbot.','Exact Egypt localization unverified. Distinct brand/domain from Mawared HR.','Regional alternative','Q','Official FAQ says packages depend on company size, industry and employees; contact sales.','Quote required.','https://mawredhr.com/en/faq-2/')
add('People365','Middle East-regional','HCM and workforce management','Workforce/time management, scheduling, payroll, HR, mobile; multi-entity payroll and accounting integration.','Regional offices include Egypt in vendor brochure; exact statutory engine/release to verify.','Add to enterprise workforce demos','U','No numeric price verified in this research.','Scoped quote required.','https://people365.com/solutions/payroll-software/')
add('Mercans','International','Global payroll software and services','Payroll calculation, employee portal, attendance and payroll reports; vendor publishes Egypt-specific offering.','Vendor explicitly markets Egypt payroll; validate current rules in a parallel run.','Potential payroll component/partner','U','No numeric Egypt price verified; identify SaaS versus managed payroll scope.','Scoped quote required.','https://mercans.com/payroll-software/egypt/')
add('Zimyo','International','HRMS with regional editions','Core HR, attendance, leave, payroll and ESS; higher tiers add lifecycle, engagement, roster, performance and administration.','Egypt page claims local tax handling; pricing page also contains GCC terminology, so local statutory proof is essential.','Add to value-price comparison','P','Egypt page: Basic EGP 150; Standard 200; Enterprise 300/user/month, monthly billing, minimum 25. International USD 3/4/6 displayed separately; use Egypt offer for this scenario.','EGP 1,800,000 / 2,400,000 / 3,600,000 per year before discounts/extras.','https://www.zimyo.me/egypt/','https://www.zimyo.me/pricing/egypt/')
add('Sage HR','International','Modular HR platform','Core HR/leave, performance, timesheets, shifts, expenses and recruitment sold as modules.','US price reference does not establish Egyptian payroll.','International benchmark','P','US page main cards: Core USD 6.50/employee/month; performance, timesheets and shifts each +3.25; expenses +1.75; recruitment +210/company/month. Same page FAQ retains 5.50; resolve discrepancy in quote.','Core USD 78,000; all listed HR modules including recruitment USD 218,520/year. No Egyptian payroll included in this arithmetic.','https://www.sage.com/en-us/sage-business-cloud/hr/')
add('peopleHum','International','HR platform','Modular people-management platform; exact selected modules require quote.','Egyptian statutory payroll not established.','International benchmark','P','Starts at USD 2/employee/month; vendor packages selected products.','USD 24,000 starting-rate illustration, not full-suite cost.','https://www.peoplehum.com/pricing')
add('Darwinbox','International','Enterprise HCM','Core HR, workforce, payroll/compensation, expenses, hiring/onboarding, talent and analytics.','Exact Egyptian payroll localization unverified.','Enterprise benchmark','Q','Official quotation form prices selected modules; no numeric tariff verified.','Quote required.','https://explore.darwinbox.com/lp/request-a-quote')
add('Zendesk Employee Service','Agentic/specialist','Employee service and workflow layer','Ticketing, knowledge and action builder; higher tiers add self-service, tasks, approvals, service levels and advanced controls.','Not a payroll engine or complete HR system of record.','Direct service-layer competitor or component','P','Annual billing: Team USD 29; Growth 59; Professional 99 per support agent/month; Enterprise quote. Check AI-resolution allowances/charges separately.','Depends on support agents, not employee headcount. At 10 agents: USD 3,480 / 7,080 / 11,880 yearly before AI extras.','https://www.zendesk.com/pricing/employee-service-pricing/')

assert len(rows)==53 and len({r['vendor'] for r in rows})==53
for r in rows:
    r.pop('pricing',None)
(HERE/'pricing_register.json').write_text(json.dumps({'reviewed':'2026-09-27','status':'Discussion draft; no vendor quotations obtained','vendors':rows},ensure_ascii=False,indent=2))

def cell(s): return str(s).replace('|','/').replace('\n',' ')
out=['# HR market pricing register — discussion draft / مسودة للمناقشة',
'Research date: 27 September 2026. Covers all 44 products in the earlier report plus 9 additions: **53 products**. This is an expanded longlist, not a claim to enumerate every HR product worldwide.',
'This file supersedes the earlier report’s pricing summary where the two differ. The earlier interactive report has not been rebuilt with this update. No PDF, vendor outreach, signup, purchase or implementation has been performed.',
'## Reading the evidence',
'**P** = published amount captured from an official page or its indexed rendering. It is not a negotiated offer. **P*** = earlier official evidence retained but not fully revalidated in this pass. **Q** = explicit quotation/tailored-pricing language captured. **U** = no current numeric price verified by this research; it does not mean no public price exists.',
'All 1,000-person totals below are arithmetic illustrations, using exactly 1,000 chargeable employees/users where applicable. Kandil has more than 1,000 employees, so these are a comparison baseline, not its actual budget. They exclude taxes, FX, volume discounts, implementation, migration, devices, connectors, training, support upgrades and AI usage unless expressly included. Do not rank prices without comparing module and country coverage.',
'Prices remain in their published currency. No invented EGP exchange rate has been used. When sources render differently or conflict, the uncertainty is recorded rather than resolved by assumption.',
'## Full pricing register',
'| Product / المنتج | Evidence | Published price / السعر | Annual illustration or missing input | Source |',
'|---|---|---|---|---|']
for r in rows:
    out.append('| '+' | '.join(cell(x) for x in [r['vendor'],r['priceStatus'],r['priceEvidence'],r['annual1000'],f"[Official page]({r['priceSource']})"] )+' |')
out += ['## Google Workspace route: cost benchmark, not an HR vendor',
'Google Sheets, Forms, Drive and Apps Script can support an initial controlled workflow. Budget for design, permission controls, testing, maintenance and the actual Workspace contract. AppSheet is optional; it is not synonymous with every Google-based implementation.',
'[AppSheet official pricing](https://about.appsheet.com/pricing/): Starter USD 5/user/month; Core 10; Enterprise Plus 20. Core is included in many paid Workspace plans for eligible users. At 1,000 newly paid app users, simple annual arithmetic is USD 60,000 / 120,000 / 240,000. Existing entitlements and the number of actual app users can change this materially. These are not recommendations to give every employee a new licence.',
'## Mawared identity and pricing',
'The Egyptian Mawared HR at [mawaredhr.com](https://mawaredhr.com/) is the product added to the local comparison. Its [Google Play listing](https://play.google.com/store/apps/details?id=com.qu_attendance) identifies Mawared Solutions. The similarly named [Mawred](https://mawredhr.com/en/faq-2/) is listed separately. No inference that the brands are affiliated is made.',
'Search surfaced old customer-specific Mawared proposals on Scribd. Their validity, authorship, discounts, employee counts and implementation terms are not independently confirmed. They are excluded from the price table and must not be multiplied into a Kandil budget.',
'## New-product scope and fit',
'| Addition | Advertised scope | Egypt / Kandil question | Product source |',
'|---|---|---|---|']
for r in rows[-9:]:
    out.append('| '+' | '.join(cell(x) for x in [r['vendor'],r['modules'],r['egyptPayroll'],f"[Vendor]({r['source']})"] )+' |')
out += ['## Compare equivalent bids',
'Ask each shortlisted supplier to price the same headcount, legal entities, sites, administrators, managers and employee self-service access; core HR, time/shift/overtime, leave, Egyptian payroll, letters, mobile Arabic/English, approvals, audit, APIs and bulk export. Price talent/recruitment and advanced AI separately.',
'Require itemized first-year and renewal costs: licence unit and minimums; implementation; data cleaning/migration; attendance-device bridge; ERP/payroll integrations; SSO/API/sandbox; training; support SLA; storage; AI/messages; statutory maintenance; exit/export. For payroll, ask who maintains Egyptian rules and require a sample parallel payroll run before selection.',
'Three-year TCO = setup + migration + integration + training + 36 months of recurring licence/hosting/AI/support + budgeted change work + exit costs. Prices quoted only for small businesses, another country, EOR services or entry hosting are not substitutes for that calculation.',
'## Proposal treatment',
'Keep the main proposal focused on a small shortlist, with this full register as an appendix. Provisional demo set: Mawared HR, HITS/Nexus, Menaitech, ZenHR, bluworks and People365. These are candidates for validation, not scored winners. Compare Frappe HR as a possible configurable foundation and Zendesk/Leena AI/ServiceNow/Moveworks as execution-layer alternatives.',
'Public pricing research is complete enough for discussion, but a final all-vendor procurement price comparison is not complete: many amounts remain unverified or quote-dependent. No supplier has provided a Kandil quotation.']
rendered = out[0]
for previous, current in zip(out,out[1:]):
    rendered += ('\n' if previous.startswith('|') and current.startswith('|') else '\n\n') + current
(HERE/'Pricing_Comparison_53_Products.md').write_text(rendered+'\n')
print('Created 53-row register and pricing notes.')
