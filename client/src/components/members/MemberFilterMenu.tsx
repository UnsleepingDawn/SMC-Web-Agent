"use client";

import { ListFilter, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	MemberFilterState,
	MEMBER_FILTER_FIELDS,
	countSelected,
	hasFilters,
	optionsForField,
	toggleFilterValue,
} from "@/lib/memberFilter";
import { MemberFilters } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface MemberFilterMenuProps {
	filters: MemberFilters | null;
	value: MemberFilterState;
	onChange: (next: MemberFilterState) => void;
	className?: string;
}

export function MemberFilterMenu({ filters, value, onChange, className }: MemberFilterMenuProps) {
	const selectedCount = countSelected(value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" className={cn("md:w-auto", className)}>
					<ListFilter className="mr-2 h-4 w-4" />
					筛选
					{selectedCount > 0 ? (
						<Badge variant="secondary" className="ml-2 tabular-nums">
							{selectedCount}
						</Badge>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={4} className="w-52">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					悬停属性展开词条，可多选
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{MEMBER_FILTER_FIELDS.map((spec) => {
					const options = optionsForField(spec, filters);
					const selected = value[spec.field];
					return (
						<DropdownMenuSub key={spec.field}>
							<DropdownMenuSubTrigger>
								<span>{spec.label}</span>
								{selected.length > 0 ? (
									<Badge variant="secondary" className="ml-auto mr-1 tabular-nums">
										{selected.length}
									</Badge>
								) : null}
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="max-h-72 w-44 overflow-y-auto">
								{options.length === 0 ? (
									<p className="px-2 py-1.5 text-xs text-muted-foreground">暂无可选项</p>
								) : (
									options.map((option) => (
										<DropdownMenuCheckboxItem
											key={option.value}
											checked={selected.includes(option.value)}
											onCheckedChange={() =>
												onChange(toggleFilterValue(value, spec.field, option.value))
											}
											// Keep the menu open so several values can be ticked in a row.
											onSelect={(event) => event.preventDefault()}
										>
											{option.label}
										</DropdownMenuCheckboxItem>
									))
								)}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					);
				})}
				{hasFilters(value) ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={(event) => {
								event.preventDefault();
								onChange({
									...value,
									advisor: [],
									grade: [],
									enrollment_status: [],
									need_attendance: [],
								});
							}}
						>
							<RotateCcw className="mr-2 h-4 w-4" />
							清除筛选
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
