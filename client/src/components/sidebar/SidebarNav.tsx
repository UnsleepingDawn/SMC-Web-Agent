"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navItems, SidebarNavKey } from "./navItems";
import { User } from "@/lib/auth";

interface SidebarNavProps {
    user: User | null;
}

function activeKeyFromPath(pathname: string): SidebarNavKey | null {
    if (pathname === "/") return "home";
    const match = navItems.find(
        (item) => item.url !== "/" && pathname.startsWith(item.url),
    );
    return match ? match.key : null;
}

export function SidebarNav({ user }: SidebarNavProps) {
    const pathname = usePathname();
    const activeKey = activeKeyFromPath(pathname);

    return (
        <SidebarGroup className="px-1 pt-3">
            <SidebarGroupContent>
                <SidebarMenu>
                    {navItems.map((item) => {
                        const target = item.requiresAuth && !user ? "/login" : item.url;
                        return (
                            <SidebarMenuItem key={item.key}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={item.key === activeKey}
                                    tooltip={item.title}
                                    className="h-9 [&>svg]:size-5 group-data-[collapsible=icon]:h-9! group-data-[collapsible=icon]:w-9!"
                                >
                                    <Link href={target}>
                                        <item.icon />
                                        <span className="group-data-[collapsible=icon]:hidden">
                                            {item.title}
                                        </span>
                                        {item.isWip && (
                                            <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                                                （开发中）
                                            </span>
                                        )}
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
