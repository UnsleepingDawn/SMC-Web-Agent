"use client";

import { buildTicks } from "@/lib/chartTicks";

interface AttendanceBarChartProps {
	data: { name: string; absent: number; late: number }[];
}

/** Plot height in px; the value axis is scaled onto this. */
const PLOT_HEIGHT = 160;
/** Column width in px, matching the name label row below the plot. */
const COLUMN_WIDTH = 40;
/** Gap in px between two neighbouring people; kept slightly wider than BAR_GAP. */
const COLUMN_GAP = 6;
/** Gap in px between the two bars of one person. */
const BAR_GAP = 4;

/** A dependency-free grouped bar chart for the weekly attendance counts. */
export function AttendanceBarChart({ data }: AttendanceBarChartProps) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">本周没有考勤记录。</p>;
	}

	const maxValue = Math.max(
		1,
		...data.map((item) => Math.max(item.absent, item.late)),
	);
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
									style={{ width: COLUMN_WIDTH, gap: BAR_GAP }}
								>
									<div
										className="w-4 rounded-t bg-rose-500"
										style={{ height: `${(item.absent / max) * 100}%` }}
										title={`缺卡 ${item.absent}`}
									/>
									<div
										className="w-4 rounded-t bg-amber-500"
										style={{ height: `${(item.late / max) * 100}%` }}
										title={`迟到 ${item.late}`}
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
					缺卡
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-amber-500" />
					迟到
				</span>
			</div>
		</div>
	);
}
