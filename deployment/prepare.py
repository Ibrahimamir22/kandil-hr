#!/usr/bin/env python3
"""Prepare private local-only installer secrets, preserving existing values."""

import secrets
from pathlib import Path

root = Path(__file__).resolve().parent / ".local"
root.mkdir(mode=0o700, exist_ok=True)
for name in ("db_password", "admin_password"):
	p = root / name
	if not p.exists():
		with p.open("x") as f:
			f.write(secrets.token_urlsafe(36) + "\n")
		p.chmod(0o600)
(root / "workspace").mkdir(exist_ok=True)
print("Prepared local-only secret files. Values were not printed. Existing files preserved.")
