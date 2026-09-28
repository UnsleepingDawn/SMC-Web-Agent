/**
 * Which roster the seminar attendance page shows for one week.
 *
 * The server keeps the synced clock-in rows and the manual override rows side
 * by side, so the page can flip between them. The choice is a per-week display
 * preference, so it lives in the browser rather than in the database.
 */
export type SeminarView = "override" | "flow";

const STORAGE_PREFIX = "smc:seminar-view";

function storageKey(semesterId: string, week: number): string {
	return `${STORAGE_PREFIX}:${semesterId}:${week}`;
}

/** The stored choice for one week, or `null` when the user never picked one. */
export function readSeminarView(semesterId: string, week: number): SeminarView | null {
	if (typeof window === "undefined") return null;
	try {
		const stored = window.localStorage.getItem(storageKey(semesterId, week));
		return stored === "flow" || stored === "override" ? stored : null;
	} catch {
		return null;
	}
}

export function writeSeminarView(
	semesterId: string,
	week: number,
	view: SeminarView,
): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(storageKey(semesterId, week), view);
	} catch {
		// Private mode or a full quota: the toggle still works for this visit.
	}
}
