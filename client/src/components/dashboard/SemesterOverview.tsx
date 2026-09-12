import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { formatHhmm } from "@/lib/utils";

interface SemesterOverviewProps {
	semester: Semester;
	currentWeek: number | null;
}

export function SemesterOverview({ semester, currentWeek }: SemesterOverviewProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>当前学期</CardTitle>
				<CardDescription>第 1 周从 {semester.start_date} 开始。</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-2xl font-bold">{semester.name}</span>
					<Badge variant="secondary">第 {currentWeek ?? "-"} 周</Badge>
					{semester.is_active ? null : (
						<Badge variant="secondary" className="bg-muted text-muted-foreground">
							已停用
						</Badge>
					)}
				</div>
				<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-xs text-muted-foreground">本周日期</dt>
						<dd>
							{semester.week_start && semester.week_end
								? `${semester.week_start} ~ ${semester.week_end}`
								: "—"}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">默认组会时间</dt>
						<dd>
							{WEEKDAY_NAMES[semester.default_seminar_weekday - 1] ?? "—"}{" "}
							{formatHhmm(semester.default_seminar_start_time)}-
							{formatHhmm(semester.default_seminar_end_time)}
						</dd>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}
