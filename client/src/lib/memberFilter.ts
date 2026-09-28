/**
 * Member filter state and the pure logic behind the multi-select filter menu.
 * A field may hold several values: values inside one field match as OR, while
 * different fields still AND together. Mirrors `memberSort.ts` in layering -
 * the menu component stays presentational and this file owns the semantics.
 */

import { MemberFilters } from "./schema";

/** Fields the filter menu can constrain, in the order shown in the menu. */
export type MemberFilterField =
	| "advisor"
	| "grade"
	| "enrollment_status"
	| "need_attendance";

export interface MemberFilterState {
	search: string;
	advisor: string[];
	grade: string[];
	enrollment_status: string[];
	need_attendance: string[];
}

export const EMPTY_FILTERS: MemberFilterState = {
	search: "",
	advisor: [],
	grade: [],
	enrollment_status: [],
	need_attendance: [],
};

/** The four list-valued fields, i.e. everything except the free-text search. */
const FILTER_VALUE_FIELDS: MemberFilterField[] = [
	"advisor",
	"grade",
	"enrollment_status",
	"need_attendance",
];

/** One selectable entry in a field's second-level list. */
export interface MemberFilterOption {
	value: string;
	label: string;
}

/** Sentinel values for the boolean attendance field, kept out of the UI labels. */
export const NEED_ATTENDANCE_VALUE = "needed";
export const NOT_NEED_ATTENDANCE_VALUE = "not_needed";

export interface MemberFilterFieldSpec {
	field: MemberFilterField;
	label: string;
	/** Key on `/api/members/filters` sourcing the options, for the text fields. */
	optionsKey?: keyof MemberFilters;
	/** Fixed options, used by the boolean attendance field. */
	staticOptions?: MemberFilterOption[];
}

export const MEMBER_FILTER_FIELDS: MemberFilterFieldSpec[] = [
	{ field: "advisor", label: "导师", optionsKey: "advisors" },
	{ field: "grade", label: "年级", optionsKey: "grades" },
	{
		field: "enrollment_status",
		label: "在读情况",
		optionsKey: "enrollment_statuses",
	},
	{
		field: "need_attendance",
		label: "考勤",
		staticOptions: [
			{ value: NEED_ATTENDANCE_VALUE, label: "需要考勤" },
			{ value: NOT_NEED_ATTENDANCE_VALUE, label: "不需要考勤" },
		],
	},
];

/** Options for one field, either fixed or taken from the server's facet list. */
export function optionsForField(
	spec: MemberFilterFieldSpec,
	filters: MemberFilters | null,
): MemberFilterOption[] {
	if (spec.staticOptions) return spec.staticOptions;
	if (!spec.optionsKey) return [];
	return (filters?.[spec.optionsKey] ?? []).map((value) => ({
		value,
		label: value,
	}));
}

/** Toggle one value in a field, returning a new state. */
export function toggleFilterValue(
	state: MemberFilterState,
	field: MemberFilterField,
	value: string,
): MemberFilterState {
	const current = state[field];
	const next = current.includes(value)
		? current.filter((item) => item !== value)
		: [...current, value];
	return { ...state, [field]: next };
}

/** Total number of selected values across all fields, for the trigger badge. */
export function countSelected(state: MemberFilterState): number {
	return FILTER_VALUE_FIELDS.reduce((total, field) => total + state[field].length, 0);
}

export function hasFilters(state: MemberFilterState): boolean {
	return countSelected(state) > 0;
}

/**
 * Map the attendance values to a single tri-state boolean for the API.
 * Selecting both entries (or none) means "no constraint". The backend keeps
 * `need_attendance` a plain boolean, so the "or" of both options is expressed
 * by simply not filtering.
 */
export function deriveNeedAttendance(values: string[]): boolean | undefined {
	const wantsNeeded = values.includes(NEED_ATTENDANCE_VALUE);
	const wantsNotNeeded = values.includes(NOT_NEED_ATTENDANCE_VALUE);
	if (wantsNeeded === wantsNotNeeded) return undefined;
	return wantsNeeded;
}
