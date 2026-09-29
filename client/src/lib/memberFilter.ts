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
	| "cultivation_type"
	| "enrollment_status"
	| "need_attendance";

export interface MemberFilterState {
	search: string;
	advisor: string[];
	grade: string[];
	cultivation_type: string[];
	enrollment_status: string[];
	need_attendance: string[];
}

/** Every field unconstrained. */
export const EMPTY_FILTERS: MemberFilterState = {
	search: "",
	advisor: [],
	grade: [],
	cultivation_type: [],
	enrollment_status: [],
	need_attendance: [],
};

/**
 * Initial state of the members page: the roster defaults to members who are
 * still around, so alumni imported from the address book stay out of the way.
 */
export const DEFAULT_FILTERS: MemberFilterState = {
	...EMPTY_FILTERS,
	enrollment_status: ["在读", "临近毕业"],
};

/** The five list-valued fields, i.e. everything except the free-text search. */
const FILTER_VALUE_FIELDS: MemberFilterField[] = [
	"advisor",
	"grade",
	"cultivation_type",
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
		field: "cultivation_type",
		label: "培养类型",
		optionsKey: "cultivation_types",
	},
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

/**
 * The subset of `Member` the filter logic needs. Pages that already hold the
 * member fields can pass the row through; pages that only have a name (such as
 * the semester summary) pass the name plus whatever details are known.
 */
export interface FilterableMember {
	name: string;
	student_id?: string | null;
	advisor?: string | null;
	grade?: string | null;
	cultivation_type?: string | null;
	enrollment_status?: string | null;
	need_attendance?: boolean | null;
}

/** An empty selection means "no constraint"; a value must match exactly. */
function matchesValues(values: string[], value: string | null | undefined): boolean {
	if (values.length === 0) return true;
	return value != null && values.includes(value);
}

/**
 * Apply the filter state to one member on the client.
 *
 * Mirrors the backend's `member_crud.list_filtered`: values inside one field
 * match as OR, different fields still AND together, and the free-text search
 * spans name / student id / advisor. Used where the roster is already in
 * memory so filtering costs no request.
 */
export function matchesMemberFilters(
	member: FilterableMember,
	state: MemberFilterState,
): boolean {
	const search = state.search.trim().toLowerCase();
	if (search) {
		const haystack = [member.name, member.student_id, member.advisor]
			.filter((value): value is string => Boolean(value))
			.join(" ")
			.toLowerCase();
		if (!haystack.includes(search)) return false;
	}

	if (!matchesValues(state.advisor, member.advisor)) return false;
	if (!matchesValues(state.grade, member.grade)) return false;
	if (!matchesValues(state.cultivation_type, member.cultivation_type)) return false;
	if (!matchesValues(state.enrollment_status, member.enrollment_status)) return false;

	const needAttendance = deriveNeedAttendance(state.need_attendance);
	if (needAttendance !== undefined && member.need_attendance !== needAttendance) {
		return false;
	}
	return true;
}
