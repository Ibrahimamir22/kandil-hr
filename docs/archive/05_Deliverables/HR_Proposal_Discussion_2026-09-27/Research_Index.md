# Kandil HR — expanded research and proposal discussion

Updated 27 September 2026. Content for discussion before creating the proposal PDF.

## Start here

| Document | What it answers |
|---|---|
| [Proposal discussion — AR/EN](Proposal_Discussion_AR_EN.md) | Product direction, confirmed decisions, employee journey, ownership and commercial model |
| [Five implementation plans — AR/EN](Five_Route_Implementation_Plans_AR_EN.md) | Phases, responsibilities, indicative timing, cost drivers, pros/cons and acceptance criteria for every route |
| [Critical comparison — 53 products](Critical_Comparison_53_Products.md) | Product-specific strengths, weaknesses, Egypt fit, integration gaps and verdict for Kandil |
| [Expanded pricing — 53 products](Pricing_Comparison_53_Products.md) | Amounts, units, currencies, commercial scope, sources and carefully labelled 1,000-person illustrations |
| [GitHub catalogue — 25 repositories](GitHub_HR_Catalogue.md) | Suites versus components/demos, actual licences, last-push evidence, pros/cons and reuse recommendation |

## Confirmed decisions

- Kandil has over 1,000 employees and currently uses Google Drive/Sheets for HR.
- Kandil owns the proposed original product and sells it to other companies; upstream components keep their existing licences.
- RaaS means Results as a Service, with agentic execution of approved HR processes.
- New HR letters use the generation/download date. An archived original retains its original date.
- Compare five routes fairly and separate the internal efficiency case from the external commercial case.
- Odoo Enterprise remains comparison-only under the user's stated preference.
- Discuss/agree content before producing the proposal PDF.

## Coverage and remaining evidence gaps

The 53-product register includes numeric or free-licence evidence for **41 products**. That includes current published prices, limited-scope examples, marketplace offers, older procurement schedules, unverified customer uploads and secondary estimates. It does **not** mean 41 confirmed complete offers for Kandil. Each row names the evidence quality and its limitations.

For **12 products**, no reliable numeric amount was found: HITS/HR Nexus, bluworks, MegaCom/MegaHR Enterprise, HR Enterprise/Click Enterprise, BSmart HR, Yomly, ASCON, Artify360, Ramco Payce, Zenithr, Mawred and People365. Vendor-specific and broader public searches were attempted; no vendor was contacted. These entries remain explicit commercial gaps, not invented estimates.

The GitHub catalogue covers 25 repositories. It does not claim that every HR repository/fork worldwide has been enumerated. Several are components, source-available projects or demonstrations rather than deployable full HR suites. Current default-branch licences were inspected; exact deployment versions still need to be selected and checked.

Additional discovery leads surfaced during the final searches: [AliaTeck Nexus](https://nexus.aliateck.com/nexus/), [The Five HR](https://thefive.space/), [inyad Staff Egypt](https://inyad.com/en-eg/pricing-staff), and [Mawered EMEA](https://mawered.com/en/). These have not received the same full assessment as the 53-product register and are not counted as verified additions. In particular, similarly named Mawared/Mawred/Mawered products must not be merged into one vendor.

## How to use this research

Use matched requirements and three-year ownership cost to choose finalists. The smallest price in a row may be a small-company package, a single module, a historical rate or a different country. It is not sufficient for a buying decision. Buying a vendor platform can still support a Kandil-owned agentic layer if access and commercial terms permit it.

The provisional direction is an open-source proof of fit plus a narrowly scoped agentic service pilot. The buy/configure shortlist remains a fair alternative if it offers a materially better supported operational foundation. A conventional custom system can remain useful and commercially sellable; AI is not a prerequisite for revenue.

No real employee data was accessed, no software was deployed and no proposal PDF was created. Downloaded vendor PDFs are research sources. This package supersedes earlier price summaries in the older research-app folder.

## Evidence and reproducibility

- `pricing_register.json`: 53 structured product records, pricing sources and critical assessments.
- `github_repository_evidence.json`: public repository metadata and licence evidence for 25 repositories.
- `Oracle_Global_Price_List.pdf`: unchanged official global pricing source; HCM table inspected on page 8.
- `Workday_GCloud14_Price_List.pdf`: unchanged public procurement source; price table page 2, definitions page 4 and assumptions page 8 inspected.
- `expand_research.py`: generates the updated price register and critical comparison.
- `build_github_catalogue.py`: generates the GitHub assessment from preserved public evidence.
- `build_pricing_notes.py`: earlier snapshot builder; running it alone would restore older pricing. Reapply `expand_research.py` afterward if used.

Validation performed: unique product/repository counts, complete pros/cons/verdict fields, source-link presence, key arithmetic and local document links. Assessment is desk research, not a hands-on product benchmark, licence audit or payroll certification.
