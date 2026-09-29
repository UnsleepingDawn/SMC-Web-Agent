/**
 * The wording of the semester summary's three metric cells.
 *
 * Both the page's detail table and the exported poster print these numbers, so
 * the phrases live here instead of in the components: changing how a metric is
 * described then reaches every surface rather than only the one that was
 * edited. The numbers themselves always come from the row, never from here.
 */

import type { SemesterSummaryRow } from "@/lib/schema";

/** One metric cell, split into the pieces a view may lay out differently. */
export interface MetricCellText {
	/** The main line, e.g. `缺卡 3、迟到 1`. */
	primary: string;
	/** A dimmer second line explaining what was left out, when there is one. */
	secondary: string | null;
	/** The metric's rate, or null when the metric carries no data at all. */
	rate: number | null;
}

/** Join the non-null parts of a phrase with a Chinese enumeration comma. */
function joinParts(parts: (string | null)[]): string {
	return parts.filter((part): part is string => part !== null).join("、");
}

/**
 * Daily clock-ins. A member with nothing but excused or pending days has no
 * expected days at all, which the cell says outright instead of showing the
 * bare "缺卡 0、迟到 0" that reads like a clean record.
 */
export function dailyCellText(daily: SemesterSummaryRow["daily"]): MetricCellText {
	if (daily.expected === 0) {
		const aside = joinParts([
			daily.course > 0 ? `上课 ${daily.course}` : null,
			daily.excused > 0 ? `无需打卡 ${daily.excused}` : null,
			daily.pending > 0 ? `尚未打卡 ${daily.pending}` : null,
		]);
		return {
			primary: "无日常考勤记录",
			secondary: aside ? `仅有：${aside}` : null,
			rate: daily.rate,
		};
	}
	const aside = joinParts([
		daily.excused > 0 ? `无需打卡 ${daily.excused}` : null,
		daily.pending > 0 ? `尚未打卡 ${daily.pending}` : null,
	]);
	return {
		primary: joinParts([
			`缺卡 ${daily.absent}、迟到 ${daily.late}`,
			daily.course > 0 ? `上课 ${daily.course}` : null,
		]),
		secondary: aside ? `不计入：${aside}` : null,
		rate: daily.rate,
	};
}

/**
 * Seminar weeks. With no eligible week at all the cell falls back to saying
 * why: either the member has no seminar row whatsoever, meaning nobody ever
 * asked them to attend, or every week was exempted by a course or a leave.
 */
export function seminarCellText(
	seminar: SemesterSummaryRow["seminar"],
): MetricCellText {
	if (seminar.eligible === 0 && seminar.attended === 0) {
		if (seminar.course === 0 && seminar.leave === 0) {
			return { primary: "无组会出勤记录", secondary: null, rate: seminar.rate };
		}
		return {
			primary: "应到 0 周",
			secondary: `全部豁免：${joinParts([
				seminar.course > 0 ? `上课 ${seminar.course}` : null,
				seminar.leave > 0 ? `请假 ${seminar.leave}` : null,
			])}`,
			rate: seminar.rate,
		};
	}
	return {
		primary: joinParts([
			`实到 ${seminar.attended} / 应到 ${seminar.eligible}`,
			seminar.leave > 0 ? `请假 ${seminar.leave}` : null,
		]),
		secondary: null,
		rate: seminar.rate,
	};
}

/** Weekly-report submissions; every week 1..end_week is due a report. */
export function reportCellText(
	report: SemesterSummaryRow["weekly_report"],
): MetricCellText {
	return {
		primary: `提交 ${report.submitted} / 应提交 ${report.expected}`,
		secondary: null,
		rate: report.rate,
	};
}
