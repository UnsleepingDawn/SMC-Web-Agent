"use client";

import { buildTicks } from "@/lib/chartTicks";

/** One person's column in a poster chart; `values` is aligned with `series`. */
export interface PosterBarRow {
	name: string;
	/** One value per entry in `series`. */
	values: number[];
	/** Single-series only: draw this row in the highlight color instead. */
	highlight?: boolean;
}

export interface PosterBarSeries {
	/** Tailwind background class for this slot, e.g. `bg-rose-500`. */
	className: string;
}

interface PosterBarChartProps {
	data: PosterBarRow[];
	/** Bar colors, aligned with each row's `values`. */
	series: PosterBarSeries[];
	/**
	 * Legend entries. Kept separate from `series` because a single series can
	 * still need two legend colours (regular vs. highlighted rows).
	 */
	legend: { label: string; className: string }[];
	/** Single-series only: colour used when `row.highlight` is true. */
	highlightClassName?: string;
	/** At most this many people are plotted; the rest collapse into 「等 N 人」. */
	maxColumns?: number;
	emptyText: string;
	/**
	 * Width in px of the plotting area (the axis column and the legend are
	 * outside it). The poster canvas is a fixed width, so this is passed in
	 * rather than measured.
	 */
	plotWidth: number;
	plotHeight?: number;
}

/** Axis label column width in px. */
const AXIS_WIDTH = 56;
const DEFAULT_PLOT_HEIGHT = 300;
const COLUMN_GAP = 6;
/** Columns stop growing past this width, so three people do not get three huge bars. */
const MAX_COLUMN_WIDTH = 96;
/** Widest a bar gets in the single-series and grouped layouts. */
const SINGLE_BAR_MAX_WIDTH = 36;
const GROUPED_BAR_MAX_WIDTH = 28;
/** Gap in px between the two bars of one person. */
const BAR_GAP = 6;
/** Horizontal breathing room inside one column, so bars never touch each other. */
const COLUMN_PADDING = 20;
const MAX_COLUMNS = 10;
/** Headroom in px above the plot for the value labels printed on top of the bars. */
const VALUE_LABEL_SPACE = 38;

/**
 * A dependency-free bar chart laid out for the poster: values are printed on
 * the bars because a PNG cannot be hovered, and every size is an explicit px so
 * the exported image does not depend on the root font size.
 */
export function PosterBarChart({
	data,
	series,
	legend,
	highlightClassName,
	maxColumns = MAX_COLUMNS,
	emptyText,
	plotWidth,
	plotHeight = DEFAULT_PLOT_HEIGHT,
}: PosterBarChartProps) {
	if (data.length === 0) {
		return <p className="text-[28px] text-muted-foreground">{emptyText}</p>;
	}

	const visible = data.slice(0, maxColumns);
	const hiddenCount = data.length - visible.length;
	const maxValue = Math.max(1, ...visible.flatMap((row) => row.values));
	const { max, ticks } = buildTicks(maxValue);

	// Subtract the gaps first, then cap, so the group never overflows `plotWidth`.
	const columnWidth = Math.min(
		MAX_COLUMN_WIDTH,
		(plotWidth - COLUMN_GAP * (visible.length - 1)) / visible.length,
	);
	const usableWidth = columnWidth - COLUMN_PADDING;
	const barWidth =
		series.length > 1
			? Math.max(
					6,
					Math.min(
						GROUPED_BAR_MAX_WIDTH,
						(usableWidth - BAR_GAP * (series.length - 1)) / series.length,
					),
				)
			: Math.max(10, Math.min(SINGLE_BAR_MAX_WIDTH, usableWidth));

	return (
		<div className="space-y-[18px]">
			<div className="flex items-start gap-[12px]">
				<div
					className="relative shrink-0"
					style={{ width: AXIS_WIDTH, height: plotHeight, marginTop: VALUE_LABEL_SPACE }}
				>
					{ticks.map((tick) => (
						<span
							key={tick}
							className="absolute right-0 translate-y-1/2 text-[24px] tabular-nums text-muted-foreground"
							style={{ bottom: `${(tick / max) * 100}%` }}
						>
							{tick}
						</span>
					))}
				</div>

				<div style={{ width: plotWidth, paddingTop: VALUE_LABEL_SPACE }}>
					<div className="relative" style={{ height: plotHeight }}>
						{ticks.map((tick) => (
							<div
								key={tick}
								className="absolute inset-x-0 border-t border-dashed border-border"
								style={{ bottom: `${(tick / max) * 100}%` }}
							/>
						))}
						<div
							className="relative z-10 flex h-full items-end"
							style={{ gap: COLUMN_GAP }}
						>
							{visible.map((row) => (
								<div
									key={row.name}
									className="flex h-full items-end justify-center"
									style={{ width: columnWidth, gap: BAR_GAP }}
								>
									{row.values.map((value, index) => {
										// `series` and `values` are aligned by design; fall back to the
										// first colour rather than crash on a mis-sized row.
										const slot = series[index] ?? series[0];
										const className =
											row.highlight && highlightClassName
												? highlightClassName
												: slot.className;
										const height = `${(value / max) * 100}%`;
										return (
											<div
												key={slot.className + String(index)}
												className="relative h-full"
												style={{ width: barWidth }}
											>
												<div
													className={`absolute bottom-0 w-full rounded-t ${className}`}
													style={{ height }}
												/>
												<span
													className="absolute w-full text-center text-[24px] font-medium tabular-nums text-foreground"
													style={{ bottom: `calc(${height} + 6px)` }}
												>
													{value}
												</span>
											</div>
										);
									})}
								</div>
							))}
						</div>
					</div>
					<div className="mt-[10px] flex" style={{ gap: COLUMN_GAP }}>
						{visible.map((row) => (
							<span
								key={row.name}
								className="shrink-0 truncate text-center text-[28px] text-muted-foreground"
								style={{ width: columnWidth }}
								title={row.name}
							>
								{row.name}
							</span>
						))}
					</div>
				</div>
			</div>

			{hiddenCount > 0 ? (
				<p className="text-[26px] text-muted-foreground">
					等 {hiddenCount} 人（完整数据见系统）
				</p>
			) : null}

			<div className="flex flex-wrap gap-[28px]">
				{legend.map((item) => (
					<span
						key={item.label}
						className="flex items-center gap-[10px] text-[26px] text-muted-foreground"
					>
						<span className={`inline-block h-[22px] w-[22px] rounded ${item.className}`} />
						{item.label}
					</span>
				))}
			</div>
		</div>
	);
}
