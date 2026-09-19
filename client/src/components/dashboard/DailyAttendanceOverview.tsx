"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AttendanceBarChart } from "@/components/attendance/AttendanceBarChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAttendanceOverview } from "@/hooks/useAttendanceOverview";

interface DailyAttendanceOverviewProps {
	semesterId: string;
	/** Week selected on the dashboard; not necessarily the semester's current week. */
	week: number | null;
	/** Bumped by the parent after a sync to force a reload. */
	refreshKey?: number;
}

/** Members shown by name before the list is shortened to 「等 N 人」. */
const NAME_LIMIT = 8;
/** Absence count that marks someone as worth calling out on the dashboard. */
const ABSENT_THRESHOLD = 3;

export function DailyAttendanceOverview({
	semesterId,
	week,
	refreshKey = 0,
}: DailyAttendanceOverviewProps) {
	const { daily, isLoading } = useAttendanceOverview(
		semesterId,
		week ?? undefined,
		refreshKey,
	);

	// Only people worth calling out are charted or named, so the chart and the
	// list below it always agree. The full roster stays on the attendance page.
	const chartRows = daily?.chart ?? [];
	const chartData = chartRows.filter((row) => row.absent >= ABSENT_THRESHOLD);
	const absentNames = chartData.map((row) => row.name);

	return (
		<Card>
			<CardHeader>
				<CardTitle>日常考勤统计</CardTitle>
				<CardDescription>第 {week ?? "-"} 周的缺卡与迟到次数。</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在统计...
					</div>
				) : chartRows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						该周还没有日常考勤数据，请先同步日常考勤。
					</p>
				) : chartData.length === 0 ? (
					<p className="text-sm text-green-600 dark:text-green-400">
						该周没有缺卡 ≥ {ABSENT_THRESHOLD} 次的同学。
					</p>
				) : (
					<>
						<AttendanceBarChart data={chartData} />
						<p className="text-sm text-muted-foreground">
							缺卡 ≥ {ABSENT_THRESHOLD} 次：
							{absentNames.slice(0, NAME_LIMIT).join("、")}
							{absentNames.length > NAME_LIMIT
								? ` 等 ${absentNames.length} 人`
								: ""}
						</p>
					</>
				)}
				<Link
					href="/attendance?tab=daily"
					className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
				>
					查看考勤统计 →
				</Link>
			</CardContent>
		</Card>
	);
}
