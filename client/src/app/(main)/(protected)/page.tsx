"use client";

import Link from "next/link";
import { Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SemesterOverview } from "@/components/dashboard/SemesterOverview";
import { SeminarOverview } from "@/components/dashboard/SeminarOverview";
import { WeeklyReportOverview } from "@/components/dashboard/WeeklyReportOverview";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useSemesters } from "@/hooks/useSemesters";

export default function DashboardPage() {
	const { semester, currentWeek, isLoading, error, refetch } = useCurrentSemester();
	const { semesters, refetch: refetchSemesters } = useSemesters();

	const refreshAll = () => {
		refetch();
		refetchSemesters();
	};

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-8">
			<PageHeader
				title="仪表盘"
				description="当前学期、本周组会与周报提交进度一览。"
				actions={
					<Button variant="outline" onClick={refreshAll}>
						刷新
					</Button>
				}
			/>

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载...
				</div>
			) : error ? (
				<p className="text-sm text-destructive">{error.message}</p>
			) : !semester ? (
				<EmptyState
					title="还没有配置学期"
					description="创建学期并填写多维表信息后，这里会显示组会与周报的统计。"
					icon={<Settings className="h-6 w-6" />}
					action={
						<Button asChild>
							<Link href="/settings">前往设置</Link>
						</Button>
					}
				/>
			) : (
				<div className="space-y-6">
					<SemesterOverview semester={semester} currentWeek={currentWeek} />
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						<SeminarOverview semesterId={semester.id} currentWeek={currentWeek} />
						<WeeklyReportOverview semesterId={semester.id} currentWeek={currentWeek} />
					</div>
					<SyncPanel
						semesters={semesters}
						defaultSemesterId={semester.id}
						defaultWeek={currentWeek}
						onCompleted={refreshAll}
					/>
				</div>
			)}
		</div>
	);
}
