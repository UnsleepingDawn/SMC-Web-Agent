"use client";

import { useCallback, useEffect, useState } from "react";
import {
	getAttendanceGroup,
	getDailyAttendance,
	getSchedule,
	getSeminarAttendance,
	getSeminarLeaves,
} from "@/lib/api";
import type {
	AttendanceGroupInfo,
	DailyAttendanceSummary,
	ScheduleEntry,
	SeminarAttendanceSummary,
	SeminarLeave,
} from "@/lib/schema";

interface UseAttendanceResult {
	daily: DailyAttendanceSummary | null;
	seminar: SeminarAttendanceSummary | null;
	group: AttendanceGroupInfo | null;
	leaves: SeminarLeave[];
	schedule: ScheduleEntry[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/** One week of attendance: daily table, seminar list, leaves and the timetable. */
export function useAttendance(
	semesterId?: string,
	week?: number,
): UseAttendanceResult {
	const [daily, setDaily] = useState<DailyAttendanceSummary | null>(null);
	const [seminar, setSeminar] = useState<SeminarAttendanceSummary | null>(null);
	const [group, setGroup] = useState<AttendanceGroupInfo | null>(null);
	const [leaves, setLeaves] = useState<SeminarLeave[]>([]);
	const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchAll = useCallback(async () => {
		if (!semesterId || !week) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const [dailyResponse, seminarResponse, groupResponse, leaveResponse, scheduleResponse] =
				await Promise.all([
					getDailyAttendance(semesterId, week),
					getSeminarAttendance(semesterId, week),
					getAttendanceGroup(),
					getSeminarLeaves(semesterId, week),
					getSchedule(semesterId),
				]);
			setDaily(dailyResponse);
			setSeminar(seminarResponse);
			setGroup(groupResponse);
			setLeaves(leaveResponse.leaves);
			setSchedule(scheduleResponse.entries);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("获取考勤数据失败"));
		} finally {
			setIsLoading(false);
		}
	}, [semesterId, week]);

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	return { daily, seminar, group, leaves, schedule, isLoading, error, refetch: fetchAll };
}
