# Sprint 2 — PDF downloads and local document delivery

13 October 2026. Custom portal increment over the existing Frappe HR / `kandil_hr` backend. S2 and the full HR goal remain active.

## Portal workflow

Open `http://localhost:8102/hr-portal` → **Job descriptions / الوصف الوظيفي** → open a revision → **Documents and delivery / المستندات والتسليم**.

- Select Arabic or English and JD or worker card. View/print opens the existing scoped HTML; **Download PDF** returns a private attachment with a UTF-8 filename.
- On an approved revision, authorized HR/managers can select 1–10 eligible portal recipients, optionally add a note of up to 500 characters, and **Capture email locally / حفظ نسخة البريد محليًا**.
- The UI explicitly states that no email is sent. The existing domain command stores an immutable local MIME message containing HTML and an actual PDF. It does not call an email provider.
- Sender/recipient can inspect their permitted capture history and download the `.eml` review copy. Scope and native JD read/print checks apply at capture and again on download; revocation removes access.

This is a tested local capture workflow, not a live-email implementation or proof of external delivery. A mail provider, configured sender/domain, retry/bounce handling and approved live acceptance remain a separate integration gate. No real recipient, employee record, Odoo system or external mail service was used.

## Implementation and corrections

`portal/document_delivery.py` adds bounded recipient and history projections; capture/download reuse the mature native domain. Candidate recipient IDs are paginated before eligibility checks, taken only from the document company's grant candidates. Search is by recipient email. An empty eligible page may still have a next candidate page; the UI explains this. No global user directory, raw MIME or scope snapshot is returned in list responses.

History uses the existing native delivery permission hook. Its internal own-capture scan is not a new performance guarantee; sustained 1,000+ account performance remains S11 work.

`DocumentDelivery.tsx` provides bilingual document selectors, PDF downloads, local capture form, recipient selection and capture history. Stable command IDs make unchanged retries idempotent. Existing grade/salary exclusions and approval rules are unchanged.

The first browser download exposed a genuine native response mismatch: Frappe's generic PDF response was inline despite `display_content_as`. The endpoint now returns an explicit attachment response, Arabic-safe filename, `private, no-store`, and `nosniff`.

Visual checks then exposed split section headings and Arabic print-edge clipping. Shared HTML/PDF layout now uses a block container with inner print padding, protected section/list breaks, explicit margins and page numbers. Both direct PDF downloads and captured PDF attachments use the same options. Long documents remain multi-page; no arbitrary promise of a one-page worker card is made.

## Verification and evidence

- [Final native evidence](evidence/s2-regression-61699afc8436.json): **33 passing checks** across portal delivery (8), native delivery (13) and JD portal regression (12), run serially. This is the focused suite selection, not the full regression runner.
- [Final browser evidence](../portal/evidence/documents-09edd524df9b/results.json): **15 passing checks**, four actual UI PDF downloads, local MIME/PDF attachment, retry without duplicates, scoped recipient/history access, guessed URL denials and revoked-user denials. No JavaScript errors, HTTP 5xx or external requests recorded. All six fixture accounts disabled; current fixture ledgers zero; audit history retained.
- [Render checks](../portal/evidence/documents-09edd524df9b/render-checks.json) and [manual visual review](../portal/evidence/documents-09edd524df9b/visual-review.json): four PDFs, **eight pages inspected**. Final Arabic glyphs, English text, section boundaries, tables, safety block, signature area and page numbering are readable. Desktop and Arabic mobile screenshots also inspected. This is developer rendering review, not HR or legal acceptance.
- TypeScript/Vite build passed (36 modules); recorded native/browser source hashes were rechecked against the final files. Pinned upstream source links are unchanged.

Passing HTTP/PDF-header or word-bounding-box checks alone do not certify layout. Earlier PDFs below remain historical failed-layout evidence, not accepted outputs.

Earlier attempts are retained with explicit limits:

- `documents-118b4682163b`: download timeout caused by inline PDF response; browser PDF-viewer internal requests appeared as null origins. No external recipient or email was involved; the cohort was retired.
- `documents-3faa18782f4a`: all 15 browser/API checks passed, but the four inspected Arabic pages failed visual review (split heading and print-edge clipping). These PDFs are superseded.
- `documents-8104915e2d04`: all 15 browser/API checks passed and all eight pages were inspected; a high-resolution crop still showed the first Arabic purpose glyph clipped. Added inner padding before final regeneration. These PDFs are also superseded.
- A local system Python XML-library mismatch prevented the first bounding-box helper invocation; the bundled Python runtime runs the helper successfully. This did not affect the Frappe app.

## Remaining acceptance

ORG-003 retains its complete original definition including email. Local capture is not grounds to mark that requirement fully accepted. S2 still needs complete structure/JD/assignment history comparisons and HR review of tree, terminology and documents. Worker acknowledgement wording also remains pending legal/HR review, as stated on the document.

No change to the frozen 98 requirement IDs or the historical 72 passed / 4 partial / 4 blocked baseline. Identity/MFA, independent security, sustained load for 1,000+ accounts, recovery/monitoring, production hosting, real-data migration and HR/IT/UAT gates remain open.
