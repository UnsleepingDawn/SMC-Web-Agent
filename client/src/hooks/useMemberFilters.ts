"use client";

import { useCallback, useEffect, useState } from "react";
import { getMemberFilters } from "@/lib/api";
import { MemberFilters } from "@/lib/schema";

interface UseMemberFiltersResult {
    filters: MemberFilters | null;
    isLoading: boolean;
    refetch: () => Promise<void>;
}

export function useMemberFilters(): UseMemberFiltersResult {
    const [filters, setFilters] = useState<MemberFilters | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        try {
            setFilters(await getMemberFilters());
        } catch (err) {
            console.error("获取筛选选项失败", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { filters, isLoading, refetch };
}
