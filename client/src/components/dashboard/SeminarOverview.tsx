"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSeminars } from "@/hooks/useSeminars";
import { Seminar, WEEKDAY_NAMES } from "@/lib/schema";

interface SeminarOverviewProps {
	semesterId: string;
	currentWeek: number | null;
}

function upcoming(seminars: Seminar[], currentWeek: number | null): Seminar | null {
	if (!currentWeek) return seminars.find((item) => !item.happened) ?? null;
	return (
		seminars.find((item) => item.week === currentWeek && !item.happened) ??
		seminars.find((item) => item.week >= currentWeek && !item.happened) ??
		null
	);
}

export function SeminarOverview({ semesterId, currentWeek }: SeminarOverviewProps) {
	const { seminars, isLoading } = useSeminars(semesterId);
	const next = upcoming(seminars, currentWeek);

	return (
		<Card>
			<CardHeader>
				<CardTitle>本周组会</CardTitle>
				<CardDescription>当前周次的组会安排与报告人。</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在加载...
					</div>
				) : !next ? (
					<p className="text-sm text-muted-foreground">本周还没有组会安排。</p>
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className="font-medium">第 {next.week} 周</span>
							<span className="text-muted-foreground">
								{WEEKDAY_NAMES[next.weekday - 1] ?? ""}
								{next.room ? ` · ${next.room}` : ""}
							</span>
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
