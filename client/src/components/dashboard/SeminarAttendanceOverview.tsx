"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { MissedBarChart } from "@/components/common/MissedBarChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAttendanceOverview } from "@/hooks/useAttendanceOverview";
import { useSeminarMissed } from "@/hooks/useSeminarMissed";

interface SeminarAttendanceOverviewProps {
	semesterId: string;
	/** Week selected on the dashboard; not necessarily the semester's current week. */
	week: number | null;
	/** Bumped by the parent after a sync to force a reload. */
	refreshKey?: number;
}

/** Members shown by name before the list is shortened to 「等 N 人」. */
const NAME_LIMIT = 8;

export function SeminarAttendanceOverview({
	semesterId,
	week,
	refreshKey = 0,
}: SeminarAttendanceOverviewProps) {
	const { seminar, isLoading } = useAttendanceOverview(
		semesterId,
		week ?? undefined,
		refreshKey,
	);
	const { summary: missed, isLoading: isMissedLoading } = useSeminarMissed(
		semesterId,
		week ?? undefined,
		refreshKey,
	);

	const absentNames = seminar?.absent ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>组会考勤统计</CardTitle>
				<CardDescription>
					第 {week ?? "-"} 周的组会出勤与累计缺勤次数。
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading || isMissedLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在统计...
					</div>
				) : (
					<>
						<MissedBarChart
							data={(missed?.chart ?? []).map((row) => ({
								name: row.name,
								missed: row.missed,
								never: row.never_attended,
							}))}
							emptyText="还没有缺勤记录。"
							unit="缺勤"
							neverLabel="从未出勤"
							missedLabel="出勤过但有缺勤"
						/>
						{!seminar ? (
							<p className="text-sm text-muted-foreground">
								该周还没有组会考勤数据，请先同步组会考勤。
							</p>
						) : absentNames.length > 0 ? (
							<p className="text-sm text-muted-foreground">
								该周未出勤：
								{absentNames.slice(0, NAME_LIMIT).join("、")}
								{absentNames.length > NAME_LIMIT
									? ` 等 ${absentNames.length} 人`
									: ""}
							</p>
						) : (
							<p className="text-sm text-green-600 dark:text-green-400">
								该周所有人都已出勤。
							</p>
						)}
					</>
				)}
				<Link
					href="/attendance?tab=seminar"
					className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
				>
					查看组会考勤 →
				</Link>
			</CardContent>
		</Card>
	);
}
