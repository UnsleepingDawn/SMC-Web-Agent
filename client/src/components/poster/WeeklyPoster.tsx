"use client";

import type { ReactNode, Ref } from "react";
import { PosterBarChart } from "@/components/poster/PosterBarChart";
import type { PosterDataBundle } from "@/hooks/usePosterData";
import { nextSeminar, weekPeriod } from "@/lib/dashboardWeek";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";

interface WeeklyPosterProps {
	semester: Semester;
	/** Week the statistics show. */
	week: number;
	/** Current semester week, used to resolve the "next seminar" like the dashboard does. */
	currentWeek: number | null;
	data: PosterDataBundle;
	generatedAt: Date;
	ref?: Ref<HTMLDivElement>;
}

/* ---------------------------------------------------------------- geometry */

/**
 * The canvas is a fixed 1080 px wide, so every size below is an explicit px or
 * a percentage of a known width. Nothing here may depend on the root font size
 * (`html { font-size: 106.25% }`) or the exported image would shift with it.
 */
const CANVAS_WIDTH = 1080;
const PADDING = 56;
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;
/** Axis column plus the gap between it and the plot, matching `PosterBarChart`. */
const CHART_CHROME_WIDTH = 56 + 12;
const PLOT_WIDTH = CONTENT_WIDTH - CHART_CHROME_WIDTH;

/** Width in px of the poster canvas; the preview scales this down to fit. */
export const POSTER_WIDTH = CANVAS_WIDTH;

/** People named before a list is shortened to 「等 N 人」. */
const NAME_LIMIT = 10;
/** Absence count that marks someone as worth calling out, matching the dashboard card. */
const ABSENT_THRESHOLD = 3;

/* ---------------------------------------------------------------- helpers */

/** Join names into one line, shortening long lists to 「等 N 人」. */
function formatNameList(names: string[], limit = NAME_LIMIT): string {
	if (names.length === 0) return "无";
	const shown = names.slice(0, limit).join("、");
	return names.length > limit ? `${shown} 等 ${names.length} 人` : shown;
}

/** Render a Date as `YYYY-MM-DD HH:MM` in local time. */
function formatGeneratedAt(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

function PosterSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-[28px] border-t border-border pt-[40px]">
			<h2 className="flex items-center gap-[16px] text-[40px] leading-none font-bold">
				<span className="inline-block h-[36px] w-[8px] rounded bg-foreground" />
				{title}
			</h2>
			{children}
		</section>
	);
}

function StatPill({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: number;
	valueClassName?: string;
}) {
	return (
		<div className="min-w-[180px] rounded-[16px] bg-secondary px-[28px] py-[18px]">
			<p className="text-[26px] text-muted-foreground">{label}</p>
			<p className={`text-[44px] leading-tight font-bold tabular-nums ${valueClassName ?? ""}`}>
				{value}
			</p>
		</div>
	);
}

/* ----------------------------------------------------------------- poster */

/**
 * The exported weekly poster: a fixed-width, always-light long image meant to be
 * read on a phone, so the four dashboard blocks are re-laid out rather than
 * screenshotted. Pure presentation; all data comes in through `data`.
 */
export function WeeklyPoster({
	semester,
	week,
	currentWeek,
	data,
	generatedAt,
	ref,
}: WeeklyPosterProps) {
	const { weeklyStats, weeklyMissed, daily, seminarAttendance, seminarMissed } = data;

	const period = weekPeriod(semester.start_date, week);
	const seminar = nextSeminar(data.seminars, semester, currentWeek ?? week);

	// The poster charts the same people the dashboard card calls out: 缺卡 ≥ 3 only.
	// Sorting by severity first means the ten columns a poster fits are the useful ones.
	const dailyRows = daily?.chart ?? [];
	const dailyChart = dailyRows
		.filter((row) => row.absent >= ABSENT_THRESHOLD)
		.sort((a, b) => b.absent - a.absent || b.late - a.late || a.name.localeCompare(b.name, "zh"));
	const absentNames = dailyChart.map((row) => row.name);

	const weeklyTotal = weeklyStats?.total_count ?? 0;
	const weeklyPercent =
		weeklyTotal === 0
			? 0
			: Math.round(((weeklyStats?.submitted_count ?? 0) / weeklyTotal) * 100);

	return (
		<div
			ref={ref}
			className="poster-canvas bg-background text-foreground"
			style={{ width: POSTER_WIDTH, padding: PADDING }}
		>
			<header className="space-y-[24px] pb-[40px]">
				<div className="flex items-center justify-between">
					<span className="text-[28px] tracking-wide text-muted-foreground">
						SMC-Web-Agent
					</span>
					<span className="text-[28px] text-muted-foreground">{semester.name}</span>
				</div>
				<div className="flex items-end justify-between gap-[24px]">
					<h1 className="text-[68px] leading-none font-bold">第 {week} 周统计</h1>
					<span className="text-[30px] text-muted-foreground">
						{period ? `${period.start} ~ ${period.end}` : ""}
					</span>
				</div>
			</header>

			<div className="space-y-[40px]">
				<PosterSection title="组会信息">
					{!seminar ? (
						<p className="text-[30px] text-muted-foreground">暂无后续组会安排。</p>
					) : (
						<div className="space-y-[28px]">
							<p className="text-[30px] text-muted-foreground">
								第 {seminar.week} 周 · {WEEKDAY_NAMES[seminar.weekday - 1] ?? ""}
								{seminar.room ? ` · ${seminar.room}` : ""}
							</p>
							<ul className="space-y-[24px]">
								{seminar.presentations.map((presentation) => (
									<li
										key={presentation.track}
										className="space-y-[10px] border-l-[6px] border-border pl-[22px]"
									>
										<p className="text-[26px] text-muted-foreground">
											Track {presentation.track} · {presentation.presenter_name}
										</p>
										<p className="text-[34px] leading-snug font-medium">
											{presentation.title}
										</p>
									</li>
								))}
							</ul>
						</div>
					)}
				</PosterSection>

				<PosterSection title="周报提交进度">
					<div className="space-y-[28px]">
						<div className="flex items-end justify-between gap-[24px]">
							<div className="flex items-baseline gap-[14px]">
								<span className="text-[64px] leading-none font-bold tabular-nums">
									{weeklyStats?.submitted_count ?? 0}
								</span>
								<span className="text-[30px] text-muted-foreground">
									/ {weeklyTotal} 人已提交
								</span>
							</div>
							<span className="text-[44px] font-bold tabular-nums">{weeklyPercent}%</span>
						</div>

						<div className="h-[22px] w-full overflow-hidden rounded-full bg-secondary">
							<div
								className="h-full rounded-full bg-emerald-500"
								style={{ width: `${weeklyPercent}%` }}
							/>
						</div>

						<p className="text-[28px] leading-snug">
							<span className="font-medium">未提交：</span>
							<span className="text-muted-foreground">
								{formatNameList((weeklyStats?.missing ?? []).map((member) => member.name))}
							</span>
						</p>

						<div className="space-y-[16px] border-t border-border pt-[28px]">
							<p className="text-[30px] font-medium">缺交次数</p>
							<PosterBarChart
								data={(weeklyMissed?.chart ?? []).map((row) => ({
									name: row.name,
									values: [row.missed],
									highlight: row.never_submitted,
								}))}
								series={[{ className: "bg-amber-500" }]}
								highlightClassName="bg-rose-500"
								legend={[
									{ label: "从未提交", className: "bg-rose-500" },
									{ label: "提交过但有缺交", className: "bg-amber-500" },
								]}
								emptyText="还没有缺交记录。"
								plotWidth={PLOT_WIDTH}
							/>
						</div>
					</div>
				</PosterSection>

				<PosterSection title="日常考勤统计">
					<div className="space-y-[28px]">
						{dailyRows.length === 0 ? (
							<p className="text-[30px] text-muted-foreground">
								该周还没有日常考勤数据，请先同步日常考勤。
							</p>
						) : dailyChart.length === 0 ? (
							<p className="text-[30px] text-muted-foreground">
								该周没有缺卡 ≥ {ABSENT_THRESHOLD} 次的同学。
							</p>
						) : (
							<>
								<p className="text-[28px] leading-snug">
									<span className="font-medium">缺卡 ≥ {ABSENT_THRESHOLD} 次：</span>
									<span className="text-muted-foreground">
										{formatNameList(absentNames)}
									</span>
								</p>
								<PosterBarChart
									data={dailyChart.map((row) => ({
										name: row.name,
										values: [row.absent, row.late],
									}))}
									series={[{ className: "bg-rose-500" }, { className: "bg-amber-500" }]}
									legend={[
										{ label: "缺卡", className: "bg-rose-500" },
										{ label: "迟到", className: "bg-amber-500" },
									]}
									emptyText="该周没有缺卡 ≥ 3 次的同学。"
									plotWidth={PLOT_WIDTH}
								/>
							</>
						)}
					</div>
				</PosterSection>

				<PosterSection title="组会考勤统计">
					<div className="space-y-[28px]">
						{seminarAttendance ? (
							<>
								<div className="flex flex-wrap gap-[18px]">
									<StatPill label="应到" value={seminarAttendance.expected.length} />
									<StatPill
										label="已出勤"
										value={seminarAttendance.attended.length}
										valueClassName="text-emerald-600"
									/>
									<StatPill
										label="未出勤"
										value={seminarAttendance.absent.length}
										valueClassName={seminarAttendance.absent.length ? "text-rose-600" : ""}
									/>
									<StatPill label="请假" value={seminarAttendance.leave.length} />
								</div>
								<p className="text-[28px] leading-snug">
									<span className="font-medium">本周未出勤：</span>
									<span className="text-muted-foreground">
										{formatNameList(seminarAttendance.absent)}
									</span>
								</p>
							</>
						) : (
							<p className="text-[30px] text-muted-foreground">
								该周还没有组会考勤数据，请先同步组会考勤。
							</p>
						)}

						<div className="space-y-[16px] border-t border-border pt-[28px]">
							<p className="text-[30px] font-medium">缺勤次数</p>
							<PosterBarChart
								data={(seminarMissed?.chart ?? []).map((row) => ({
									name: row.name,
									values: [row.missed],
									highlight: row.never_attended,
								}))}
								series={[{ className: "bg-amber-500" }]}
								highlightClassName="bg-rose-500"
								legend={[
									{ label: "从未出勤", className: "bg-rose-500" },
									{ label: "出勤过但有缺勤", className: "bg-amber-500" },
								]}
								emptyText="还没有缺勤记录。"
								plotWidth={PLOT_WIDTH}
							/>
						</div>
					</div>
				</PosterSection>
			</div>

			<footer className="mt-[40px] border-t border-border pt-[28px] text-[24px] text-muted-foreground">
				本图由 SMC-Web-Agent 于 {formatGeneratedAt(generatedAt)} 生成 · 数据来自飞书同步
			</footer>
		</div>
	);
}
