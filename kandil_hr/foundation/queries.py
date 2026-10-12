"""Named Frappe query hooks. They restrict native list/search/export queries."""

from kandil_hr.foundation.security import hr_query, scope_query


def capacity(user=None):
	return scope_query("Kandil Capacity", user)


def route(user=None):
	return scope_query("Kandil Recruitment Route", user)


def delegation(user=None):
	return scope_query("Kandil Delegation", user)


def job_opening(user=None):
	return hr_query("Job Opening", user)


def job_applicant(user=None):
	return hr_query("Job Applicant", user)


def job_offer(user=None):
	return hr_query("Job Offer", user)


def interview(user=None):
	return hr_query("Interview", user)


def interview_feedback(user=None):
	return hr_query("Interview Feedback", user)


def employee(user=None):
	return hr_query("Employee", user)


def employee_onboarding(user=None):
	return hr_query("Employee Onboarding", user)
