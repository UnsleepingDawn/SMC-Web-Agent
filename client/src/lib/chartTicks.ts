/**
 * Shared value-axis helper for the dependency-free bar charts (weekly reports,
 * attendance and the poster). Rounding the axis maximum up to a readable step
 * keeps the dashed gridlines on round numbers instead of the raw data maximum.
 */

/** Readable step sizes, smallest first; the first one that keeps the axis within ~4 steps wins. */
const STEP_CANDIDATES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** Round the axis maximum up to a readable step and list the ticks (0..max). */
export function buildTicks(maxValue: number): { max: number; ticks: number[] } {
	const target = Math.max(1, maxValue);
	const step =
		STEP_CANDIDATES.find((candidate) => target / candidate <= 4) ?? 1000;
	const max = Math.ceil(target / step) * step;
	const ticks: number[] = [];
	for (let value = 0; value <= max; value += step) {
		ticks.push(value);
	}
	return { max, ticks };
}
