# Frappe source linked directly from this repository

The three folders beside this file are Git submodules: tracked links to the exact source commits of the official projects. GitHub opens their source at the pinned revision when you click them. They are not empty placeholder folders or private forks. The upstream code remains in its upstream repository; this repository stores the URL and exact commit.

| Folder | Purpose |
|---|---|
| `frappe` | Framework: accounts, sessions, document/database operations, APIs and jobs. |
| `erpnext` | Dependency of the installed Frappe HR stack; not a replacement for Kandil's Odoo. |
| `hrms` | Frappe HR's existing HR records and workflows. |

Retrieve all source from a new checkout:

```sh
git clone --recurse-submodules https://github.com/Ibrahimamir22/kandil-hr.git
```

If you already cloned the repo:

```sh
git submodule update --init --recursive
```

Private repository access and network access to the official repositories are required. The source links and `deployment/versions.lock.json` must agree. Run `python3 deployment/check_upstream.py` to verify their URLs and commits. Do not use `git submodule update --remote`: it would move away from the reviewed version.

The running local Bench still uses its existing sibling clones at `frappe-bench/apps/frappe`, `erpnext`, `hrms` and `kandil_hr`. Adding these source links does not move those clones or change the running system. `deployment/install.py` installs the same locked revisions into a fresh Bench. Downloading source alone does not create sites, databases or accounts; see `deployment/README.md`.

We implement Kandil's changes in the custom app at repository root. If an upstream patch is required later, review that patch and its maintenance strategy explicitly. A linked dependency is not a private mirror or an independent backup of all upstream history.
