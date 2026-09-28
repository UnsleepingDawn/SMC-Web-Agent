"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { MemberFilterMenu } from "@/components/members/MemberFilterMenu";
import { MemberFilterState } from "@/lib/memberFilter";
import { MemberFilters as Filters } from "@/lib/schema";

interface MemberFilterBarProps {
	filters: Filters | null;
	value: MemberFilterState;
	onChange: (next: MemberFilterState) => void;
	/** Optional controls pinned to the right end of the bar, e.g. the sort menu. */
	trailing?: ReactNode;
}

export function MemberFilterBar({ filters, value, onChange, trailing }: MemberFilterBarProps) {
	const patch = (partial: Partial<MemberFilterState>) => onChange({ ...value, ...partial });

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-center">
			<Input
				placeholder="按姓名、学号或导师搜索..."
				value={value.search}
				onChange={(event) => patch({ search: event.target.value })}
				className="md:max-w-xs"
			/>
			<MemberFilterMenu filters={filters} value={value} onChange={onChange} />
			{trailing ? <div className="md:ml-auto">{trailing}</div> : null}
		</div>
	);
}
