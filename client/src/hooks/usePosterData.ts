"use client";

import { useAttendanceOverview } from "@/hooks/useAttendanceOverview";
import { useSeminarMissed } from "@/hooks/useSeminarMissed";
import { useSeminars } from "@/hooks/useSeminars";
import { useWeeklyReportMissed } from "@/hooks/useWeeklyReportMissed";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";
import type {
	DailyAttendanceSummary,
	Seminar,
	SeminarAttendanceSummary,
	SeminarMissed,
	WeeklyReportMissed,
	WeeklyReportStats,
} from "@/lib/schema";

export interface PosterDataBundle {
	seminars: Seminar[];
	weeklyStats: WeeklyReportStats | null;
	weeklyMissed: WeeklyReportMissed | null;
	daily: DailyAttendanceSummary | null;
	seminarAttendance: SeminarAttendanceSummary | null;
	seminarMissed: SeminarMissed | null;
	isLoading: boolean;
	error: Error | null;
}

/**
 * Everything the poster needs, gathered from the same hooks the dashboard
 * cards use so both surfaces always agree on the numbers.
 */
export function usePosterData(
	semesterId: string | undefined,
	week: number | null,
	refreshKey = 0,
): PosterDataBundle {
	const seminars = useSeminars(semesterId, refreshKey);
	const weeklyReports = useWeeklyReports(week ?? 0, semesterId, refreshKey);
	const weeklyMissed = useWeeklyReportMissed(week ?? 0, semesterId, refreshKey);
	const attendance = useAttendanceOverview(semesterId, week ?? undefined, refreshKey);
	const seminarMissed = useSeminarMissed(semesterId, week ?? undefined, refreshKey);

	return {
		seminars: seminars.seminars,
		weeklyStats: weeklyReports.stats,
		weeklyMissed: weeklyMissed.summary,
		daily: attendance.daily,
		seminarAttendance: attendance.seminar,
		seminarMissed: seminarMissed.summary,
		isLoading:
			seminars.isLoading ||
			weeklyReports.isLoading ||
			weeklyMissed.isLoading ||
			attendance.isLoading ||
			seminarMissed.isLoading,
		error:
			seminars.error ??
			weeklyReports.error ??
			weeklyMissed.error ??
			attendance.error ??
			seminarMissed.error,
	};
}
