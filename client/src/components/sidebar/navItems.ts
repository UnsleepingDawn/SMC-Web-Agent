import {
    CalendarClock,
    CalendarDays,
    ClipboardCheck,
    ClipboardList,
    LayoutDashboard,
    Send,
    Settings,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SidebarNavKey =
    | "home"
    | "members"
    | "seminars"
    | "attendance"
    | "group-meeting"
    | "weekly-reports"
    | "notifications"
    | "settings";

export interface SidebarNavItem {
    key: SidebarNavKey;
    title: string;
    url: string;
    icon: LucideIcon;
    requiresAuth: boolean;
    isWip?: boolean;
}

export const navItems: SidebarNavItem[] = [
    {
        key: "home",
        title: "仪表盘",
        url: "/",
        icon: LayoutDashboard,
        requiresAuth: false,
    },
    {
        key: "members",
        title: "人员管理",
        url: "/members",
        icon: Users,
        requiresAuth: true,
    },
    {
        key: "seminars",
        title: "组会管理",
        url: "/seminars",
        icon: CalendarDays,
        requiresAuth: true,
    },
    {
        key: "attendance",
        title: "考勤统计",
        url: "/attendance",
        icon: ClipboardCheck,
        requiresAuth: true,
    },
    {
        key: "group-meeting",
        title: "小组会议排班",
        url: "/group-meeting",
        icon: CalendarClock,
        requiresAuth: true,
    },
    {
        key: "weekly-reports",
        title: "周报统计",
        url: "/weekly-reports",
        icon: ClipboardList,
        requiresAuth: true,
    },    {
        key: "notifications",
        title: "推送历史",
        url: "/notifications",
        icon: Send,
        requiresAuth: true,
    },
    {
        key: "settings",
        title: "设置",
        url: "/settings",
        icon: Settings,
        requiresAuth: true,
    },
];
