/**
 * Weighting, ranking and the bottom-share cut for the semester summary.
 *
 * Kept as plain functions so the semantics live in exactly one place and the
 * page stays a thin view: it owns the weight inputs, this file owns the math.
 * Everything here is synchronous, so moving a slider re-ranks without a request.
 */

import type { SemesterSummaryRow } from "@/lib/schema";

/** The three metrics a member is scored on. */
export type MetricKey = "daily" | "seminar" | "weekly_report";

export const METRIC_KEYS: MetricKey[] = ["daily", "seminar", "weekly_report"];

export const METRIC_LABELS: Record<MetricKey, string> = {
	daily: "日常出勤",
	seminar: "组会出勤",
	weekly_report: "周报提交",
};

/** Weights are percentages, but only their ratio matters. */
export type MetricWeights = Record<MetricKey, number>;

/** Clock-in problems hurt more than a late report, so they lead the defaults. */
export const DEFAULT_WEIGHTS: MetricWeights = {
	daily: 40,
	seminar: 40,
	weekly_report: 20,
};

/** Share of the roster flagged as needing attention. */
export const BOTTOM_RATIO = 0.2;

/** The rate a metric contributes, or null when the metric has no data. */
function rateFor(row: SemesterSummaryRow, key: MetricKey): number | null {
	if (key === "daily") return row.daily.rate;
	if (key === "seminar") return row.seminar.rate;
	return row.weekly_report.rate;
}

/**
 * Weighted mean of the metrics that actually have data.
 *
 * A metric with no data is dropped rather than counted as zero, so someone who
 * never had a seminar is not punished for it; the remaining weights are
 * renormalised. Returns null when no weighted metric is available at all.
 */
export function computeScore(
	row: SemesterSummaryRow,
	weights: MetricWeights,
): number | null {
	let weighted = 0;
	let total = 0;
	for (const key of METRIC_KEYS) {
		const weight = weights[key];
		const rate = rateFor(row, key);
		if (weight <= 0 || rate === null) continue;
		weighted += weight * rate;
		total += weight;
	}
	if (total <= 0) return null;
	return weighted / total;
}

export interface RankedSemesterRow {
	row: SemesterSummaryRow;
	/** null when no metric had data, i.e. the member cannot be scored. */
	score: number | null;
	/** 1 is the lowest score; null for unscored rows. */
	rank: number | null;
	/** True for the bottom share of the scored rows. */
	isBottom: boolean;
}

/**
 * Score every row, order them worst first, and mark the bottom share.
 *
 * Ties break on the name so the same data always produces the same order, and
 * the cut is `ceil` so a small roster still flags at least one member. Rows
 * without enough data are kept at the end and never marked.
 */
export function rankRows(
	rows: SemesterSummaryRow[],
	weights: MetricWeights,
	ratio: number = BOTTOM_RATIO,
): RankedSemesterRow[] {
	const scored: { row: SemesterSummaryRow; score: number }[] = [];
	const unscored: SemesterSummaryRow[] = [];

	for (const row of rows) {
		const score = computeScore(row, weights);
		if (score === null) unscored.push(row);
		else scored.push({ row, score });
	}

	scored.sort((a, b) => a.score - b.score || a.row.name.localeCompare(b.row.name));
	unscored.sort((a, b) => a.name.localeCompare(b.name));

	const bottomCount = Math.min(
		scored.length,
		Math.max(1, Math.ceil(scored.length * ratio)),
	);

	return [
		...scored.map((entry, index) => ({
			row: entry.row,
			score: entry.score,
			rank: index + 1,
			isBottom: index < bottomCount,
		})),
		...unscored.map((row) => ({
			row,
			score: null,
			rank: null,
			isBottom: false,
		})),
	];
}

/** How many people the bottom cut holds for a given roster size. */
export function bottomCount(size: number, ratio: number = BOTTOM_RATIO): number {
	if (size <= 0) return 0;
	return Math.min(size, Math.max(1, Math.ceil(size * ratio)));
}

/** Render a 0..1 rate as a whole percentage, or a dash when there is no data. */
export function formatRate(rate: number | null): string {
	if (rate === null) return "—";
	return `${Math.round(rate * 100)}%`;
}
