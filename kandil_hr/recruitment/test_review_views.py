"""Ordinary-user lists, immutable delegated timelines and request scope contracts."""

import json
import unittest

import frappe
from frappe.utils import add_days, today

from kandil_hr.recruitment import api, review_views
from kandil_hr.recruitment import test_commands as fixtures


class TestReviewViews(unittest.TestCase):
	def setUp(self):
		self.f = fixtures.TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def user(self, key, roles):
		user = self.f.insert(
			"User",
			email=f"{self.f.prefix.lower()}-{key}@example.invalid",
			first_name=key,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[{"role": r} for r in roles],
		)
		self.f.users[key] = user.name
		self.f.grants[key] = self.f.insert(
			"Kandil Access Grant",
			user=user.name,
			company=self.f.company,
			department=self.f.department,
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic review view scope",
		).name
		return user.name

	def request_as(self, key):
		original = self.f.users["requester"]
		try:
			self.f.users["requester"] = self.f.users[key]
			return self.f.request((1,))
		finally:
			self.f.users["requester"] = original

	def delegate(self, department=None, start=None, end=None):
		return self.f.insert(
			"Kandil Delegation",
			company=self.f.company,
			department=department or self.f.department,
			from_user=self.f.users["manager"],
			to_user=self.f.users["delegate"],
			from_date=start or today(),
			to_date=end or today(),
			reason="Synthetic delegated timeline evidence",
		)

	def test_my_requests_is_own_only_while_native_lists_enforce_scope(self):
		self.user("other", ["Kandil Requester"])
		own = self.f.request((1,))
		other = self.request_as("other")
		self.f.submit(own.name)
		self.f.call("other", api.submit_request, other.name)
		for key, expected in [("requester", own.name), ("other", other.name)]:
			with fixtures.acting_as(self.f.users[key]):
				rows = review_views.my_requests()
				self.assertEqual({r.name for r in rows}, {expected})
				self.assertTrue(all(r.requested_by == self.f.users[key] for r in rows))
		for key in ("manager", "hr"):
			with fixtures.acting_as(self.f.users[key]):
				rows = frappe.get_list("Kandil Hiring Request", fields=["name"])
				self.assertEqual({r.name for r in rows}, {own.name, other.name})
				self.assertEqual(review_views.my_requests(), [])
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["hr"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with fixtures.acting_as(self.f.users["hr"]):
			self.assertEqual(frappe.get_list("Kandil Hiring Request", fields=["name"]), [])
			with self.assertRaises(frappe.PermissionError):
				review_views.timeline(own.name)

	def test_delegated_timeline_preserves_original_events_and_exact_actor_principal_time(self):
		self.user("delegate", ["Kandil Approver"])
		self.delegate()
		req = self.f.request((1,))
		self.f.submit(req.name)
		fields = ["name", "action", "actor", "principal", "creation", "note"]
		original = frappe.get_all(
			"Kandil Recruitment Event",
			filters={"request": req.name},
			fields=fields,
			order_by="creation asc, name asc",
		)
		self.assertTrue(original)
		note = '<img src=x onerror="alert(1)"> literal decision note'
		self.f.decide(req.name, "delegate", comment=note)
		self.f.decide(req.name, "hr", comment="HR final approval")
		with fixtures.acting_as(self.f.users["requester"]):
			result = review_views.timeline(req.name)
			first = review_views.timeline(req.name, page_length=1)
			second = review_views.timeline(req.name, start=first["next_start"])
		actual = frappe.get_all(
			"Kandil Recruitment Event",
			filters={"request": req.name},
			fields=fields,
			order_by="creation asc, name asc",
		)
		self.assertEqual(result["events"], actual)
		self.assertEqual(actual[: len(original)], original)
		self.assertEqual(first["events"] + second["events"], actual)
		self.assertTrue(first["has_more"])
		delegated = [r for r in actual if r.actor == self.f.users["delegate"]]
		self.assertEqual(len(delegated), 1)
		self.assertEqual(
			(delegated[0].action, delegated[0].principal, delegated[0].note),
			("Approve", self.f.users["manager"], '<img src="x"> literal decision note'),
		)
		self.assertTrue(delegated[0].creation)
		steps = self.f.load(req.name).approval_steps
		self.assertEqual(
			(steps[0].actor, steps[0].principal), (self.f.users["delegate"], self.f.users["manager"])
		)
		self.assertLessEqual(steps[0].decided_at, delegated[0].creation)
		self.assertNotIn("snapshot", delegated[0])
		with fixtures.acting_as(self.f.users["delegate"]), self.f.rejected(frappe.PermissionError):
			event = frappe.get_doc("Kandil Recruitment Event", delegated[0].name)
			event.principal = self.f.users["hr"]
			event.save()

	def test_delegate_cannot_act_outside_effective_unit_or_interval(self):
		self.user("delegate", ["Kandil Approver"])
		other_department = self.f.insert(
			"Department", department_name=self.f.prefix + "-other", company=self.f.company
		)
		req = self.f.request((1,))
		self.f.submit(req.name)
		counts = self.f.counts(req.name)
		self.delegate(department=other_department.name)
		self.delegate(start=add_days(today(), -2), end=add_days(today(), -1))
		self.delegate(start=add_days(today(), 1), end=add_days(today(), 2))
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(req.name, "delegate")
		self.assertEqual(self.f.counts(req.name), counts)
		self.delegate()  # Inclusive one-day interval permits this recruitment step.
		self.f.decide(req.name, "delegate")
		self.assertEqual(self.f.load(req.name).approval_steps[0].actor, self.f.users["delegate"])

	def test_manager_a1_position_payload_b1_denied_server_side(self):
		manager = self.f.users["manager"]
		old = frappe.get_doc("Kandil Access Grant", self.f.grants["manager"])
		old.revoked = 1
		old.save(ignore_permissions=True)
		branch = frappe.db.get_value("Kandil Capacity", self.f.capacities[0], "branch")
		self.f.insert(
			"Kandil Access Grant",
			user=manager,
			company=self.f.company,
			department=self.f.department,
			branch=branch,
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic A1 manager grant",
		)
		req = self.request_as("manager")
		self.assertEqual(req.requested_position, self.f.positions[0])
		from frappe.client import save

		with fixtures.acting_as(manager):
			payload = self.f.load(req.name).as_dict()
			payload["requested_position"] = self.f.positions[1]
			with self.f.rejected(frappe.PermissionError):
				save(json.dumps(payload, default=str))
			self.assertEqual(self.f.load(req.name).requested_position, self.f.positions[0])
			payload = self.f.load(req.name).as_dict()
			payload["lines"][0]["capacity"] = self.f.capacities[1]
			with self.f.rejected(frappe.PermissionError):
				save(json.dumps(payload, default=str))
			self.assertEqual(self.f.load(req.name).lines[0].capacity, self.f.capacities[0])

	def test_selected_position_scope_rechecked_on_submit_and_review(self):
		def restrict(key):
			grant = frappe.get_doc("Kandil Access Grant", self.f.grants[key])
			grant.revoked = 1
			grant.save(ignore_permissions=True)
			self.f.insert(
				"Kandil Access Grant",
				user=self.f.users[key],
				company=self.f.company,
				department=self.f.department,
				branch=frappe.db.get_value("Kandil Capacity", self.f.capacities[1], "branch"),
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic B-only position scope revalidation",
			)

		def request_b_line():
			req = self.f.request((1,))
			with fixtures.acting_as(self.f.users["requester"]):
				req.lines[0].capacity = self.f.capacities[1]
				req.save()
			return req

		pending = request_b_line()
		self.f.submit(pending.name)
		self.f.decide(pending.name, "manager")
		draft = request_b_line()
		restrict("requester")
		counts = self.f.counts(draft.name)
		with self.f.rejected(frappe.PermissionError):
			self.f.submit(draft.name)
		self.assertEqual(self.f.counts(draft.name), counts)
		restrict("hr")
		counts = self.f.counts(pending.name)
		with self.f.rejected(frappe.PermissionError):
			self.f.call(
				"hr",
				api.review,
				pending.name,
				quantities={line.name: 1 for line in self.f.load(pending.name).lines},
				priority="Normal",
				reason="Synthetic outside selected position",
			)
		self.assertEqual(self.f.counts(pending.name), counts)


def run():
	import sys

	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(k)
			for k in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
			)
		)
	):
		raise RuntimeError("Review view checks require opted-in parity CLI")
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestReviewViews)
	)
	value = dict(
		suite="recruitment-review-views",
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 5,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		checks=result.checks,
		fixtures_rolled_back=True,
	)
	print(json.dumps(value))
	if not value["successful"]:
		raise AssertionError("Review view checks failed or skipped")
	return value
