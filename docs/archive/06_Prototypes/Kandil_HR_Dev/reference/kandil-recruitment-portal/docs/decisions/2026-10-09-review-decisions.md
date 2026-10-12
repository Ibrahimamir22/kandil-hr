# Owner decisions on the v0.33 review — 9 Oct 2026

Source: the review report (three parts: gaps, blueprint vs best practice, code) and the owner's answers in
the decisions workbook (59 questions + 49 code fixes), plus the follow-up chat of 9 Oct 2026.
Each decision is recorded in Blueprint v2.3 §0 as CHG-72 … CHG-112 and built in v0.34.0 – v0.39.0.

## Owner answers (decisions workbook)

| # | Topic | Decision |
|---|---|---|
| 1 | Google account | Stay on Gmail until go-live; move to Google Workspace after go-live. Supabase noted as a possible database later. |
| 2 | Technical owner | HR Sector Manager for now. |
| 3 | Two-person rule | The Payroll & Salaries Supervisor requests a data wipe / admin login reset; the HR Sector Manager approves (the owner and the HR Sector Manager are the same person today). |
| 4 | Backups | Weekly copy to a protected folder, last 8 weeks kept, restore test every quarter; owner only. |
| 5 | Real database | Improve the sheets now; decide a move after 6 months of real use. |
| 6 | E-mail priority | Login codes → candidate mails → approvals → daily summary (≤ half the budget). |
| 7 | Daily summary | One combined e-mail to managers only; everyone else sees it in the portal. |
| 8 | Data protection officer | Someone outside HR (name to follow). |
| 9 | Breach | Owner detects and reports, DPO decides and notifies the regulator within 72 h, HR Sector Manager informed at once. |
| 10 | Lawyer | One memo with every legal question. |
| 11 | AI CV reading | Runs now (test data); the go-live step reminds about the transfer licence. |
| 12 | AI match | Keep the score, shown as a percentage. |
| 13 | What goes to the AI | No photo, no National ID; address reduced to district + governorate (commute matters). |
| 14 | Transfer licence | Start first, apply later — reminder at go-live. |
| 15 | Payroll stop notice | Stays active. |
| 16 | Social insurance | From the first working day; anything else is an exception with a reason and approval. |
| 17 | Contracts without insurance | Kept, with the legal basis, a form filled in the portal, printed, signed and uploaded back. |
| 18 | Background / criminal record | All jobs; written consent uploaded before the check. |
| 19 | Retention | 2 years. |
| 20 | Minors | Guardian consent path. |
| 21 | Manually added candidates | Privacy notice + consent link; cannot pass "Contacted" without recorded consent. |
| 22 | Salary on the apply form | Optional, as a range; current salary asked at the offer stage. |
| 23 | Relatives | Question on the apply form, match alert, no-relation declaration by interviewer and approver. |
| 24 | Disability | Optional accommodation question + 5 % indicator. |
| 25 | Data-subject requests | 30 days; identity check recorded. |
| 26 | Usage policy | Accepted once by every user; staff told that the portal computes their service indicators. |
| 27 | Candidate photo | Hidden from the hiring manager until after the interview. |
| 28 | Photo consent | Separate, optional. |
| 29–31 | Consultant | Full access and export for now (test data only); NDA not needed while data is not real — restricted before go-live. |
| 32 | CEO approvals | The basic list only (delegation changes, top appointments, the HR Sector Manager's personal matters). |
| 33 | Termination | Unit manager requests, HR Sector Manager approves (two people). |
| 34–35 | Self approval / HC exception | The HR Sector Manager approves as the highest HR authority and may ask for the CEO's approval; anything that concerns him personally goes to the CEO. |
| 36 | Delegation length | 90 days, renewable. |
| 37 | Access review | Every 3 months. |
| 38 | Vacant unit head | Goes up one level, HR alerted. |
| 39 | Board decision recorded on behalf | Attachment required (minutes, written approval or a WhatsApp screenshot). |
| 40 | Candidate link | Build it; the recruiter can still enter / upload on the candidate's behalf. |
| 41 | Net pay in the offer | Marked "estimated", reviewed by the payroll supervisor before sending. |
| 42 | Transfers | Receiving manager can start; managers give an opinion only. |
| 43 | Transfer extras | Temporary transfer, handover list, replacement request. |
| 44 | Onboarding | IT / admin / safety owners, custody & PPE log, "arriving tomorrow" screen. |
| 45 | Change after approval | HR may change branch / contract type alone (risk accepted, reason logged). |
| 46 | Recruiter offer authority | Grade minimum exactly. |
| 47 | Hiring ban | Review every 2 years, candidate may appeal. |
| 48 | Response deadline | 5 working days (corrected by the owner on 9 Oct 2026; was 10). An approval step: reminder day 2, escalation to HR day 3, warning day 4, rejected day 5. |
| 49 | Deferred documents | Escalate to HR Manager after 7 days. |
| 50 | WhatsApp offers | Kept — from each recruiter's own work number. |
| 51 | Weekend | Expiries / transfers / probation every day; reminders and escalations pause Fri–Sat. |
| 52 | Employment contract | Contract stage with signed upload — joining not blocked. |
| 53 | Small deferred features | All of them. |
| 54 | Authenticator | Mandatory from the first sign-in for everyone. |
| 55 | Session | One working day; remember-me 7 days; idle lock enforced on the server. |
| 56 | Private links | 7 days, revoked when done, "send a new link". |
| 57 | Go-live button | Built; the owner presses it on go-live day. |
| 58 | Anthropic key | Rotated every 6 months by the owner, with a reminder. |
| 59 | Small surveys | Hidden below 5 answers. |
| Code | 49 code fixes | All approved ("implement"). |

## Follow-up (chat, 9 Oct 2026)

- CEO approval: in the portal, through a link the HR Sector Manager sends on WhatsApp, with the CEO's trusted
  device (90 days, reminder to the owner of the days left) and a PIN only the CEO knows.
- AI reading also normalises the address to "district, governorate" (e.g. مدينة نصر، القاهرة) and the portal
  flags a long commute for the recruiter (information only).
- New look inspired by Gusto and BambooHR: inbox home, stage board, tabbed candidate file, guided steps,
  global search; one colour per main section (sub-tabs in shades of it), Kandil red kept for the logo and
  primary buttons, red / green / orange kept for statuses only.
  Mock-up: https://claude.ai/artifact/QuFdXrGn9gFE21a7deTaJo
- "Review and implement everything straight away."
