"use client";

import type { Ref } from "react";
import { PosterBarChart } from "@/components/poster/PosterBarChart";
import { PosterSection } from "@/components/poster/PosterBlocks";
import { BOTTOM_RATIO, METRIC_LABELS, formatRate } from "@/lib/semesterScore";
import type { RankedSemesterRow } from "@/lib/semesterScore";
import {
	type MetricCellText,
	dailyCellText,
	reportCellText,
	seminarCellText,
} from "@/lib/semesterSummaryText";
import type { Semester } from "@/lib/schema";

interface SemesterSummaryPosterProps {
	semester: Semester;
	/** Last week counted; null when the server has not resolved it yet. */
	endWeek: number | null;
	/** Rows in the page table's order, with the page's filters already applied. */
	rows: RankedSemesterRow[];
	/** Scored rows in the page chart's order; unscored members are not charted. */
	chartRows: RankedSemesterRow[];
	generatedAt: Date;
	ref?: Ref<HTMLDivElement>;
}

/* ---------------------------------------------------------------- geometry */

/**
 * The canvas is a fixed width and every size below is an explicit px, so the
 * exported image never depends on the root font size
 * (`html { font-size: 106.25% }`). It is wider than the weekly poster because
 * the detail table carries three metric columns side by side.
 */
const CANVAS_WIDTH = 1240;
const PADDING = 56;
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;
/** Axis column plus the gap between it and the plot, matching `PosterBarChart`. */
const CHART_CHROME_WIDTH = 56 + 12;
const PLOT_WIDTH = CONTENT_WIDTH - CHART_CHROME_WIDTH;

/** Width in px of the poster canvas; the preview scales this down to fit. */
export const SEMESTER_POSTER_WIDTH = CANVAS_WIDTH;

/**
 * The score axis, pinned to the same 0..100% scale and quarter gridlines the
 * page's own score chart uses, so a bar read off the poster means the same
 * thing as a bar read off the page.
 */
const SCORE_AXIS = { max: 100, step: 25 };

/**
 * The detail table's columns, in order. Widths add up to `CONTENT_WIDTH`, and
 * the cells are sized so one metric line fits without wrapping in the common
 * case; a long line wraps rather than overflowing.
 */
const COLUMNS = [
	{ label: "姓名", width: 170 },
	{ label: METRIC_LABELS.daily, width: 258 },
	{ label: METRIC_LABELS.seminar, width: 268 },
	{ label: METRIC_LABELS.weekly_report, width: 300 },
	{ label: "综合得分", width: 132 },
];

/* ---------------------------------------------------------------- helpers */

/** Render a Date as `YYYY-MM-DD HH:MM` in local time. */
function formatGeneratedAt(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

/** One metric cell: the wording on one line, the rate bracketed after it. */
function MetricCell({ text }: { text: MetricCellText }) {
	return (
		<td className="px-[16px] py-[18px] align-top">
			<span className="text-[22px]">{text.primary}</span>
			{text.rate === null ? null : (
				<span className="text-[22px] font-semibold tabular-nums">
					（{formatRate(text.rate)}）
				</span>
			)}
			{text.secondary ? (
				<span className="mt-[4px] block text-[18px] text-muted-foreground">
					{text.secondary}
				</span>
			) : null}
		</td>
	);
}

/* ----------------------------------------------------------------- poster */

/**
 * The exported semester summary: who needs attention, followed by the detail
 * table. Meant to be read on a phone, so the page's two cards are re-laid out
 * rather than screenshotted, and the detail table drops the fields that do not
 * matter for a semester overview (advisor, grade and the status badge).
 *
 * The overview figures are deliberately left out: they are already on the
 * page's overview card, and repeating them here only makes the poster longer.
 * Pure presentation; all data comes in through props, already filtered and
 * ranked by the page.
 */
export function SemesterSummaryPoster({
	semester,
	endWeek,
	rows,
	chartRows,
	generatedAt,
	ref,
}: SemesterSummaryPosterProps) {
	const bottomPercent = Math.round(BOTTOM_RATIO * 100);

	// Only the flagged share is charted, and all of it: a chart cropped to the
	// first N columns would drop flagged people whenever the cut is wider than N,
	// and would pad the chart with unflagged people whenever it is narrower. The
	// axis is a percentage, so the scores are scaled to 0..100 here;
	// `PosterBarChart` prints its values verbatim.
	const chartData = chartRows
		.filter((item) => item.isBottom)
		.map((item) => ({
			name: item.row.name,
			values: [Math.round((item.score ?? 0) * 100)],
		}));

	return (
		<div
			ref={ref}
			className="poster-canvas bg-background text-foreground"
			style={{ width: SEMESTER_POSTER_WIDTH, padding: PADDING }}
		>
			<header className="space-y-[24px] pb-[40px]">
				<div className="flex items-center justify-between">
					<span className="text-[28px] tracking-wide text-muted-foreground">
						SMC-Web-Agent
					</span>
					<span className="text-[28px] text-muted-foreground">{semester.name}</span>
				</div>
				<div className="flex items-end justify-between gap-[24px]">
					<h1 className="text-[68px] leading-none font-bold">学期总结</h1>
					<span className="text-[30px] text-muted-foreground">
						{endWeek ? `第 1 至 ${endWeek} 周 · 共 ${rows.length} 人` : `共 ${rows.length} 人`}
					</span>
				</div>
			</header>

			<div className="space-y-[40px]">
				<PosterSection title="综合得分">
					<div className="space-y-[28px]">
						<p className="text-[28px] leading-snug">
							<span className="font-medium">
								后 {bottomPercent}% 需要重点关注的 {chartData.length} 人：
							</span>
							<span className="text-muted-foreground">
								纵轴与柱上数字为综合得分（0–100%），按当前权重加权；得分只包含有数据的指标。
							</span>
						</p>
						<PosterBarChart
							data={chartData}
							series={[{ className: "bg-rose-500" }]}
							// No cap: every flagged member must fit, otherwise the chart
							// would silently drop exactly the people it exists to show.
							maxColumns={chartData.length}
							// With the whole flagged share on one row the columns are narrow,
							// so the names are set vertically and stay complete.
							labelOrientation="vertical"
							// Pinned to the page chart's scale. Left to the data, the axis
							// would stop at the worst score and a 35% bar would read as a
							// near-perfect one.
							axis={SCORE_AXIS}
							valueSuffix="%"
							legend={[
								{ label: `后 ${bottomPercent}% 重点关注`, className: "bg-rose-500" },
							]}
							emptyText="还没有可计算得分的成员。"
							plotWidth={PLOT_WIDTH}
						/>
					</div>
				</PosterSection>

				<PosterSection title="明细">
					<div className="overflow-hidden rounded-[16px] border border-border">
						<table style={{ width: CONTENT_WIDTH, tableLayout: "fixed" }}>
							<colgroup>
								{COLUMNS.map((column) => (
									<col key={column.label} style={{ width: column.width }} />
								))}
							</colgroup>
							<thead>
								<tr className="bg-secondary">
									{COLUMNS.map((column) => (
										<th
											key={column.label}
											className="px-[16px] py-[20px] text-left text-[26px] font-medium"
										>
											{column.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((item) => (
									<tr key={item.row.name} className="border-t border-border">
										<td className="px-[16px] py-[18px] align-top">
											{/* Kept in step with the page: the bottom share is called out by
											    the name alone, since the poster drops the status column. */}
											<span
												className={
													item.isBottom
														? "inline-block rounded-[8px] bg-rose-500 px-[12px] py-[4px] text-[26px] font-medium text-white"
														: "text-[26px] font-medium"
												}
											>
												{item.row.name}
											</span>
											{item.rank ? (
												<span className="mt-[4px] block text-[20px] tabular-nums text-muted-foreground">
													倒数第 {item.rank} 名
												</span>
											) : null}
										</td>
										<MetricCell text={dailyCellText(item.row.daily)} />
										<MetricCell text={seminarCellText(item.row.seminar)} />
										<MetricCell text={reportCellText(item.row.weekly_report)} />
										<td className="px-[16px] py-[18px] align-top text-[30px] font-bold tabular-nums">
											{formatRate(item.score)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</PosterSection>
			</div>

			<footer className="mt-[40px] border-t border-border pt-[28px] text-[24px] text-muted-foreground">
				本图由 SMC-Web-Agent 于 {formatGeneratedAt(generatedAt)} 生成 · 数据来自飞书同步 ·
				统计范围与权重取导出时的页面设置
			</footer>
		</div>
	);
}
