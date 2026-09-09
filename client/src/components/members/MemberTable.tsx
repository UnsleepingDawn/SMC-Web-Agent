"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { Member } from "@/lib/schema";

interface MemberTableProps {
	members: Member[];
	onEdit: (member: Member) => void;
}

export function MemberTable({ members, onEdit }: MemberTableProps) {
	if (members.length === 0) {
		return (
			<EmptyState
				title="没有匹配的成员"
				description="调整筛选条件，或先执行一次飞书同步导入人员主数据。"
			/>
		);
	}

	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>姓名</TableHead>
						<TableHead>年级</TableHead>
						<TableHead>导师</TableHead>
						<TableHead>培养类型</TableHead>
						<TableHead>在读情况</TableHead>
						<TableHead>学号</TableHead>
						<TableHead>考勤</TableHead>
						<TableHead className="text-right">操作</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => (
						<TableRow key={member.id}>
							<TableCell className="font-medium">
								{member.name}
								{member.is_active ? null : (
									<Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
										已离册
									</Badge>
								)}
							</TableCell>
							<TableCell>{member.grade || "—"}</TableCell>
							<TableCell>{member.advisor || "—"}</TableCell>
							<TableCell>{member.cultivation_type || "—"}</TableCell>
							<TableCell>{member.enrollment_status || "—"}</TableCell>
							<TableCell>{member.student_id || "—"}</TableCell>
							<TableCell>
								{member.need_attendance ? (
									<Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
										需要
									</Badge>
								) : (
									<span className="text-xs text-muted-foreground">—</span>
								)}
							</TableCell>
							<TableCell className="text-right">
								<Button variant="ghost" size="sm" onClick={() => onEdit(member)}>
									<Pencil className="mr-2 h-4 w-4" />
									编辑
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
