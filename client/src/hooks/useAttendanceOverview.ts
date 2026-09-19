"use client";

import { useCallback, useEffect, useState } from "react";
import { getDailyAttendance, getSeminarAttendance } from "@/lib/api";
import type { DailyAttendanceSummary, SeminarAttendanceSummary } from "@/lib/schema";

interface UseAttendanceOverviewResult {
	daily: DailyAttendanceSummary | null;
	seminar: SeminarAttendanceSummary | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/** Dashboard-level attendance: only the daily chart and this week's seminar. */
export function useAttendanceOverview(
	semesterId?: string,
	week?: number,
	refreshKey = 0,
): UseAttendanceOverviewResult {
	const [daily, setDaily] = useState<DailyAttendanceSummary | null>(null);
	const [seminar, setSeminar] = useState<SeminarAttendanceSummary | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchAll = useCallback(async () => {
		if (!semesterId || !week) {
			setDaily(null);
			setSeminar(null);
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const [dailyResponse, seminarResponse] = await Promise.all([
				getDailyAttendance(semesterId, week),
				getSeminarAttendance(semesterId, week),
			]);
			setDaily(dailyResponse);
			setSeminar(seminarResponse);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取考勤数据失败"));
		} finally {
			setIsLoading(false);
		}
	}, [semesterId, week, refreshKey]);

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	return { daily, seminar, isLoading, error, refetch: fetchAll };
}
