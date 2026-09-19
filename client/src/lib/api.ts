import type {
	AttendanceGroupInfo,
	DailyAttendanceSummary,
	FeishuConfig,
	GroupMeetingConfig,
	GroupMeetingDraft,
	GroupMeetingPlan,
	Member,
	MemberFilters,
	Notification,
	PostMessage,
	Recipient,
	ScheduleEntry,
	Seminar,
	SeminarAttendanceSummary,
	SeminarLeave,
	Semester,
	SyncRun,
	SyncTask,
	TeacherPushPlan,
	PushTeacherResult,
	WeeklyPushConfig,
	WeeklyPushDraft,
	WeeklyReportMissed,
	WeeklyReportStats,
} from '@/lib/schema';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/* ------------------------------------------------ pending request tracking */

type PendingRequestsListener = (count: number) => void;

const pendingRequestsListeners = new Set<PendingRequestsListener>();
let pendingRequestsCount = 0;

function emitPendingRequests() {
    pendingRequestsListeners.forEach((listener) => listener(pendingRequestsCount));
}

/** Subscribes to the number of in-flight API requests (used by the route loading overlay). */
export function subscribePendingRequests(listener: PendingRequestsListener): () => void {
    pendingRequestsListeners.add(listener);
    listener(pendingRequestsCount);
    return () => {
        pendingRequestsListeners.delete(listener);
    };
}

function trackRequest<T>(promise: Promise<T>): Promise<T> {
    pendingRequestsCount += 1;
    emitPendingRequests();
    return promise.finally(() => {
        pendingRequestsCount -= 1;
        emitPendingRequests();
    });
}

export function fetchFromApi(endpoint: string, options: RequestInit = {}) {
    return trackRequest(fetchFromApiInner(endpoint, options));
}

async function fetchFromApiInner(endpoint: string, options: RequestInit = {}) {
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

export function uploadAvatar(file: Blob): Promise<{ success: boolean; message: string }> {
    const formData = new FormData();
    formData.append('file', file, 'avatar.jpg');
    return fetchFromApi('/api/auth/avatar', {
        method: 'POST',
        body: formData,
    });
}

export function deleteAvatar(): Promise<{ success: boolean; message: string }> {
    return fetchFromApi('/api/auth/avatar', { method: 'DELETE' });
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

/** Accumulated missed weeks per member, since their last submission. */
export function getWeeklyReportMissed(
    week: number,
    semesterId?: string,
): Promise<WeeklyReportMissed> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports/missed?${query.toString()}`);
}

export function getTeacherPushPlan(
    week: number,
    semesterId?: string,
): Promise<TeacherPushPlan> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports/teacher-push?${query.toString()}`);
}

/** `audience: 'admin'` is the dry run that reaches only the admin. */
export function pushTeacherReports(
    week: number,
    payload: { teacher_names: string[]; audience: 'teachers' | 'admin' },
    semesterId?: string,
): Promise<PushTeacherResult> {
    const query = new URLSearchParams({ week: String(week) });
    if (semesterId) query.set('semester_id', semesterId);
    return fetchFromApi(`/api/weekly-reports/teacher-push?${query.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
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

/** The signed-in user's last teacher selection for the semester. */
export function getWeeklyPushDraft(
    semesterId: string,
): Promise<{ draft: WeeklyPushDraft | null }> {
    const query = new URLSearchParams({ semester_id: semesterId });
    return fetchFromApi(`/api/weekly-reports/push-draft?${query.toString()}`);
}

export function saveWeeklyPushDraft(payload: {
    semester_id: string;
    teacher_names: string[];
    expanded_teachers: string[];
}): Promise<{ draft: WeeklyPushDraft | null }> {
    return fetchFromApi('/api/weekly-reports/push-draft', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

/* ------------------------------------------------------------ notifications */

export function getNotifications(limit = 50): Promise<{ notifications: Notification[] }> {
    return fetchFromApi(`/api/notifications?limit=${limit}`);
}

/** Empty `search` returns the most recent push targets; otherwise name matches. */
export function searchRecipients(search = '', limit = 20): Promise<{ recipients: Recipient[] }> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (search.trim()) query.set('search', search.trim());
    return fetchFromApi(`/api/notifications/recipients?${query.toString()}`);
}

/** Statuses for a batch of notification ids. */
export function getNotificationStatuses(
    ids: string[],
): Promise<{ notifications: Notification[] }> {
    const query = new URLSearchParams({ ids: ids.join(',') });
    return fetchFromApi(`/api/notifications/statuses?${query.toString()}`);
}

interface WaitForNotificationsResult {
    settled: Notification[];
    timedOutIds: string[];
}

/**
 * Poll until every notification settles (sent or failed) or the timeout hits.
 * The Feishu call happens in the worker, so the POST response cannot tell us
 * whether the message actually went out.
 */
export async function waitForNotifications(
    ids: string[],
    { intervalMs = 2000, timeoutMs = 30000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<WaitForNotificationsResult> {
    if (ids.length === 0) return { settled: [], timedOutIds: [] };
    const deadline = Date.now() + timeoutMs;
    const settledById = new Map<string, Notification>();

    for (;;) {
        try {
            const response = await getNotificationStatuses(ids);
            for (const record of response.notifications ?? []) {
                if (record.status === 'sent' || record.status === 'failed') {
                    settledById.set(record.id, record);
                }
            }
        } catch (error) {
            console.error('轮询推送状态失败', error);
        }
        if (settledById.size === ids.length) break;
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
        settled: [...settledById.values()],
        timedOutIds: ids.filter((id) => !settledById.has(id)),
    };
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

export function getWeeklyPushConfig(): Promise<WeeklyPushConfig> {
    return fetchFromApi('/api/settings/weekly-push');
}

export function saveWeeklyPushConfig(payload: {
    admin_open_id: string;
}): Promise<WeeklyPushConfig> {
    return fetchFromApi('/api/settings/weekly-push', {
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

export function getGroupMeetingDraft(
    semesterId: string,
): Promise<{ draft: GroupMeetingDraft | null }> {
    const query = new URLSearchParams({ semester_id: semesterId });
    return fetchFromApi(`/api/group-meeting/draft?${query.toString()}`);
}

export function saveGroupMeetingDraft(payload: {
    semester_id: string;
    name_list: string[];
    already_grouped: string[][];
    meeting_periods: string[];
}): Promise<{ draft: GroupMeetingDraft | null }> {
    return fetchFromApi('/api/group-meeting/draft', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
