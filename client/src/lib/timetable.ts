/**
 * University bell schedule, mirroring the server-side `SYSU_SCHEDULE`
 * (`server/app/helpers/meeting_slots.py`). Course slots parsed from the Feishu
 * bitable only carry `period` / `section` labels, so the week view needs this
 * table to place them on a real time axis.
 */

export interface ClassSectionTime {
	start: string;
	end: string;
}

/** period -> section -> (start, end), as "HH:MM". */
export const CLASS_SECTION_TIMES: Record<string, Record<string, ClassSectionTime>> = {
	"上午": {
		"第1节": { start: "08:00", end: "08:45" },
		"第2节": { start: "08:55", end: "09:40" },
		"第3节": { start: "10:10", end: "10:55" },
		"第4节": { start: "11:05", end: "11:50" },
	},
	"下午": {
		"第1节": { start: "14:20", end: "15:05" },
		"第2节": { start: "15:15", end: "16:00" },
		"第3节": { start: "16:30", end: "17:15" },
		"第4节": { start: "17:25", end: "18:10" },
	},
	"晚上": {
		"第1节": { start: "19:00", end: "19:45" },
		"第2节": { start: "19:55", end: "20:40" },
		"第3节": { start: "20:50", end: "21:35" },
	},
};

/** A day-independent break shown as one band across the whole week view. */
export interface BreakSpan {
	label: string;
	start: string;
	end: string;
}

/** Breaks shared by every weekday, as "HH:MM". */
export const BREAK_SPANS: BreakSpan[] = [
	{ label: "课间", start: "09:40", end: "10:10" },
	{ label: "午休", start: "11:50", end: "14:20" },
	{ label: "课间", start: "16:00", end: "16:30" },
	{ label: "晚餐", start: "18:10", end: "19:00" },
];

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(hhmm: string): number {
	const [hour, minute] = hhmm.split(":");
	return Number(hour) * 60 + Number(minute);
}
