'use client'

import { useIsDarkMode } from "@/hooks/useDarkMode"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Actually use the hook - this ensures React is aware of the dark mode state
    const { } = useIsDarkMode();

    return <>{children}</>;
}
