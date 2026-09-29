// Week helpers for the statistics pages. Kept as plain functions so the
// "which week shows by default" rule lives in exactly one place: the dashboard
// and the weekly-report / attendance pages all call `defaultStatsWeek`, and
// every sync panel uses its result as the default week input.

import { Seminar, Semester } from "@/lib/schema";
import { formatHhmm } from "@/lib/utils";

/**
 * Default week for the statistics cards.
 *
 * Friday, Saturday and Sunday show the current semester week; Monday through
 * Thursday show the previous one. The reporting window for a week therefore
 * runs from its Friday through the following Thursday, and the lower bound is
 * week 1 (the first week has no previous week to fall back to).
 */
export function defaultStatsWeek(
	currentWeek: number | null,
	now: Date = new Date(),
): number | null {
	if (!currentWeek) return null;
	const weekday = now.getDay(); // 0 = Sunday
	const showCurrent = weekday === 5 || weekday === 6 || weekday === 0;
	return showCurrent ? currentWeek : Math.max(1, currentWeek - 1);
}

/** Parse a plain YYYY-MM-DD value as a local date to avoid the UTC off-by-one. */
function parseLocalDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
	if (!match) return null;
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Render a local date as YYYY-MM-DD (the display format used across the app). */
function formatLocalDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/** The same moment with the time of day dropped, so day diffs are whole. */
function dayStart(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Which semester week a date falls in, mirroring the backend's `semester_week`
 * (`semester_calendar.py`): the start date's own week is week 1, and every seven
 * days after it adds one.
 */
export function semesterWeek(startDate: string, on: Date = new Date()): number {
	const start = parseLocalDate(startDate);
	if (!start) return 1;
	const days = Math.round((dayStart(on).getTime() - start.getTime()) / 86_400_000);
	return Math.max(1, Math.floor(days / 7) + 1);
}

/**
 * Week numbers the sync panel's "全部周数" option stands for, newest first.
 * A finished semester (its end date already behind us) stops at its end week;
 * an ongoing one stops at the current week so future weeks are never pulled.
 */
export function syncWeekOptions(semester: Semester, now: Date = new Date()): number[] {
	const end = semester.end_date ? parseLocalDate(semester.end_date) : null;
	const currentWeek = semesterWeek(semester.start_date, now);
	const last =
		end && end.getTime() < dayStart(now).getTime()
			? semesterWeek(semester.start_date, end)
			: currentWeek;
	return Array.from({ length: last }, (_, index) => last - index);
}

/**
 * Render week numbers as a compact Chinese span, e.g. `[1,2,3,5]` becomes
 * `第 1-3、5 周`. Consecutive weeks collapse into a range so a full-term
 * coverage note stays one line.
 */
export function formatWeekSpan(weeks: number[]): string {
	const sorted = [...new Set(weeks)].sort((a, b) => a - b);
	if (sorted.length === 0) return "暂无";

	const parts: string[] = [];
	let start = sorted[0];
	let previous = sorted[0];
	for (const week of sorted.slice(1)) {
		if (week === previous + 1) {
			previous = week;
			continue;
		}
		parts.push(start === previous ? String(start) : `${start}-${previous}`);
		start = week;
		previous = week;
	}
	parts.push(start === previous ? String(start) : `${start}-${previous}`);
	return `第 ${parts.join("、")} 周`;
}

/**
 * Monday through Friday of the given week, mirroring the backend's `week_period`
 * (week 1 starts on the semester start date). Unlike `Semester.week_start` /
 * `week_end`, this works for any week, not just the current one.
 */
export function weekPeriod(
	startDate: string,
	week: number,
): { start: string; end: string } | null {
	const start = parseLocalDate(startDate);
	if (!start) return null;
	start.setDate(start.getDate() + (week - 1) * 7);
	const end = new Date(start);
	end.setDate(end.getDate() + 4);
	return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

/**
 * The local moment the given seminar occurrence ends.
 *
 * Uses the same week arithmetic as the backend (`week_period`): the seminar date
 * is the semester start date shifted by (week - 1) * 7 + (weekday - 1) days.
 * Returns null when the date or time cannot be parsed; callers treat null as
 * "not passed yet" and keep showing the occurrence.
 */
export function seminarEndAt(semester: Semester, seminar: Seminar): Date | null {
	const start = parseLocalDate(semester.start_date);
	if (!start) return null;

	const date = new Date(start);
	date.setDate(date.getDate() + (seminar.week - 1) * 7 + (seminar.weekday - 1));

	const time = formatHhmm(seminar.end_time ?? semester.default_seminar_end_time);
	if (!time) return null;

	const [hours, minutes] = time.split(":").map(Number);
	date.setHours(hours, minutes, 0, 0);
	return date;
}

/**
 * The next seminar to announce: the earliest upcoming occurrence whose end time
 * has not passed. Occurrences already marked as happened are skipped, matching
 * the backend's preview/push rule. When the current week has no seminar, or its
 * seminar already ended, this naturally falls through to a later week.
 */
export function nextSeminar(
	seminars: Seminar[],
	semester: Semester,
	currentWeek: number | null,
	now: Date = new Date(),
): Seminar | null {
	const candidates = seminars
		.filter((item) => !item.happened)
		.filter((item) => currentWeek == null || item.week >= currentWeek)
		.sort((a, b) => a.week - b.week || a.weekday - b.weekday);

	return (
		candidates.find((item) => {
			const end = seminarEndAt(semester, item);
			return end == null || end.getTime() >= now.getTime();
		}) ?? null
	);
}
