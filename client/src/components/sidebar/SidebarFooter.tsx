"use client"

import { ChevronsUpDown, User as UserIcon } from "lucide-react";
import {
    SidebarFooter,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet";
import { User } from "@/lib/auth";
import { UserAvatar, UserMenuContent } from "./UserMenuContent";

interface AppSidebarFooterProps {
    user: User | null;
    isMobile: boolean;
    darkMode: boolean;
    onToggleDarkMode: () => void;
    onLogout: () => void;
}

export function AppSidebarFooter({
    user,
    isMobile,
    darkMode,
    onToggleDarkMode,
    onLogout,
}: AppSidebarFooterProps) {
    return (
        <SidebarFooter>
            {/* User Profile (if logged in) */}
            {user && (
                <SidebarMenuItem className="mb-2">
                    {isMobile ? (
                        <Sheet>
                            <SheetTrigger asChild>
                                <SidebarMenuButton className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                                    <span className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:flex-initial">
                                        <UserAvatar user={user} className="h-6 w-6 shrink-0" iconSize={16} />
                                        <span className="truncate group-data-[collapsible=icon]:hidden">{user.name || user.email}</span>
                                    </span>
                                    <ChevronsUpDown className="h-4 w-4 shrink-0 group-data-[collapsible=icon]:hidden" />
                                </SidebarMenuButton>
                            </SheetTrigger>
                            <SheetContent side="bottom">
                                <UserMenuContent user={user} handleLogout={onLogout} toggleDarkMode={onToggleDarkMode} darkMode={darkMode} />
                            </SheetContent>
                        </Sheet>
                    ) : (
                        <Popover>
                            <PopoverTrigger asChild>
                                <SidebarMenuButton className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                                    <span className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:flex-initial">
                                        <UserAvatar user={user} className="h-6 w-6 shrink-0" iconSize={16} />
                                        <span className="truncate group-data-[collapsible=icon]:hidden">{user.name || user.email}</span>
                                    </span>
                                    <ChevronsUpDown className="h-4 w-4 shrink-0 group-data-[collapsible=icon]:hidden" />
                                </SidebarMenuButton>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-1" align="start">
                                <UserMenuContent user={user} handleLogout={onLogout} toggleDarkMode={onToggleDarkMode} darkMode={darkMode} />
                            </PopoverContent>
                        </Popover>
                    )}
                </SidebarMenuItem>
            )}

            {/* Login button (if not logged in) */}
            {!user && (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                        <a
                            href="/login"
                            className="w-full flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 rounded-md transition-colors group-data-[collapsible=icon]:justify-center"
                        >
                            <UserIcon size={16} />
                            <span className="font-medium group-data-[collapsible=icon]:hidden">登录</span>
                        </a>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
        </SidebarFooter>
    )
}
