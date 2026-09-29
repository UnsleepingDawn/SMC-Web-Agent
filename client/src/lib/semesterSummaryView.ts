/**
 * The semester summary's view state, remembered across visits.
 *
 * Picking a semester, ticking filters, dragging the weight inputs and flipping
 * the sort direction are display preferences: leaving the page would drop them,
 * so they live in the browser instead of the database. Every field is validated
 * on the way out, so a blob written by an older build (or edited by hand) falls
 * back to its default instead of breaking the page.
 */

import { EMPTY_FILTERS, MemberFilterState } from "@/lib/memberFilter";
import { DEFAULT_WEIGHTS, METRIC_KEYS, MetricWeights } from "@/lib/semesterScore";

const STORAGE_KEY = "smc:semester-summary-view";

/** The whole view state, exactly as the page holds it. */
export interface SemesterSummaryViewState {
	/** null follows the current semester. */
	semesterId: string | null;
	/** null uses the server's default end week. */
	endWeek: number | null;
	weights: MetricWeights;
	memberFilters: MemberFilterState;
	/** True lists the weakest members first. */
	worstFirst: boolean;
}

export const DEFAULT_VIEW_STATE: SemesterSummaryViewState = {
	semesterId: null,
	endWeek: null,
	weights: DEFAULT_WEIGHTS,
	memberFilters: EMPTY_FILTERS,
	worstFirst: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** A list of filter values, or null when the stored value is not one. */
function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
		return null;
	}
	return value;
}

function readWeights(value: unknown): MetricWeights {
	const weights = { ...DEFAULT_WEIGHTS };
	if (!isRecord(value)) return weights;
	for (const key of METRIC_KEYS) {
		const candidate = value[key];
		// A negative or non-finite weight would make the score meaningless, so
		// that field keeps its default rather than the stored value.
		if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
			weights[key] = candidate;
		}
	}
	return weights;
}

function readFilters(value: unknown): MemberFilterState {
	if (!isRecord(value)) return { ...EMPTY_FILTERS };
	return {
		search: typeof value.search === "string" ? value.search : "",
		advisor: asStringArray(value.advisor) ?? [],
		grade: asStringArray(value.grade) ?? [],
		cultivation_type: asStringArray(value.cultivation_type) ?? [],
		enrollment_status: asStringArray(value.enrollment_status) ?? [],
		need_attendance: asStringArray(value.need_attendance) ?? [],
	};
}

/** The API rejects anything past week 40, so the stored value must respect it. */
function readEndWeek(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	return value >= 1 && value <= 40 ? value : null;
}

/** The stored state, with every unrecognised field replaced by its default. */
export function readSemesterSummaryView(): SemesterSummaryViewState {
	if (typeof window === "undefined") return DEFAULT_VIEW_STATE;

	let parsed: unknown;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_VIEW_STATE;
		parsed = JSON.parse(raw);
	} catch {
		return DEFAULT_VIEW_STATE;
	}
	if (!isRecord(parsed)) return DEFAULT_VIEW_STATE;

	return {
		semesterId:
			typeof parsed.semesterId === "string" && parsed.semesterId
				? parsed.semesterId
				: null,
		endWeek: readEndWeek(parsed.endWeek),
		weights: readWeights(parsed.weights),
		memberFilters: readFilters(parsed.memberFilters),
		worstFirst: typeof parsed.worstFirst === "boolean" ? parsed.worstFirst : true,
	};
}

export function writeSemesterSummaryView(state: SemesterSummaryViewState): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Private mode or a full quota: the view still works for this visit.
	}
}
