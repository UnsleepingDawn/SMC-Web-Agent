"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/EmptyState";
import { MessagePreview } from "@/components/common/MessagePreview";
import { PageHeader } from "@/components/common/PageHeader";
import { RecipientPicker } from "@/components/common/RecipientPicker";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useSemesters } from "@/hooks/useSemesters";
import { useTeacherPushPlan } from "@/hooks/useTeacherPushPlan";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";
import { previewWeeklySummary, pushTeacherReports, pushWeeklySummary } from "@/lib/api";
import { PostMessage, Recipient } from "@/lib/schema";
import { toast } from "sonner";

type TeacherPushStage = "closed" | "confirm" | "reviewed";

export default function WeeklyReportsPage() {
	const { semester, currentWeek } = useCurrentSemester();
	const { semesters } = useSemesters();
	const [week, setWeek] = useState<number | null>(null);
	const activeWeek = week ?? currentWeek ?? 0;
	const { stats, isLoading, error, refetch } = useWeeklyReports(activeWeek, semester?.id);

	const [recipient, setRecipient] = useState<Recipient | null>(null);
	const [preview, setPreview] = useState<PostMessage | null>(null);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [isPushing, setIsPushing] = useState(false);

	const {
		plan,
		isLoading: isPlanLoading,
		error: planError,
		refetch: refetchPlan,
	} = useTeacherPushPlan(activeWeek, semester?.id);
	const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
	const [stage, setStage] = useState<TeacherPushStage>("closed");
	const [isPushingTeachers, setIsPushingTeachers] = useState(false);

	useEffect(() => {
		if (!plan) return;
		setSelectedTeachers(
			new Set(
				plan.teachers
					.filter((teacher) => teacher.student_count > 0 && teacher.open_id)
					.map((teacher) => teacher.name),
			),
		);
	}, [plan]);

	const selectableTeachers = useMemo(
		() =>
			plan
				? plan.teachers.filter(
						(teacher) => teacher.student_count > 0 && teacher.open_id,
					)
				: [],
		[plan],
	);
	const allSelected =
		selectableTeachers.length > 0 &&
		selectableTeachers.every((teacher) => selectedTeachers.has(teacher.name));

	const toggleTeacher = (name: string, checked: boolean) => {
		setSelectedTeachers((prev) => {
			const next = new Set(prev);
			if (checked) next.add(name);
			else next.delete(name);
			return next;
		});
	};

	const handlePreview = async () => {
		setIsPreviewing(true);
		try {
			const response = await previewWeeklySummary(activeWeek, semester?.id);
			setPreview(response.payload);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "渲染总结失败。");
		} finally {
			setIsPreviewing(false);
		}
	};

	const handlePush = async () => {
		if (!recipient) {
			toast.error("请选择要推送的接收者。");
			return;
		}
		setIsPushing(true);
		try {
			await pushWeeklySummary(
				activeWeek,
				{ receive_id: recipient.receive_id, receive_id_type: recipient.receive_id_type },
				semester?.id,
			);
			toast.success("已提交推送任务。");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "推送失败。");
		} finally {
			setIsPushing(false);
		}
	};

	const openTeacherPush = () => {
		if (selectedTeachers.size === 0) {
			toast.error("请至少选择一位老师。");
			return;
		}
		setStage("confirm");
	};

	const sendToAdmin = async () => {
		setIsPushingTeachers(true);
		try {
			await pushTeacherReports(
				activeWeek,
				{ teacher_names: [...selectedTeachers], audience: "admin" },
				semester?.id,
			);
			toast.success("已把即将发送的内容发给管理员，请确认无误。");
			setStage("reviewed");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "发给管理员失败。");
		} finally {
			setIsPushingTeachers(false);
		}
	};

	const sendToTeachers = async () => {
		setIsPushingTeachers(true);
		try {
			const response = await pushTeacherReports(
				activeWeek,
				{ teacher_names: [...selectedTeachers], audience: "teachers" },
				semester?.id,
			);
			toast.success(`已向 ${response.sent} 位老师提交推送任务。`);
			setStage("closed");
			refetchPlan();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "推送给老师失败。");
		} finally {
			setIsPushingTeachers(false);
		}
	};

	if (!semester) {
		return (
			<div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
				<PageHeader title="周报统计" />
				<EmptyState title="还没有配置学期" description="请先在设置页创建学期。" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
			<PageHeader
				title="周报统计"
				description="按周查看提交情况，推送总结或把周报链接发给各位老师。"
				actions={
					<div className="flex items-center gap-2">
						<Label htmlFor="week" className="text-sm whitespace-nowrap">
							周次
						</Label>
						<Input
							id="week"
							type="number"
							min={1}
							value={activeWeek}
							onChange={(event) => setWeek(Number(event.target.value))}
							className="w-24"
						/>
					</div>
				}
			/>

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在统计...
				</div>
			) : stats ? (
				<Card>
					<CardHeader>
						<CardTitle>第 {stats.week} 周</CardTitle>
						<CardDescription>
							已提交 {stats.submitted_count} 人，未提交 {stats.missing_count} 人。
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Button variant="outline" onClick={handlePreview} disabled={isPreviewing}>
							{isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							预览总结
						</Button>
						{preview ? <MessagePreview message={preview} /> : null}
					</CardContent>
				</Card>
			) : null}

			<SyncPanel
				semesters={semesters}
				defaultSemesterId={semester.id}
				defaultWeek={currentWeek}
				tasks={["weekly_reports"]}
				defaultTask="weekly_reports"
				allowSyncAll
				onCompleted={refetch}
			/>

			<Card>
				<CardHeader>
					<CardTitle>总结推送</CardTitle>
					<CardDescription>把本周总结推送到指定的群或成员。</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<div className="flex-1 space-y-2">
							<Label>接收者</Label>
							<RecipientPicker
								value={recipient}
								onChange={setRecipient}
								disabled={isPushing}
							/>
						</div>
						<Button onClick={handlePush} disabled={isPushing}>
							{isPushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							推送总结
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>推送给老师</CardTitle>
					<CardDescription>
						把本周周报链接与组内每位在读学生的周报链接，私聊发给选中的老师。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{planError ? <p className="text-sm text-destructive">{planError.message}</p> : null}
					{isPlanLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							正在统计各老师的学生...
						</div>
					) : !plan || plan.teachers.length === 0 ? (
						<EmptyState
							title="还没有老师名单"
							description={`老师名单来自通讯录的 ${plan?.teacher_department ?? "Tenure"} 部门，请先在人员管理页同步人员。`}
						/>
					) : (
						<>
							<div className="flex items-center gap-2 border-b pb-3">
								<Checkbox
									id="select-all-teachers"
									checked={allSelected}
									onCheckedChange={(checked) =>
										setSelectedTeachers(
											checked === true
												? new Set(selectableTeachers.map((teacher) => teacher.name))
												: new Set(),
										)
									}
								/>
								<Label htmlFor="select-all-teachers" className="text-sm">
									全选（{selectedTeachers.size}/{selectableTeachers.length}）
								</Label>
							</div>
							<ul className="space-y-3">
								{plan.teachers.map((teacher) => {
									const disabled = teacher.student_count === 0 || !teacher.open_id;
									const note = !teacher.open_id
										? "缺少飞书账号"
										: teacher.student_count === 0
											? "无在读学生"
											: `已提交 ${teacher.submitted_count} / ${teacher.student_count}`;
									return (
										<li key={teacher.name} className="flex items-center gap-3">
											<Checkbox
												id={`teacher-${teacher.name}`}
												checked={selectedTeachers.has(teacher.name)}
												disabled={disabled}
												onCheckedChange={(checked) =>
													toggleTeacher(teacher.name, checked === true)
												}
											/>
											<Label
												htmlFor={`teacher-${teacher.name}`}
												className="flex flex-1 items-center justify-between gap-2 text-sm"
											>
												<span className="font-medium">{teacher.name}</span>
												<span className="text-xs text-muted-foreground">{note}</span>
											</Label>
										</li>
									);
								})}
							</ul>
							<Button onClick={openTeacherPush} disabled={isPushingTeachers}>
								{isPushingTeachers ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Send className="mr-2 h-4 w-4" />
								)}
								推送给老师
							</Button>
						</>
					)}
				</CardContent>
			</Card>

			<AlertDialog
				open={stage === "confirm"}
				onOpenChange={(open) => {
					if (!open && !isPushingTeachers) setStage("closed");
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>确认推送给老师</AlertDialogTitle>
						<AlertDialogDescription>
							即将把本周周报链接发给选中的 {selectedTeachers.size} 位老师。可先发给管理员核对，避免推送出错。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button
							variant="outline"
							onClick={() => setStage("closed")}
							disabled={isPushingTeachers}
						>
							取消
						</Button>
						<Button
							variant="outline"
							onClick={sendToAdmin}
							disabled={isPushingTeachers || !plan?.admin_configured}
						>
							{isPushingTeachers ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							先发给管理员
						</Button>
						<Button onClick={sendToTeachers} disabled={isPushingTeachers}>
							{isPushingTeachers ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							确认
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={stage === "reviewed"}
				onOpenChange={(open) => {
					if (!open && !isPushingTeachers) setStage("closed");
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>请确认无误</AlertDialogTitle>
						<AlertDialogDescription>
							已把即将发送给老师的内容发给管理员。确认后将直接发送给选中的 {selectedTeachers.size} 位老师。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button
							variant="outline"
							onClick={() => setStage("closed")}
							disabled={isPushingTeachers}
						>
							取消
						</Button>
						<Button onClick={sendToTeachers} disabled={isPushingTeachers}>
							{isPushingTeachers ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							确认
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
