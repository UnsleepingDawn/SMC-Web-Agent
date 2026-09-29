/**
 * The wording of the semester summary's three metric cells.
 *
 * Both the page's detail table and the exported poster print these numbers, so
 * the phrases live here instead of in the components: changing how a metric is
 * described then reaches every surface rather than only the one that was
 * edited. The numbers themselves always come from the row, never from here.
 *
 * Two renderings are exported. `*CellText` is the page's, which spells the
 * counts out (`缺卡 3、迟到 1`). `*CompactText` is the poster's, which keeps the
 * column header as the only place the counts are named and leaves the cell as
 * `73% (6/0/58)`. The derived values -- what counts as an exemption, how many
 * reports are outstanding -- are computed once and shared by both, so the two
 * renderings can never disagree about the numbers.
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

/**
 * One metric cell in the poster's compact form. The counts carry no units: the
 * column header's format line above them names each position, so printing
 * `缺卡 6、迟到 0、上课 58` again inside the cell would only repeat it.
 */
export interface MetricCompactText {
	/** The metric's rate, or null when the metric carries no data at all. */
	rate: number | null;
	/** The raw counts, in the order the column's format line spells out. */
	counts: number[];
	/** A dimmer line explaining what was left out, when there is one. */
	aside: string | null;
}

/** Join the non-null parts of a phrase with a Chinese enumeration comma. */
function joinParts(parts: (string | null)[]): string {
	return parts.filter((part): part is string => part !== null).join("、");
}

/**
 * The daily cell's "what was left out" line.
 *
 * `withCourse` is the only difference between the two renderings. The page's
 * main line never mentions course-exempt days, so for a member with no
 * countable day at all the aside has to name them ("仅有：上课 5"); the poster
 * prints them inside the brackets instead, and repeating them would be noise.
 */
function dailyAside(
	daily: SemesterSummaryRow["daily"],
	{ withCourse }: { withCourse: boolean },
): string | null {
	const parts = joinParts([
		withCourse && daily.course > 0 ? `上课 ${daily.course}` : null,
		daily.excused > 0 ? `无需打卡 ${daily.excused}` : null,
		daily.pending > 0 ? `尚未打卡 ${daily.pending}` : null,
	]);
	if (!parts) return null;
	// With no countable day the line reads as an explanation of the blank rate
	// rather than as a footnote to a rate that was printed.
	return daily.expected === 0 ? `仅有：${parts}` : `不计入：${parts}`;
}

/**
 * Daily clock-ins. A member with nothing but excused or pending days has no
 * expected days at all, which the cell says outright instead of showing the
 * bare "缺卡 0、迟到 0" that reads like a clean record.
 */
export function dailyCellText(daily: SemesterSummaryRow["daily"]): MetricCellText {
	if (daily.expected === 0) {
		return {
			primary: "无日常考勤记录",
			secondary: dailyAside(daily, { withCourse: true }),
			rate: daily.rate,
		};
	}
	return {
		primary: joinParts([
			`缺卡 ${daily.absent}、迟到 ${daily.late}`,
			daily.course > 0 ? `上课 ${daily.course}` : null,
		]),
		secondary: dailyAside(daily, { withCourse: false }),
		rate: daily.rate,
	};
}

/** Daily clock-ins, poster form: `73% (6/0/58)` for 缺卡/迟到/上课. */
export function dailyCompactText(
	daily: SemesterSummaryRow["daily"],
): MetricCompactText {
	return {
		rate: daily.rate,
		counts: [daily.absent, daily.late, daily.course],
		aside: dailyAside(daily, { withCourse: false }),
	};
}

/**
 * The seminar cell's "what was left out" line: the approved leaves in the
 * ordinary case, or the whole reason there is no rate when every due week was
 * exempted. A member with no stored leave and nothing exempted has no line.
 */
function seminarAside(seminar: SemesterSummaryRow["seminar"]): string | null {
	if (seminar.eligible === 0 && seminar.attended === 0) {
		if (seminar.course === 0 && seminar.leave === 0) return null;
		return `全部豁免：${joinParts([
			seminar.course > 0 ? `上课 ${seminar.course}` : null,
			seminar.leave > 0 ? `请假 ${seminar.leave}` : null,
		])}`;
	}
	return seminar.leave > 0 ? `请假 ${seminar.leave}` : null;
}

/**
 * Seminar weeks. With no eligible week at all the cell falls back to saying
 * why: either the member has no seminar row whatsoever, meaning nobody ever
 * asked them to attend, or every week was exempted by a course or a leave.
 */
export function seminarCellText(
	seminar: SemesterSummaryRow["seminar"],
): MetricCellText {
	const aside = seminarAside(seminar);
	if (seminar.eligible === 0 && seminar.attended === 0) {
		return aside === null
			? { primary: "无组会出勤记录", secondary: null, rate: seminar.rate }
			: { primary: "应到 0 周", secondary: aside, rate: seminar.rate };
	}
	return {
		primary: joinParts([
			`实到 ${seminar.attended} / 应到 ${seminar.eligible}`,
			aside,
		]),
		secondary: null,
		rate: seminar.rate,
	};
}

/** Seminar weeks, poster form: `77% (17/13)` for 应到/实到. */
export function seminarCompactText(
	seminar: SemesterSummaryRow["seminar"],
): MetricCompactText {
	return {
		rate: seminar.rate,
		counts: [seminar.eligible, seminar.attended],
		aside: seminarAside(seminar),
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

/**
 * Weekly reports, poster form: `88% (15/2)` for 已交/未交. The outstanding
 * count is derived here rather than sent by the server, which reports only
 * what was submitted and how many weeks were due.
 */
export function reportCompactText(
	report: SemesterSummaryRow["weekly_report"],
): MetricCompactText {
	return {
		rate: report.rate,
		counts: [report.submitted, Math.max(0, report.expected - report.submitted)],
		aside: null,
	};
}
