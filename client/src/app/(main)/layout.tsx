import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "../globals.css";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider } from "@/lib/auth";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/providers";
import { SidebarController } from "@/components/utils/SidebarAutoCollapse";
import { MobileSidebarTrigger } from "@/components/utils/MobileSidebarTrigger";

const geistSans = localFont({
	variable: "--font-geist-sans",
	src: "../fonts/Geist.woff2",
	display: "swap",
});

const geistMono = localFont({
	variable: "--font-geist-mono",
	src: "../fonts/GeistMono.woff2",
	display: "swap",
});

export const metadata: Metadata = {
	title: "SMC-Web-Agent",
	description: "SMCLab 日常事务管理：人员主数据、组会预告与周报统计。",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Read the persisted sidebar state server-side so a freshly-mounted sidebar
	// renders collapsed from the very first paint, instead of defaulting open
	// and animating shut after hydration.
	const cookieStore = await cookies();
	const sidebarState = cookieStore.get("sidebar_state")?.value;
	const defaultOpen = sidebarState !== "false";

	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				<script
					id="theme-script"
					dangerouslySetInnerHTML={{
						__html: `
      try {
        if (localStorage.getItem('darkMode') === 'dark' ||
            (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {}
    `,
					}}
				/>
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ThemeProvider>
					<AuthProvider>
						<SidebarProvider defaultOpen={defaultOpen}>
							<AppSidebar />
							<SidebarInset>
								<MobileSidebarTrigger />
								<SidebarController>
									{children}
								</SidebarController>
							</SidebarInset>
						</SidebarProvider>
					</AuthProvider>
				</ThemeProvider>
				<Toaster
					position="top-right"
					richColors
					duration={3000}
				/>
			</body>
		</html>
	);
}
