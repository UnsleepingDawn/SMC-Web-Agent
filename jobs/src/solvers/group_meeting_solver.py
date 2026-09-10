"""BILP group-meeting scheduler, ported from ``SMCLabGroupMeetingScheduler``.

The model decides both who groups together and which 30-minute slot each group
presents in. It is a pure function of its inputs: the server assembles the
member list and the course-conflict matrix, the worker runs CBC, and the
solution goes back over the webhook.

The code keeps the original model's shape (seven binary variable families, the
same constraints and weights) so the results stay comparable to the CLI tool,
with one added rule: each morning session is filled up to three groups, using a
penalised slack variable so a roster that cannot fill it still solves.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pulp  # type: ignore

logger = logging.getLogger(__name__)

# Objective weights: a 3-person group is free, a 2-person group costs 1, a
# 4-person group costs 5, and booking the very last slot costs 2.
WEIGHT_TWO = 1
WEIGHT_FOUR = 5
WEIGHT_LAST_SLOT = 2
# Every morning session should present this many groups. The shortfall penalty
# is kept below WEIGHT_TWO so the solver fills a morning with groups it already
# needs, but never invents an extra 2-person group just to reach the target:
# best effort, under-filling is acceptable when the roster cannot fill it.
MORNING_PERIOD = "上午"
MORNING_TARGET_GROUPS = 3
WEIGHT_MORNING_SHORTFALL = 0.5


def _default_weights() -> Dict[str, float]:
    return {
        "w2": WEIGHT_TWO,
        "w4": WEIGHT_FOUR,
        "alpha": WEIGHT_LAST_SLOT,
        "beta": WEIGHT_MORNING_SHORTFALL,
    }


def solve_group_meeting(
    *,
    name_list: Sequence[str],
    slots: Sequence[Dict[str, Any]],
    busy_pairs: Optional[Sequence[Sequence[int]]] = None,
    already_grouped: Optional[Sequence[Sequence[str]]] = None,
    weights: Optional[Dict[str, float]] = None,
    time_limit_seconds: int = 60,
) -> Dict[str, Any]:
    """Solve the grouping and scheduling problem.

    ``busy_pairs`` holds ``(member_index, slot_index)`` pairs where the member
    has a class. ``already_grouped`` holds member names that must share a group.
    """
    names = [str(name) for name in name_list]
    if not names:
        raise ValueError("参会名单不能为空")

    weights = {**_default_weights(), **(weights or {})}
    already = [list(group) for group in (already_grouped or [])]
    busy = {(int(pair[0]), int(pair[1])) for pair in (busy_pairs or [])}

    name_to_id = {name: index for index, name in enumerate(names)}
    for group in already:
        for name in group:
            if name not in name_to_id:
                raise ValueError(f"预设分组里的 {name} 不在参会名单中")

    member_count = len(names)
    slot_count = len(slots)
    if slot_count == 0:
        raise ValueError("没有可用的会议时段")

    group_count = math.ceil(member_count / 2)
    last_slot = slot_count - 1

    problem = pulp.LpProblem("Unified_Group_Meeting", pulp.LpMinimize)
    members = range(member_count)
    groups = range(group_count)
    slot_indexes = range(slot_count)

    assign = pulp.LpVariable.dicts(
        "y", (members, groups), cat=pulp.LpBinary
    )
    scheduled = pulp.LpVariable.dicts(
        "x", (groups, slot_indexes), cat=pulp.LpBinary
    )
    used = pulp.LpVariable.dicts("z", groups, cat=pulp.LpBinary)
    is_two = pulp.LpVariable.dicts("s2", groups, cat=pulp.LpBinary)
    is_three = pulp.LpVariable.dicts("s3", groups, cat=pulp.LpBinary)
    is_four = pulp.LpVariable.dicts("s4", groups, cat=pulp.LpBinary)
    last = pulp.LpVariable.dicts("l", groups, cat=pulp.LpBinary)

    # Group the morning slots by session (one per selected "weekday + 上午").
    # Each session gets a slack variable for the groups it falls short of the
    # target, letting the model under-fill instead of turning infeasible.
    morning_slots: Dict[Tuple[str, str], List[int]] = {}
    for p in slot_indexes:
        slot = slots[p]
        if str(slot.get("period")) == MORNING_PERIOD:
            morning_slots.setdefault(
                (str(slot.get("day")), MORNING_PERIOD), []
            ).append(p)
    shortfall = {
        key: pulp.LpVariable(
            f"m{index}",
            lowBound=0,
            upBound=min(MORNING_TARGET_GROUPS, len(slot_ids)),
            cat="Integer",
        )
        for index, (key, slot_ids) in enumerate(morning_slots.items())
    }

    problem += pulp.lpSum(
        weights["w2"] * is_two[g]
        + weights["w4"] * is_four[g]
        + weights["alpha"] * last[g]
        for g in groups
    ) + weights["beta"] * pulp.lpSum(shortfall.values())

    # Every member belongs to exactly one group.
    for i in members:
        problem += pulp.lpSum(assign[i][g] for g in groups) == 1

    for g in groups:
        # Group size is 2, 3 or 4, and matches whether the group is used.
        problem += is_two[g] + is_three[g] + is_four[g] == used[g]
        problem += (
            pulp.lpSum(assign[i][g] for i in members)
            == 2 * is_two[g] + 3 * is_three[g] + 4 * is_four[g]
        )
        # A used group occupies exactly one slot.
        problem += pulp.lpSum(scheduled[g][p] for p in slot_indexes) == used[g]
        # The penalty indicator tracks the last slot.
        problem += last[g] == scheduled[g][last_slot]

    # One group per 30-minute slot: the lab books a single room.
    for p in slot_indexes:
        problem += pulp.lpSum(scheduled[g][p] for g in groups) <= 1

    # Each morning session presents up to MORNING_TARGET_GROUPS groups, and the
    # slack covers any shortfall so a small roster cannot make the model fail.
    for key, slot_ids in morning_slots.items():
        target = min(MORNING_TARGET_GROUPS, len(slot_ids))
        problem += (
            pulp.lpSum(scheduled[g][p] for g in groups for p in slot_ids)
            + shortfall[key]
            == target
        )

    # No member may be scheduled into a slot they have a class in.
    for (i, p) in busy:
        if i < 0 or i >= member_count or p < 0 or p >= slot_count:
            continue
        for g in groups:
            problem += assign[i][g] + scheduled[g][p] <= 1

    # Members listed together must share a group.
    for group in already:
        anchor = name_to_id[group[0]]
        for name in group[1:]:
            other = name_to_id[name]
            for g in groups:
                problem += assign[anchor][g] == assign[other][g]

    status = problem.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit_seconds))
    status_name = pulp.LpStatus[status]

    result: Dict[str, List[List[str]]] = {}
    if status_name != "Optimal":
        logger.warning("Group meeting solver returned %s", status_name)

    if status_name == "Optimal":
        for g in groups:
            if pulp.value(used[g]) != 1:
                continue
            members_in_group = [
                names[i] for i in members if pulp.value(assign[i][g]) == 1
            ]
            for p in slot_indexes:
                if pulp.value(scheduled[g][p]) == 1:
                    result.setdefault(str(slots[p]["name"]), []).append(
                        members_in_group
                    )

    validation = _validate(
        names, slots, busy, result, status_name
    )
    return {
        "solver_status": status_name,
        "result": result,
        "validation": validation,
    }


def _validate(
    names: Sequence[str],
    slots: Sequence[Dict[str, Any]],
    busy: set[Tuple[int, int]],
    result: Dict[str, List[List[str]]],
    status_name: str,
) -> Dict[str, Any]:
    """Report members left out and any group put in a conflicting slot."""
    name_to_id = {name: index for index, name in enumerate(names)}
    slot_to_id = {str(slot["name"]): index for index, slot in enumerate(slots)}

    scheduled_names: set[str] = set()
    conflicts: List[Dict[str, str]] = []
    for slot_name, groups in result.items():
        slot_id = slot_to_id.get(slot_name)
        if slot_id is None:
            continue
        for group in groups:
            for name in group:
                scheduled_names.add(name)
                if (name_to_id.get(name), slot_id) in busy:
                    conflicts.append({"name": name, "slot": slot_name})

    missing = [name for name in names if name not in scheduled_names]
    message = ""
    if status_name != "Optimal":
        message = f"求解状态为 {status_name}，结果可能不完整"
    return {"missing": missing, "conflicts": conflicts, "message": message}
