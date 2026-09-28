"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
	MEMBER_SORT_FIELDS,
	MemberSortField,
	MemberSortRule,
} from "@/lib/memberSort";

interface MemberSortControlProps {
	rules: MemberSortRule[];
	onChange: (rules: MemberSortRule[]) => void;
	className?: string;
}

export function MemberSortControl({ rules, onChange, className }: MemberSortControlProps) {
	const toggleField = (field: MemberSortField) => {
		if (rules.some((rule) => rule.field === field)) {
			onChange(rules.filter((rule) => rule.field !== field));
		} else {
			// New keys join as the least significant one, defaulting to ascending.
			onChange([...rules, { field, direction: "asc" }]);
		}
	};

	const toggleDirection = (field: MemberSortField) => {
		onChange(
			rules.map((rule) =>
				rule.field === field
					? { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" }
					: rule,
			),
		);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" className={cn("md:w-auto", className)}>
					<ArrowUpDown className="mr-2 h-4 w-4" />
					排序
					{rules.length > 0 ? (
						<Badge variant="secondary" className="ml-2 tabular-nums">
							{rules.length}
						</Badge>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={4} className="w-64 p-1.5">
				<p className="px-2 py-1.5 text-xs text-muted-foreground">
					按勾选顺序排序，先勾选的优先级更高
				</p>
				<div className="flex flex-col">
					{MEMBER_SORT_FIELDS.map(({ field, label }) => {
						const index = rules.findIndex((rule) => rule.field === field);
						const active = index >= 0;
						const rule = rules[index];
						return (
							<div
								key={field}
								className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-accent"
							>
								<Checkbox
									id={`member-sort-${field}`}
									checked={active}
									onCheckedChange={() => toggleField(field)}
								/>
								<label
									htmlFor={`member-sort-${field}`}
									className={cn(
										"flex-1 cursor-pointer select-none text-sm",
										active && "font-medium",
									)}
								>
									{label}
								</label>
								<span className="flex w-5 justify-center">
									{active ? (
										<Badge
											variant="secondary"
											className="h-5 px-1.5 tabular-nums"
										>
											{index + 1}
										</Badge>
									) : null}
								</span>
								<button
									type="button"
									onClick={() => toggleDirection(field)}
									disabled={!active}
									aria-label={`切换「${label}」的排序方向`}
									title={rule?.direction === "desc" ? "降序" : "升序"}
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground",
										!active && "invisible",
									)}
								>
									{rule?.direction === "desc" ? (
										<ArrowDown className="h-3.5 w-3.5" />
									) : (
										<ArrowUp className="h-3.5 w-3.5" />
									)}
								</button>
							</div>
						);
					})}
				</div>
				{rules.length > 0 ? (
					<>
						<Separator className="my-1.5" />
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							onClick={() => onChange([])}
						>
							<RotateCcw className="mr-2 h-4 w-4" />
							清除排序
						</Button>
					</>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
