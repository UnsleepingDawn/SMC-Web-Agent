"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { SeminarCard } from "@/components/seminars/SeminarCard";
import { SeminarEditorDialog } from "@/components/seminars/SeminarEditorDialog";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useSeminars } from "@/hooks/useSeminars";
import { useSemesters } from "@/hooks/useSemesters";
import { Seminar } from "@/lib/schema";

export default function SeminarsPage() {
	const { semester, currentWeek } = useCurrentSemester();
	const { semesters } = useSemesters();
	const { seminars, isLoading, error, refetch } = useSeminars(semester?.id);
	const [editing, setEditing] = useState<Seminar | null>(null);
	const [weekFilter, setWeekFilter] = useState("__all__");

	const weeks = useMemo(
		() => Array.from(new Set(seminars.map((item) => item.week))).sort((a, b) => a - b),
		[seminars],
	);

	const visible = useMemo(
		() =>
			weekFilter === "__all__"
				? seminars
				: seminars.filter((item) => String(item.week) === weekFilter),
		[seminars, weekFilter],
	);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
			<PageHeader
				title="组会管理"
				description="按周次查看与编辑报告安排，渲染并推送飞书预告。"
				actions={
					<div className="w-40">
						<Select value={weekFilter} onValueChange={setWeekFilter}>
							<SelectTrigger>
								<SelectValue placeholder="全部周次" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__all__">全部周次</SelectItem>
								{weeks.map((week) => (
									<SelectItem key={week} value={String(week)}>
										第 {week} 周
										{week === currentWeek ? "（本周）" : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				}
			/>

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载组会安排...
				</div>
			) : visible.length === 0 ? (
				<EmptyState
					title="还没有组会安排"
					description="先同步飞书组会表，或在下方提交一次「组会安排」同步任务。"
				/>
			) : (
				<div className="space-y-6">
					{visible.map((seminar) => (
						<SeminarCard
							key={seminar.id}
							seminar={seminar}
							onEdit={setEditing}
							onChanged={refetch}
						/>
					))}
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>推送记录</CardTitle>
					<CardDescription>每次推送都会记录在「推送历史」页面，可追踪成功与失败。</CardDescription>
				</CardHeader>
				<CardContent>
					<SyncPanel
						semesters={semesters}
						defaultSemesterId={semester?.id}
						defaultWeek={currentWeek}
						onCompleted={refetch}
					/>
				</CardContent>
			</Card>

			<SeminarEditorDialog
				seminar={editing}
				open={editing !== null}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={refetch}
			/>
		</div>
	);
}
