"use client"

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

function safeReturnTo(pathname: string): string {
	if (!pathname.startsWith("/") || pathname.startsWith("//")) {
		return "/";
	}
	return pathname;
}

/** Gates protected routes behind the local account session. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (loading) return;
		if (!user) {
			router.replace(`/login?returnTo=${encodeURIComponent(safeReturnTo(pathname))}`);
		}
	}, [loading, user, pathname, router]);

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-3rem)] w-full items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!user) return null;
	return <>{children}</>;
}
