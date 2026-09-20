"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MissedBarChart } from "@/components/common/MissedBarChart";
import { useWeeklyReportMissed } from "@/hooks/useWeeklyReportMissed";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";

interface WeeklyReportOverviewProps {
	semesterId: string;
	/** Week selected on the dashboard; not necessarily the semester's current week. */
	week: number | null;
	/** Bumped by the parent after a sync to force a reload. */
	refreshKey?: number;
}

export function WeeklyReportOverview({
	semesterId,
	week,
	refreshKey = 0,
}: WeeklyReportOverviewProps) {
	const { stats, isLoading } = useWeeklyReports(week ?? 0, semesterId, refreshKey);
	const { summary: missed, isLoading: isMissedLoading } = useWeeklyReportMissed(
		week ?? 0,
		semesterId,
		refreshKey,
	);

	const total = stats?.total_count ?? 0;
	const percent = total === 0 ? 0 : Math.round(((stats?.submitted_count ?? 0) / total) * 100);

	return (
		<Card>
			<CardHeader>
				<CardTitle>周报提交进度</CardTitle>
				<CardDescription>第 {week ?? "-"} 周的提交情况。</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在统计...
					</div>
				) : !stats ? (
					<p className="text-sm text-muted-foreground">暂无可统计的数据。</p>
				) : (
					<div className="space-y-4">
						<div className="flex items-baseline gap-2">
							<span className="text-2xl font-bold">{stats.submitted_count}</span>
							<span className="text-sm text-muted-foreground">
								/ {total} 人已提交
							</span>
						</div>
						<Progress value={percent} />
						{stats.missing_count > 0 ? (
							<p className="text-sm text-muted-foreground">
								未提交：
								{stats.missing
									.slice(0, 8)
									.map((member) => member.name)
									.join("、")}
								{stats.missing_count > 8 ? ` 等 ${stats.missing_count} 人` : ""}
							</p>
						) : (
							<p className="text-sm text-green-600 dark:text-green-400">
								该周所有人都已提交周报。
							</p>
						)}
						{isMissedLoading ? (
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								正在统计缺交次数...
							</div>
						) : (
							<MissedBarChart
								height={72}
								data={(missed?.chart ?? []).map((row) => ({
									name: row.name,
									missed: row.missed,
									never: row.never_submitted,
								}))}
								emptyText="还没有缺交记录。"
								unit="缺交"
								neverLabel="从未提交"
								missedLabel="提交过但有缺交"
							/>
						)}
						<Link
							href="/weekly-reports"
							className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
						>
							查看周报统计 →
						</Link>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
