# Recreate the Kandil HR development stack

This package installs the official Frappe, ERPNext and HRMS sources at the exact commits in `versions.lock.json`, plus this custom app checkout. No GitHub fork of upstream is required. Native dependency installers still use upstream package registries; this is version-pinned source installation, not a fully offline/bit-for-bit software supply-chain archive.

The repository also exposes those exact upstream commits as Git submodules under `upstream/`. Clone with `--recurse-submodules` to browse all source, or let this installer fetch the pinned sources into its fresh Bench. Source download alone is not a running installation. `python3 deployment/check_upstream.py` checks that the tracked links and installer lock agree.

Local Apple Silicon / `linux/arm64` development only. Docker, internet access to official GitHub/package registries, sufficient disk space, and private-repository access are required. Port 8110 is a new isolated sandbox, separate from the existing 8100/8101/8102 environment. Linux AMD64 needs an independently tested image/platform lock.

From a clone of the private `Ibrahimamir22/kandil-hr` repo at a tested release commit:

```sh
python3 deployment/prepare.py
docker compose -f deployment/compose.yaml up -d
docker compose -f deployment/compose.yaml logs -f bench
```

The installer stages and checks exact upstream commits before Bench installs them. It refuses existing-version mismatches. The mounted custom checkout is the code being used; do not switch its version beneath a running system. Use a clean tested release commit. A dirty working tree is an unaccepted development snapshot, never a reproducible release. Administrator password is in ignored `deployment/.local/admin_password`; do not paste it into commits, screenshots or tickets.

No real data, outbound email, enabled scheduler, external provider or production hardening is configured. Enhanced HR flags and synthetic fixtures are enabled only on a designated acceptance site after migration and access tests. Existing site migration is explicit, not an automatic side effect of restart.

## Changes and safe rollback

1. Save the prior app commit and all upstream commits/image digests.
2. Back up the site with files using `bench --site kandil-sandbox.localhost backup --with-files` inside the bench container. Securely preserve site configuration/encryption key separately. They contain secrets and must never enter Git.
3. Rehearse the upgrade and `bench migrate` against a disposable restored site. Reconcile employee/position/capacity counts and rerun the critical workflow tests.
4. If rollback is needed, restore a compatible pre-change database/files/config plus the previous code/image set. Git checkout alone does not undo schema or data migrations.
5. A synthetic blank-company restore was executed successfully (see `docs/sprints/evidence/restore-sandbox-2026-10-12.json`). Final release acceptance still requires the tested commit, representative data and approved recovery procedures.

Use project-scoped stop commands. Never run global Docker prune or delete volumes for unrelated projects. `docker compose down -v` deletes this sandbox's DB and must not be used as routine restart.

The installer runs `deployment/verify_checkout.py` before any installation work. It refuses a dirty app checkout (including untracked source), records the clean custom commit, upstream pins and image digests in `/workspace/kandil-source-checkpoint.json`, and never records secret contents. Run `python3 deployment/verify_checkout.py` locally for the same preflight. This is source provenance, not proof that a workflow or deployment passed.

## Position-history schema upgrade

The custom app now includes `Kandil Position Audit Link` and the post-model-sync patch
`kandil_hr.foundation.position_history_index`. Back up and migrate each intended site;
a web restart alone does not add the table or backfill. Other sites sharing code are
not migrated automatically. The optional timeline is unavailable until its patch
completes; existing audit writes tolerate an absent lookup table.

On the existing isolated parity development setup, the following verifier runs inside
Bench's environment (from the outer development compose directory):

```sh
docker compose exec -T -w /workspace/frappe-bench parity-web env/bin/python apps/kandil_hr/deployment/verify_position_history.py
```

It is deliberately guarded to the muted test-enabled parity site. It checks the patch,
replays the derived index against immutable audits, verifies source digest preservation,
checks query-index selection and reports aggregate queue state. It never starts workers
or clears jobs. Do not use this hardcoded synthetic verifier as production acceptance.
See `docs/roadmap/S2_POSITION_HISTORY_CHECKPOINT.md` for tested migration scope, the
idempotent Property Setter correction, evidence and rollback limitations.


## Approval invitation workers

`recruitment.invitations` schedules generation on Frappe's `short` queue **after an authorized domain transaction commits**. A deployment needs its short worker and scheduler configured and monitored. After installing/updating the app, the normal migration/job-sync process must register `kandil_hr.recruitment.invitations.process_pending` from the `all` scheduler hook. It catches missed event jobs and newly effective delegations. Generation is not a promise of instant delivery: receipts follow the existing outbox worker and retry schedule.

Do not start a shared review-site worker merely to exercise this feature. The isolated synthetic [invitation rehearsal](../docs/roadmap/S4_INVITATIONS_CHECKPOINT.md) moved only exact cohort jobs to a private queue; it did not drain the shared backlog. The separate [timed catch-up rehearsal](../docs/roadmap/S4_INVITATION_CATCHUP_CHECKPOINT.md) now passes 10 checks; production scheduling/latency and sustained capacity remain acceptance gates. A reused site must clear hook caches before syncing jobs, as normal Frappe migration does; seeing the hook in source alone does not prove registration. No external email provider is enabled by this change.


### Candidate identity rollout boundary

`after_migrate` installs the new Candidate Person metadata and read-only Job Applicant references on parity-enabled sites. It does not migrate applicant records or activate new intake. The additional `kandil_candidate_identity_enabled` setting defaults off. Do not enable it for normal users until the candidate portal, reviewed legacy migration manifest and ordinary-session/concurrency checks in [S5_IDENTITY_CHECKPOINT](../docs/roadmap/S5_IDENTITY_CHECKPOINT.md) are complete. When enabled, native applicant creation must use the reviewed candidate command. Existing identity/source references stay protected even if the setting is subsequently disabled. Preserve existing applicant IDs; never infer person merges from contact equality.
