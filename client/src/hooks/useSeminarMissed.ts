"use client";

import { useCallback, useEffect, useState } from "react";
import { getSeminarMissed } from "@/lib/api";
import { SeminarMissed } from "@/lib/schema";

interface UseSeminarMissedResult {
	summary: SeminarMissed | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/** Accumulated seminar absences per member, since their last attendance. */
export function useSeminarMissed(
	semesterId?: string,
	week?: number,
	refreshKey = 0,
): UseSeminarMissedResult {
	const [summary, setSummary] = useState<SeminarMissed | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchMissed = useCallback(async () => {
		if (!semesterId || !week) {
			setSummary(null);
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const response = await getSeminarMissed(semesterId, week);
			setSummary(response);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取缺勤次数失败"));
		} finally {
			setIsLoading(false);
		}
	}, [semesterId, week, refreshKey]);

	useEffect(() => {
		fetchMissed();
	}, [fetchMissed]);

	return { summary, isLoading, error, refetch: fetchMissed };
}
