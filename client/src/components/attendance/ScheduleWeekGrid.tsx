"use client";

import { useMemo } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { WEEKDAY_NAMES } from "@/lib/schema";
import type { ScheduleEntry } from "@/lib/schema";
import { CLASS_SECTION_TIMES, toMinutes } from "@/lib/timetable";
import { cn } from "@/lib/utils";

interface ScheduleWeekGridProps {
	entries: ScheduleEntry[];
}

const WEEKDAYS = WEEKDAY_NAMES.slice(0, 5);
/** Fixed body height in px; the vertical axis is scaled onto this. */
const BODY_HEIGHT = 640;

/** Cell fills, low -> high headcount. Keep the fill in sync with `swatch`. */
const INTENSITY_LEVELS = [
	{
		cell: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
		swatch: "bg-blue-50 dark:bg-blue-950",
	},
	{
		cell: "bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-800",
		swatch: "bg-blue-100 dark:bg-blue-900",
	},
	{
		cell: "bg-blue-500 text-white ring-blue-600 dark:bg-blue-600 dark:text-white dark:ring-blue-500",
		swatch: "bg-blue-500 dark:bg-blue-600",
	},
	{
		cell: "bg-blue-600 text-white ring-blue-700 dark:bg-blue-400 dark:text-blue-950 dark:ring-blue-300",
		swatch: "bg-blue-600 dark:bg-blue-400",
	},
];

interface SectionSlot {
	period: string;
	section: string;
	start: number;
	end: number;
}

function formatMinutes(minutes: number): string {
	const hour = Math.floor(minutes / 60)
		.toString()
		.padStart(2, "0");
	const minute = (minutes % 60).toString().padStart(2, "0");
	return `${hour}:${minute}`;
}

/** A week agenda: one rounded block per course section, sized by its real time. */
export function ScheduleWeekGrid({ entries }: ScheduleWeekGridProps) {
	const slots = useMemo<SectionSlot[]>(() => {
		const list: SectionSlot[] = [];
		for (const [period, sections] of Object.entries(CLASS_SECTION_TIMES)) {
			for (const [section, time] of Object.entries(sections)) {
				list.push({
					period,
					section,
					start: toMinutes(time.start),
					end: toMinutes(time.end),
				});
			}
		}
		return list;
	}, []);

	const dayStart = Math.min(...slots.map((slot) => slot.start));
	const dayEnd = Math.max(...slots.map((slot) => slot.end));
	const total = dayEnd - dayStart;

	const boundaries = useMemo(
		() => Array.from(new Set(slots.map((slot) => slot.start))).sort((a, b) => a - b),
		[slots],
	);

	/** `weekday|period|section` -> distinct member names taking that slot. */
	const cells = useMemo(() => {
		const map = new Map<string, { names: Set<string> }>();
		for (const entry of entries) {
			const key = `${entry.weekday}|${entry.period}|${entry.section}`;
			const cell = map.get(key) ?? { names: new Set<string>() };
			cell.names.add(entry.member_name);
			map.set(key, cell);
		}
		return map;
	}, [entries]);

	const maxCount = useMemo(() => {
		let max = 0;
		for (const cell of cells.values()) {
			max = Math.max(max, cell.names.size);
		}
		return max;
	}, [cells]);

	const percent = (minutes: number) => ((minutes - dayStart) / total) * 100;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>每个矩形为一个节次，颜色越深表示该时段上课人数越多；悬停查看学生名单。</span>
				<span className="flex items-center gap-1.5">
					<span>上课人数少</span>
					{INTENSITY_LEVELS.map((level) => (
						<span
							key={level.swatch}
							className={cn("h-3 w-5 rounded-sm ring-1 ring-inset ring-black/5", level.swatch)}
						/>
					))}
					<span>多</span>
				</span>
			</div>

			<div className="overflow-x-auto">
				<div className="min-w-[600px]">
					<div className="grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] gap-x-1">
						<div />
						{WEEKDAYS.map((day) => (
							<div key={day} className="pb-2 text-center text-sm font-medium">
								{day}
							</div>
						))}
					</div>

					<div className="grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] gap-x-1">
						<div className="relative" style={{ height: BODY_HEIGHT }}>
							{boundaries.map((minute) => (
								<span
									key={minute}
									className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
									style={{ top: `${percent(minute)}%` }}
								>
									{formatMinutes(minute)}
								</span>
							))}
						</div>

						{WEEKDAYS.map((day, index) => {
							const weekday = index + 1;
							return (
								<div
									key={day}
									className="relative rounded-md border border-border/60 bg-muted/20"
									style={{ height: BODY_HEIGHT }}
								>
									{boundaries.map((minute) => (
										<div
											key={minute}
											className="absolute inset-x-0 border-t border-border/40"
											style={{ top: `${percent(minute)}%` }}
										/>
									))}

									{slots.map((slot) => {
										const cell = cells.get(`${weekday}|${slot.period}|${slot.section}`);
										if (!cell || cell.names.size === 0) return null;

										const names = Array.from(cell.names).sort((a, b) =>
											a.localeCompare(b, "zh"),
										);
										const level =
											maxCount <= 1
												? INTENSITY_LEVELS[0]
												: INTENSITY_LEVELS[
														Math.round(
															((cell.names.size - 1) / (maxCount - 1)) *
																(INTENSITY_LEVELS.length - 1),
														)
													];
										const height = percent(slot.end) - percent(slot.start);
										const label = `${day}${slot.period}${slot.section}`;

										return (
											<div
												key={`${weekday}|${slot.period}|${slot.section}`}
												className="absolute inset-x-0.5"
												style={{
													top: `${percent(slot.start)}%`,
													height: `calc(${height}% - 2px)`,
												}}
											>
												<HoverCard openDelay={100} closeDelay={50}>
													<HoverCardTrigger asChild>
														<button
															type="button"
															aria-label={`${label} ${cell.names.size} 人`}
															className={cn(
																"flex h-full w-full items-center justify-center rounded-md text-xs font-semibold ring-1 ring-inset transition-colors",
																level.cell,
															)}
														>
															{cell.names.size}人
														</button>
													</HoverCardTrigger>
													<HoverCardContent
														side="right"
														align="start"
														className="w-60 text-sm"
													>
														<div className="font-medium">{label}</div>
														<div className="mt-0.5 text-xs text-muted-foreground">
															{formatMinutes(slot.start)} - {formatMinutes(slot.end)} · 共{" "}
															{cell.names.size} 人
														</div>
														<div className="mt-2 max-h-56 overflow-y-auto text-xs leading-relaxed">
															{names.join("、")}
														</div>
													</HoverCardContent>
												</HoverCard>
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
