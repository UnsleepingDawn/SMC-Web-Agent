"use client";

import { buildTicks } from "@/lib/chartTicks";

/** One person's accumulated misses, shared by the weekly-report and seminar charts. */
export interface MissedBarRow {
	name: string;
	missed: number;
	/** True when the person has never shown up / submitted at all. */
	never: boolean;
}

interface MissedBarChartProps {
	data: MissedBarRow[];
	/** Empty-state copy when nobody has anything to catch up on. */
	emptyText: string;
	/** Action word used in the bar tooltip, e.g. 缺交 / 缺勤. */
	unit: string;
	/** Legend label for the red bars. */
	neverLabel: string;
	/** Legend label for the amber bars. */
	missedLabel: string;
	/** Plot height in px; the value axis is scaled onto this. */
	height?: number;
}

/** Default plot height in px; the value axis is scaled onto this. */
const DEFAULT_PLOT_HEIGHT = 160;
/** Column width in px, matching the name label row below the plot. */
const COLUMN_WIDTH = 40;
/** Gap in px between two neighbouring people. */
const COLUMN_GAP = 6;

/** A dependency-free bar chart for accumulated misses, styled like the attendance chart. */
export function MissedBarChart({
	data,
	emptyText,
	unit,
	neverLabel,
	missedLabel,
	height = DEFAULT_PLOT_HEIGHT,
}: MissedBarChartProps) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyText}</p>;
	}

	const maxValue = Math.max(1, ...data.map((item) => item.missed));
	const { max, ticks } = buildTicks(maxValue);

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="relative w-6 shrink-0" style={{ height }}>
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
							style={{ height, gap: COLUMN_GAP }}
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
											item.never ? "bg-rose-500" : "bg-amber-500"
										}`}
										style={{ height: `${(item.missed / max) * 100}%` }}
										title={`${item.name} ${unit} ${item.missed} 次`}
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
					{neverLabel}
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-amber-500" />
					{missedLabel}
				</span>
			</div>
		</div>
	);
}
