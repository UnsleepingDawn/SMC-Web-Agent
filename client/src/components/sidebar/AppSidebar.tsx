"use client"

import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useIsDarkMode } from "@/hooks/useDarkMode";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarNav } from "./SidebarNav";
import { AppSidebarFooter } from "./SidebarFooter";

export function AppSidebar() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { darkMode, toggleDarkMode } = useIsDarkMode();
    const isMobile = useIsMobile();

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    }

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="relative h-12 flex-row items-center justify-between gap-0 border-b pl-4 pr-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                <Link href="/" className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                    <FlaskConical className="size-7 text-primary" />
                    <span className="text-lg font-semibold whitespace-nowrap">SMC-Web-Agent</span>
                </Link>
                <SidebarTrigger className="size-9 [&>svg]:size-5 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:left-1/2 group-data-[collapsible=icon]:-translate-x-1/2" />
            </SidebarHeader>
            <SidebarContent>
                <SidebarNav user={user} />
            </SidebarContent>
            <AppSidebarFooter
                user={user}
                isMobile={isMobile}
                darkMode={darkMode}
                onToggleDarkMode={toggleDarkMode}
                onLogout={handleLogout}
            />
        </Sidebar>
    )
}
