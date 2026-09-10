"use client";

import { useCallback, useEffect, useState } from "react";
import { getGroupMeetingDraft, saveGroupMeetingDraft } from "@/lib/api";
import type { GroupMeetingDraft } from "@/lib/schema";

interface UseGroupMeetingDraftResult {
	draft: GroupMeetingDraft | null;
	isLoading: boolean;
	save: (payload: GroupMeetingDraft) => Promise<void>;
}

/** Load and persist the group-meeting selection for one semester. */
export function useGroupMeetingDraft(
	semesterId: string | null,
): UseGroupMeetingDraftResult {
	const [draft, setDraft] = useState<GroupMeetingDraft | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!semesterId) {
			setDraft(null);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		getGroupMeetingDraft(semesterId)
			.then((response) => {
				if (!cancelled) setDraft(response.draft);
			})
			.catch(() => {
				if (!cancelled) setDraft(null);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [semesterId]);

	const save = useCallback(
		async (payload: GroupMeetingDraft) => {
			if (!semesterId) return;
			const response = await saveGroupMeetingDraft({
				semester_id: semesterId,
				...payload,
			});
			setDraft(response.draft);
		},
		[semesterId],
	);

	return { draft, isLoading, save };
}
