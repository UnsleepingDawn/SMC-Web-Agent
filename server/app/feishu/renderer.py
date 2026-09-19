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


def _time_range(seminar: Seminar, semester: Semester) -> str:
    """This occurrence's window as "HH:MM-HH:MM".

    The slot's own ``start_time``/``end_time`` win when set; otherwise the
    semester's default seminar time applies.
    """
    try:
        start = format_hhmm(seminar.start_time or semester.default_seminar_start_time)
        end = format_hhmm(seminar.end_time or semester.default_seminar_end_time)
    except ValueError as exc:
        raise TemplateError(
            "组会时间格式不正确，请在学期设置或组会安排里重新填写"
        ) from exc
    return f"{start}-{end}"


def _presentations(seminar: Seminar) -> List[Dict[str, Any]]:
    """The talks in track order, validated before they reach the template.

    Track numbers are whatever the seminar table holds, so they may start above
    1; only their order matters here.
    """
    talks = sorted(seminar.presentations, key=lambda item: item.track)
    if not talks:
        raise TemplateError("该周组会还没有安排报告人，无法生成预告")
    for talk in talks:
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
    period[3]["text"] = _time_range(seminar, semester)
    content.append(period)

    room = template.paragraph(2)
    room[1]["text"] = seminar.room or "请联系老师指定教室"
    content.append(room)

    advisor = template.paragraph(3)
    advisor[1]["text"] = seminar.offline_advisor or "待定"
    content.append(advisor)

    online = template.paragraph(4)
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
    """Build the weekly summary post, covering only the weekly-report section."""
    template = load_template("weekly_summary")

    content: List[List[Dict[str, Any]]] = []

    content.append(template.paragraph(0))  # 周报 heading
    link_paragraph = template.paragraph(1)
    link_paragraph[0]["href"] = semester.weekly_report_url or "http://www.feishu.cn"
    content.append(link_paragraph)
    submitted_paragraph = template.paragraph(2)
    submitted_paragraph[1]["text"] = "、".join(submitted_names) or "无"
    content.append(submitted_paragraph)
    missing_paragraph = template.paragraph(3)
    missing_paragraph[1]["text"] = "、".join(missing_names) or "无"
    content.append(missing_paragraph)

    return template.to_payload(
        f"{semester.name}-第{week}周总结",
        content,
    )


def render_teacher_weekly_reports(
    *,
    semester: Semester,
    week: int,
    teacher_name: str,
    students: List[Dict[str, Any]],
    for_admin: bool = False,
) -> Dict[str, Any]:
    """One teacher's weekly-report digest: the overall link plus each student's.

    ``for_admin`` renders the same body but labels the title with the intended
    teacher, so the admin dry run makes clear who each message is for.
    """
    template = load_template("weekly_report_teacher")

    content: List[List[Dict[str, Any]]] = []

    link_paragraph = template.paragraph(0)
    link_paragraph[1]["href"] = semester.weekly_report_url or "http://www.feishu.cn"
    content.append(link_paragraph)

    content.append(template.paragraph(1))  # 组内学生周报 heading

    for student in students:
        row = template.paragraph(2)
        row[0]["text"] = f"{student['name']}: "
        if student.get("doc_link"):
            row[1] = {
                "tag": "a",
                "href": str(student["doc_link"]),
                "text": "查看周报",
            }
        elif student.get("has_attachment"):
            row[1] = {"tag": "text", "text": "已提交（文件）"}
        elif student.get("submitted"):
            row[1] = {"tag": "text", "text": "已提交"}
        else:
            row[1] = {"tag": "text", "text": "未提交"}
        content.append(row)

    if for_admin:
        title = f"{semester.name}-第{week}周周报汇总（发给{teacher_name}老师）"
    else:
        title = f"{semester.name}-第{week}周周报汇总（{teacher_name}老师组）"
    return template.to_payload(title, content)


def member_open_id(member: Member) -> Optional[str]:
    """The Feishu ``open_id`` we address messages to."""
    return member.feishu_account or None
