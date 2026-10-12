# Kandil HR local development

This workspace uses the official Frappe Docker development approach, adapted to
Apple Silicon and loopback-only ports. It is a development environment, not a
production installation. Source: https://github.com/frappe/frappe_docker

## Current P0–P3 sprint

Custom source is in the private [Kandil HR repository](https://github.com/Ibrahimamir22/kandil-hr).
The official upstream clones stay separate; their pins are recorded in the custom
app's `deployment/versions.lock.json`. The new synthetic parity site is at
http://localhost:8102; start its web process with
`docker compose --profile parity up -d parity-web` after the site is provisioned.
Its generated role credentials are in
`development/frappe-bench/sites/kandil-parity.localhost/private/kandil-review.json`.
Never commit or share this file. This site is separate from the earlier pilot below.

Use the custom app's `docs/sprints/SPRINT_PLAN.md`, `tracker.json` and `CHECKPOINT.md`
for current evidence and test instructions. Historical pilot totals below do not
certify the new implementation. The pinned clean-install package is under the
custom app's `deployment/`; it runs a separate sandbox at port 8110.

## Start and stop

Run these commands from this directory:

```sh
docker compose up -d
docker compose ps
docker compose logs --tail 60 frappe
docker compose stop
```

Shortcuts are also available: `./hr start`, `./hr stop`, `./hr status`,
`./hr logs`, `./hr shell` and `./hr backup`.

Open http://localhost:8100. User: `Administrator`.
The generated password is in `.secrets/admin_password` (local file, not committed).
Do not paste credentials or site configuration into commits or support logs.
The main site now contains company records. Do not rerun setup or add test fixtures there.

## Isolated functional testing

The synthetic test site is `kandil-test.localhost`, at http://localhost:8101.
Start it with `docker compose --profile testing up -d test-web`. The main site
stays at port 8100. Both sites have separate databases but share the local bench,
app code, MariaDB server and Redis services; this is not production isolation.

Only the test site contains the `Kandil TEST ONLY` company and synthetic accounts.
Administrator uses the same local password file. Ordinary role test credentials
are in `development/test-credentials.json`; never commit or share that file.
Functional results, browser captures and the first-run results are in
`development/testing`. The review report is under
`../../05_Deliverables/Frappe_HR_Pilot_2026-10-11/`. The older Test report is the baseline.

The test server includes a container-loopback proxy for port 8101 so the PDF
renderer can fetch assets using the same localhost URL as the Mac browser.
This is development wiring, not a production hosting design.

`scripts/test_hr_functional.py` uses real HTTP sessions and normal HR/employee
roles. Its state file preserves created records. It is a staged scenario, not
an independently repeatable unit suite: some checks capture before/after states.
Do not delete its state and rerun against existing fixtures. Use a fresh test
database for a clean scenario run. Initial setup issues and later retests are
explained in the report. See STATUS.txt for the implemented pilot and resolved concurrency probes.

To initialize a fresh environment, after the containers are up:

```sh
docker compose exec -T frappe python /opt/kandil/bootstrap.py
```

The web process starts when bootstrap creates `development/frappe-bench/.kandil-ready`.
Bootstrap will stop on errors. Inspect partial installation state before retrying.

## Where code and data live

- `development/frappe-bench/apps/kandil_hr`: Kandil custom app and its own local Git repository.
- `development/frappe-bench/apps/frappe`: upstream Framework clone.
- `development/frappe-bench/apps/erpnext`: upstream ERPNext dependency clone.
- `development/frappe-bench/apps/hrms`: upstream Frappe HR clone.
- `reference/kandil-recruitment-portal`: unchanged reference clone of the HR concept.
- `vendor/frappe_docker`: unchanged reference clone of the official Docker setup.
- `development/frappe-bench/sites`: site configuration, uploads and backup output.
- Named Docker volumes retain the MariaDB database and Redis job queue.
- `.secrets`: local bootstrap credentials.

Normal container stop/restart preserves these. Do not run `docker compose down -v`
or delete volumes unless you intend to delete the development database.

## Work inside the environment

```sh
docker compose exec -w /workspace/frappe-bench frappe bash
bench --site kandil.localhost list-apps
bench --site kandil.localhost migrate
bench --site kandil.localhost backup --with-files
```

Backup files are written under the site's private backups folder. Preserve the
site configuration/encryption key separately in secure local storage. A recovery
rehearsal is needed before this setup holds real business data.

## Current scope

Use Frappe HR for HR only. Odoo remains independent. No Odoo, Google Sheets,
BioTime or AI provider integration is configured here. Email delivery is muted.
There is no imported real employee or candidate data; the isolated test site contains synthetic fixtures. No cloud subscription is created.

The custom app now implements the five proof cases on the isolated pilot site.
Read its README for the exact scope and remaining differences from the complete
HR blueprint. HR acceptance is pending.

All three upstream Frappe apps use version-16. Installed commits and container
digests are recorded in `versions.json` after installation. Review compatibility
and take a backup before updating. Do not run an unreviewed global `bench update`.

## Native HR workspace and source-control handoff

Open http://localhost:8101/kandil for the actual local company hub, then choose
People & HR to enter http://localhost:8101/kandil-pilot. These pages use the
existing Frappe login and link to native HR forms. The delivery/estimator/Odoo
cards are explicitly unconnected; this is not the custom design mockup.

Read `NATIVE_REVIEW.md` for the tested walkthrough and `GITHUB_SETUP.md` for the
source-control boundaries and proposed private repository setup. The custom HR
app and this orchestration directory are separate local Git repositories.
