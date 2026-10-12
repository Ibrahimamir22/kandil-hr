"""Hook targets for native organization list, API, print and private-file access."""

from kandil_hr.foundation.security import scope_query, scoped_permission, sensitive_permission


def permission(doc, user=None, ptype=None):
	if doc.doctype == "Kandil Grade Band":
		return sensitive_permission(doc, user, ptype)
	return scoped_permission(doc, user, ptype)


def settings(user=None):
	return scope_query("Kandil Organization Settings", user)


def code(user=None):
	return scope_query("Kandil Organization Code", user)


def position(user=None):
	return scope_query("Kandil Position", user)


def hierarchy(user=None):
	return scope_query("Kandil Position Hierarchy", user)


def assignment(user=None):
	return scope_query("Kandil Position Assignment", user)


def grade(user=None):
	return scope_query("Kandil Grade Band", user, capability="sensitive")


def jd(user=None):
	return scope_query("Kandil JD Revision", user)


def change(user=None):
	return scope_query("Kandil Structure Change", user)


def snapshot(user=None):
	return scope_query("Kandil Structure Snapshot", user)


def import_batch(user=None):
	return scope_query("Kandil Organization Import", user)


HOOK_QUERIES = {
	"Kandil Organization Code": "code",
	"Kandil Organization Settings": "settings",
	"Kandil Position": "position",
	"Kandil Position Hierarchy": "hierarchy",
	"Kandil Position Assignment": "assignment",
	"Kandil Grade Band": "grade",
	"Kandil JD Revision": "jd",
	"Kandil Structure Change": "change",
	"Kandil Structure Snapshot": "snapshot",
	"Kandil Organization Import": "import_batch",
}
