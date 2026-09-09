"use client"

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchFromApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export function ProfileSection() {
	const { user, refreshUser } = useAuth();
	const [name, setName] = useState(user?.name ?? "");
	const [isSavingName, setIsSavingName] = useState(false);

	const handleSaveName = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			toast.error("名称不能为空。");
			return;
		}
		setIsSavingName(true);
		try {
			await fetchFromApi("/api/auth/profile", {
				method: "PATCH",
				body: JSON.stringify({ name: trimmed }),
			});
			await refreshUser();
			toast.success("个人资料已更新。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "更新个人资料失败。");
		} finally {
			setIsSavingName(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>个人资料</CardTitle>
				<CardDescription>你的显示名称。</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSaveName} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">名称</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="你的名称"
							disabled={isSavingName}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">邮箱</Label>
						<Input
							id="email"
							value={user?.email ?? ""}
							disabled
							title={user?.email}
							className="bg-muted truncate"
						/>
					</div>
					<Button type="submit" disabled={isSavingName || !name.trim()}>
						{isSavingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						保存
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
