"use client";

import { useCallback, useEffect, useState } from "react";
import { getWeeklyReportMissed } from "@/lib/api";
import { WeeklyReportMissed } from "@/lib/schema";

interface UseWeeklyReportMissedResult {
	summary: WeeklyReportMissed | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

export function useWeeklyReportMissed(
	week: number,
	semesterId?: string,
	refreshKey = 0,
): UseWeeklyReportMissedResult {
	const [summary, setSummary] = useState<WeeklyReportMissed | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchMissed = useCallback(async () => {
		if (!week) {
			setSummary(null);
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const response = await getWeeklyReportMissed(week, semesterId);
			setSummary(response);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取缺交次数失败"));
		} finally {
			setIsLoading(false);
		}
	}, [week, semesterId, refreshKey]);

	useEffect(() => {
		fetchMissed();
	}, [fetchMissed]);

	return { summary, isLoading, error, refetch: fetchMissed };
}
