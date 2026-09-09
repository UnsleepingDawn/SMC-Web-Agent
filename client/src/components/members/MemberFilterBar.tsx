"use client";

import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MemberFilters as Filters } from "@/lib/schema";

const ALL = "__all__";

export interface MemberFilterState {
	search: string;
	advisor: string;
	grade: string;
	enrollment_status: string;
	need_attendance: boolean;
}

export const EMPTY_FILTERS: MemberFilterState = {
	search: "",
	advisor: "",
	grade: "",
	enrollment_status: "",
	need_attendance: false,
};

interface MemberFilterBarProps {
	filters: Filters | null;
	value: MemberFilterState;
	onChange: (next: MemberFilterState) => void;
}

export function MemberFilterBar({ filters, value, onChange }: MemberFilterBarProps) {
	const patch = (partial: Partial<MemberFilterState>) => onChange({ ...value, ...partial });

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-center">
			<Input
				placeholder="按姓名、学号或导师搜索..."
				value={value.search}
				onChange={(event) => patch({ search: event.target.value })}
				className="md:max-w-xs"
			/>
			<Select
				value={value.advisor || ALL}
				onValueChange={(next) => patch({ advisor: next === ALL ? "" : next })}
			>
				<SelectTrigger className="md:w-40">
					<SelectValue placeholder="导师" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>全部导师</SelectItem>
					{(filters?.advisors ?? []).map((advisor) => (
						<SelectItem key={advisor} value={advisor}>
							{advisor}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={value.grade || ALL}
				onValueChange={(next) => patch({ grade: next === ALL ? "" : next })}
			>
				<SelectTrigger className="md:w-36">
					<SelectValue placeholder="年级" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>全部年级</SelectItem>
					{(filters?.grades ?? []).map((grade) => (
						<SelectItem key={grade} value={grade}>
							{grade}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={value.enrollment_status || ALL}
				onValueChange={(next) => patch({ enrollment_status: next === ALL ? "" : next })}
			>
				<SelectTrigger className="md:w-36">
					<SelectValue placeholder="在读情况" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>全部状态</SelectItem>
					{(filters?.enrollment_statuses ?? []).map((status) => (
						<SelectItem key={status} value={status}>
							{status}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex items-center gap-2">
				<Switch
					id="need-attendance"
					checked={value.need_attendance}
					onCheckedChange={(checked) => patch({ need_attendance: checked })}
				/>
				<Label htmlFor="need-attendance" className="text-sm whitespace-nowrap">
					只看需要考勤
				</Label>
			</div>
		</div>
	);
}
