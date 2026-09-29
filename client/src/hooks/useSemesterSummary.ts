"use client";

import { useCallback, useEffect, useState } from "react";
import { getSemesterSummary } from "@/lib/api";
import type { SemesterSummary } from "@/lib/schema";

interface UseSemesterSummaryResult {
	summary: SemesterSummary | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/**
 * Term-wide metrics for one semester. `endWeek` is left undefined until the
 * user picks one, so the server's "finished semester ends at its end date"
 * rule supplies the default.
 */
export function useSemesterSummary(
	semesterId?: string,
	endWeek?: number,
	refreshKey = 0,
): UseSemesterSummaryResult {
	const [summary, setSummary] = useState<SemesterSummary | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchSummary = useCallback(async () => {
		if (!semesterId) {
			setSummary(null);
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			setSummary(await getSemesterSummary(semesterId, endWeek));
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取学期总结失败"));
		} finally {
			setIsLoading(false);
		}
	}, [semesterId, endWeek, refreshKey]);

	useEffect(() => {
		fetchSummary();
	}, [fetchSummary]);

	return { summary, isLoading, error, refetch: fetchSummary };
}
