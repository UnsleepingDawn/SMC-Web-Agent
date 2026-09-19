"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, Send } from "lucide-react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/EmptyState";
import { MessagePreview } from "@/components/common/MessagePreview";
import { MissedBarChart } from "@/components/common/MissedBarChart";
import { PageHeader } from "@/components/common/PageHeader";
import { RecipientPicker } from "@/components/common/RecipientPicker";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useSemesters } from "@/hooks/useSemesters";
import { useTeacherPushPlan } from "@/hooks/useTeacherPushPlan";
import { useWeeklyPushDraft } from "@/hooks/useWeeklyPushDraft";
import { useWeeklyReportMissed } from "@/hooks/useWeeklyReportMissed";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";
import {
	previewWeeklySummary,
	pushTeacherReports,
	pushWeeklySummary,
	waitForNotifications,
} from "@/lib/api";
import {
	PostMessage,
	PushTeacherIssue,
	PushTeacherResult,
	Recipient,
	TeacherPushStudent,
} from "@/lib/schema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TeacherPushStage = "closed" | "confirm" | "reviewed";

/** One student's submission state as a colored badge. */
function StudentStatus({ student }: { student: TeacherPushStudent }) {
	if (student.doc_link) {
		return (
			<Badge
				variant="secondary"
				className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
			>
				已提交（
				<a
					href={student.doc_link}
					target="_blank"
					rel="noreferrer"
					className="text-inherit underline underline-offset-2"
				>
					飞书链接
				</a>
				）
			</Badge>
		);
	}
	if (student.has_attachment) {
		return (
			<Badge
				variant="secondary"
				className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
			>
				已提交（文件）
			</Badge>
		);
	}
	if (student.submitted) {
		return (
			<Badge
				variant="secondary"
				className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
			>
				已提交
			</Badge>
		);
	}
	return <Badge variant="secondary">未提交</Badge>;
}

export default function WeeklyReportsPage() {
	const { semester, currentWeek } = useCurrentSemester();
	const { semesters } = useSemesters();
	const [week, setWeek] = useState<number | null>(null);
	const activeWeek = week ?? currentWeek ?? 0;
	const { stats, isLoading, error, refetch } = useWeeklyReports(activeWeek, semester?.id);
	const {
		summary: missed,
		isLoading: isMissedLoading,
		refetch: refetchMissed,
	} = useWeeklyReportMissed(activeWeek, semester?.id);

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
	const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
	const [stage, setStage] = useState<TeacherPushStage>("closed");
	const [isPushingTeachers, setIsPushingTeachers] = useState(false);
	const [pushIssues, setPushIssues] = useState<PushTeacherIssue[]>([]);
	const [isCheckingResults, setIsCheckingResults] = useState(false);
	const { draft, isLoading: isDraftLoading, save: saveDraft } = useWeeklyPushDraft(
		semester?.id ?? null,
	);
	const appliedDraftFor = useRef<string | null>(null);

	// Restore the last selection once per semester, so a sync or a refetch of the
	// plan never resets what the user picked.
	useEffect(() => {
		const semesterId = semester?.id;
		if (!semesterId || !plan || isDraftLoading) return;
		if (appliedDraftFor.current === semesterId) return;
		appliedDraftFor.current = semesterId;

		const selectable = plan.teachers.filter(
			(teacher) => teacher.student_count > 0 && teacher.open_id,
		);
		if (!draft) {
			setSelectedTeachers(new Set(selectable.map((teacher) => teacher.name)));
			setExpandedTeachers(new Set());
			return;
		}
		const selectableNames = new Set(selectable.map((teacher) => teacher.name));
		const known = new Set(plan.teachers.map((teacher) => teacher.name));
		setSelectedTeachers(
			new Set(draft.teacher_names.filter((name) => selectableNames.has(name))),
		);
		setExpandedTeachers(
			new Set(draft.expanded_teachers.filter((name) => known.has(name))),
		);
	}, [semester?.id, plan, draft, isDraftLoading]);

	// Persist later edits, debounced so dragging through the list is one write.
	useEffect(() => {
		const semesterId = semester?.id;
		if (!semesterId || appliedDraftFor.current !== semesterId) return;
		const timer = setTimeout(() => {
			saveDraft({
				teacher_names: [...selectedTeachers],
				expanded_teachers: [...expandedTeachers],
			}).catch((error) => {
				console.error("保存老师推送草稿失败", error);
			});
		}, 500);
		return () => clearTimeout(timer);
	}, [semester?.id, selectedTeachers, expandedTeachers, saveDraft]);

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

	const toggleExpanded = (name: string) => {
		setExpandedTeachers((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};

	const loadPreview = useCallback(async () => {
		setIsPreviewing(true);
		try {
			const response = await previewWeeklySummary(activeWeek, semester?.id);
			setPreview(response.payload);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "渲染总结失败。");
		} finally {
			setIsPreviewing(false);
		}
	}, [activeWeek, semester?.id]);

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

	/** A finished sync can change every statistic on this page, so refresh them all. */
	const handleSyncCompleted = useCallback(async () => {
		await Promise.all([refetch(), refetchPlan(), refetchMissed()]);
		if (preview) await loadPreview();
	}, [refetch, refetchPlan, refetchMissed, loadPreview, preview]);

	/**
	 * The POST only enqueues; the Feishu call happens in the worker. Turn the
	 * immediate outcome into issues, then wait for the async results.
	 */
	const collectPushIssues = useCallback(
		async (response: PushTeacherResult): Promise<PushTeacherIssue[]> => {
			const issues: PushTeacherIssue[] = [
				...response.failed.map(
					(item): PushTeacherIssue => ({
						name: item.name,
						reason: item.reason,
						kind: "failed",
					}),
				),
				...response.skipped.map(
					(item): PushTeacherIssue => ({
						name: item.name,
						reason: item.reason,
						kind: "skipped",
					}),
				),
			];

			const ids = response.notifications.map((item) => item.notification_id);
			if (ids.length === 0) return issues;

			const nameById = new Map(
				response.notifications.map((item) => [item.notification_id, item.name]),
			);
			setIsCheckingResults(true);
			try {
				const { settled, timedOutIds } = await waitForNotifications(ids);
				for (const record of settled) {
					if (record.status === "failed") {
						issues.push({
							name: nameById.get(record.id) ?? record.id,
							reason: record.error || "飞书发送失败",
							kind: "failed",
						});
					}
				}
				for (const id of timedOutIds) {
					issues.push({
						name: nameById.get(id) ?? id,
						reason: "发送结果确认超时，请稍后在推送历史查看",
						kind: "timeout",
					});
				}
			} finally {
				setIsCheckingResults(false);
			}
			return issues;
		},
		[],
	);

	const openTeacherPush = () => {
		if (selectedTeachers.size === 0) {
			toast.error("请至少选择一位老师。");
			return;
		}
		setPushIssues([]);
		setStage("confirm");
	};

	const sendToAdmin = async () => {
		setIsPushingTeachers(true);
		setPushIssues([]);
		try {
			const response = await pushTeacherReports(
				activeWeek,
				{ teacher_names: [...selectedTeachers], audience: "admin" },
				semester?.id,
			);
			const issues = await collectPushIssues(response);
			setPushIssues(issues);
			if (issues.length > 0) {
				// Close the dialog so the red summary in the card is visible.
				toast.error(`有 ${issues.length} 条内容没有发给管理员。`);
				setStage("closed");
			} else {
				toast.success("已把即将发送的内容发给管理员，请确认无误。");
				setStage("reviewed");
			}
		} catch (err) {
			const reason = err instanceof Error ? err.message : "发给管理员失败。";
			setPushIssues([{ name: "管理员", reason, kind: "failed" }]);
			toast.error(reason);
			setStage("closed");
		} finally {
			setIsPushingTeachers(false);
		}
	};

	const sendToTeachers = async () => {
		setIsPushingTeachers(true);
		setPushIssues([]);
		try {
			const response = await pushTeacherReports(
				activeWeek,
				{ teacher_names: [...selectedTeachers], audience: "teachers" },
				semester?.id,
			);
			setStage("closed");
			// Write the selection back on submit, mirroring the planner draft.
			saveDraft({
				teacher_names: [...selectedTeachers],
				expanded_teachers: [...expandedTeachers],
			}).catch((saveError) => {
				console.error("保存老师推送草稿失败", saveError);
			});
			refetchPlan();

			const issues = await collectPushIssues(response);
			setPushIssues(issues);
			if (issues.length > 0) {
				toast.error(`有 ${issues.length} 位老师没有发送成功。`);
			} else {
				toast.success(`已向 ${response.sent} 位老师发送周报汇总。`);
			}
		} catch (err) {
			const reason = err instanceof Error ? err.message : "推送给老师失败。";
			setPushIssues([{ name: "推送请求", reason, kind: "failed" }]);
			toast.error(reason);
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

			<SyncPanel
				semesters={semesters}
				defaultSemesterId={semester.id}
				defaultWeek={currentWeek}
				tasks={["weekly_reports"]}
				defaultTask="weekly_reports"
				allowSyncAll
				onCompleted={handleSyncCompleted}
			/>

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
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>缺交次数</CardTitle>
					<CardDescription>
						自上次提交周报后的累计缺交周数，含当前所选周次；红色表示从未提交过。
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isMissedLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							正在统计缺交次数...
						</div>
					) : (
						<MissedBarChart
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>总结预览与推送</CardTitle>
					<CardDescription>
						预览本周周报提交情况的总结，确认无误后可直接推送到群或成员。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Button variant="outline" onClick={loadPreview} disabled={isPreviewing}>
						{isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						预览总结
					</Button>
					{preview ? <MessagePreview message={preview} /> : null}
					<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
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
					{pushIssues.length > 0 ? (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>有 {pushIssues.length} 位老师未发送成功</AlertTitle>
							<AlertDescription>
								<ul className="list-disc space-y-1 pl-4">
									{pushIssues.map((issue) => (
										<li key={`${issue.kind}-${issue.name}-${issue.reason}`}>
											{issue.name}：{issue.reason}
										</li>
									))}
								</ul>
							</AlertDescription>
						</Alert>
					) : null}
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
									const expanded = expandedTeachers.has(teacher.name);
									return (
										<li key={teacher.name}>
											<Collapsible
												open={expanded}
												onOpenChange={() => toggleExpanded(teacher.name)}
											>
												<div className="flex items-center gap-3">
													<Checkbox
														id={`teacher-${teacher.name}`}
														checked={selectedTeachers.has(teacher.name)}
														disabled={disabled}
														onCheckedChange={(checked) =>
															toggleTeacher(teacher.name, checked === true)
														}
													/>
													<CollapsibleTrigger asChild>
														<button
															type="button"
															className="flex items-center gap-1 rounded-sm p-1 hover:bg-muted"
															aria-label={expanded ? "收起学生名单" : "展开学生名单"}
														>
															<ChevronRight
																className={cn(
																	"h-4 w-4 text-muted-foreground transition-transform",
																	expanded && "rotate-90",
																)}
															/>
														</button>
													</CollapsibleTrigger>
													<Label
														htmlFor={`teacher-${teacher.name}`}
														className="flex flex-1 items-center justify-between gap-2 text-sm"
													>
														<span className="font-medium">{teacher.name}</span>
														<span className="text-xs text-muted-foreground">{note}</span>
													</Label>
												</div>
												<CollapsibleContent>
													{teacher.students.length === 0 ? (
														<p className="pt-2 pl-9 text-xs text-muted-foreground">
															没有在读学生。
														</p>
													) : (
													<ul className="space-y-1 pt-2 pl-9">
														{teacher.students.map((student) => (
															<li
																key={student.name}
																className="grid grid-cols-[4rem_1fr] items-center gap-2 text-sm"
															>
																<span className="truncate" title={student.name}>
																	{student.name}
																</span>
																<span>
																	<StudentStatus student={student} />
																</span>
															</li>
														))}
													</ul>
													)}
												</CollapsibleContent>
											</Collapsible>
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
								{isCheckingResults ? "正在确认发送结果…" : "推送给老师"}
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
