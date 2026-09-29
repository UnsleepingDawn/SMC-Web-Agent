"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { MemberFilterBar } from "@/components/members/MemberFilterBar";
import { SemesterScoreChart } from "@/components/semester-summary/SemesterScoreChart";
import { WeightPanel } from "@/components/semester-summary/WeightPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useMemberFilters } from "@/hooks/useMemberFilters";
import { useSemesterSummary } from "@/hooks/useSemesterSummary";
import { useSemesters } from "@/hooks/useSemesters";
import { formatWeekSpan } from "@/lib/dashboardWeek";
import {
	EMPTY_FILTERS,
	MemberFilterState,
	matchesMemberFilters,
} from "@/lib/memberFilter";
import {
	BOTTOM_RATIO,
	DEFAULT_WEIGHTS,
	METRIC_LABELS,
	MetricWeights,
	formatRate,
	rankRows,
} from "@/lib/semesterScore";
import {
	readSemesterSummaryView,
	writeSemesterSummaryView,
} from "@/lib/semesterSummaryView";
import type { SemesterSummaryRow } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** Mean of the values that are present, or null when there is nothing to average. */
function average(values: number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Pull the non-null rates of one metric out of the rows. */
function ratesOf(
	rows: SemesterSummaryRow[],
	get: (row: SemesterSummaryRow) => number | null,
): number[] {
	return rows
		.map(get)
		.filter((value): value is number => value !== null);
}

function SummaryStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="space-y-1">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="text-2xl font-semibold tabular-nums">{value}</p>
			{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

/** A metric's rate, dimmed when the metric carries no data. */
function Rate({ value }: { value: number | null }) {
	return (
		<span
			className={cn(
				"ml-1 font-medium text-foreground",
				value === null && "text-muted-foreground",
			)}
		>
			{formatRate(value)}
		</span>
	);
}

/**
 * Daily clock-ins. A member with nothing but excused or pending days has no
 * expected days at all, which the cell says outright instead of showing the
 * bare "缺卡 0、迟到 0" that reads like a clean record.
 */
function DailyCell({ daily }: { daily: SemesterSummaryRow["daily"] }) {
	if (daily.expected === 0) {
		const aside = [
			daily.course > 0 ? `上课 ${daily.course}` : null,
			daily.excused > 0 ? `无需打卡 ${daily.excused}` : null,
			daily.pending > 0 ? `尚未打卡 ${daily.pending}` : null,
		].filter((part): part is string => part !== null);
		return (
			<span className="block">
				无日常考勤记录
				{aside.length > 0 ? (
					<span className="block text-[10px] opacity-80">
						仅有：{aside.join("、")}
					</span>
				) : null}
			</span>
		);
	}
	return (
		<span className="block">
			缺卡 {daily.absent}、迟到 {daily.late}
			{daily.course > 0 ? `、上课 ${daily.course}` : ""}
			<Rate value={daily.rate} />
			{daily.excused > 0 || daily.pending > 0 ? (
				<span className="block text-[10px] opacity-80">
					不计入：无需打卡 {daily.excused}
					{daily.pending > 0 ? `、尚未打卡 ${daily.pending}` : ""}
				</span>
			) : null}
		</span>
	);
}

/**
 * Seminar weeks. With no eligible week at all the cell falls back to saying
 * why: either the member has no seminar row whatsoever, meaning nobody ever
 * asked them to attend, or every week was exempted by a course or a leave.
 */
function SeminarCell({ seminar }: { seminar: SemesterSummaryRow["seminar"] }) {
	if (seminar.eligible === 0 && seminar.attended === 0) {
		if (seminar.course === 0 && seminar.leave === 0) {
			return <span className="block">无组会出勤记录</span>;
		}
		const aside = [
			seminar.course > 0 ? `上课 ${seminar.course}` : null,
			seminar.leave > 0 ? `请假 ${seminar.leave}` : null,
		].filter((part): part is string => part !== null);
		return (
			<span className="block">
				应到 0 周
				<span className="block text-[10px] opacity-80">
					全部豁免：{aside.join("、")}
				</span>
			</span>
		);
	}
	return (
		<span className="block">
			实到 {seminar.attended} / 应到 {seminar.eligible}
			{seminar.leave > 0 ? `、请假 ${seminar.leave}` : ""}
			<Rate value={seminar.rate} />
		</span>
	);
}

/** Weekly-report submissions; every week 1..end_week is due a report. */
function ReportCell({ report }: { report: SemesterSummaryRow["weekly_report"] }) {
	return (
		<span className="block">
			提交 {report.submitted} / 应提交 {report.expected}
			<Rate value={report.rate} />
		</span>
	);
}

export default function SemesterSummaryPage() {
	const { semester: currentSemester, isLoading: isSemesterLoading } = useCurrentSemester();
	const { semesters, isLoading: isSemestersLoading } = useSemesters();
	const { filters: filterOptions } = useMemberFilters();

	/** null means "follow the current semester"; reset whenever the list changes. */
	const [semesterId, setSemesterId] = useState<string | null>(null);
	const activeSemesterId = semesterId ?? currentSemester?.id ?? null;

	/** null means "use the server's default end week". */
	const [endWeek, setEndWeek] = useState<number | null>(null);
	const [weights, setWeights] = useState<MetricWeights>(DEFAULT_WEIGHTS);
	const [memberFilters, setMemberFilters] = useState<MemberFilterState>(EMPTY_FILTERS);
	/** Worst first by default: the page exists to surface who needs attention. */
	const [worstFirst, setWorstFirst] = useState(true);
	/** False until the stored view has been applied, so it is not overwritten. */
	const [isViewRestored, setIsViewRestored] = useState(false);

	// The stored view is applied after mount rather than while rendering: reading
	// localStorage during the first render would make the client's markup differ
	// from the server's HTML and break hydration.
	useEffect(() => {
		const stored = readSemesterSummaryView();
		setSemesterId(stored.semesterId);
		setEndWeek(stored.endWeek);
		setWeights(stored.weights);
		setMemberFilters(stored.memberFilters);
		setWorstFirst(stored.worstFirst);
		setIsViewRestored(true);
	}, []);

	// Every later change is remembered, so leaving the page and coming back keeps
	// the same semester, filters, weights and sort direction.
	useEffect(() => {
		if (!isViewRestored) return;
		writeSemesterSummaryView({
			semesterId,
			endWeek,
			weights,
			memberFilters,
			worstFirst,
		});
	}, [isViewRestored, semesterId, endWeek, weights, memberFilters, worstFirst]);

	/** The stored semester, or null when the list no longer holds it. */
	const storedSemesterExists =
		semesterId !== null && semesters.some((item) => item.id === semesterId);

	// A semester deleted in settings would otherwise 404 on every visit, so the
	// request waits for the list rather than guessing. The reset below then drops
	// the dead id and the page follows the current semester again.
	useEffect(() => {
		if (isSemestersLoading || semesterId === null || storedSemesterExists) return;
		setSemesterId(null);
	}, [isSemestersLoading, semesterId, storedSemesterExists]);

	const summarySemesterId =
		semesterId !== null && !storedSemesterExists
			? undefined
			: activeSemesterId ?? undefined;
	/** True while the stored semester is waiting to be validated by the list. */
	const isWaitingForSemesters = summarySemesterId === undefined && semesterId !== null;

	const { summary, isLoading, error, refetch } = useSemesterSummary(
		summarySemesterId,
		endWeek ?? undefined,
	);

	// The server resolves the default end week; showing it back keeps the input
	// honest without seeding state (which would trigger a second request).
	const activeEndWeek = endWeek ?? summary?.end_week ?? null;

	const filteredRows = useMemo(() => {
		if (!summary) return [];
		return summary.rows.filter((row) =>
			matchesMemberFilters(
				{
					name: row.name,
					advisor: row.member?.advisor,
					grade: row.member?.grade,
					cultivation_type: row.member?.cultivation_type,
					enrollment_status: row.member?.enrollment_status,
					student_id: row.member?.student_id,
					need_attendance: row.member?.need_attendance,
				},
				memberFilters,
			),
		);
	}, [summary, memberFilters]);

	const ranked = useMemo(() => rankRows(filteredRows, weights), [filteredRows, weights]);

	const scored = useMemo(
		() => ranked.filter((item) => item.score !== null),
		[ranked],
	);
	const bottomRows = useMemo(() => scored.filter((item) => item.isBottom), [scored]);

	// The chart and the table share one direction switch so they never disagree.
	const chartRows = useMemo(
		() => (worstFirst ? scored : [...scored].reverse()),
		[scored, worstFirst],
	);
	const tableRows = useMemo(
		() => (worstFirst ? ranked : [...ranked].reverse()),
		[ranked, worstFirst],
	);

	const averages = useMemo(
		() => ({
			daily: average(ratesOf(filteredRows, (row) => row.daily.rate)),
			seminar: average(ratesOf(filteredRows, (row) => row.seminar.rate)),
			weekly_report: average(
				ratesOf(filteredRows, (row) => row.weekly_report.rate),
			),
			score: average(scored.map((item) => item.score as number)),
		}),
		[filteredRows, scored],
	);

	/** Weeks with no daily rows yet; the page must say so, or the rates mislead. */
	const dailyMissingWeeks = useMemo(() => {
		if (!summary || activeEndWeek == null) return [];
		const synced = new Set(summary.coverage.daily);
		return Array.from({ length: activeEndWeek }, (_, index) => index + 1).filter(
			(week) => !synced.has(week),
		);
	}, [summary, activeEndWeek]);

	if (isSemesterLoading && !currentSemester) {
		return (
			<div className="mx-auto w-full max-w-6xl px-6 py-8">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载学期...
				</div>
			</div>
		);
	}

	if (!currentSemester) {
		return (
			<div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
				<PageHeader title="学期总结" />
				<EmptyState title="还没有配置学期" description="请先在设置页创建学期。" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
			<PageHeader
				title="学期总结"
				description="汇总整个学期的日常出勤、组会出勤与周报提交，标出需要重点关注的同学。"
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Label htmlFor="summary-semester" className="text-sm whitespace-nowrap">
							学期
						</Label>
						<Select
							value={activeSemesterId ?? undefined}
							onValueChange={(value) => {
								setSemesterId(value);
								setEndWeek(null);
							}}
						>
							<SelectTrigger id="summary-semester" className="w-40">
								<SelectValue placeholder="选择学期" />
							</SelectTrigger>
							<SelectContent>
								{semesters.map((item) => (
									<SelectItem key={item.id} value={item.id}>
										{item.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Label htmlFor="summary-end-week" className="text-sm whitespace-nowrap">
							截止周次
						</Label>
						<Input
							id="summary-end-week"
							type="number"
							min={1}
							max={40}
							value={activeEndWeek ?? ""}
							onChange={(event) => {
								const value = Number(event.target.value);
								// The API rejects anything past week 40; clamping here
								// keeps the input from producing a 422 on its own.
								setEndWeek(value > 0 ? Math.min(40, value) : null);
							}}
							className="w-24"
						/>
						<Button variant="outline" onClick={refetch} disabled={isLoading}>
							{isLoading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 h-4 w-4" />
							)}
							刷新
						</Button>
					</div>
				}
			/>

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			<WeightPanel
				weights={weights}
				onChange={setWeights}
				onReset={() => setWeights(DEFAULT_WEIGHTS)}
			/>

			<MemberFilterBar
				filters={filterOptions}
				value={memberFilters}
				onChange={setMemberFilters}
				trailing={
					<Toggle
						variant="outline"
						pressed={worstFirst}
						onPressedChange={setWorstFirst}
					>
						{worstFirst ? (
							<ArrowUpNarrowWide className="mr-2 h-4 w-4" />
						) : (
							<ArrowDownWideNarrow className="mr-2 h-4 w-4" />
						)}
						{worstFirst ? "表现较弱的在前" : "表现较好的在前"}
					</Toggle>
				}
			/>

			{(isLoading && !summary) || isWaitingForSemesters ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在汇总本学期数据...
				</div>
			) : !summary || summary.rows.length === 0 ? (
				<EmptyState
					title="本学期还没有可统计的数据"
					description="请先在仪表盘或考勤统计页同步日常考勤、组会出勤与周报。统计范围与考勤组一致。"
				/>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>概览</CardTitle>
							<CardDescription>
								统计第 1 至 {activeEndWeek ?? "-"} 周，当前筛选出 {filteredRows.length} 人
								{summary.rows.length !== filteredRows.length
									? `（全部 ${summary.rows.length} 人）`
									: ""}
								；重点关注为得分最低的 {bottomRows.length} 人（后{" "}
								{Math.round(BOTTOM_RATIO * 100)}%）。
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
								<SummaryStat
									label="参与统计人数"
									value={String(filteredRows.length)}
								/>
								<SummaryStat
									label="重点关注人数"
									value={String(bottomRows.length)}
									hint="综合得分最低的一档"
								/>
								<SummaryStat
									label="平均日常出勤率"
									value={formatRate(averages.daily)}
									hint="迟到按半天计"
								/>
								<SummaryStat
									label="平均组会出勤率"
									value={formatRate(averages.seminar)}
									hint="请假与有课的周不计入"
								/>
								<SummaryStat
									label="平均周报提交率"
									value={formatRate(averages.weekly_report)}
								/>
							</div>
							<div className="border-t pt-4">
								<p className="text-xs text-muted-foreground">
									平均综合得分（按当前权重）：{formatRate(averages.score)}
								</p>
							</div>
							<p className="text-xs text-muted-foreground">
								日常考勤已同步 {formatWeekSpan(summary.coverage.daily)}；组会出勤已同步{" "}
								{formatWeekSpan(summary.coverage.seminar)}；周报已同步{" "}
								{formatWeekSpan(summary.coverage.weekly_report)}。
								{dailyMissingWeeks.length > 0
									? `日常考勤还缺少 ${formatWeekSpan(dailyMissingWeeks)} 的数据，这些周不计入应到天数。`
									: ""}
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>综合得分</CardTitle>
							<CardDescription>
								按当前权重加权的得分，红色为后 {Math.round(BOTTOM_RATIO * 100)}%
								需要重点关注的同学。得分只包含有数据的指标。
							</CardDescription>
						</CardHeader>
						<CardContent>
							<SemesterScoreChart data={chartRows} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>明细</CardTitle>
							<CardDescription>
								日常出勤率只统计已同步且有结果的日期，补卡通过算作出勤；组会应到周数不含请假与当周有课的周。
							</CardDescription>
						</CardHeader>
						<CardContent>
							{filteredRows.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									当前筛选条件下没有成员，请调整筛选条件。
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>姓名</TableHead>
											<TableHead>导师</TableHead>
											<TableHead>年级</TableHead>
											<TableHead>{METRIC_LABELS.daily}</TableHead>
											<TableHead>{METRIC_LABELS.seminar}</TableHead>
											<TableHead>{METRIC_LABELS.weekly_report}</TableHead>
											<TableHead>综合得分</TableHead>
											<TableHead>状态</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{tableRows.map((item) => {
											const row = item.row;
											return (
												<TableRow key={row.name}>
													<TableCell className="font-medium">
														{row.name}
														{item.rank ? (
															<span className="ml-2 text-xs text-muted-foreground tabular-nums">
																倒数第 {item.rank} 名
															</span>
														) : null}
													</TableCell>
													<TableCell>{row.member?.advisor || "-"}</TableCell>
													<TableCell>{row.member?.grade || "-"}</TableCell>
													<TableCell
														className="text-xs text-muted-foreground"
														title="出勤率只按正常、迟到、缺卡三类计算；课程豁免、无需打卡与尚未打卡不计入应到天数。"
													>
														<DailyCell daily={row.daily} />
													</TableCell>
													<TableCell
														className="text-xs text-muted-foreground"
														title="应到周数不含请假周与当周组会时段有课的周。"
													>
														<SeminarCell seminar={row.seminar} />
													</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														<ReportCell report={row.weekly_report} />
													</TableCell>
													<TableCell className="tabular-nums">
														{formatRate(item.score)}
													</TableCell>
													<TableCell>
														{item.score === null ? (
															<Badge variant="secondary">数据不足</Badge>
														) : item.isBottom ? (
															<Badge variant="destructive">重点关注</Badge>
														) : (
															<Badge variant="outline">正常</Badge>
														)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</>
			)}

			<p className="text-xs text-muted-foreground">
				成员名单取自该学期自身的数据（日常考勤、组会出勤、周报、组会请假），正在进行的学期另加考勤组在册人员；某个学期里完全没有记录的成员不会出现在表中。组会出勤只对该学期留下过考勤或组会记录的同学判定，不参照今天的考勤组。缺少数据的那一项显示为「—」且不参与加权。改权重与筛选只影响本页展示，不会修改任何数据；这些设置会记住，下次打开仍是同一套。
			</p>
		</div>
	);
}
