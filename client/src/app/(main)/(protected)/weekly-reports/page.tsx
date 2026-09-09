"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { MessagePreview } from "@/components/common/MessagePreview";
import { PageHeader } from "@/components/common/PageHeader";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";
import { previewWeeklySummary, pushWeeklySummary, remindMissingReports } from "@/lib/api";
import { PostMessage } from "@/lib/schema";
import { toast } from "sonner";

export default function WeeklyReportsPage() {
	const { semester, currentWeek } = useCurrentSemester();
	const [week, setWeek] = useState<number | null>(null);
	const activeWeek = week ?? currentWeek ?? 0;
	const { stats, isLoading, error } = useWeeklyReports(activeWeek, semester?.id);

	const [receiveId, setReceiveId] = useState("");
	const [preview, setPreview] = useState<PostMessage | null>(null);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [isPushing, setIsPushing] = useState(false);
	const [isReminding, setIsReminding] = useState(false);

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

	const handleRemind = async () => {
		setIsReminding(true);
		try {
			const response = await remindMissingReports(activeWeek, semester?.id);
			if (response.sent === 0) {
				toast.success(response.message ?? "本周所有人都已提交周报。");
			} else {
				toast.success(`已向 ${response.sent} 人发送催交消息。`);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "发送催交失败。");
		} finally {
			setIsReminding(false);
		}
	};

	const handlePush = async () => {
		if (!receiveId.trim()) {
			toast.error("请填写接收者 ID（群 chat_id 或用户 open_id）。");
			return;
		}
		setIsPushing(true);
		try {
			await pushWeeklySummary(activeWeek, { receive_id: receiveId.trim() }, semester?.id);
			toast.success("已提交推送任务。");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "推送失败。");
		} finally {
			setIsPushing(false);
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
				description="按周查看提交与缺交名单，一键催交或推送总结。"
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
					<CardContent>
						<Tabs defaultValue="submitted">
							<TabsList>
								<TabsTrigger value="submitted">已提交</TabsTrigger>
								<TabsTrigger value="missing">未提交</TabsTrigger>
							</TabsList>
							<TabsContent value="submitted">
								{stats.submitted.length === 0 ? (
									<p className="text-sm text-muted-foreground">本周还没有人提交。</p>
								) : (
									<ul className="space-y-2 text-sm">
										{stats.submitted.map((report) => (
											<li key={report.id} className="flex items-center gap-2">
												<span className="font-medium">{report.member_name}</span>
												{report.doc_link ? (
													<a
														href={report.doc_link}
														target="_blank"
														rel="noreferrer"
														className="text-blue-600 hover:underline dark:text-blue-400"
													>
														查看文档
													</a>
												) : (
													<span className="text-xs text-muted-foreground">无链接</span>
												)}
											</li>
										))}
									</ul>
								)}
							</TabsContent>
							<TabsContent value="missing">
								{stats.missing.length === 0 ? (
									<p className="text-sm text-green-600 dark:text-green-400">
										本周所有人都已提交周报。
									</p>
								) : (
									<p className="text-sm">
										{stats.missing.map((member) => member.name).join("、")}
									</p>
								)}
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>催交与总结推送</CardTitle>
					<CardDescription>催交会私聊每位缺交成员，总结推送到指定群。</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={handleRemind} disabled={isReminding}>
							{isReminding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							催交未提交成员
						</Button>
						<Button variant="outline" onClick={handlePreview} disabled={isPreviewing}>
							{isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							预览总结
						</Button>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<div className="flex-1 space-y-2">
							<Label htmlFor="weekly-receive">接收者 ID</Label>
							<Input
								id="weekly-receive"
								value={receiveId}
								onChange={(event) => setReceiveId(event.target.value)}
								placeholder="群 chat_id 或用户 open_id"
							/>
						</div>
						<Button onClick={handlePush} disabled={isPushing}>
							{isPushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							推送总结
						</Button>
					</div>
					{preview ? <MessagePreview message={preview} /> : null}
				</CardContent>
			</Card>
		</div>
	);
}
