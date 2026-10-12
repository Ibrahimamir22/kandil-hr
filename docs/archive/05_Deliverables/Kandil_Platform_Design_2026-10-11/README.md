# قنديل — platform design 01

Created 11 October 2026. Local review artifacts only.

## Open

- `dist/index.html`: clickable company portal. Works by opening the file directly; no installation, account or subscription needed.
- `Platform_Blueprint.html`: readable architecture, navigation, ownership, stack recommendation, release sequence, open decisions and source links.
- `Platform_Blueprint_AR_EN.md`: editable blueprint source.

Start at Overview. Use the preview-role selector and العربية / English switch. The prototype contains seven demonstration roles and six destinations; available navigation changes with the role. These are visual rules, not implemented authentication or access control.

All records are fictional. Actions modify browser memory only. Reload or Reset demo restores the samples. No real Frappe, Odoo or Google Drive requests are made. The optional link to the separate HR pilot opens localhost:8101 and requires that environment and its own login. A sample letter can download as a clearly labeled text file.

## Suggested 10-minute review

1. **Manager → Overview → HR:** inspect the dashboard and hiring request list. Create a multi-location request. A request above A=3 or B=2 needs a justification. These are static illustrative availability values, not a capacity engine.
2. **Sector approver → My approvals:** approve the sample exception. Switch to HR recruiter for the next decision. A manager submitting their own request skips the manager step.
3. **Employee → People & HR:** review own sample requests and preview/download the example employment letter. The date is generated in Africa/Cairo. It is not a valid or signed employment document.
4. **Delivery operations → Delivery:** open DL-028. Add a note, capture sample proof, then review the outcome. Alternatively record an exception. Odoo stock is never updated.
5. **Cost engineer → Cost estimator:** edit quantity/waste/rates, recalculate, confirm review and freeze one demo snapshot. Changed inputs require review again; the existing snapshot stays fixed. The calculator is not CAD, a commercial quote or validated cutting logic.
6. **Executive overview:** inspect aggregate HR information and read-only delivery/estimator. No candidate/salary access is implied.
7. **Architecture & plan:** review record ownership and staged implementation. This is a design-review aid, not an employee production destination.
8. Switch Arabic and reduce browser width to review mobile navigation.

## What to decide from this draft

- Does the navigation match how Kandil works?
- Is recruitment the right first connected journey, or is delivery more urgent?
- Which roles/sites should see and approve each record?
- Which screens should remain in native Frappe initially?
- Confirm Odoo responsibilities/API access and employee identity approach.
- Have HR/operations/engineering validate the real rules behind the mockup.

## Implementation direction

The prototype uses dependency-free HTML/CSS/JavaScript for fast review. This does **not** implement the proposed React/TypeScript + Django/PostgreSQL stack. Frappe HR + MariaDB stays separate. Read the blueprint for the reasons, actor-mapping spike, event/retry design and unresolved gates.

The local HR pilot was not modified or retested during this design work. Its earlier test results are separate from this prototype's UI checks. This design is not a production implementation or HR sign-off.

## Reproduce

Rebuild the readable blueprint after changing Markdown:

```sh
python3 build_blueprint.py
```

For the optional HTTP preview, serve the parent `05_Deliverables` directory on loopback and open `/Kandil_Platform_Design_2026-10-11/dist/`. Relative evidence links then resolve. `qa/check.cjs` records browser interaction checks, screenshots, runtime errors and layout checks; it uses the locally installed Playwright/Chrome paths and port 8120.

The prototype has no network dependencies, external fonts, analytics, remote images or live credentials. `qa/results.json` describes verification scope precisely; browser role switching is not a security test.
