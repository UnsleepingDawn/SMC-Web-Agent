"use client";

import { buildTicks } from "@/lib/chartTicks";
import { formatRate } from "@/lib/semesterScore";
import type { RankedSemesterRow } from "@/lib/semesterScore";

interface SemesterScoreChartProps {
	/** Ranked rows, worst first; only scored rows are expected here. */
	data: RankedSemesterRow[];
}

/** Plot height in px; the value axis is scaled onto this. */
const PLOT_HEIGHT = 160;
/** Column width in px, matching the name label row below the plot. */
const COLUMN_WIDTH = 40;
/** Gap in px between two neighbouring people. */
const COLUMN_GAP = 6;

/**
 * A dependency-free bar chart of the weighted score, drawn in the same style as
 * the attendance and missed charts. The y axis is a 0..1 ratio, so the ticks
 * are percentage labels; the bottom share is red and everyone else is neutral.
 */
export function SemesterScoreChart({ data }: SemesterScoreChartProps) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">还没有可计算得分的成员。</p>;
	}

	// The axis always spans 0..100%, so two members' bars stay comparable. A
	// score of 1 fills the plot; the ticks are quarter lines for readability.
	const { max: tickMax, ticks } = buildTicks(4);
	const gridlines = ticks.map((tick) => tick / tickMax);

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="relative w-8 shrink-0" style={{ height: PLOT_HEIGHT }}>
					{gridlines.map((fraction) => (
						<span
							key={fraction}
							className="absolute right-0 translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
							style={{ bottom: `${fraction * 100}%` }}
						>
							{Math.round(fraction * 100)}%
						</span>
					))}
				</div>

				<div className="overflow-x-auto pb-1">
					<div className="w-max min-w-full">
						<div
							className="relative flex items-end"
							style={{ height: PLOT_HEIGHT, gap: COLUMN_GAP }}
						>
							{gridlines.map((fraction) => (
								<div
									key={fraction}
									className="absolute inset-x-0 border-t border-dashed border-border/60"
									style={{ bottom: `${fraction * 100}%` }}
								/>
							))}
							{data.map((item) => (
								<div
									key={item.row.name}
									className="relative z-10 flex h-full shrink-0 items-end justify-center"
									style={{ width: COLUMN_WIDTH }}
								>
									<div
										className={`w-5 rounded-t ${
											item.isBottom ? "bg-rose-500" : "bg-sky-500"
										}`}
										style={{ height: `${(item.score ?? 0) * 100}%` }}
										title={`${item.row.name} 综合得分 ${formatRate(item.score)}（第 ${item.rank} 名）`}
									/>
								</div>
							))}
						</div>
						<div className="mt-1 flex" style={{ gap: COLUMN_GAP }}>
							{data.map((item) => (
								<span
									key={item.row.name}
									className="shrink-0 truncate text-center text-xs text-muted-foreground"
									style={{ width: COLUMN_WIDTH }}
									title={item.row.name}
								>
									{item.row.name}
								</span>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="flex gap-4 text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-rose-500" />
					后 20% 重点关注
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-sky-500" />
					其余成员
				</span>
			</div>
		</div>
	);
}
