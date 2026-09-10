"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Member } from "@/lib/schema";

const UNASSIGNED_ADVISOR = "未指定导师";

interface MemberPickerProps {
	members: Member[];
	selectedNames: Set<string>;
	onChange: (next: Set<string>) => void;
}

/** 在读成员名单选择器：按导师分组，支持组内全选与整体全选。 */
export function MemberPicker({ members, selectedNames, onChange }: MemberPickerProps) {
	const groups = useMemo(() => {
		const byAdvisor = new Map<string, Member[]>();
		for (const member of members) {
			const advisor = member.advisor?.trim() || UNASSIGNED_ADVISOR;
			const bucket = byAdvisor.get(advisor);
			if (bucket) bucket.push(member);
			else byAdvisor.set(advisor, [member]);
		}
		return Array.from(byAdvisor.entries()).sort(([left], [right]) =>
			left.localeCompare(right, "zh-Hans-CN"),
		);
	}, [members]);

	const apply = (names: string[], selected: boolean) => {
		const next = new Set(selectedNames);
		for (const name of names) {
			if (selected) next.add(name);
			else next.delete(name);
		}
		onChange(next);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground">
					已选 {selectedNames.size} 人 / 共 {members.length} 人
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => apply(members.map((member) => member.name), true)}
					>
						全选
					</Button>
					<Button variant="outline" size="sm" onClick={() => onChange(new Set())}>
						清空
					</Button>
				</div>
			</div>
			<div className="max-h-80 space-y-4 overflow-y-auto rounded-md border p-3">
				{members.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						还没有在读成员，请先同步人员主数据。
					</p>
				) : (
					groups.map(([advisor, groupMembers]) => {
						const names = groupMembers.map((member) => member.name);
						const selectedCount = names.filter((name) => selectedNames.has(name)).length;
						const allSelected = selectedCount === names.length;
						return (
							<div key={advisor} className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium">{advisor}</span>
										<Badge variant="secondary" className="text-xs">
											{selectedCount}/{names.length}
										</Badge>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => apply(names, !allSelected)}
									>
										{allSelected ? "取消全选" : "全选该导师"}
									</Button>
								</div>
								<div className="space-y-1.5 pl-1">
									{groupMembers.map((member) => (
										<label
											key={member.id}
											className="flex items-center gap-2 text-sm"
										>
											<Checkbox
												checked={selectedNames.has(member.name)}
												onCheckedChange={() =>
													apply(
														[member.name],
														!selectedNames.has(member.name),
													)
												}
											/>
											<span>{member.name}</span>
											{member.grade ? (
												<span className="text-xs text-muted-foreground">
													{member.grade}
												</span>
											) : null}
										</label>
									))}
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
