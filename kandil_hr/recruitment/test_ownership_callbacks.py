"""Pure callback queue isolation checks; no database connection or fixture data."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe
from frappe.utils import CallbackManager

from kandil_hr.recruitment import ownership


class TestOwnershipCallbacks(unittest.TestCase):
	def test_cleanup_failure_preserves_all_outer_callbacks(self):
		names = ("before_commit", "after_commit", "before_rollback", "after_rollback")
		db = SimpleNamespace(**{name: CallbackManager() for name in names})
		outer = {name: getattr(db, name) for name in names}
		called = []
		for name, manager in outer.items():
			manager.add(lambda name=name: called.append(name))

		def rollback():
			for name in names:
				getattr(db, name).reset()

		db.rollback = rollback
		db.commit = Mock()
		with (
			patch.object(frappe, "db", db),
			patch.object(frappe, "logger", return_value=Mock()),
			patch.object(ownership, "handoff_disabled_user", side_effect=ValueError("synthetic")),
		):
			ownership._after_disable("synthetic@example.invalid", "Administrator")
		for name in names:
			self.assertIs(getattr(db, name), outer[name])
			outer[name].run()
		self.assertEqual(called, list(names))
		db.commit.assert_not_called()

	def test_cleanup_commit_executes_only_local_callbacks(self):
		names = ("before_commit", "after_commit", "before_rollback", "after_rollback")
		db = SimpleNamespace(**{name: CallbackManager() for name in names})
		outer = {name: getattr(db, name) for name in names}
		called = []
		outer["after_commit"].add(lambda: called.append("sibling session revocation"))

		def cleanup(*args):
			db.after_commit.add(lambda: called.append("cleanup local"))

		db.commit = lambda: db.after_commit.run()
		db.rollback = Mock()
		with (
			patch.object(frappe, "db", db),
			patch.object(ownership, "handoff_disabled_user", side_effect=cleanup),
		):
			ownership._after_disable("synthetic@example.invalid", "Administrator")
		self.assertEqual(called, ["cleanup local"])
		outer["after_commit"].run()
		self.assertEqual(called, ["cleanup local", "sibling session revocation"])
		for name in names:
			self.assertIs(getattr(db, name), outer[name])


def run():
	result = unittest.TextTestRunner(verbosity=2).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestOwnershipCallbacks)
	)
	if result.testsRun != 2 or not result.wasSuccessful():
		raise RuntimeError("Callback isolation checks failed")
	return dict(
		discovered=2,
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
		classification="pure mocked callback queues; no DB",
	)
