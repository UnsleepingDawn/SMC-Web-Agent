"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSeminars } from "@/hooks/useSeminars";
import { nextSeminar } from "@/lib/dashboardWeek";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
interface SeminarOverviewProps {
	semester: Semester;
	semesterId: string;
	currentWeek: number | null;
	/** Bumped by the parent after a sync to force a reload. */
	refreshKey?: number;
}

export function SeminarOverview({
	semester,
	semesterId,
	currentWeek,
	refreshKey = 0,
}: SeminarOverviewProps) {
	const { seminars, isLoading } = useSeminars(semesterId, refreshKey);
	// The card always points at the next seminar: a passed or absent current week
	// falls through to a later one.
	const next = useMemo(
		() => nextSeminar(seminars, semester, currentWeek),
		[seminars, semester, currentWeek],
	);
	const isFutureWeek = next != null && currentWeek != null && next.week > currentWeek;

	return (
		<Card>
			<CardHeader>
				<CardTitle>组会信息</CardTitle>
				<CardDescription>下一次组会安排与报告人。</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在加载...
					</div>
				) : !next ? (
					<p className="text-sm text-muted-foreground">暂无后续组会安排。</p>
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className="font-medium">第 {next.week} 周</span>
							<span className="text-muted-foreground">
								{WEEKDAY_NAMES[next.weekday - 1] ?? ""}
								{next.room ? ` · ${next.room}` : ""}
							</span>
							{isFutureWeek ? (
								<span className="text-xs text-muted-foreground">
									（本周组会已结束 / 本周无组会）
								</span>
							) : null}
						</div>
						<ul className="space-y-3">
							{next.presentations.map((presentation) => (
								<li key={presentation.track} className="space-y-1 border-l-2 pl-3">
									<p className="text-xs text-muted-foreground">
										Track {presentation.track} · {presentation.presenter_name}
									</p>
									<p className="text-sm font-medium">{presentation.title}</p>
									{presentation.abstract ? (
										<p className="line-clamp-2 text-xs text-muted-foreground">
											{presentation.abstract}
										</p>
									) : null}
								</li>
							))}
						</ul>
						<Link
							href="/seminars"
							className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
						>
							查看组会管理与预告推送 →
						</Link>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
