"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWeeklyPushConfig, saveWeeklyPushConfig } from "@/lib/api";
import type { WeeklyPushTeacher } from "@/lib/schema";
import { toast } from "sonner";

/**
 * The teacher list is not editable here: it mirrors the address book's Tenure
 * department. Only the admin target, used for the pre-send review, is stored.
 */
export function WeeklyPushSection() {
	const [teachers, setTeachers] = useState<WeeklyPushTeacher[]>([]);
	const [department, setDepartment] = useState("Tenure");
	const [adminOpenId, setAdminOpenId] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		getWeeklyPushConfig()
			.then((response) => {
				setTeachers(response.teachers);
				setDepartment(response.teacher_department);
				setAdminOpenId(response.admin_open_id);
			})
			.catch((error) => {
				toast.error(error instanceof Error ? error.message : "读取周报推送配置失败。");
			})
			.finally(() => setIsLoading(false));
	}, []);

	const save = async () => {
		setIsSaving(true);
		try {
			const response = await saveWeeklyPushConfig({ admin_open_id: adminOpenId.trim() });
			setTeachers(response.teachers);
			setDepartment(response.teacher_department);
			setAdminOpenId(response.admin_open_id);
			toast.success("周报推送配置已保存。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存周报推送配置失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="space-y-1">
					<CardTitle>周报老师推送</CardTitle>
					<CardDescription>
						老师名单自动取通讯录「{department}」部门的成员，同步人员后即更新，无需手动维护。
					</CardDescription>
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
							<Label>老师名单</Label>
							{teachers.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									没有在通讯录里找到「{department}」部门的成员，请先同步人员。
								</p>
							) : (
								<ul className="space-y-2">
									{teachers.map((teacher) => (
										<li
											key={teacher.name}
											className="flex flex-wrap items-center gap-2 text-sm"
										>
											<span className="font-medium">{teacher.name}</span>
											{teacher.open_id ? (
												<span className="font-mono text-xs text-muted-foreground">
													{teacher.open_id}
												</span>
											) : (
												<Badge
													variant="secondary"
													className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
												>
													缺少飞书账号
												</Badge>
											)}
										</li>
									))}
								</ul>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="weekly-push-admin">管理员 open_id</Label>
							<Input
								id="weekly-push-admin"
								value={adminOpenId}
								onChange={(event) => setAdminOpenId(event.target.value)}
								placeholder="先发给管理员的飞书 open_id，如 ou_xxx"
								disabled={isSaving}
								autoComplete="off"
							/>
							<p className="text-xs text-muted-foreground">
								发送给老师前可先发给该管理员核对。留空时回退到环境变量 `SMC_ADMIN_OPEN_ID`，再回退到默认管理员。
							</p>
						</div>

						<Button onClick={save} disabled={isSaving}>
							{isSaving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Save className="mr-2 h-4 w-4" />
							)}
							保存配置
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
