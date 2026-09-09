"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Floating mobile-only trigger for the app sidebar. The desktop sidebar keeps
// its toggle inside its own header; on mobile the sidebar is an overlay sheet
// with no trigger of its own, so this button is the only way to open it.
export function MobileSidebarTrigger() {
    const pathname = usePathname();
    if (pathname === "/login") return null;

    return (
        <div className="fixed left-2 top-2 z-40 md:hidden">
            <SidebarTrigger className="size-9 rounded-md border bg-background/80 backdrop-blur-sm shadow-sm" />
        </div>
    );
}
