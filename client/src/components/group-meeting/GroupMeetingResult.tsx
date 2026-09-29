"use client";

import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { GroupMeetingPlan, GroupMeetingSlot } from "@/lib/schema";
import { WEEKDAY_NAMES } from "@/lib/schema";

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

const DAY_ORDER = new Map<string, number>(
	WEEKDAY_NAMES.map((day, index) => [day, index]),
);

/** Slots in chronological order, so groups read top-to-bottom by time. */
function sortByTime(slots: GroupMeetingPlan["params"]["slots"]) {
	return [...slots].sort((left, right) => {
		const leftDay = DAY_ORDER.get(left.day) ?? Number.MAX_SAFE_INTEGER;
		const rightDay = DAY_ORDER.get(right.day) ?? Number.MAX_SAFE_INTEGER;
		if (leftDay !== rightDay) return leftDay - rightDay;
		return left.start.localeCompare(right.start);
	});
}

/** One meeting session: a weekday + period, and one numbered row per slot. */
interface SessionBlock {
	key: string;
	day: string;
	period: string;
	/** Start of the session's first slot, the time the session reads as. */
	start: string;
	rows: { seq: number; members: string[] }[];
}

/**
 * Lay the timetable out the way the printed schedule does: every slot gets a
 * numbered row, so free slots still show up as blank lines. The solver books at
 * most one group per 30-minute slot, but a slot holding several groups would
 * simply become several consecutive rows.
 */
function buildSessions(
	slots: GroupMeetingSlot[],
	result: Record<string, string[][]>,
): SessionBlock[] {
	const blocks: SessionBlock[] = [];
	const byKey = new Map<string, SessionBlock>();
	let seq = 0;
	for (const slot of slots) {
		const key = `${slot.day}|${slot.period}`;
		let block = byKey.get(key);
		if (!block) {
			block = { key, day: slot.day, period: slot.period, start: slot.start, rows: [] };
			byKey.set(key, block);
			blocks.push(block);
		}
		const groups = result[slot.name] ?? [];
		const slotGroups: string[][] = groups.length > 0 ? groups : [[]];
		for (const members of slotGroups) {
			seq += 1;
			block.rows.push({ seq, members });
		}
	}
	return blocks;
}

export function GroupMeetingResult({ plan }: { plan: GroupMeetingPlan }) {
	const slots = sortByTime(plan.params.slots ?? []);
	const result = plan.result ?? {};
	const missing = plan.validation?.missing ?? [];
	const conflicts = plan.validation?.conflicts ?? [];
	const sessions = buildSessions(slots, result);
	const hasAnyGroup = sessions.some((session) =>
		session.rows.some((row) => row.members.length > 0),
	);
	// As wide as the largest group so every name lands in its own column.
	const memberColumns = Math.max(
		2,
		...Object.values(result)
			.flat()
			.map((group) => group.length),
	);

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

			{!hasAnyGroup ? (
				<p className="text-sm text-muted-foreground">
					{plan.status === "solving" || plan.status === "pending"
						? "正在求解，请稍候..."
						: "没有可展示的分组结果。"}
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-28">时段</TableHead>
							<TableHead className="w-14 text-center">序号</TableHead>
							<TableHead colSpan={memberColumns} className="text-center">
								小组成员
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sessions.map((session) =>
							session.rows.map((row, rowIndex) => (
								<TableRow key={`${session.key}-${row.seq}`}>
									{rowIndex === 0 ? (
										<TableCell
											rowSpan={session.rows.length}
											className="bg-muted/40 text-center align-middle"
										>
											<div className="text-sm font-medium">
												{session.day}
												<span className="font-semibold">{session.period}</span>
											</div>
											<div className="text-xs text-muted-foreground">
												{session.start} 开始
											</div>
										</TableCell>
									) : null}
									<TableCell className="text-center text-muted-foreground tabular-nums">
										{row.seq}
									</TableCell>
									{Array.from({ length: memberColumns }, (_, column) => (
										<TableCell key={column} className="text-center">
											{row.members[column] ?? ""}
										</TableCell>
									))}
								</TableRow>
							)),
						)}
					</TableBody>
				</Table>
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
