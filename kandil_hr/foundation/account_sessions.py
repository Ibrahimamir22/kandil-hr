"""Complete native session revocation for server-side account disable changes.

Frappe User only logs out disabled users when a HTTP login_manager is present.
Its native clear_sessions commits internally, so schedule it AFTER the account
transaction commits. A rolled-back disable must not terminate valid sessions.
This does not configure MFA, providers, trusted devices, or session durations.
"""

from functools import partial

import frappe
from frappe.utils import cint

from kandil_hr.foundation.security import enabled


def revoke_disabled_sessions(doc, method=None):
	if not enabled() or doc.name in ("Administrator", "Guest"):
		return
	old = doc.get_doc_before_save()
	if old and cint(old.enabled) and not cint(doc.enabled):
		frappe.db.after_commit.add(partial(_revoke_if_still_disabled, doc.name))


def _revoke_if_still_disabled(user):
	# after_commit callbacks can survive a rollback to a savepoint; only the
	# committed account state is authority. Missing/deleted users need no work.
	state = frappe.db.get_value("User", user, "enabled")
	if state is None or cint(state):
		return
	from frappe.sessions import clear_sessions

	frappe.clear_cache(user=user)
	# Native clear_sessions handles at most 100 per call. Repeat to revoke every
	# current session, retaining its native logout history and cache invalidation.
	while frappe.db.count("Sessions", {"user": user}):
		clear_sessions(user=user, force=True)
