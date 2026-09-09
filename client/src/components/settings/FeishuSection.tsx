"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFeishuConfig, saveFeishuConfig } from "@/lib/api";
import { toast } from "sonner";

export function FeishuSection() {
	const [appId, setAppId] = useState("");
	const [appSecret, setAppSecret] = useState("");
	const [configured, setConfigured] = useState(false);
	const [secretConfigured, setSecretConfigured] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		getFeishuConfig()
			.then((response) => {
				setAppId(response.app_id);
				setConfigured(response.configured);
				setSecretConfigured(response.app_secret_configured);
			})
			.catch((error) => {
				toast.error(error instanceof Error ? error.message : "读取飞书配置失败。");
			})
			.finally(() => setIsLoading(false));
	}, []);

	const save = async () => {
		if (!appId.trim()) {
			toast.error("app_id 不能为空。");
			return;
		}
		setIsSaving(true);
		try {
			const response = await saveFeishuConfig({
				app_id: appId.trim(),
				app_secret: appSecret,
			});
			setConfigured(response.configured);
			setSecretConfigured(response.app_secret_configured);
			setAppSecret("");
			toast.success("飞书凭据已加密保存。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存飞书凭据失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-1">
						<CardTitle>飞书应用凭据</CardTitle>
						<CardDescription>
							保存在数据库中并加密，页面上不会回显密钥。也可通过 `.env` 注入。
						</CardDescription>
					</div>
					{configured ? (
						<Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
							已配置
						</Badge>
					) : (
						<Badge variant="secondary" className="bg-muted text-muted-foreground">
							未配置
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在读取...
					</div>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="feishu-app-id">App ID</Label>
							<Input
								id="feishu-app-id"
								value={appId}
								onChange={(event) => setAppId(event.target.value)}
								disabled={isSaving}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="feishu-app-secret">App Secret</Label>
							<Input
								id="feishu-app-secret"
								type="password"
								value={appSecret}
								onChange={(event) => setAppSecret(event.target.value)}
								placeholder={secretConfigured ? "已保存；输入新密钥以替换" : "请输入 App Secret"}
								disabled={isSaving}
								autoComplete="off"
							/>
						</div>
						<Button onClick={save} disabled={isSaving}>
							{isSaving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Save className="mr-2 h-4 w-4" />
							)}
							保存凭据
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
