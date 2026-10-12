"""Pure tests with a minimal framework boundary; no site or database needed."""

import sys
import unittest
from datetime import UTC, date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from kandil_hr.foundation import clock


class TestCairoClock(unittest.TestCase):
	def setUp(self):
		self.framework = SimpleNamespace(
			conf={"allow_tests": True}, flags={"in_test": True}, local=SimpleNamespace(request=None)
		)
		self.stub = patch.dict(sys.modules, {"frappe": self.framework})
		self.stub.start()
		self.addCleanup(self.stub.stop)

	def test_frozen_cairo_date_and_nested_restoration(self):
		with clock.test_clock(datetime(2026, 10, 11, 22, tzinfo=UTC)):
			self.assertEqual(clock.today_cairo(), date(2026, 10, 12))
			self.assertEqual(clock.now_cairo().hour, 1)
			with self.assertRaisesRegex(RuntimeError, "Injected"):
				with clock.test_clock(datetime(2026, 1, 1, tzinfo=UTC)):
					self.assertEqual(clock.now_cairo().hour, 2)
					raise RuntimeError("Injected")
			self.assertEqual(clock.today_cairo(), date(2026, 10, 12))
		self.assertNotIn("kandil_test_clock", self.framework.flags)

	def test_test_mode_and_site_opt_in_are_both_required(self):
		for allow_tests, in_test in ((False, False), (False, True), (True, False)):
			self.framework.conf["allow_tests"] = allow_tests
			self.framework.flags["in_test"] = in_test
			with self.assertRaises(RuntimeError):
				with clock.test_clock(datetime.now(UTC)):
					self.fail("Unprotected override was accepted")

	def test_http_context_cannot_override_clock_even_on_test_site(self):
		self.framework.local.request = object()
		with self.assertRaises(RuntimeError):
			with clock.test_clock(datetime.now(UTC)):
				self.fail("HTTP override was accepted")

	def test_naive_time_is_rejected_and_stale_override_fails_closed(self):
		with self.assertRaises(ValueError):
			with clock.test_clock(datetime(2026, 1, 1)):
				self.fail("Naive override was accepted")
		self.framework.flags["kandil_test_clock"] = datetime.now(UTC)
		self.framework.flags["in_test"] = False
		with self.assertRaises(RuntimeError):
			clock.now_cairo()

	def test_default_clock_is_aware_without_test_mode(self):
		self.framework.flags.clear()
		self.framework.conf.clear()
		before = datetime.now(UTC)
		value = clock.now_cairo()
		self.assertEqual(str(value.tzinfo), "Africa/Cairo")
		self.assertLessEqual(before, value)
		self.assertLessEqual(value, datetime.now(UTC))
