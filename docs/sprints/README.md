# Sprint tracker maintenance

- `tracker.json`: task status, dependencies, decisions and workstreams.
- `acceptance-results.json`: canonical case results. No case passes without tested commit, date and evidence. Preserve all baseline IDs.
- `SPRINT_PLAN.md`: human-readable sprint plan.
- `dashboard.html`: source template.
- `render_tracker.py`: validates dependency graph, coverage and evidence requirements, then rebuilds the standalone local dashboard.
- `evidence/`: dated installation, native, browser and concurrency evidence with source fingerprints. Old pilot tests are not new-phase evidence.

From the custom app root run `python3 docs/sprints/render_tracker.py`. Use `--output /absolute/folder` to choose a different output location; outside the Kandil workspace the default is ignored `docs/sprints/_generated`. Open the generated deliverable `dist/index.html` in Codex. Use a loopback static server for browser QA; `test_tracker.cjs` expects port 8113 and the locally available Chrome/Playwright runtime. Browser review marks stay on that browser origin and never modify canonical JSON. Export reviews before switching browsers or moving the page.

At each implementation checkpoint: update task status/evidence, record case outcomes and defects, rebuild, then update the sprint review summary. A task cannot become verified merely because its file exists. Source changes are local until a reviewed commit is pushed. No scheduled refresh is configured.
