"use client"

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/api";
import { toast } from "sonner";

export function PasswordSection() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [saving, setSaving] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentPassword || !newPassword) {
			toast.error("请填写所有密码字段。");
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error("两次输入的新密码不一致。");
			return;
		}
		setSaving(true);
		try {
			await changePassword(currentPassword, newPassword);
			toast.success("密码已修改。");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "修改密码失败。");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>密码</CardTitle>
				<CardDescription>修改你的本地登录密码。</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="current-password">当前密码</Label>
						<Input
							id="current-password"
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							autoComplete="current-password"
							disabled={saving}
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="new-password">新密码</Label>
							<Input
								id="new-password"
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								disabled={saving}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm-password">确认新密码</Label>
							<Input
								id="confirm-password"
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								autoComplete="new-password"
								disabled={saving}
							/>
						</div>
					</div>
					<Button
						type="submit"
						disabled={saving || !currentPassword || !newPassword || !confirmPassword}
					>
						{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						修改密码
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
