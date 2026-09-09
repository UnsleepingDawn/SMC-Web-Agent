"use client";

import { useCallback, useEffect, useState } from "react";
import { getNotifications } from "@/lib/api";
import { Notification } from "@/lib/schema";

interface UseNotificationsResult {
    notifications: Notification[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useNotifications(limit = 50): UseNotificationsResult {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchNotifications = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getNotifications(limit);
            setNotifications(response.notifications || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("获取推送历史失败"));
        } finally {
            setIsLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    return { notifications, isLoading, error, refetch: fetchNotifications };
}
