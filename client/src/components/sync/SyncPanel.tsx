"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Semester, SyncRun, SyncTask } from "@/lib/schema";
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
}

export function SyncPanel({ semesters, defaultSemesterId, defaultWeek, onCompleted }: SyncPanelProps) {
	const [task, setTask] = useState<SyncTask>("members");
	const [semesterId, setSemesterId] = useState(defaultSemesterId ?? "");
	const [week, setWeek] = useState(String(defaultWeek ?? 1));
	const [run, setRun] = useState<SyncRun | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!semesterId && defaultSemesterId) setSemesterId(defaultSemesterId);
	}, [defaultSemesterId, semesterId]);

	useEffect(() => {
		if (defaultWeek) setWeek(String(defaultWeek));
	}, [defaultWeek]);

	// Poll the run while it is queued or executing.
	useEffect(() => {
		if (!run || run.status === "completed" || run.status === "failed") return;
		const timer = setInterval(async () => {
			try {
				const response = await getSyncRun(run.id);
				setRun(response.run);
				if (response.run.status === "completed") {
					toast.success("飞书同步已完成。");
					onCompleted?.();
				} else if (response.run.status === "failed") {
					toast.error(response.run.error || "飞书同步失败。");
					onCompleted?.();
				}
			} catch (error) {
				console.error("轮询同步状态失败", error);
			}
		}, 2000);
		return () => clearInterval(timer);
	}, [run, onCompleted]);

	const submit = useCallback(async () => {
		if (!semesterId) {
			toast.error("请先选择学期。");
			return;
		}
		setIsSubmitting(true);
		try {
			const response = await startSync({
				task,
				semester_id: semesterId,
				week: WEEK_TASKS.includes(task) ? Number(week) : undefined,
			});
			setRun({
				id: response.run_id,
				job_id: response.job_id,
				task_name: task,
				semester_id: semesterId,
				week: WEEK_TASKS.includes(task) ? Number(week) : null,
				status: "running",
				error: null,
				payload: {},
				started_at: null,
				completed_at: null,
				created_at: null,
			});
			toast.success("已提交同步任务，正在后台执行。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "提交同步任务失败。");
		} finally {
			setIsSubmitting(false);
		}
	}, [task, semesterId, week]);

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
						<Select value={task} onValueChange={(value) => setTask(value as SyncTask)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(TASK_LABELS) as SyncTask[]).map((key) => (
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
					{WEEK_TASKS.includes(task) ? (
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
					{run ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<StatusBadge status={run.status} />
							{run.error ? <span className="text-destructive">{run.error}</span> : null}
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
