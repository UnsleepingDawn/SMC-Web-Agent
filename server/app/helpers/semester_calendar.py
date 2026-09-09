"""Semester week arithmetic, ported from the original TimeParser helpers.

All dates are plain ``date`` objects; the "YYYYMMDD" integers the old code used
were an artefact of passing values into Feishu API filters, which now happen in
the jobs service.
"""

from datetime import date, timedelta


def semester_week(start_date: date, on: date | None = None) -> int:
    """Return the 1-based week number, counting the start date's week as week 1."""
    on = on or date.today()
    days_passed = (on - start_date).days
    return max(1, days_passed // 7 + 1)


def week_period(start_date: date, week: int) -> tuple[date, date]:
    """Monday and Friday of the given week."""
    monday = start_date + timedelta(days=(week - 1) * 7)
    return monday, monday + timedelta(days=4)


def previous_week(week: int) -> int:
    return max(1, week - 1)


def format_hhmm(value: str | int) -> str:
    """Render HHMM as "19:00" for message templates."""
    text = str(value).strip()
    if len(text) != 4 or not text.isdigit():
        raise ValueError(f"Time must be four digits, got {value!r}")
    hhmm = int(text)
    return f"{hhmm // 100:02d}:{hhmm % 100:02d}"
