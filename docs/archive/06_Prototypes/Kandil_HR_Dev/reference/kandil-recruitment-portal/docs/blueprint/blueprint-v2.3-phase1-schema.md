# Phase 1 Schema — Foundation

Phase 1 needs 20 tables in 4 spreadsheets; every table below is final enough to build on, and new columns are only ever appended at the end.

## Conventions

- Row 1 = column headers exactly as written here; no merged cells, no formulas in data sheets.
- Every table also ends with: Created\_At, Created\_By, Updated\_At, Updated\_By (not repeated below).
- IDs come from ID\_SEQUENCES under a lock; a row number is never an ID. Nothing is deleted: Status = Inactive / Closed instead.
- Dates ISO (2026-09-30), timestamps ISO with time, booleans Y / N, codes in UPPER\_SNAKE.
- New columns are appended at the far right only; a column inserted in the middle needs a migration (lesson from HR-REC-F02).
- All spreadsheets are owned by the system account and shared with no one.

## Spreadsheets

| Spreadsheet | Tables |
| --- | --- |
| KE-REC-CORE | CONFIG, ID\_SEQUENCES, ROLES, USERS, USER\_ROLES, REASON\_MASTER |
| KE-REC-ORG | ORG\_VERSIONS, ORG\_UNITS, LOCATIONS, GRADES, JOBS, JOB\_VERSIONS, JOB\_DESCRIPTIONS, POSITIONS, POSITION\_HISTORY, DELEGATIONS, AUTHORITY\_RULES |
| KE-REC-SECURITY | LOGIN\_CODES, SESSIONS |
| KE-REC-AUDIT | AUDIT\_LOG |

## KE-REC-CORE

### CONFIG — system settings changed from Admin, never in code

| Column | Example / notes |
| --- | --- |
| Config\_Key | HC\_ENFORCEMENT\_MODE |
| Config\_Value | WARN (or BLOCK) |
| Value\_Type | TEXT / NUMBER / BOOL / JSON |
| Description | What the setting controls |

Initial keys: HC\_ENFORCEMENT\_MODE = WARN, SESSION\_DAYS = 14, OTP\_MINUTES = 10, OTP\_MAX\_ATTEMPTS = 5, EMAIL\_DAILY\_BUDGET = 80, DIGEST\_TIME = 08:00, DEFAULT\_STRUCTURAL\_HC = 1, ORG\_VERSION\_ACTIVE = ORGV-2026.01.

### ID\_SEQUENCES

| Column | Example / notes |
| --- | --- |
| Entity | USER |
| Prefix | USR |
| Year\_Scoped | N (Y resets yearly, e.g. REQ-2026-0001) |
| Year | blank or 2026 |
| Last\_Number | 12 |
| Pad\_Length | 4 |

### ROLES

| Column | Example / notes |
| --- | --- |
| Role\_Code | HR\_SECTOR\_MANAGER |
| Role\_Name\_AR / Role\_Name\_EN | مدير قطاع الموارد البشرية / HR Sector Manager |
| Description | Sole authority over grade, salary, benefits, working conditions |
| Status | Active |

Seed roles: SYS\_OWNER, HR\_SECTOR\_MANAGER, HR\_MANAGER, HR\_STAFF, RECRUITMENT\_MANAGER, RECRUITMENT\_SUPERVISOR, RECRUITER, CEO, VIEWER. Line-manager authority is not a role: it is derived from the position a user holds (a user holding an org unit's head position manages that unit and everything under it).

### USERS

| Column | Example / notes |
| --- | --- |
| User\_ID | USR-0001 |
| Email | login email (unique, lower case) |
| Full\_Name\_AR / Full\_Name\_EN |  |
| Employee\_ID | payroll code, optional |
| Position\_ID | POS-000123 — the position the user holds; drives approval chain and scope |
| Mobile | optional |
| Status | Active / Inactive |
| Last\_Login\_At | timestamp |

### USER\_ROLES

| Column | Example / notes |
| --- | --- |
| User\_Role\_ID | URL-0001 |
| User\_ID | USR-0001 |
| Role\_Code | HR\_MANAGER |
| Scope\_Type | ALL / ORG\_UNIT |
| Scope\_Org\_Unit\_ID | OU-0012 when Scope\_Type = ORG\_UNIT |
| Include\_Children | Y / N |
| Effective\_From / Effective\_To | dates; blank To = open |
| Granted\_By | USR-… |

### REASON\_MASTER — every coded list in one place

| Column | Example / notes |
| --- | --- |
| Reason\_ID | RSN-0001 |
| Process | REQUEST\_REJECT / REQUEST\_RETURN / HC\_EXCEPTION / OVERRIDE / … (later: APP\_REJECT, OFFER\_DECLINE, DID\_NOT\_JOIN) |
| Code | WORKLOAD |
| Label\_AR / Label\_EN |  |
| Requires\_Note | Y / N |
| Sort\_Order | 10 |
| Status | Active |

## KE-REC-ORG

### ORG\_VERSIONS

| Column | Example / notes |
| --- | --- |
| Org\_Version\_ID | ORGV-2026.01 |
| Effective\_Date | 2026-10-01 |
| Approval\_Date / Approved\_By | CEO approval for structural changes |
| Change\_Request\_ID | blank for the initial load |
| Description | Initial structure load |
| Status | Draft / Active / Superseded |

### ORG\_UNITS

| Column | Example / notes |
| --- | --- |
| Org\_Unit\_ID | OU-0001 |
| Org\_Version\_ID | ORGV-2026.01 |
| Unit\_Type | COMPANY / SECTOR / DEPARTMENT / SECTION / SUB\_UNIT |
| Unit\_Code | FIN (reuses current SECTOR\_CODE\_MAP codes) |
| Name\_AR / Name\_EN |  |
| Parent\_Org\_Unit\_ID | OU-… (blank for company) |
| Head\_Position\_ID | POS-… of the unit's manager position |
| Status | Active / Closed |
| Effective\_From / Effective\_To |  |

The four legal entities are COMPANY-level units.

### LOCATIONS

| Column | Example / notes |
| --- | --- |
| Location\_ID | LOC-01 |
| Name\_AR / Name\_EN | العبور / Obour |
| Location\_Type | FACTORY / SHOWROOM / WAREHOUSE / OFFICE / HQ |
| Company\_Org\_Unit\_ID | legal entity |
| Governorate |  |
| Status | Active |

### GRADES (protected: HR Sector Manager only)

| Column | Example / notes |
| --- | --- |
| Grade\_Code | G07 |
| Grade\_Name |  |
| Level\_Order | 7 |
| Status | Active |

### JOBS

| Column | Example / notes |
| --- | --- |
| Job\_Code | FIN-007 (keeps current codes) |
| Job\_Title\_AR / Job\_Title\_EN |  |
| Job\_Family | Finance |
| Job\_Level | Professional |
| Grade\_Code | G07 (protected) |
| Current\_JD\_Version | 3, blank until the JD project delivers |
| Status | Active / Inactive |
| Effective\_From / Effective\_To |  |

### JOB\_VERSIONS

| Column | Example / notes |
| --- | --- |
| Job\_Version\_ID | JBV-0001 |
| Job\_Code | FIN-007 |
| Version | 2 |
| Snapshot\_JSON | full job row as it was |
| Change\_Reason |  |

### JOB\_DESCRIPTIONS (structure now, content from the JD project)

| Column | Example / notes |
| --- | --- |
| JD\_ID | JD-0001 |
| Job\_Code / Version | FIN-007 / 3 |
| Purpose, Responsibilities, Authority, KPIs, Qualifications, Experience, Technical\_Skills, Behavioral\_Competencies, Working\_Conditions, Physical\_Requirements, Reporting\_Relationship | one column each; lists as line-separated text |
| Status | Draft / Approved / Superseded |
| Effective\_From / Approved\_By / Approved\_At |  |

### POSITIONS

| Column | Example / notes |
| --- | --- |
| Position\_ID | POS-000123 |
| Org\_Version\_ID | ORGV-2026.01 |
| Job\_Code | FIN-007 |
| Position\_Title | optional override of the job title |
| Org\_Unit\_ID | lowest unit the position sits in |
| Reports\_To\_Position\_ID | POS-… |
| Location\_ID | LOC-01 (one location per position) |
| Is\_Head\_Of\_Unit | Y when this is the unit's manager position |
| Structural\_HC | 1 (Phase 1 default) |
| HC\_Basis | BASELINE\_TEMP / MANPOWER\_PLAN |
| Occupied\_HC | entered by HR, default 0 |
| Occupied\_Updated\_At / By |  |
| Status | Active / Frozen / Closed |
| Effective\_From / Effective\_To |  |

### POSITION\_HISTORY

| Column | Example / notes |
| --- | --- |
| History\_ID | PH-000001 |
| Position\_ID |  |
| Field | Structural\_HC |
| Old\_Value / New\_Value | 1 / 3 |
| Reason |  |

### DELEGATIONS

| Column | Example / notes |
| --- | --- |
| Delegation\_ID | DLG-2026-0001 |
| From\_Position\_ID | the (possibly vacant) authority position |
| To\_User\_ID | acting approver |
| Process\_Scope | ALL / RECRUITMENT\_REQUEST / … |
| Effective\_From / Effective\_To |  |
| Reason |  |
| Status | Active / Ended / Cancelled |

### AUTHORITY\_RULES

| Column | Example / notes |
| --- | --- |
| Rule\_ID | RUL-0001 |
| Process | RECRUITMENT\_REQUEST |
| Rule\_Type | CEO\_REQUIRED / FALLBACK / HC\_EXCEPTION\_APPROVER / SKIP\_IF\_VACANT |
| Scope\_Type | ALL / JOB / ORG\_UNIT / REQUEST\_TYPE / PRIORITY |
| Scope\_Value | OU-0005 |
| Authority | role code or Position\_ID |
| Effective\_From / Effective\_To |  |
| Active | Y / N |
| Notes | e.g. CEO instruction reference |

Seed rules: HC\_EXCEPTION\_APPROVER = HR\_MANAGER or CEO; FALLBACK when Sector Manager vacant = HR\_MANAGER; CEO\_REQUIRED for requests targeting a Sector Manager position.

## KE-REC-SECURITY

### LOGIN\_CODES

| Column | Example / notes |
| --- | --- |
| Code\_ID | LC-… |
| Email |  |
| Code\_Hash | hashed 6-digit code, never plain |
| Expires\_At | +10 minutes |
| Attempts | 0–5 |
| Used\_At | timestamp or blank |

### SESSIONS

| Column | Example / notes |
| --- | --- |
| Session\_ID | SES-… |
| User\_ID |  |
| Token\_Hash | hashed random token |
| Expires\_At | +14 days |
| Last\_Seen\_At |  |
| Revoked\_At / Revoked\_By |  |
| User\_Agent | device hint for the user's session list |

## KE-REC-AUDIT

### AUDIT\_LOG — append-only

| Column | Example / notes |
| --- | --- |
| Audit\_ID | AUD-… |
| Timestamp |  |
| User\_ID | actor |
| On\_Behalf\_Of | candidate / employee ID when acting for them |
| Entity\_Type / Entity\_ID | POSITION / POS-000123 |
| Action | CREATE / UPDATE / STATE\_CHANGE / LOGIN / OVERRIDE |
| Field | Structural\_HC |
| Old\_Value / New\_Value |  |
| Reason |  |
| Session\_ID |  |

## Structure import template (what HR sends for open item 1)

One row per position; the importer creates units, jobs and positions and reports anything it cannot match.

| Column | Example |
| --- | --- |
| Company | قنديل مصر |
| Sector | القطاع المالي |
| Department | الحسابات |
| Section | التكاليف (blank if none) |
| Sub\_Unit | blank if none |
| Job\_Code | FIN-007 (blank = system assigns) |
| Job\_Title | محاسب تكاليف |
| Location | العبور |
| Reports\_To\_Job\_Title | رئيس قسم التكاليف |
| Is\_Head\_Of\_Unit | Y / N |
| Grade | optional |
| Structural\_HC | blank = 1 |

## What Phase 1 screens use these tables

Login, Users & Roles, Org Structure (tree + versions), Jobs, Positions (HC edit with reason), Delegations, Authority Rules, Reasons, Config, Structure Import, Audit Explorer.
