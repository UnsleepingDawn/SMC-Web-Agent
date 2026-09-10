"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { GroupMeetingResult } from "@/components/group-meeting/GroupMeetingResult";
import { MemberPicker } from "@/components/group-meeting/MemberPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { useGroupMeeting } from "@/hooks/useGroupMeeting";
import { useGroupMeetingDraft } from "@/hooks/useGroupMeetingDraft";
import { createGroupMeetingPlan, getMembers } from "@/lib/api";
import type { Member } from "@/lib/schema";
import { ENROLLED_STATUS, WEEKDAY_NAMES } from "@/lib/schema";
import { toast } from "sonner";
const DAYS = WEEKDAY_NAMES.slice(0, 7);
const PERIODS = ["上午", "下午"];

function parseGroups(text: string): string[][] {
	return text
		.split("\n")
		.map((line) =>
			line
				.split(/[、,，\s]+/)
				.map((name) => name.trim())
				.filter(Boolean),
		)
		.filter((group) => group.length > 0);
}

export default function GroupMeetingPage() {
	const { semester } = useCurrentSemester();
	const { config, plans, isLoading, error, refetch } = useGroupMeeting();
	const { draft, save: saveDraft } = useGroupMeetingDraft(semester?.id ?? null);
	const [members, setMembers] = useState<Member[]>([]);
	const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
	const [groupText, setGroupText] = useState("");
	const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(["周三"]));
	const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set(["下午"]));
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [activePlanId, setActivePlanId] = useState<string | null>(null);
	const appliedDraftFor = useRef<string | null>(null);

	useEffect(() => {
		getMembers({ is_active: true, enrollment_status: ENROLLED_STATUS })
			.then((response) => setMembers(response.members))
			.catch(() => setMembers([]));
	}, []);

	// Restore the last submitted selection once the roster is available.
	useEffect(() => {
		const semesterId = semester?.id;
		if (!semesterId || !draft || members.length === 0) return;
		if (appliedDraftFor.current === semesterId) return;
		appliedDraftFor.current = semesterId;

		const known = new Set(members.map((member) => member.name));
		setSelectedNames(new Set(draft.name_list.filter((name) => known.has(name))));
		setGroupText(draft.already_grouped.map((group) => group.join("、")).join("\n"));

		const days = new Set<string>();
		const periods = new Set<string>();
		for (const period of draft.meeting_periods) {
			if (period.length < 3) continue;
			days.add(period.slice(0, 2));
			periods.add(period.slice(2));
		}
		if (days.size > 0) setSelectedDays(days);
		if (periods.size > 0) setSelectedPeriods(periods);
	}, [draft, members, semester?.id]);

	const toggle = (
		setter: Dispatch<SetStateAction<Set<string>>>,
		value: string,
	) => {
		setter((previous) => {
			const next = new Set(previous);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return next;
		});
	};

	const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;

	const handleSubmit = async () => {
		if (!semester) {
			toast.error("请先选择学期。");
			return;
		}
		if (selectedNames.size === 0) {
			toast.error("请至少选择一位参会成员。");
			return;
		}
		if (selectedDays.size === 0 || selectedPeriods.size === 0) {
			toast.error("请至少选择一个星期与时段。");
			return;
		}
		const meetingPeriods: string[] = [];
		selectedDays.forEach((day) =>
			selectedPeriods.forEach((period) => meetingPeriods.push(`${day}${period}`)),
		);
		const nameList = Array.from(selectedNames);
		const alreadyGrouped = parseGroups(groupText);

		setIsSubmitting(true);
		try {
			const response = await createGroupMeetingPlan({
				semester_id: semester.id,
				name_list: nameList,
				already_grouped: alreadyGrouped,
				meeting_periods: meetingPeriods,
				weights: config?.weights,
			});
			setActivePlanId(response.plan_id);
			toast.success("已提交排班任务，正在求解。");
			await refetch();
			// Remember this selection so the next visit restores it.
			saveDraft({
				name_list: nameList,
				already_grouped: alreadyGrouped,
				meeting_periods: meetingPeriods,
			}).catch((saveError) => {
				console.error("保存排班选择失败", saveError);
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "提交排班失败。");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!semester) {
		return (
			<div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
				<PageHeader title="小组会议排班" />
				<EmptyState title="还没有配置学期" description="请先在设置页创建学期。" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
			<PageHeader
				title="小组会议排班"
				description="参会名单仅含在读成员，可按导师全选；提交后按课表冲突求解分组与时段。"
			/>

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			<div className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>参会名单</CardTitle>
							<CardDescription>仅列出在读成员，可按导师全选。</CardDescription>
						</CardHeader>
						<CardContent>
							<MemberPicker
								members={members}
								selectedNames={selectedNames}
								onChange={setSelectedNames}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>预设分组与时段</CardTitle>
							<CardDescription>每行一组，组内姓名用顿号或逗号分隔；留空则由求解器分组。</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<Textarea
								rows={4}
								placeholder={"张三、李四\n王五、赵六"}
								value={groupText}
								onChange={(event) => setGroupText(event.target.value)}
							/>
							<div className="space-y-2">
								<Label>星期</Label>
								<div className="flex flex-wrap gap-3">
									{DAYS.map((day) => (
										<label key={day} className="flex items-center gap-1 text-sm">
											<Checkbox
												checked={selectedDays.has(day)}
												onCheckedChange={() => toggle(setSelectedDays, day)}
											/>
											{day}
										</label>
									))}
								</div>
							</div>
							<div className="space-y-2">
								<Label>时段</Label>
								<div className="flex flex-wrap gap-3">
									{PERIODS.map((period) => (
										<label key={period} className="flex items-center gap-1 text-sm">
											<Checkbox
												checked={selectedPeriods.has(period)}
												onCheckedChange={() => toggle(setSelectedPeriods, period)}
											/>
											{period}
										</label>
									))}
								</div>
							</div>
							<Button onClick={handleSubmit} disabled={isSubmitting}>
								{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
								提交排班
							</Button>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>排班结果</CardTitle>
							<CardDescription>每 30 分钟最多安排一个小组。</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{isLoading ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									正在加载...
								</div>
							) : activePlan ? (
								<GroupMeetingResult plan={activePlan} />
							) : (
								<EmptyState title="暂无排班记录" description="提交一次排班后即可在此查看结果。" />
							)}
						</CardContent>
					</Card>

					{plans.length > 1 ? (
						<Card>
							<CardHeader>
								<CardTitle>历史排班</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								{plans.map((plan) => (
									<button
										key={plan.id}
										type="button"
										onClick={() => setActivePlanId(plan.id)}
										className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted"
									>
										<span className="font-mono text-xs">{plan.id.slice(0, 8)}</span>
										<span className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												{plan.params.name_list?.length ?? 0} 人
											</span>
											<Badge variant="secondary">{plan.status}</Badge>
										</span>
									</button>
								))}
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}
