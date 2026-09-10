import type {
	AttendanceGroupInfo,
	DailyAttendanceSummary,
	FeishuConfig,
	GroupMeetingConfig,
	GroupMeetingPlan,
	Member,
	MemberFilters,
	Notification,
	PostMessage,
	ScheduleEntry,
	Seminar,
	SeminarAttendanceSummary,
	SeminarLeave,
	Semester,
	SyncRun,
	SyncTask,
	WeeklyReportStats,
} from '@/lib/schema';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchFromApi(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {};

    // Only set Content-Type to application/json if we're not sending FormData
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
        credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
        let errorMessage: unknown = `API error: ${response.status}`;

        try {
            const errorData = await response.json();
            if (errorData.message) {
                errorMessage = errorData.message;
            } else if (errorData.error) {
                errorMessage = errorData.error;
            } else if (errorData.detail) {
                errorMessage = errorData.detail;
            }
        } catch {
            // If we can't parse the error response, fall back to status text
            errorMessage = `API error: ${response.status} ${response.statusText}`;
        }

        if (typeof errorMessage !== 'string') {
            errorMessage = JSON.stringify(errorMessage);
        }

        throw new Error(errorMessage as string)
    }

    if (response.status === 204) {
        return null; // No content to return
    }

    return response.json();
}

export async function changePassword(
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    await fetchFromApi('/api/auth/local/password', {
        method: 'POST',
        body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
        }),
    });
}

/* ---------------------------------------------------------------- semesters */

export function getSemesters(): Promise<{ semesters: Semester[] }> {
    return fetchFromApi('/api/semesters');
}

export function getCurrentSemester(): Promise<{
    semester: Semester | null;
    current_week: number | null;
}> {
    return fetchFromApi('/api/semesters/current');
}

export function createSemester(payload: Partial<Semester>): Promise<{ semester: Semester }> {
    return fetchFromApi('/api/semesters', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function updateSemester(
    semesterId: string,
    payload: Partial<Semester>,
): Promise<{ semester: Semester }> {
    return fetchFromApi(`/api/semesters/${semesterId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

export function deleteSemester(semesterId: string): Promise<{ message: string }> {
    return fetchFromApi(`/api/semesters/${semesterId}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ members */

export function getMembers(params: Record<string, string | boolean | undefined> = {}): Promise<{
    members: Member[];
}> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== null) {
            query.set(key, String(value));
        }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return fetchFromApi(`/api/members${suffix}`);
}

export function getMemberFilters(): Promise<MemberFilters> {
    return fetchFromApi('/api/members/filters');
}

export function updateMember(memberId: string, payload: Partial<Member>): Promise<{ member: Member }> {
    return fetchFromApi(`/api/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

export function exportSignatureSheet(): Promise<{ file_url: string; count: number }> {
    return fetchFromApi('/api/members/export/signature-sheet', { method: 'POST' });
}

/* ----------------------------------------------------------------- seminars */

export function getSeminars(semesterId: string): Promise<{ seminars: Seminar[] }> {
    return fetchFromApi(`/api/seminars?semester_id=${semesterId}`);
}

export function updateSeminar(seminarId: string, payload: Partial<Seminar>): Promise<{ seminar: Seminar }> {
    return fetchFromApi(`/api/seminars/${seminarId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

export function updatePresentations(
    seminarId: string,
    presentations: Seminar['presentations'],
): Promise<{ seminar: Seminar }> {
    return fetchFromApi(`/api/seminars/${seminarId}/presentations`, {
        method: 'PUT',
        body: JSON.stringify({ presentations }),
    });
}

export function previewSeminar(semesterId: string, week: number): Promise<{ payload: PostMessage }> {
    return fetchFromApi(`/api/seminars/${semesterId}/preview?week=${week}`);
}

export function pushSeminar(
    semesterId: string,
    week: number,
    payload: { receive_id: string; receive_id_type?: string },
): Promise<{ notification_id: string; task_id: string }> {
    return fetchFromApi(`/api/seminars/${semesterId}/push?week=${week}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/* ------------------------------------------------------------ weekly reports */

export function getWeeklyReportStats(
    week: number,
    semesterId?: string,
): Promise<WeeklyReportStats> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports?${query.toString()}`);
}

export function previewWeeklySummary(
    week: number,
    semesterId?: string,
): Promise<{ payload: PostMessage }> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports/summary?${query.toString()}`);
}

export function remindMissingReports(
    week: number,
    semesterId?: string,
    message?: string,
): Promise<{ sent: number; tasks?: { member: string; task_id: string }[]; message?: string }> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    if (message) query.set('message', message);
    return fetchFromApi(`/api/weekly-reports/remind?${query.toString()}`, {
        method: 'POST',
    });
}

export function pushWeeklySummary(
    week: number,
    payload: { receive_id: string; receive_id_type?: string },
    semesterId?: string,
): Promise<{ notification_id: string; task_id: string }> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports/push?${query.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/* ------------------------------------------------------------ notifications */

export function getNotifications(limit = 50): Promise<{ notifications: Notification[] }> {
    return fetchFromApi(`/api/notifications?limit=${limit}`);
}

/* --------------------------------------------------------------------- sync */

export function startSync(payload: {
    task: SyncTask;
    semester_id: string;
    week?: number;
}): Promise<{ run_id: string; job_id: string; status: string }> {
    return fetchFromApi('/api/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function getSyncRuns(limit = 20): Promise<{ runs: SyncRun[] }> {
    return fetchFromApi(`/api/sync/runs?limit=${limit}`);
}

export function getSyncRun(runId: string): Promise<{ run: SyncRun }> {
    return fetchFromApi(`/api/sync/runs/${runId}`);
}

/* ----------------------------------------------------------------- settings */

export function getFeishuConfig(): Promise<FeishuConfig> {
    return fetchFromApi('/api/settings/feishu');
}

export function saveFeishuConfig(payload: {
    app_id: string;
    app_secret: string;
}): Promise<FeishuConfig> {
    return fetchFromApi('/api/settings/feishu', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

/* -------------------------------------------------------------- attendance */

export function getAttendanceGroup(): Promise<AttendanceGroupInfo> {
    return fetchFromApi('/api/attendance/group');
}

export function getDailyAttendance(
    semesterId: string,
    week: number,
): Promise<DailyAttendanceSummary> {
    return fetchFromApi(`/api/attendance/daily?semester_id=${semesterId}&week=${week}`);
}

export function exportDailyAttendance(
    semesterId: string,
    week: number,
): Promise<{ file_url: string; week: number }> {
    return fetchFromApi(
        `/api/attendance/daily/export?semester_id=${semesterId}&week=${week}`,
        { method: 'POST' },
    );
}

export function getSeminarAttendance(
    semesterId: string,
    week: number,
): Promise<SeminarAttendanceSummary> {
    return fetchFromApi(`/api/attendance/seminar?semester_id=${semesterId}&week=${week}`);
}

export function submitSeminarRelay(payload: {
    semester_id: string;
    week: number;
    text: string;
}): Promise<{ count: number; names: string[] }> {
    return fetchFromApi('/api/attendance/seminar/relay', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function setSeminarManual(payload: {
    semester_id: string;
    week: number;
    observed_names: string[];
}): Promise<{ count: number; names: string[] }> {
    return fetchFromApi('/api/attendance/seminar/manual', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

export function getSeminarLeaves(
    semesterId: string,
    week: number,
): Promise<{ leaves: SeminarLeave[] }> {
    return fetchFromApi(`/api/attendance/leaves?semester_id=${semesterId}&week=${week}`);
}

export function getSchedule(semesterId: string): Promise<{ entries: ScheduleEntry[] }> {
    return fetchFromApi(`/api/attendance/schedule?semester_id=${semesterId}`);
}

/* ------------------------------------------------------------ group meeting */

export function getGroupMeetingConfig(): Promise<GroupMeetingConfig> {
    return fetchFromApi('/api/group-meeting/config');
}

export function createGroupMeetingPlan(payload: {
    semester_id: string;
    name_list: string[];
    already_grouped: string[][];
    meeting_periods: string[];
    weights?: Record<string, number>;
}): Promise<{ plan_id: string; job_id: string; status: string }> {
    return fetchFromApi('/api/group-meeting/plans', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function getGroupMeetingPlans(limit = 20): Promise<{ plans: GroupMeetingPlan[] }> {
    return fetchFromApi(`/api/group-meeting/plans?limit=${limit}`);
}

export function getGroupMeetingPlan(planId: string): Promise<{ plan: GroupMeetingPlan }> {
    return fetchFromApi(`/api/group-meeting/plans/${planId}`);
}
