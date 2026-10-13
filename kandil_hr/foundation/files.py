"""Strict HR file/download and sharing boundary, without upstream patches."""

import io
import zipfile

import frappe
from frappe import _


def protected_target(doctype, name, depth=0, user=None):
	from kandil_hr.foundation.file_links import resolve
	return resolve(doctype,name,depth,user=user)


def strict_file_access(doc, user=None, ptype="read"):
	from kandil_hr.foundation.security import enabled

	if not enabled():
		return True
	from kandil_hr.foundation.file_links import UNRESOLVED, file_reference
	user = user or frappe.session.user
	# Every retained alias of the same bytes must permit this reader. Checking
	# only the selected File would let an old unattached alias bypass HR scope.
	links = [(doc.name,doc.attached_to_doctype,doc.attached_to_name)]
	if doc.file_url:
		links += [(r.name,r.attached_to_doctype,r.attached_to_name) for r in frappe.get_all(
			"File",filters={"file_url":doc.file_url,"name":["!=",doc.name]},
			fields=["name","attached_to_doctype","attached_to_name"])]
	for file_name,kind,name in links:
		if file_name and frappe.db.exists("File",file_name) and not file_reference(file_name,user):return False
		target = protected_target(kind,name,user=user)
		if target == UNRESOLVED:return False
		if not target:continue
		if target[0] == "Report":
			from kandil_hr.foundation.reports import report_allowed
			if not report_allowed(target[1],user,include_builder=True):return False
		if not frappe.permissions.has_permission(target[0],ptype,doc=target[1],user=user,
				ignore_share_permissions=True,print_logs=False):return False
	return True


class FileMixin:
	def on_trash(self):
		from kandil_hr.foundation.board_files import protect_recorded
		protect_recorded(self)
		return super().on_trash()

	def save_file(self, *args, **kwargs):
		from kandil_hr.foundation.board_files import before_content_write
		before_content_write(self)
		return super().save_file(*args, **kwargs)

	def is_downloadable(self):
		return strict_file_access(self) and super().is_downloadable()

	@staticmethod
	def zip_files(files):
		# The upstream static method bypasses the File permission hooks and calls
		# its module-level permission function. Check both boundaries explicitly.
		from frappe.core.doctype.file.file import File, has_permission

		archive = io.BytesIO()
		with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as writer:
			for item in files:
				doc = frappe.get_doc("File", item) if isinstance(item, str) else item
				if not isinstance(doc, File) or doc.is_folder:
					continue
				if strict_file_access(doc) and has_permission(doc, "read"):
					writer.writestr(doc.file_name, doc.get_content())
		return archive.getvalue()


@frappe.whitelist()
def zip_files(files):
	"""Override the HTTP zip endpoint, which statically imports upstream File."""
	frappe.response["filename"] = "files.zip"
	frappe.response["filecontent"] = FileMixin.zip_files(frappe.parse_json(files))
	frappe.response["type"] = "download"


def validate_file_alias(doc):
	from kandil_hr.foundation.security import enabled

	if not enabled() or not doc.file_url:
		return
	for previous in frappe.get_all(
		"File", filters={"file_url": doc.file_url}, fields=["name", "attached_to_doctype", "attached_to_name"]
	):
		if previous.name == doc.name:
			continue
		if protected_target(previous.attached_to_doctype, previous.attached_to_name):
			if (doc.attached_to_doctype, doc.attached_to_name) != (
				previous.attached_to_doctype,
				previous.attached_to_name,
			):
				frappe.throw(
					_("Protected HR file content cannot be aliased to another record or an unattached file."),
					frappe.PermissionError,
				)


def validate_share(doc, method=None):
	from kandil_hr.recruitment.models import enabled

	if enabled() and protected_target(doc.share_doctype, doc.share_name):
		frappe.throw(
			_("Protected HR records use scoped access and cannot be shared directly."), frappe.PermissionError
		)


def purge_protected_shares():
	"""Opt-in parity migration: purge bypassing grants, audit only the count.

	Call after hook installation. Legacy DocShare fallback overrides both detail
	and list restrictions until these existing rows have been removed.
	"""
	from kandil_hr.foundation.models import record_security_event
	from kandil_hr.recruitment.models import enabled

	if not enabled():
		return 0
	frappe.only_for("System Manager")
	shares = frappe.get_all("DocShare", fields=["name", "share_doctype", "share_name"])
	protected = [row.name for row in shares if protected_target(row.share_doctype, row.share_name)]
	for name in protected:
		frappe.db.delete("DocShare", {"name": name})
	if protected:
		record_security_event(
			"Protected direct shares removed", frappe.session.user, changed_fields=f"count={len(protected)}"
		)
	return len(protected)
