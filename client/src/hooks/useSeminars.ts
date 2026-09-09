"use client";

import { useCallback, useEffect, useState } from "react";
import { getSeminars } from "@/lib/api";
import { Seminar } from "@/lib/schema";

interface UseSeminarsResult {
    seminars: Seminar[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useSeminars(semesterId?: string): UseSeminarsResult {
    const [seminars, setSeminars] = useState<Seminar[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSeminars = useCallback(async () => {
        if (!semesterId) {
            setSeminars([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await getSeminars(semesterId);
            setSeminars(response.seminars || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取组会安排失败"));
        } finally {
            setIsLoading(false);
        }
    }, [semesterId]);

    useEffect(() => {
        fetchSeminars();
    }, [fetchSeminars]);

    return { seminars, isLoading, error, refetch: fetchSeminars };
}
