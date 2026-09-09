'use client';

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";

export function SidebarController({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { setOpenMobile } = useSidebar();

    useEffect(() => {
        // Only close the mobile sidebar on navigation (it's an overlay).
        // The desktop sidebar keeps its state unless the user toggles it.
        setOpenMobile(false);
    }, [pathname, setOpenMobile]);

    return <>{children}</>;
}
