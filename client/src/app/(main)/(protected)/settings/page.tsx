"use client"

import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { PasswordSection } from "@/components/settings/PasswordSection";
import { SemesterSection } from "@/components/settings/SemesterSection";
import { FeishuSection } from "@/components/settings/FeishuSection";

function SettingsContent() {
	const { user, loading } = useAuth();

	if (loading || !user) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-bold">设置</h1>
				<p className="text-base text-muted-foreground">
					管理你的账号、学期参数与飞书应用凭据。
				</p>
			</div>
			<ProfileSection />
			<PasswordSection />
			<SemesterSection />
			<FeishuSection />
		</div>
	);
}

export default function SettingsPage() {
	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center h-full">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<SettingsContent />
		</Suspense>
	);
}
