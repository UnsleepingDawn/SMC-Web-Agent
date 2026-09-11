"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
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
import { StatusBadge } from "@/components/common/StatusBadge";
import { getSyncRun, startSync } from "@/lib/api";
import { JobStatus, Semester, SyncRun, SyncTask } from "@/lib/schema";
import { toast } from "sonner";

const TASK_LABELS: Record<SyncTask, string> = {
	members: "人员主数据（通讯录 + 组会表）",
	seminars: "组会安排",
	weekly_reports: "周报记录",
	attendance_group: "考勤组名单",
	daily_attendance: "日常考勤（本周打卡）",
	seminar_attendance: "组会考勤（打卡流水）",
	seminar_leaves: "组会请假",
	schedule: "课表",
};

const ALL_TASKS = Object.keys(TASK_LABELS) as SyncTask[];

/** Sentinel option that submits every offered task in sequence. */
export const SYNC_ALL = "__all__";
type TaskChoice = SyncTask | typeof SYNC_ALL;

// Tasks that operate on a single week and therefore show the week input.
const WEEK_TASKS: SyncTask[] = [
	"weekly_reports",
	"daily_attendance",
	"seminar_attendance",
	"seminar_leaves",
];

interface SyncPanelProps {
	semesters: Semester[];
	defaultSemesterId?: string;
	defaultWeek?: number | null;
	onCompleted?: () => void;
	/** Tasks offered in the dropdown; defaults to every task. */
	tasks?: SyncTask[];
	/** Task selected on first render; defaults to the first offered task. */
	defaultTask?: TaskChoice;
	/** Offer an "全部内容" option that submits every offered task. */
	allowSyncAll?: boolean;
}

export function SyncPanel({
	semesters,
	defaultSemesterId,
	defaultWeek,
	onCompleted,
	tasks,
	defaultTask,
	allowSyncAll = false,
}: SyncPanelProps) {
	const availableTasks = tasks ?? ALL_TASKS;
	const [task, setTask] = useState<TaskChoice>(defaultTask ?? availableTasks[0] ?? "members");
	const [semesterId, setSemesterId] = useState(defaultSemesterId ?? "");
	const [week, setWeek] = useState(String(defaultWeek ?? 1));
	const [runs, setRuns] = useState<SyncRun[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const notifiedRef = useRef(false);

	useEffect(() => {
		if (!semesterId && defaultSemesterId) setSemesterId(defaultSemesterId);
	}, [defaultSemesterId, semesterId]);

	useEffect(() => {
		if (defaultWeek) setWeek(String(defaultWeek));
	}, [defaultWeek]);

	// Any task in the selection needs the week input when submitted in bulk.
	const needsWeek = task === SYNC_ALL || WEEK_TASKS.includes(task as SyncTask);

	// Poll the batch while it is queued or executing.
	useEffect(() => {
		const pending = runs.filter(
			(item) => item.status !== "completed" && item.status !== "failed",
		);
		if (pending.length === 0) return;
		const timer = setInterval(async () => {
			const refreshed = await Promise.all(
				runs.map(async (item) => {
					if (item.status === "completed" || item.status === "failed") return item;
					try {
						const response = await getSyncRun(item.id);
						return response.run;
					} catch (error) {
						console.error("轮询同步状态失败", error);
						return item;
					}
				}),
			);
			setRuns(refreshed);
		}, 2000);
		return () => clearInterval(timer);
	}, [runs]);

	// Announce once the whole batch settles.
	useEffect(() => {
		if (runs.length === 0 || notifiedRef.current) return;
		const settled = runs.every(
			(item) => item.status === "completed" || item.status === "failed",
		);
		if (!settled) return;
		notifiedRef.current = true;
		const failed = runs.filter((item) => item.status === "failed");
		if (failed.length > 0) {
			toast.error(failed[0].error || `有 ${failed.length} 个同步任务失败。`);
		} else {
			toast.success("飞书同步已完成。");
		}
		onCompleted?.();
	}, [runs, onCompleted]);

	const submit = useCallback(async () => {
		if (!semesterId) {
			toast.error("请先选择学期。");
			return;
		}
		const targets: SyncTask[] = task === SYNC_ALL ? availableTasks : [task];
		const created: SyncRun[] = [];
		setIsSubmitting(true);
		try {
			for (const target of targets) {
				const response = await startSync({
					task: target,
					semester_id: semesterId,
					week: WEEK_TASKS.includes(target) ? Number(week) : undefined,
				});
				created.push({
					id: response.run_id,
					job_id: response.job_id,
					task_name: target,
					semester_id: semesterId,
					week: WEEK_TASKS.includes(target) ? Number(week) : null,
					status: "running",
					error: null,
					payload: {},
					started_at: null,
					completed_at: null,
					created_at: null,
				});
			}
			notifiedRef.current = false;
			setRuns(created);
			toast.success(
				created.length > 1
					? `已提交 ${created.length} 个同步任务，正在后台执行。`
					: "已提交同步任务，正在后台执行。",
			);
		} catch (error) {
			if (created.length > 0) {
				notifiedRef.current = false;
				setRuns([...created]);
				toast.error(
					`已提交 ${created.length} 个任务，后续提交失败：${error instanceof Error ? error.message : "未知错误"}`,
				);
			} else {
				toast.error(error instanceof Error ? error.message : "提交同步任务失败。");
			}
		} finally {
			setIsSubmitting(false);
		}
	}, [task, semesterId, week, availableTasks]);

	const settledCount = runs.filter(
		(item) => item.status === "completed" || item.status === "failed",
	).length;
	const failedRun = runs.find((item) => item.status === "failed");
	const overallStatus: JobStatus = failedRun
		? "failed"
		: runs.length > 0 && settledCount === runs.length
			? "completed"
			: runs.some((item) => item.status === "running")
				? "running"
				: "pending";

	return (
		<Card>
			<CardHeader>
				<CardTitle>飞书同步</CardTitle>
				<CardDescription>同步在后台 Celery 任务中执行，可离开页面稍后回来查看。</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label>同步内容</Label>
						<Select value={task} onValueChange={(value) => setTask(value as TaskChoice)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{allowSyncAll ? <SelectItem value={SYNC_ALL}>全部内容</SelectItem> : null}
								{availableTasks.map((key) => (
									<SelectItem key={key} value={key}>
										{TASK_LABELS[key]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>学期</Label>
						<Select value={semesterId} onValueChange={setSemesterId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="选择学期" />
							</SelectTrigger>
							<SelectContent>
								{semesters.map((semester) => (
									<SelectItem key={semester.id} value={semester.id}>
										{semester.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{needsWeek ? (
						<div className="space-y-2">
							<Label>周次</Label>
							<Input
								type="number"
								min={1}
								value={week}
								onChange={(event) => setWeek(event.target.value)}
							/>
						</div>
					) : null}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Button onClick={submit} disabled={isSubmitting || !semesterId}>
						{isSubmitting ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 h-4 w-4" />
						)}
						开始同步
					</Button>
					{runs.length > 0 ? (
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<StatusBadge status={overallStatus} />
							{runs.length > 1 ? (
								<span>
									已完成 {settledCount}/{runs.length}
								</span>
							) : null}
							{failedRun?.error ? (
								<span className="text-destructive">{failedRun.error}</span>
							) : null}
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
