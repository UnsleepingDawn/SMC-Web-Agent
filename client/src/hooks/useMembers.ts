"use client";

import { useCallback, useEffect, useState } from "react";
import { getMembers } from "@/lib/api";
import { Member } from "@/lib/schema";

export interface MemberQuery {
    search?: string;
    advisor?: string;
    grade?: string;
    enrollment_status?: string;
    need_attendance?: boolean;
    is_active?: boolean;
}

interface UseMembersResult {
    members: Member[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useMembers(query: MemberQuery = {}): UseMembersResult {
    const [members, setMembers] = useState<Member[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const { search, advisor, grade, enrollment_status, need_attendance, is_active } = query;

    const fetchMembers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getMembers({
                search,
                advisor,
                grade,
                enrollment_status,
                need_attendance,
                is_active,
            });
            setMembers(response.members || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取人员列表失败"));
        } finally {
            setIsLoading(false);
        }
    }, [search, advisor, grade, enrollment_status, need_attendance, is_active]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    return { members, isLoading, error, refetch: fetchMembers };
}
