"""Render the Feishu post messages we send.

Port of the template-filling half of ``SMCLabMessageSender``. The sending half
lives in the jobs worker; this module only produces the message payload, which
the API returns for preview and hands to ``send_feishu_message`` when the user
confirms.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.database.models import Member, Semester, Seminar
from app.feishu.templates import load_template
from app.helpers.semester_calendar import format_hhmm

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]


class TemplateError(ValueError):
    """A template placeholder or business rule was not satisfied."""


def _presentations(seminar: Seminar) -> List[Dict[str, Any]]:
    talks = sorted(seminar.presentations, key=lambda item: item.track)
    if not talks:
        raise TemplateError("该周组会还没有安排报告人，无法生成预告")
    for expected, talk in enumerate(talks, start=1):
        if talk.track != expected:
            raise TemplateError(
                f"{talk.presenter_name} 的 Track 应为 {expected}，当前为 {talk.track}"
            )
        if not talk.title.strip():
            raise TemplateError(f"{talk.presenter_name} 还没有填写分享主题")
        if not (talk.abstract or "").strip():
            raise TemplateError(f"{talk.presenter_name} 还没有填写摘要")
    return talks


def render_seminar_preview(
    seminar: Seminar, semester: Semester
) -> Dict[str, Any]:
    """Build the preview post for one upcoming seminar."""
    if seminar.happened:
        raise TemplateError("该周组会已经开过，无法生成预告")

    template = load_template("seminar_preview")
    talks = _presentations(seminar)

    content: List[List[Dict[str, Any]]] = []
    for talk in talks:
        paragraph = template.paragraph(0)
        paragraph[1]["text"] = str(talk.track)
        paragraph[3]["text"] = talk.title
        paragraph[5]["text"] = talk.presenter_name
        paragraph[7]["text"] = talk.abstract or ""
        content.append(paragraph)

    period = template.paragraph(1)
    period[2]["text"] = WEEKDAY_NAMES[seminar.weekday]
    period[3]["text"] = (
        f"{format_hhmm(semester.default_seminar_start_time)}"
        f"-{format_hhmm(semester.default_seminar_end_time)}"
    )
    content.append(period)

    room = template.paragraph(2)
    room[1]["text"] = seminar.room or "请联系老师指定教室"
    content.append(room)

    online = template.paragraph(3)
    if seminar.weekday == semester.default_seminar_weekday:
        link = semester.default_seminar_tencent_link or ""
        meeting_id = semester.default_seminar_tencent_id or ""
        online[1]["text"] = (
            f"(点击链接入会，或添加至会议列表)\n{link}\n腾讯会议: {meeting_id}"
        )
    else:
        online[1]["text"] = "(由于本周组会时间调整, 腾讯会议号另行通知)"
    content.append(online)

    return template.to_payload(
        f"{semester.name}-第{seminar.week}周组会通知", content
    )


def render_weekly_summary(
    *,
    semester: Semester,
    week: int,
    submitted_names: List[str],
    missing_names: List[str],
) -> Dict[str, Any]:
    """Build the weekly summary post; attendance sections are omitted."""
    template = load_template("weekly_summary")

    content = template.paragraph(0)  # heading
    link_paragraph = template.paragraph(1)
    link_paragraph[0]["href"] = semester.weekly_report_url or "http://www.feishu.cn"
    submitted_paragraph = template.paragraph(2)
    submitted_paragraph[1]["text"] = "、".join(submitted_names) or "无"
    missing_paragraph = template.paragraph(3)
    missing_paragraph[1]["text"] = "、".join(missing_names) or "无"

    return template.to_payload(
        f"{semester.name}-第{week}周总结",
        [content, link_paragraph, submitted_paragraph, missing_paragraph],
    )


def member_open_id(member: Member) -> Optional[str]:
    """The Feishu ``open_id`` we address messages to."""
    return member.feishu_account or None
