"use client";

import { WeeklyReportMissedRow } from "@/lib/schema";

interface WeeklyReportMissedChartProps {
	data: WeeklyReportMissedRow[];
}

/** Plot height in px; the value axis is scaled onto this. */
const PLOT_HEIGHT = 160;
/** Column width in px, matching the name label row below the plot. */
const COLUMN_WIDTH = 40;
/** Gap in px between two neighbouring people. */
const COLUMN_GAP = 6;

/** Round the axis maximum up to a readable step and list the ticks (0..max). */
function buildTicks(maxValue: number): { max: number; ticks: number[] } {
	const target = Math.max(1, maxValue);
	const step =
		[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(
			(candidate) => target / candidate <= 4,
		) ?? 1000;
	const max = Math.ceil(target / step) * step;
	const ticks: number[] = [];
	for (let value = 0; value <= max; value += step) {
		ticks.push(value);
	}
	return { max, ticks };
}

/** A dependency-free bar chart for the accumulated weekly-report misses. */
export function WeeklyReportMissedChart({ data }: WeeklyReportMissedChartProps) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">还没有缺交记录。</p>;
	}

	const maxValue = Math.max(1, ...data.map((item) => item.missed));
	const { max, ticks } = buildTicks(maxValue);

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="relative w-6 shrink-0" style={{ height: PLOT_HEIGHT }}>
					{ticks.map((tick) => (
						<span
							key={tick}
							className="absolute right-0 translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
							style={{ bottom: `${(tick / max) * 100}%` }}
						>
							{tick}
						</span>
					))}
				</div>

				<div className="overflow-x-auto pb-1">
					<div className="w-max min-w-full">
						<div
							className="relative flex items-end"
							style={{ height: PLOT_HEIGHT, gap: COLUMN_GAP }}
						>
							{ticks.map((tick) => (
								<div
									key={tick}
									className="absolute inset-x-0 border-t border-dashed border-border/60"
									style={{ bottom: `${(tick / max) * 100}%` }}
								/>
							))}
							{data.map((item) => (
								<div
									key={item.name}
									className="relative z-10 flex h-full shrink-0 items-end justify-center"
									style={{ width: COLUMN_WIDTH }}
								>
									<div
										className={`w-3 rounded-t ${
											item.never_submitted ? "bg-rose-500" : "bg-amber-500"
										}`}
										style={{ height: `${(item.missed / max) * 100}%` }}
										title={`${item.name} 缺交 ${item.missed} 次`}
									/>
								</div>
							))}
						</div>
						<div className="mt-1 flex" style={{ gap: COLUMN_GAP }}>
							{data.map((item) => (
								<span
									key={item.name}
									className="shrink-0 truncate text-center text-xs text-muted-foreground"
									style={{ width: COLUMN_WIDTH }}
									title={item.name}
								>
									{item.name}
								</span>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="flex gap-4 text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-rose-500" />
					从未提交
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-amber-500" />
					提交过但有缺交
				</span>
			</div>
		</div>
	);
}
