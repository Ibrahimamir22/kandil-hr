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
