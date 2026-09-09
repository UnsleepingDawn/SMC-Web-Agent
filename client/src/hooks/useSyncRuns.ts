"use client";

import { useCallback, useEffect, useState } from "react";
import { getSyncRuns } from "@/lib/api";
import { SyncRun } from "@/lib/schema";

interface UseSyncRunsResult {
    runs: SyncRun[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useSyncRuns(limit = 20): UseSyncRunsResult {
    const [runs, setRuns] = useState<SyncRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchRuns = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getSyncRuns(limit);
            setRuns(response.runs || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取同步记录失败"));
        } finally {
            setIsLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchRuns();
    }, [fetchRuns]);

    return { runs, isLoading, error, refetch: fetchRuns };
}
