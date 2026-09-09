"use client";

import { useCallback, useEffect, useState } from "react";
import { getSemesters } from "@/lib/api";
import { Semester } from "@/lib/schema";

interface UseSemestersResult {
    semesters: Semester[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useSemesters(): UseSemestersResult {
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSemesters = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getSemesters();
            setSemesters(response.semesters || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取学期列表失败"));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSemesters();
    }, [fetchSemesters]);

    return { semesters, isLoading, error, refetch: fetchSemesters };
}
