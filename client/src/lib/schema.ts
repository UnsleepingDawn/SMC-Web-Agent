// Shared types mirroring the FastAPI responses. Status-like values are declared
// as `as const` arrays with a same-named union so they stay in sync with the
// backend without an enum.

export const JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SYNC_TASKS = [
	"members",
	"seminars",
	"weekly_reports",
	"attendance_group",
	"daily_attendance",
	"seminar_attendance",
	"seminar_leaves",
	"schedule",
] as const;
export type SyncTask = (typeof SYNC_TASKS)[number];

export const WEEKDAY_NAMES = [
	"周一",
	"周二",
	"周三",
	"周四",
	"周五",
	"周六",
	"周日",
] as const;

/** 在读情况取此值时才算「在读」，小组会议参会名单只允许在读成员。 */
export const ENROLLED_STATUS = "在读";

export interface Semester {
	id: string;
	name: string;
	start_date: string;
	default_seminar_weekday: number;
	default_seminar_start_time: string;
	default_seminar_end_time: string;
	default_seminar_tencent_id: string | null;
	default_seminar_tencent_link: string | null;
	is_active: boolean;
	weekly_report_app_token: string | null;
	weekly_report_table_id: string | null;
	weekly_report_url: string | null;
	schedule_app_token: string | null;
	schedule_table_id: string | null;
	schedule_url: string | null;
	seminar_app_token: string | null;
	seminar_table_id: string | null;
	seminar_url: string | null;
	seminar_leave_app_token: string | null;
	seminar_leave_table_id: string | null;
	seminar_leave_url: string | null;
	current_week?: number;
	week_start?: string;
	week_end?: string;
}

export interface Member {
	id: string;
	name: string;
	grade: string | null;
	advisor: string | null;
	advisor_user_id: string | null;
	cultivation_type: string | null;
	enrollment_status: string | null;
	feishu_account: string | null;
	student_id: string | null;
	union_id: string | null;
	feishu_user_id: string | null;
	email: string | null;
	mobile: string | null;
	department: string | null;
	need_attendance: boolean;
	is_active: boolean;
}

export interface MemberFilters {
	advisors: string[];
	grades: string[];
	enrollment_statuses: string[];
}

export interface SeminarPresentation {
	id?: string;
	seminar_id?: string;
	track: number;
	presenter_name: string;
	member_id?: string | null;
	title: string;
	abstract: string | null;
}

export interface Seminar {
	id: string;
	semester_id: string;
	week: number;
	weekday: number;
	happened: boolean;
	room: string | null;
	offline_advisor: string | null;
	presentations: SeminarPresentation[];
}

export interface WeeklyReport {
	id: string;
	semester_id: string;
	week: number;
	member_id: string | null;
	member_name: string;
	doc_link: string | null;
	attachments: { file_token?: string; name?: string }[];
	record_id: string | null;
}

export interface WeeklyReportStats {
	semester: Semester;
	week: number;
	submitted: WeeklyReport[];
	missing: Member[];
	submitted_count: number;
	missing_count: number;
}

export interface Notification {
	id: string;
	channel: string;
	template_key: string;
	target: string;
	payload: Record<string, unknown>;
	status: JobStatus;
	error: string | null;
	sent_at: string | null;
	created_at: string | null;
}

export interface SyncRun {
	id: string;
	job_id: string | null;
	task_name: string;
	semester_id: string | null;
	week: number | null;
	status: JobStatus;
	error: string | null;
	payload: Record<string, unknown>;
	started_at: string | null;
	completed_at: string | null;
	created_at: string | null;
}

/** A push target: a lab member (open_id) or a group chat (chat_id). */
export interface Recipient {
	receive_id: string;
	receive_id_type: "open_id" | "chat_id";
	name: string;
	kind: "user" | "chat";
	subtitle: string;
}

export interface FeishuConfig {
	app_id: string;
	app_secret_configured: boolean;
	configured: boolean;
}

/** A rendered Feishu post payload, as produced by the server templates. */
export interface PostMessage {
	zh_cn: {
		title: string;
		content: Record<string, unknown>[][];
	};
}

/* --------------------------------------------------------------- attendance */

export interface AttendanceGroupMember {
	id: string;
	attendance_group_id: string;
	member_id: string | null;
	feishu_user_id: string;
	name: string | null;
}

export interface AttendanceGroupInfo {
	group_name: string;
	feishu_group_id: string | null;
	members: AttendanceGroupMember[];
}

export interface DailyAttendanceRow {
	member_name: string;
	days: Record<string, string>;
	absent_count: number;
	late_count: number;
}

export interface DailyAttendanceSummary {
	week: number;
	dates: string[];
	rows: DailyAttendanceRow[];
	chart: { name: string; absent: number; late: number }[];
}

export interface SeminarLeave {
	id: string;
	semester_id: string;
	week: number;
	member_name: string;
	reason: string | null;
}

export interface SeminarAttendanceSummary {
	week: number;
	weekday: number;
	seminar_date: string;
	period: string;
	expected: string[];
	attended: string[];
	absent: string[];
	leave: { member_name: string; reason: string | null }[];
	course_exempt: string[];
	source: "flow" | "relay" | "manual";
}

export interface ScheduleEntry {
	id: string;
	semester_id: string;
	weekday: number;
	period: string;
	section: string;
	member_name: string;
}

/* ----------------------------------------------------------- group meeting */

export const GROUP_MEETING_STATUSES = [
	"pending",
	"solving",
	"completed",
	"failed",
] as const;
export type GroupMeetingStatus = (typeof GROUP_MEETING_STATUSES)[number];

export interface GroupMeetingSlot {
	name: string;
	day: string;
	period: string;
	start: string;
	end: string;
}

export interface GroupMeetingPlan {
	id: string;
	status: GroupMeetingStatus;
	job_id: string | null;
	params: {
		name_list: string[];
		already_grouped: string[][];
		meeting_periods: string[];
		weights: Record<string, number>;
		slots: GroupMeetingSlot[];
		busy_count: number;
	};
	result: Record<string, string[][]>;
	validation: {
		missing: string[];
		conflicts: { name: string; slot: string }[];
		message?: string;
	};
	solver_status: string | null;
	error: string | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface GroupMeetingConfig {
	periods: {
		period: string;
		slots: { label: string; start: string; end: string }[];
	}[];
	weights: Record<string, number>;
}

/** The planner form state the signed-in user last submitted for a semester. */
export interface GroupMeetingDraft {
	name_list: string[];
	already_grouped: string[][];
	meeting_periods: string[];
}
