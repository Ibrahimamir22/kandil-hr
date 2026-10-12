# HR portal/API contract — Sprint 1

Engineering contract for subsequent sprints, based on the current source. This does not assert that future workflows or production infrastructure already exist.

## Ownership and transport

The React/TypeScript website (`frontend/portal`) provides the Arabic/English experience. Frappe owns personal accounts, sessions and CSRF validation. `kandil_hr/portal/api.py` owns narrow portal read projections and draft saving. Recruitment, organization and future domain modules own authorization, commands, audit and transaction rules. Frappe HR/ERPNext records and MariaDB remain the HR data store. Odoo is outside this implementation boundary; there is no duplicate portal database.

Requests use the same origin and personal session cookies. Mutations use POST plus the session CSRF token. GET endpoints do not perform business transitions. No browser-held shared API key, Administrator fallback, HR record cache in localStorage, or client-selected acting identity is allowed. Production TLS, cookie/session policy, MFA and external identity acceptance remain separate gates.

## Reads and language

- Server field allowlists define response projections; do not expose whole documents or private HR notes through a new convenience endpoint.
- Native read permission and company/department/location scope are checked independently of navigation visibility. List, detail, search, export and attachment paths require their own negative tests.
- Current overview uses 50 requests by default, capped at 100; counts, approvals and vacancies apply to that request page. The current client search is within the loaded page. It is not company-wide reporting.
- Position and capacity selectors return up to 500 rows with a truncation flag. Recruiter selectors fail explicitly if the supported limit is exceeded. Later sprints must implement scoped server search for larger catalogs; silently dropping options is unacceptable.
- Read results are advisory. The command rechecks current identity, scope, version, capacity and policy under locks before mutation.
- `_lang` is transport metadata, excluded from command signatures. API identifiers/statuses remain stable; visible labels support AR/EN, and Arabic uses RTL. Names and entered business text are not automatically translated.

## Commands, versions and retries

A transition carries a unique `command_id`, its target and `expected_version` from the record the person reviewed. The server compares a current locked version and rejects stale decisions. Commands must check both resource access and specific business authority, including self-interest and delegation rules.

Receipt identity includes the authenticated actor, target and command ID; payload/reviewed-version hashes prevent changed-payload reuse. Identical replays return the original result, while current authorization still applies. A network timeout is an unknown outcome, not proof of rollback. Retry the same operation with its original ID and unchanged payload; do not create another ID automatically after an uncertain response.

The current frontend keeps the most recent attempt per method in memory. Its retry protection therefore applies while that page and attempt remain available. It does not persist a recovery ledger across browser reloads or competing edited attempts. After reload, inspect saved state before repeating a create action. A later recovery feature must avoid storing sensitive payloads in browser storage and must be independently tested.

The draft-create command uses an actor/company receipt key because there is no target name yet. A saved draft has server identity and requires its reviewed version for changes. Creating a draft and submitting it are separate commands; a submission refusal leaves a real editable draft.

## Transactions and outcomes

All business writes, request snapshots, capacity changes, success receipts and command audit commit together. Database/domain locks precede sorted account/grant/outbox locks. Existing commands serialize on Company before their request; do not add reverse lock order. Transaction retries repeat the whole rolled-back command and must not send external messages inside that boundary.

An evaluated headcount refusal returns a structured `outcome=denied` response, potentially with HTTP 200. This is explicitly a failed business action: the client shows the safe message and retains inputs. The boundary rolls back business changes and stores a private denied outcome for authorized replay. An authorization, validation or infrastructure exception retains its ordinary failure/rollback behavior; it must not be disguised as a headcount refusal.

The frontend strips HTML from server messages and does not render raw tracebacks. It distinguishes an uncertain network result from a confirmed business refusal. New screens must preserve entered values on errors and show the reviewed change before consequential actions.

## Notifications

Delivery is currently local Notification Log delivery only. There is no proof of external email or other provider delivery. Outbox content commits with the business transition; delivery rechecks current recipient access. Pending quantity revision suppresses old undelivered notices for that request before queuing the new revision notices. Historical delivered notices remain; decisions still require the current step/version.

## Required proof for each new workflow

Verify ordinary positive roles and forbidden roles, cross-company/location access, disabled/revoked access, direct API/native bypass, duplicate and changed-payload replay, stale versions, transaction failure rollback, and actual persisted results. For concurrency-sensitive changes use independent connections. Verify AR/EN desktop/mobile screens with real sessions, not only mocked data or screenshots. Reuse existing commands instead of implementing alternate business rules in the frontend.

Related: [roadmap](SPRINT_PLAN.md), [policy decisions](../phases_0_3/POLICY_DECISIONS.md), [release gates and decision owners](REMAINING_GATES.md).

## Structural portal extension (Sprint 2)

`portal/structure.py` connects reviewed organization changes. Company-wide grants are required for structural records; branch/department-only viewers retain the separate scoped directory. Draft save and preview have actor/company/operation receipts; submit and decisions retain native structure command receipts and audit. New target replay uses a locking read under Company to avoid an earlier transaction snapshot missing the just-committed record.

The submitted comparison projects only whitelisted position before-values from the matching submission audit; raw audit envelopes, employee records and broad reconciliation snapshots are excluded. Branch/Designation are shared name catalogs with explicit select-only rules for structural authors; the portal additionally checks the selected company. The after-migrate installer records this setup in source. See [structural checkpoint](S2_STRUCTURE_CHECKPOINT.md) for proof and limits.
