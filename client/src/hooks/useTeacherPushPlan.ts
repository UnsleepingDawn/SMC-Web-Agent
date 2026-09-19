"use client";

import { useCallback, useEffect, useState } from "react";
import { getTeacherPushPlan } from "@/lib/api";
import { TeacherPushPlan } from "@/lib/schema";

interface UseTeacherPushPlanResult {
	plan: TeacherPushPlan | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

export function useTeacherPushPlan(
	week: number,
	semesterId?: string,
): UseTeacherPushPlanResult {
	const [plan, setPlan] = useState<TeacherPushPlan | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchPlan = useCallback(async () => {
		if (!week) {
			setPlan(null);
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const response = await getTeacherPushPlan(week, semesterId);
			setPlan(response);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取老师推送计划失败"));
		} finally {
			setIsLoading(false);
		}
	}, [week, semesterId]);

	useEffect(() => {
		fetchPlan();
	}, [fetchPlan]);

	return { plan, isLoading, error, refetch: fetchPlan };
}
