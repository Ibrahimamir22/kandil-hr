# Kandil source-control handoff

Local-only preparation. No GitHub repository has been created or pushed by this
handoff. No production deployment is implied.

## Repository boundaries

1. `kandil-hr` (proposed private GitHub name): the existing local Git repository at
   `development/frappe-bench/apps/kandil_hr`. It contains the custom HR DocTypes,
   business actions, permission checks, native form scripts, and temporary hub.
2. `kandil-hr-dev` (proposed private GitHub name): this directory's development
   orchestration, runbooks, version pins and synthetic test scripts. The entire
   `development/`, `.secrets/`, `reference/` and `vendor/` trees are ignored here.
   The custom app is committed in its own repository, not duplicated here.

Frappe, HRMS and ERPNext remain separate upstream clones. Runtime databases,
uploads, backups, credentials and test output are not source-code artifacts.
A Git commit is not a database backup. The design mockup remains a separate local
deliverable; it is not the production company portal.

## Before connecting GitHub

Choose the company-owned GitHub organization/account and confirm it is the desired
private owner. Inspect staged files, run the source scan, and retain private
backups outside Git. The user's GitHub session/organization was not assumed.

When the owner/repository names are confirmed, run in each corresponding local
repository, substituting the real owner (do not execute the placeholder):

```sh
gh repo create OWNER/kandil-hr --private --source . --remote origin --push
```

For the development repository use `OWNER/kandil-hr-dev` instead. If a repository
or `origin` already exists, inspect it and connect to that destination; do not
create duplicates or overwrite a remote. Verify visibility with `gh repo view`.
No hooks or actions in these repositories publish a site or deploy production.

## Installing the custom app elsewhere

Use a compatible Frappe/ERPNext/HRMS version-16 bench; the exact local versions are
in `versions.json`. Fetch the custom app from its chosen remote into that bench,
install it on a separate synthetic site, explicitly enable `kandil_pilot_enabled`,
and migrate that site. Configure roles, department routes and synthetic fixtures.
Do not enable the pilot flag or migrate real business sites without a reviewed
migration/rollback and tested backup restoration.

The original `bootstrap.py` initializes an empty scaffold if no custom app source
is present. It is development setup, not automatic restoration of the completed
pilot. Preserve the committed custom app separately; never replace it with a
new scaffold. Review the bootstrap sequence before attempting a clean rebuild.

## Validation boundaries

The browser scripts use the local installed Chrome/Playwright paths. Their
fixture paths and runtime dependencies must be adapted for CI or another host.
Business workflow scripts mutate synthetic fixtures and are not a clean replay
against an already populated test database. Use a fresh synthetic site for a
full acceptance run; keep the existing HR review example intact.
