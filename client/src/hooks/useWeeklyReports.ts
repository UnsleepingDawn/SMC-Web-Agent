"use client";

import { useCallback, useEffect, useState } from "react";
import { getWeeklyReportStats } from "@/lib/api";
import { WeeklyReportStats } from "@/lib/schema";

interface UseWeeklyReportsResult {
    stats: WeeklyReportStats | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useWeeklyReports(
    week: number,
    semesterId?: string,
    refreshKey = 0,
): UseWeeklyReportsResult {
    const [stats, setStats] = useState<WeeklyReportStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchStats = useCallback(async () => {
        if (!week) {
            setStats(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await getWeeklyReportStats(week, semesterId);
            setStats(response);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取周报统计失败"));
        } finally {
            setIsLoading(false);
        }
    }, [week, semesterId, refreshKey]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return { stats, isLoading, error, refetch: fetchStats };
}
