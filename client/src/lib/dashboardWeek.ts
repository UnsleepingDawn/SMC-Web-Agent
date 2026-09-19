// Dashboard week helpers shared by the overview cards. Kept as plain functions
// so the "which week shows by default" rule lives in exactly one place.

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
