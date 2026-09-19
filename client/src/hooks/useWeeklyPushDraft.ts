"use client";

import { useCallback, useEffect, useState } from "react";
import { getWeeklyPushDraft, saveWeeklyPushDraft } from "@/lib/api";
import type { WeeklyPushDraft } from "@/lib/schema";

interface UseWeeklyPushDraftResult {
	draft: WeeklyPushDraft | null;
	/** True until the draft for the current semester has settled, so callers do not
	 * mistake "not fetched yet" for "no draft saved". */
	isLoading: boolean;
	save: (payload: WeeklyPushDraft) => Promise<void>;
}

/** Load and persist the teacher selection for one semester. */
export function useWeeklyPushDraft(
	semesterId: string | null,
): UseWeeklyPushDraftResult {
	const [draft, setDraft] = useState<WeeklyPushDraft | null>(null);
	const [loadedFor, setLoadedFor] = useState<string | null>(null);

	useEffect(() => {
		if (!semesterId) {
			setDraft(null);
			setLoadedFor(null);
			return;
		}
		let cancelled = false;
		getWeeklyPushDraft(semesterId)
			.then((response) => {
				if (!cancelled) setDraft(response.draft);
			})
			.catch(() => {
				if (!cancelled) setDraft(null);
			})
			.finally(() => {
				if (!cancelled) setLoadedFor(semesterId);
			});
		return () => {
			cancelled = true;
		};
	}, [semesterId]);

	const save = useCallback(
		async (payload: WeeklyPushDraft) => {
			if (!semesterId) return;
			const response = await saveWeeklyPushDraft({
				semester_id: semesterId,
				...payload,
			});
			setDraft(response.draft);
		},
		[semesterId],
	);

	return {
		draft,
		isLoading: semesterId !== null && loadedFor !== semesterId,
		save,
	};
}
