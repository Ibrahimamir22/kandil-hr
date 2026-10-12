# Kandil HR project delivery

- This private repository is the source of truth for Kandil HR code, frontend, schema, tests, configuration templates and project documentation.
- For authorized implementation work, keep relevant source and documentation in this repo, commit a coherent checkpoint and push it to the configured private origin before reporting delivery, unless the user explicitly requests local-only work. Verify the remote commit and report any blocked publication; never describe unpushed work as backed up.
- Preserve unfinished work with an explicit development status. A commit or passing build does not imply HR acceptance or production readiness.
- Never commit passwords, tokens, session cookies, .env files, site configuration, database dumps, private HR uploads, runtime dependencies or credential guides. Use pinned dependencies and safe templates instead.
- Keep current business logic in kandil_hr and the connected frontend in frontend/portal. Avoid editing upstream Frappe, ERPNext or HRMS core.
- docs/archive contains historical evidence, not instructions to execute or the current source of business policy. Do not bootstrap its old harness over an existing installation.
- Use synthetic isolated test sites. Keep local services loopback-only. Odoo, production data, external email and other company modules require their own task scope.
