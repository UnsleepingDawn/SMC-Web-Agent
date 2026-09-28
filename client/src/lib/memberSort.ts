/**
 * Client-side multi-key sorting for the members table. The server returns the
 * roster ordered by name only, and the page already holds the whole list, so
 * re-sorting in memory keeps the control responsive without an extra request.
 */

import { Member } from "./schema";

/** Columns of the members table that can be used as sort keys. */
export type MemberSortField =
	| "name"
	| "grade"
	| "advisor"
	| "cultivation_type"
	| "enrollment_status"
	| "student_id"
	| "need_attendance";

export type SortDirection = "asc" | "desc";

/** One selected key; `rules` order is the sort priority order. */
export interface MemberSortRule {
	field: MemberSortField;
	direction: SortDirection;
}

/**
 * Initial sort of the members page: by programme first, then grade, both
 * descending, so the highest grade of each programme leads its group.
 */
export const DEFAULT_MEMBER_SORT_RULES: MemberSortRule[] = [
	{ field: "cultivation_type", direction: "desc" },
	{ field: "grade", direction: "desc" },
];

/** Selectable fields, listed in the same order as the table columns. */
export const MEMBER_SORT_FIELDS: { field: MemberSortField; label: string }[] = [
	{ field: "name", label: "姓名" },
	{ field: "grade", label: "年级" },
	{ field: "advisor", label: "导师" },
	{ field: "cultivation_type", label: "培养类型" },
	{ field: "enrollment_status", label: "在读情况" },
	{ field: "student_id", label: "学号" },
	{ field: "need_attendance", label: "考勤" },
];

/** Numeric-aware collator so "2023级" and student ids order naturally. */
const COLLATOR = new Intl.Collator("zh-Hans-CN", {
	numeric: true,
	sensitivity: "base",
});

/** Comparable value; `null` marks a missing value, which always sorts last. */
function valueOf(member: Member, field: MemberSortField): string | number | null {
	if (field === "need_attendance") return member.need_attendance ? 1 : 0;
	const raw = member[field];
	if (raw === null) return null;
	const trimmed = raw.trim();
	return trimmed === "" ? null : trimmed;
}

function compare(a: Member, b: Member, rule: MemberSortRule): number {
	const left = valueOf(a, rule.field);
	const right = valueOf(b, rule.field);
	if (left === null && right === null) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	if (typeof left === "number" && typeof right === "number") {
		return rule.direction === "asc" ? left - right : right - left;
	}
	const result = COLLATOR.compare(String(left), String(right));
	return rule.direction === "asc" ? result : -result;
}

/** Sort a copy of `members` by `rules`, in priority order. */
export function sortMembers(members: Member[], rules: MemberSortRule[]): Member[] {
	if (rules.length === 0) return members;
	return [...members].sort((a, b) => {
		for (const rule of rules) {
			const result = compare(a, b, rule);
			if (result !== 0) return result;
		}
		return 0;
	});
}
