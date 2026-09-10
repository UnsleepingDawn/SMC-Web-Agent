"use client";

import { Badge } from "@/components/ui/badge";
import type { GroupMeetingPlan } from "@/lib/schema";

const STATUS_LABELS: Record<string, string> = {
	pending: "排队中",
	solving: "求解中",
	completed: "已完成",
	failed: "失败",
};

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive"> = {
	pending: "secondary",
	solving: "secondary",
	completed: "default",
	failed: "destructive",
};

export function GroupMeetingResult({ plan }: { plan: GroupMeetingPlan }) {
	const slots = plan.params.slots ?? [];
	const result = plan.result ?? {};
	const missing = plan.validation?.missing ?? [];
	const conflicts = plan.validation?.conflicts ?? [];
	const scheduled = slots.filter((slot) => (result[slot.name] ?? []).length > 0);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Badge variant={STATUS_VARIANTS[plan.status] ?? "secondary"}>
					{STATUS_LABELS[plan.status] ?? plan.status}
				</Badge>
				{plan.solver_status ? (
					<span className="text-muted-foreground">求解状态：{plan.solver_status}</span>
				) : null}
				{plan.error ? <span className="text-destructive">{plan.error}</span> : null}
			</div>

			{plan.validation?.message ? (
				<p className="text-sm text-amber-600 dark:text-amber-400">
					{plan.validation.message}
				</p>
			) : null}

			{scheduled.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{plan.status === "solving" || plan.status === "pending"
						? "正在求解，请稍候..."
						: "没有可展示的分组结果。"}
				</p>
			) : (
				<div className="space-y-2">
					{scheduled.map((slot) => (
						<div key={slot.name} className="rounded-md border p-3">
							<p className="mb-2 text-sm font-medium">{slot.name}</p>
							<ul className="space-y-1 text-sm">
								{(result[slot.name] ?? []).map((group, index) => (
									<li key={index} className="text-muted-foreground">
										第 {index + 1} 组：{group.join("、")}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			)}

			{missing.length > 0 ? (
				<div className="rounded-md border border-amber-500/50 p-3 text-sm">
					<span className="font-medium">未排入（{missing.length}）：</span>
					{missing.join("、")}
				</div>
			) : null}

			{conflicts.length > 0 ? (
				<div className="rounded-md border border-rose-500/50 p-3 text-sm">
					<span className="font-medium">课程冲突（{conflicts.length}）：</span>
					{conflicts.map((item) => `${item.name}@${item.slot}`).join("、")}
				</div>
			) : null}
		</div>
	);
}
