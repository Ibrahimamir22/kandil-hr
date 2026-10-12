"""Native endpoint/security regressions; synthetic parity fixtures, rollback only."""

import io
import unittest
import uuid
import zipfile

import frappe
from frappe.client import get as client_get
from frappe.client import get_list as client_list
from frappe.client import set_value

from kandil_hr.foundation import files, teams


class TestNativeBoundaries(unittest.TestCase):
	def setUp(self):
		from kandil_hr.recruitment.test_commands import TestRecruitmentCommands

		self.fixture = TestRecruitmentCommands()
		self.addCleanup(self.fixture.doCleanups)
		self.fixture.setUp()
		self.request, self.opening, self.vacancies = self.fixture.vacancy_fixture()
		self.fixture.call(
			"hr",
			self.vacancies.assign_team,
			self.request,
			opening_name=self.opening,
			lead=self.fixture.users["hr"],
			members=[],
			reason="Synthetic privacy assignment",
		)
		self.fixture.call(
			"hr",
			self.vacancies.set_state,
			self.request,
			opening_name=self.opening,
			action="Open",
			reason="Synthetic privacy test",
		)
		frappe.set_user(self.fixture.users["hr"])
		self.applicant = frappe.get_doc(
			dict(
				doctype="Job Applicant",
				applicant_name="Synthetic private candidate",
				job_title=self.opening,
				phone_number="+201000"
				+ uuid.uuid4()
				.hex[:7]
				.replace("a", "1")
				.replace("b", "2")
				.replace("c", "3")
				.replace("d", "4")
				.replace("e", "5")
				.replace("f", "6"),
			)
		).insert()
		frappe.set_user("Administrator")

	def _as(self, key):
		frappe.set_user(self.fixture.users[key])

	def test_nonteam_scoped_recruiter_cannot_read_list_or_mutate_candidates(self):
		self._as("manager")  # Native Recruiter role and broad departmental grant, but no team membership.
		with self.assertRaises(frappe.PermissionError):
			client_get("Job Applicant", self.applicant.name)
		self.assertEqual(
			client_list(
				"Job Applicant", filters={"name": self.applicant.name}, fields=["name", "phone_number"]
			),
			[],
		)
		with self.assertRaises(frappe.PermissionError):
			set_value("Job Applicant", self.applicant.name, "applicant_name", "Forbidden update")
		self.assertFalse(teams.can_manage_team(self.fixture.load(self.request)))
		with self.assertRaises(frappe.PermissionError):
			self.fixture.call(
				"manager",
				self.vacancies.assign_team,
				self.request,
				opening_name=self.opening,
				lead=self.fixture.users["manager"],
				members=[],
				reason="Attempted self-allocation",
			)

	def test_assigned_readonly_recruiter_can_read_but_not_write(self):
		self.fixture.call(
			"hr",
			self.vacancies.assign_team,
			self.request,
			opening_name=self.opening,
			lead=self.fixture.users["hr"],
			members=[self.fixture.users["manager"]],
			reason="Grant team membership",
		)
		grant = frappe.get_doc("Kandil Access Grant", self.fixture.grants["manager"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.fixture.insert(
			"Kandil Access Grant",
			user=self.fixture.users["manager"],
			company=self.fixture.company,
			department=self.fixture.department,
			valid_from="2026-01-01",
			can_manage_recruitment=0,
			reason="Synthetic read-only team member",
		)
		self._as("manager")
		self.assertEqual(client_get("Job Applicant", self.applicant.name)["name"], self.applicant.name)
		self.assertEqual(len(client_list("Job Applicant", filters={"name": self.applicant.name})), 1)
		with self.assertRaises(frappe.PermissionError):
			set_value("Job Applicant", self.applicant.name, "applicant_name", "Forbidden update")

	def test_hr_authority_override_and_disabled_lead_are_explicit(self):
		request = self.fixture.load(self.request)
		self.assertTrue(teams.can_manage_team(request, self.fixture.users["hr"]))
		self.assertTrue(teams.can_manage_team(request, self.fixture.users["sector"]))
		user = frappe.get_doc("User", self.fixture.users["hr"])
		user.enabled = 0
		user.save(ignore_permissions=True)
		opening = frappe.get_doc("Job Opening", self.opening)
		self.assertTrue(teams.is_unassigned(opening))
		self.assertEqual(opening.custom_kandil_lead, self.fixture.users["hr"])
		self.assertFalse(teams.can_manage_team(request, self.fixture.users["hr"]))

	def test_stale_docshare_bypass_is_removed_and_new_shares_denied(self):
		# Simulate a legacy record predating the validation hook, not an allowed API.
		share = frappe.get_doc(
			dict(
				doctype="DocShare",
				name=uuid.uuid4().hex,
				share_doctype="Job Applicant",
				share_name=self.applicant.name,
				user=self.fixture.users["manager"],
				read=1,
			)
		)
		share.db_insert()
		self._as("manager")
		self.assertTrue(frappe.has_permission("Job Applicant", "read", doc=self.applicant.name))
		self.assertEqual(len(client_list("Job Applicant", filters={"name": self.applicant.name})), 1)
		frappe.set_user("Administrator")
		self.assertGreaterEqual(files.purge_protected_shares(), 1)
		self._as("manager")
		self.assertFalse(frappe.has_permission("Job Applicant", "read", doc=self.applicant.name))
		self.assertEqual(client_list("Job Applicant", filters={"name": self.applicant.name}), [])
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				dict(
					doctype="DocShare",
					share_doctype="Job Applicant",
					share_name=self.applicant.name,
					user=self.fixture.users["manager"],
					read=1,
				)
			).insert(ignore_permissions=True)

	def _file(self):
		self._as("hr")
		file = frappe.get_doc(
			dict(
				doctype="File",
				file_name="synthetic-privacy-" + uuid.uuid4().hex + ".txt",
				content="Synthetic isolated content " + uuid.uuid4().hex,
				is_private=1,
				attached_to_doctype="Job Applicant",
				attached_to_name=self.applicant.name,
			)
		).insert()
		frappe.set_user("Administrator")
		return file

	def test_revoked_uploader_cannot_download_zip_or_alias_protected_file(self):
		file = self._file()
		grant = frappe.get_doc("Kandil Access Grant", self.fixture.grants["hr"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self._as("hr")
		file = frappe.get_doc("File", file.name)
		self.assertFalse(file.is_downloadable())
		from frappe.core.doctype.file.utils import find_file_by_url

		self.assertIsNone(find_file_by_url(file.file_url, file.name))
		files.zip_files([file.name])
		with zipfile.ZipFile(io.BytesIO(frappe.response.filecontent)) as archive:
			self.assertEqual(archive.namelist(), [])
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				dict(doctype="File", file_name=file.file_name, file_url=file.file_url, is_private=1)
			).insert()

	def test_private_file_and_child_cannot_be_shared(self):
		file = self._file()
		line = self.fixture.load(self.request).lines[0]
		for doctype, name in (("File", file.name), ("Kandil Request Line", line.name)):
			with self.assertRaises(frappe.PermissionError):
				frappe.get_doc(
					dict(
						doctype="DocShare",
						share_doctype=doctype,
						share_name=name,
						user=self.fixture.users["manager"],
						read=1,
					)
				).insert(ignore_permissions=True)
