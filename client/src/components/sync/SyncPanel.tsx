"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getSyncRun, getSyncRuns, startSync } from "@/lib/api";
import { syncWeekOptions } from "@/lib/dashboardWeek";
import { JobStatus, Semester, SyncRun, SyncTask } from "@/lib/schema";
import { toast } from "sonner";

const TASK_LABELS: Record<SyncTask, string> = {
	members: "人员主数据（通讯录 + 组会表）",
	seminars: "组会安排",
	weekly_reports: "周报记录",
	attendance_group: "考勤组名单",
	daily_attendance: "日常考勤（打卡）",
	seminar_attendance: "组会考勤（打卡流水）",
	seminar_leaves: "组会请假",
	schedule: "课表",
};

const ALL_TASKS = Object.keys(TASK_LABELS) as SyncTask[];

/** Sentinel option that submits every offered task in sequence ("同步以下所有内容"). */
export const SYNC_ALL = "__all__";
type TaskChoice = SyncTask | typeof SYNC_ALL;

// Tasks that operate on a single week and therefore show the week picker.
const WEEK_TASKS: SyncTask[] = [
	"weekly_reports",
	"daily_attendance",
	"seminar_attendance",
	"seminar_leaves",
];

/** Sentinel week option that fans a task out over every week of the semester. */
export const WEEK_ALL = "__all_weeks__";

interface SyncPanelProps {
	semesters: Semester[];
	defaultSemesterId?: string;
	defaultWeek?: number | null;
	onCompleted?: () => void;
	/** Tasks offered in the dropdown; defaults to every task. */
	tasks?: SyncTask[];
	/** Task selected on first render; defaults to the first offered task. */
	defaultTask?: TaskChoice;
	/** Offer a "同步以下所有内容" option that submits every offered task. */
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
	// A week number as a string, or WEEK_ALL for "every week of the semester".
	const [weekChoice, setWeekChoice] = useState(String(defaultWeek ?? 1));
	const [runs, setRuns] = useState<SyncRun[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const notifiedRef = useRef(false);

	useEffect(() => {
		if (!semesterId && defaultSemesterId) setSemesterId(defaultSemesterId);
	}, [defaultSemesterId, semesterId]);

	useEffect(() => {
		if (defaultWeek) setWeekChoice(String(defaultWeek));
	}, [defaultWeek]);

	// Only show the week picker when the selection actually needs a week.
	const bulkNeedsWeek = availableTasks.some((item) => WEEK_TASKS.includes(item));
	const needsWeek =
		task === SYNC_ALL ? bulkNeedsWeek : WEEK_TASKS.includes(task as SyncTask);

	// Week candidates come from the selected semester, not from the page's own
	// week: a sync can cover a past semester the page is not showing.
	const selectedSemester = useMemo(
		() => semesters.find((item) => item.id === semesterId) ?? null,
		[semesters, semesterId],
	);
	const weekOptions = useMemo(
		() => (selectedSemester ? syncWeekOptions(selectedSemester) : []),
		[selectedSemester],
	);

	// Switching semester (or a default week from a longer term) can leave the
	// picked week outside the new range; fall back to the default or the newest
	// week. An explicit "全部周数" is always valid and never overridden here.
	useEffect(() => {
		if (weekChoice === WEEK_ALL || weekOptions.length === 0) return;
		const picked = Number(weekChoice);
		if (weekOptions.includes(picked)) return;
		setWeekChoice(
			defaultWeek && weekOptions.includes(defaultWeek)
				? String(defaultWeek)
				: String(weekOptions[0]),
		);
	}, [weekChoice, weekOptions, defaultWeek]);

	// Poll the batch while it is queued or executing. "全部周数" can spawn dozens
	// of runs, so each tick asks for one recent-run list and only falls back to
	// per-run requests for the ones that list did not cover.
	useEffect(() => {
		const pending = runs.filter(
			(item) => item.status !== "completed" && item.status !== "failed",
		);
		if (pending.length === 0) return;
		const timer = setInterval(async () => {
			try {
				const response = await getSyncRuns(100);
				const latest = new Map(response.runs.map((row) => [row.id, row]));
				const missing = pending.filter((item) => !latest.has(item.id));
				const fetched = await Promise.all(
					missing.map(async (item) => {
						try {
							const single = await getSyncRun(item.id);
							return single.run;
						} catch (error) {
							console.error("轮询同步状态失败", error);
							return item;
						}
					}),
				);
				for (const row of fetched) latest.set(row.id, row);
				setRuns((previous) =>
					previous.map((item) => latest.get(item.id) ?? item),
				);
			} catch (error) {
				console.error("轮询同步状态失败", error);
			}
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
		if (needsWeek && weekChoice === WEEK_ALL && weekOptions.length === 0) {
			toast.error("该学期还没有可同步的周次。");
			return;
		}
		// Tasks that do not depend on a week are submitted once; week tasks are
		// expanded into one submission per week when "全部周数" is picked.
		const selected: TaskChoice[] = task === SYNC_ALL ? availableTasks : [task];
		const targets: { task: SyncTask; week?: number }[] = [];
		for (const item of selected) {
			if (!WEEK_TASKS.includes(item as SyncTask)) {
				targets.push({ task: item as SyncTask });
				continue;
			}
			if (weekChoice === WEEK_ALL) {
				for (const option of weekOptions) {
					targets.push({ task: item as SyncTask, week: option });
				}
			} else {
				targets.push({ task: item as SyncTask, week: Number(weekChoice) });
			}
		}
		const created: SyncRun[] = [];
		setIsSubmitting(true);
		try {
			for (const target of targets) {
				const response = await startSync({
					task: target.task,
					semester_id: semesterId,
					week: target.week,
				});
				created.push({
					id: response.run_id,
					job_id: response.job_id,
					task_name: target.task,
					semester_id: semesterId,
					week: target.week ?? null,
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
	}, [task, semesterId, weekChoice, weekOptions, needsWeek, availableTasks]);

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
								{allowSyncAll ? <SelectItem value={SYNC_ALL}>同步以下所有内容</SelectItem> : null}
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
							<Select
								value={weekChoice}
								onValueChange={setWeekChoice}
								disabled={weekOptions.length === 0}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="选择周次" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={WEEK_ALL}>全部周数</SelectItem>
									{weekOptions.map((option) => (
										<SelectItem key={option} value={String(option)}>
											第 {option} 周
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
