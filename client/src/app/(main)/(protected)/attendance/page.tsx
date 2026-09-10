"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { AttendanceBarChart } from "@/components/attendance/AttendanceBarChart";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAttendance } from "@/hooks/useAttendance";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { exportDailyAttendance, getSemesters, setSeminarManual, submitSeminarRelay } from "@/lib/api";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { toast } from "sonner";

function statusClass(status: string): string {
	if (status === "正常") return "text-emerald-600 dark:text-emerald-400";
	if (status === "缺卡") return "text-rose-600 dark:text-rose-400";
	if (status === "迟到") return "text-amber-600 dark:text-amber-400";
	if (status === "上课") return "text-blue-600 dark:text-blue-400";
	return "text-muted-foreground";
}

function parseNames(text: string): string[] {
	return text
		.split(/[\s,，、]+/)
		.map((name) => name.trim())
		.filter(Boolean);
}

export default function AttendancePage() {
	const { semester, currentWeek } = useCurrentSemester();
	const [semesters, setSemesters] = useState<Semester[]>([]);
	const [week, setWeek] = useState<number | null>(null);
	const activeWeek = week ?? currentWeek ?? 0;
	const { daily, seminar, group, leaves, schedule, isLoading, error, refetch } = useAttendance(
		semester?.id,
		activeWeek,
	);

	const [relayText, setRelayText] = useState("");
	const [manualText, setManualText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isExporting, setIsExporting] = useState(false);

	useEffect(() => {
		getSemesters()
			.then((response) => setSemesters(response.semesters))
			.catch(() => setSemesters([]));
	}, []);

	const scheduleByMember = useMemo(() => {
		const map = new Map<string, Record<number, string[]>>();
		schedule.forEach((entry) => {
			const days = map.get(entry.member_name) ?? {};
			const label = `${entry.period}${entry.section}`;
			days[entry.weekday] = [...(days[entry.weekday] ?? []), label];
			map.set(entry.member_name, days);
		});
		return map;
	}, [schedule]);

	const handleExport = async () => {
		if (!semester) return;
		setIsExporting(true);
		try {
			const response = await exportDailyAttendance(semester.id, activeWeek);
			window.open(response.file_url, "_blank");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "导出失败。");
		} finally {
			setIsExporting(false);
		}
	};

	const handleRelay = async () => {
		if (!semester) return;
		if (!relayText.trim()) {
			toast.error("请粘贴群接龙内容。");
			return;
		}
		setIsSubmitting(true);
		try {
			const response = await submitSeminarRelay({
				semester_id: semester.id,
				week: activeWeek,
				text: relayText,
			});
			toast.success(`已按接龙记录 ${response.count} 人到场。`);
			setRelayText("");
			await refetch();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "解析接龙失败。");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleManual = async () => {
		if (!semester) return;
		const names = parseNames(manualText);
		if (names.length === 0) {
			toast.error("请填写到场名单。");
			return;
		}
		setIsSubmitting(true);
		try {
			const response = await setSeminarManual({
				semester_id: semester.id,
				week: activeWeek,
				observed_names: names,
			});
			toast.success(`已人工覆写为 ${response.count} 人到场。`);
			setManualText("");
			await refetch();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "人工调整失败。");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!semester) {
		return (
			<div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
				<PageHeader title="考勤统计" />
				<EmptyState title="还没有配置学期" description="请先在设置页创建学期。" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
			<PageHeader
				title="考勤统计"
				description="日常打卡、组会出勤、请假与课表，均来自飞书同步。"
				actions={
					<div className="flex items-center gap-2">
						<Label htmlFor="attendance-week" className="text-sm whitespace-nowrap">
							周次
						</Label>
						<Input
							id="attendance-week"
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

			<Card>
				<CardHeader>
					<CardTitle>考勤组</CardTitle>
					<CardDescription>
						{group
							? `${group.group_name}（${group.members.length} 人）`
							: "还没有同步考勤组，可在下方同步。"}
					</CardDescription>
				</CardHeader>
			</Card>

			<SyncPanel
				semesters={semesters}
				defaultSemesterId={semester.id}
				defaultWeek={currentWeek}
				onCompleted={refetch}
			/>

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载考勤数据...
				</div>
			) : null}

			<Tabs defaultValue="daily">
				<TabsList>
					<TabsTrigger value="daily">日常考勤</TabsTrigger>
					<TabsTrigger value="seminar">组会考勤</TabsTrigger>
					<TabsTrigger value="leave">请假</TabsTrigger>
					<TabsTrigger value="schedule">课表</TabsTrigger>
				</TabsList>

				<TabsContent value="daily" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>第 {activeWeek} 周打卡</CardTitle>
							<CardDescription>缺卡与迟到已排除因上课产生的异常。</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<Button
								variant="outline"
								onClick={handleExport}
								disabled={isExporting || !daily || daily.rows.length === 0}
							>
								{isExporting ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Download className="mr-2 h-4 w-4" />
								)}
								导出 Excel
							</Button>
							<AttendanceBarChart data={daily?.chart ?? []} />
							{daily && daily.rows.length > 0 ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>姓名</TableHead>
											{daily.dates.map((day) => (
												<TableHead key={day}>{day.slice(5)}</TableHead>
											))}
											<TableHead>缺卡</TableHead>
											<TableHead>迟到</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{daily.rows.map((row) => (
											<TableRow key={row.member_name}>
												<TableCell className="font-medium">{row.member_name}</TableCell>
												{daily.dates.map((day) => (
													<TableCell
														key={day}
														className={statusClass(row.days[day] ?? "")}
													>
														{row.days[day] || "-"}
													</TableCell>
												))}
												<TableCell>{row.absent_count}</TableCell>
												<TableCell>{row.late_count}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<p className="text-sm text-muted-foreground">
									本周还没有日常考勤数据，请先在同步面板里选择「日常考勤」。
								</p>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="seminar" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>第 {activeWeek} 周组会出勤</CardTitle>
							<CardDescription>
								{seminar
									? `${seminar.seminar_date} ${WEEKDAY_NAMES[seminar.weekday - 1]}${seminar.period}，应到 ${seminar.expected.length} 人`
									: "暂无数据"}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{seminar ? (
								<div className="space-y-3 text-sm">
									<div>
										<span className="font-medium">已出勤（{seminar.attended.length}）：</span>
										{seminar.attended.join("、") || "无"}
									</div>
									<div>
										<span className="font-medium">未出勤（{seminar.absent.length}）：</span>
										<span className={seminar.absent.length ? "text-rose-600 dark:text-rose-400" : ""}>
											{seminar.absent.join("、") || "无"}
										</span>
									</div>
									<div>
										<span className="font-medium">请假：</span>
										{seminar.leave.map((item) => item.member_name).join("、") || "无"}
									</div>
									<div>
										<span className="font-medium">课程豁免：</span>
										{seminar.course_exempt.join("、") || "无"}
									</div>
									<div className="flex items-center gap-2">
										<span className="font-medium">数据来源：</span>
										<Badge variant="secondary">
											{seminar.source === "flow"
												? "打卡流水"
												: seminar.source === "relay"
													? "群接龙"
													: "人工调整"}
										</Badge>
									</div>
								</div>
							) : (
								<EmptyState title="暂无组会考勤" description="同步组会考勤后可在此查看出勤情况。" />
							)}

							<div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="relay-text">群接龙内容</Label>
									<Textarea
										id="relay-text"
										rows={5}
										placeholder={"1. 张三\n2. 李四"}
										value={relayText}
										onChange={(event) => setRelayText(event.target.value)}
									/>
									<Button variant="outline" onClick={handleRelay} disabled={isSubmitting}>
										按接龙覆写出勤
									</Button>
								</div>
								<div className="space-y-2">
									<Label htmlFor="manual-text">人工到场名单</Label>
									<Textarea
										id="manual-text"
										rows={5}
										placeholder="张三、李四、王五"
										value={manualText}
										onChange={(event) => setManualText(event.target.value)}
									/>
									<Button variant="outline" onClick={handleManual} disabled={isSubmitting}>
										人工覆写名单
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="leave" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>第 {activeWeek} 周请假</CardTitle>
							<CardDescription>来自请假多维表格。</CardDescription>
						</CardHeader>
						<CardContent>
							{leaves.length === 0 ? (
								<p className="text-sm text-muted-foreground">本周没有请假记录。</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>姓名</TableHead>
											<TableHead>原因</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{leaves.map((row) => (
											<TableRow key={row.id}>
												<TableCell className="font-medium">{row.member_name}</TableCell>
												<TableCell>{row.reason || "-"}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="schedule" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>课表</CardTitle>
							<CardDescription>用于日常考勤与组会出勤的课程豁免，也用于排班冲突。</CardDescription>
						</CardHeader>
						<CardContent>
							{scheduleByMember.size === 0 ? (
								<p className="text-sm text-muted-foreground">
									还没有课表数据，请先在同步面板里选择「课表」。
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>姓名</TableHead>
											{WEEKDAY_NAMES.slice(0, 5).map((day) => (
												<TableHead key={day}>{day}</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{Array.from(scheduleByMember.entries()).map(([name, days]) => (
											<TableRow key={name}>
												<TableCell className="font-medium align-top">{name}</TableCell>
												{[1, 2, 3, 4, 5].map((weekday) => (
													<TableCell key={weekday} className="align-top text-xs">
														{(days[weekday] ?? []).join("、") || "-"}
													</TableCell>
												))}
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
