"""Semester week arithmetic. Only what the jobs service actually needs.

Mirrored from server/app/helpers/semester_calendar.py; the two services deploy
independently and so cannot share a module.
"""

from datetime import date, datetime


def week_and_weekday(start_date: date, on: date) -> tuple[int, int]:
    """Week number (1-based, the start date's week is week 1) and ISO weekday."""
    days_passed = (on - start_date).days
    week = max(1, days_passed // 7 + 1)
    return week, on.isoweekday()


def date_from_iso(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()
