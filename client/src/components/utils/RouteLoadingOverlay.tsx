"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { subscribePendingRequests } from "@/lib/api";

/** Minimum time the overlay stays visible, to avoid a distracting flicker. */
const MIN_VISIBLE_MS = 300;
/** Grace period after the route changes, letting the new page fire its first requests. */
const SETTLE_DELAY_MS = 120;
/** Hard cap so a long-running or polling request can never pin the overlay. */
const MAX_VISIBLE_MS = 4000;
/** How often the overlay re-checks whether it can hide. */
const RECHECK_INTERVAL_MS = 60;

/** Returns true when the click targets an in-app link leading to another route. */
function isInternalNavigation(event: MouseEvent): boolean {
	if (event.button !== 0) return false;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

	const target = event.target;
	if (!(target instanceof Element)) return false;

	const anchor = target.closest("a");
	if (!anchor) return false;
	if (anchor.target && anchor.target !== "_self") return false;
	if (anchor.hasAttribute("download")) return false;

	const href = anchor.getAttribute("href");
	if (!href || !href.startsWith("/")) return false;

	const targetPath = href.split(/[?#]/)[0];
	return targetPath !== window.location.pathname;
}

/** Full-screen overlay shown while a route is switching and its data is loading. */
export function RouteLoadingOverlay() {
	const pathname = usePathname();
	const [visible, setVisible] = useState(false);

	const visibleRef = useRef(false);
	const visibleSinceRef = useRef(0);
	const routeChangedAtRef = useRef<number | null>(null);
	const pendingRequestsRef = useRef(0);
	const previousPathnameRef = useRef(pathname);

	const hide = useCallback(() => {
		visibleRef.current = false;
		setVisible(false);
	}, []);

	const show = useCallback(() => {
		visibleRef.current = true;
		visibleSinceRef.current = Date.now();
		routeChangedAtRef.current = null;
		setVisible(true);
	}, []);

	const recheck = useCallback(() => {
		if (!visibleRef.current) return;

		const now = Date.now();
		if (now - visibleSinceRef.current >= MAX_VISIBLE_MS) {
			hide();
			return;
		}

		const routeChangedAt = routeChangedAtRef.current;
		if (routeChangedAt === null) return;
		if (now - routeChangedAt < SETTLE_DELAY_MS) return;
		if (pendingRequestsRef.current > 0) return;
		if (now - visibleSinceRef.current < MIN_VISIBLE_MS) return;

		hide();
	}, [hide]);

	useEffect(
		() =>
			subscribePendingRequests((count) => {
				pendingRequestsRef.current = count;
			}),
		[],
	);

	useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			if (isInternalNavigation(event)) show();
		};
		const handlePopState = () => show();

		document.addEventListener("click", handleClick, true);
		window.addEventListener("popstate", handlePopState);
		return () => {
			document.removeEventListener("click", handleClick, true);
			window.removeEventListener("popstate", handlePopState);
		};
	}, [show]);

	useEffect(() => {
		if (previousPathnameRef.current === pathname) return;
		previousPathnameRef.current = pathname;
		routeChangedAtRef.current = Date.now();
	}, [pathname]);

	useEffect(() => {
		if (!visible) return;
		recheck();
		const interval = window.setInterval(recheck, RECHECK_INTERVAL_MS);
		return () => window.clearInterval(interval);
	}, [visible, recheck]);

	if (!visible) return null;

	return (
		<div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm duration-150">
			<div className="flex flex-col items-center gap-3">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<span className="text-sm text-muted-foreground">加载中…</span>
			</div>
		</div>
	);
}
