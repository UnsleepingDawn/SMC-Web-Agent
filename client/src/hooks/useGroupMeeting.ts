"use client";

import { useCallback, useEffect, useState } from "react";
import { getGroupMeetingConfig, getGroupMeetingPlan, getGroupMeetingPlans } from "@/lib/api";
import type { GroupMeetingConfig, GroupMeetingPlan } from "@/lib/schema";

interface UseGroupMeetingResult {
	config: GroupMeetingConfig | null;
	plans: GroupMeetingPlan[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/** Solver config plus recent plans, polling while a plan is still solving. */
export function useGroupMeeting(): UseGroupMeetingResult {
	const [config, setConfig] = useState<GroupMeetingConfig | null>(null);
	const [plans, setPlans] = useState<GroupMeetingPlan[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchAll = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [configResponse, plansResponse] = await Promise.all([
				getGroupMeetingConfig(),
				getGroupMeetingPlans(),
			]);
			setConfig(configResponse);
			setPlans(plansResponse.plans);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取排班数据失败"));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	const activePlan = plans.find(
		(plan) => plan.status === "solving" || plan.status === "pending",
	);

	useEffect(() => {
		if (!activePlan) return;
		const timer = setInterval(async () => {
			try {
				const response = await getGroupMeetingPlan(activePlan.id);
				setPlans((previous) =>
					previous.map((plan) =>
						plan.id === response.plan.id ? response.plan : plan,
					),
				);
			} catch (err) {
				console.error("轮询排班状态失败", err);
			}
		}, 2000);
		return () => clearInterval(timer);
	}, [activePlan?.id]);

	return { config, plans, isLoading, error, refetch: fetchAll };
}
