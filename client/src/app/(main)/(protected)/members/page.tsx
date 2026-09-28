"use client";

import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { MemberFilterBar } from "@/components/members/MemberFilterBar";
import { MemberSortControl } from "@/components/members/MemberSortControl";
import { MemberTable } from "@/components/members/MemberTable";
import { MemberEditDialog } from "@/components/members/MemberEditDialog";
import { SyncPanel } from "@/components/sync/SyncPanel";
import { useMemberFilters } from "@/hooks/useMemberFilters";
import { useMembers } from "@/hooks/useMembers";
import { useSemesters } from "@/hooks/useSemesters";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { exportSignatureSheet } from "@/lib/api";
import { Member } from "@/lib/schema";
import {
	DEFAULT_FILTERS,
	MemberFilterState,
	deriveNeedAttendance,
} from "@/lib/memberFilter";
import {
	DEFAULT_MEMBER_SORT_RULES,
	MemberSortRule,
	sortMembers,
} from "@/lib/memberSort";
import { toast } from "sonner";

export default function MembersPage() {
	const [filters, setFilters] = useState<MemberFilterState>(DEFAULT_FILTERS);
	const [sortRules, setSortRules] = useState<MemberSortRule[]>(
		DEFAULT_MEMBER_SORT_RULES,
	);
	const [editing, setEditing] = useState<Member | null>(null);
	const [isExporting, setIsExporting] = useState(false);

	/** Empty filter fields are folded to `undefined` so the API sees no constraint. */
	const memberQuery = {
		search: filters.search || undefined,
		advisor: filters.advisor.length ? filters.advisor : undefined,
		grade: filters.grade.length ? filters.grade : undefined,
		cultivation_type: filters.cultivation_type.length
			? filters.cultivation_type
			: undefined,
		enrollment_status: filters.enrollment_status.length
			? filters.enrollment_status
			: undefined,
		need_attendance: deriveNeedAttendance(filters.need_attendance),
	};

	const { members, isLoading, error, refetch } = useMembers(memberQuery);
	const { filters: options } = useMemberFilters();
	const { semesters } = useSemesters();
	const { semester, currentWeek } = useCurrentSemester();

	const sortedMembers = useMemo(
		() => sortMembers(members, sortRules),
		[members, sortRules],
	);

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const response = await exportSignatureSheet();
			toast.success(`已生成 ${response.count} 人的签名表。`);
			window.open(response.file_url, "_blank");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "导出签名表失败。");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
			<PageHeader
				title="人员管理"
				description="通讯录与组会表合并后的主数据，可直接编辑。"
				actions={
					<Button variant="outline" onClick={handleExport} disabled={isExporting}>
						{isExporting ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Download className="mr-2 h-4 w-4" />
						)}
						导出签名表
					</Button>
				}
			/>

			<SyncPanel
				semesters={semesters}
				defaultSemesterId={semester?.id}
				defaultWeek={currentWeek}
				tasks={["members"]}
				defaultTask="members"
				allowSyncAll
				onCompleted={() => {
					refetch();
				}}
			/>

			<MemberFilterBar
				filters={options}
				value={filters}
				onChange={setFilters}
				trailing={
					<MemberSortControl rules={sortRules} onChange={setSortRules} />
				}
			/>

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载人员...
				</div>
			) : (
				<MemberTable members={sortedMembers} onEdit={setEditing} />
			)}

			<MemberEditDialog
				member={editing}
				open={editing !== null}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={refetch}
			/>
		</div>
	);
}
