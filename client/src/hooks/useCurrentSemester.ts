"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentSemester } from "@/lib/api";
import { Semester } from "@/lib/schema";

interface UseCurrentSemesterResult {
    semester: Semester | null;
    currentWeek: number | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useCurrentSemester(): UseCurrentSemesterResult {
    const [semester, setSemester] = useState<Semester | null>(null);
    const [currentWeek, setCurrentWeek] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getCurrentSemester();
            setSemester(response.semester);
            setCurrentWeek(response.current_week);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取当前学期失败"));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { semester, currentWeek, isLoading, error, refetch };
}
