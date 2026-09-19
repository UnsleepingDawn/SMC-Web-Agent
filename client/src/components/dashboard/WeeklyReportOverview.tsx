"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";

interface WeeklyReportOverviewProps {
	semesterId: string;
	currentWeek: number | null;
}

export function WeeklyReportOverview({ semesterId, currentWeek }: WeeklyReportOverviewProps) {
	const { stats, isLoading } = useWeeklyReports(currentWeek ?? 0, semesterId);

	const total = stats ? stats.submitted_count + stats.missing_count : 0;
	const percent = total === 0 ? 0 : Math.round(((stats?.submitted_count ?? 0) / total) * 100);

	return (
		<Card>
			<CardHeader>
				<CardTitle>周报提交进度</CardTitle>
				<CardDescription>第 {currentWeek ?? "-"} 周的提交情况。</CardDescription>
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
								本周所有人都已提交周报。
							</p>
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
