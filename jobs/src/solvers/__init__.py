"""Group-meeting timetabling: a pure function with no Celery or Feishu imports."""

from src.solvers.group_meeting_solver import solve_group_meeting

__all__ = ["solve_group_meeting"]
