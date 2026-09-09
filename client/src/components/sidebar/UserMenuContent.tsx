"use client"

import Link from "next/link";
import {
    LogOut,
    Moon,
    Settings,
    Sun,
    User as UserIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { User } from "@/lib/auth";
import { getAlphaHashToBackgroundColor, getInitials } from "@/lib/utils";

export const UserAvatar = ({ user, className, iconSize }: { user: User, className: string, iconSize: number }) => {
    const displayName = user.name || user.email;

    return (
        <Avatar className={className}>
            {user.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : null}
            <AvatarFallback className={displayName ? getAlphaHashToBackgroundColor(displayName) : "bg-muted text-muted-foreground"}>
                {displayName ? getInitials(displayName) : <UserIcon size={iconSize} />}
            </AvatarFallback>
        </Avatar>
    );
};

export const UserMenuContent = ({
    user,
    handleLogout,
    toggleDarkMode,
    darkMode,
}: {
    user: User,
    handleLogout: () => void,
    toggleDarkMode: () => void,
    darkMode: boolean,
}) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 p-3">
            <UserAvatar user={user} className="h-10 w-10 shrink-0" iconSize={24} />
            <div className="min-w-0 flex-1">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <h3 className="truncate font-medium">{user.name || user.email}</h3>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-72 break-words text-left">
                        {user.name || user.email}
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-72 break-words text-left">
                        {user.email}
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
        <Link href="/settings" className="w-full">
            <Button variant="ghost" className="w-full justify-start">
                <Settings size={16} className="mr-2" />
                设置
            </Button>
        </Link>
        {/* Dark Mode Toggle */}
        <Button onClick={toggleDarkMode} variant="ghost" className="w-full justify-start">
            {darkMode ? <Sun size={16} className="mr-2" /> : <Moon size={16} className="mr-2" />}
            {darkMode ? '浅色模式' : '深色模式'}
        </Button>
        <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={handleLogout}
        >
            <LogOut size={16} className="mr-2" />
            退出登录
        </Button>
    </div>
)
