"use client";

import { Loader2 } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useNotifications } from "@/hooks/useNotifications";

function formatTime(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function NotificationsPage() {
	const { notifications, isLoading, error } = useNotifications();

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
			<PageHeader title="推送历史" description="所有飞书消息的发送记录与结果。" />

			{error ? <p className="text-sm text-destructive">{error.message}</p> : null}

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					正在加载...
				</div>
			) : notifications.length === 0 ? (
				<EmptyState
					title="还没有推送记录"
					description="在组会管理或周报统计页发起推送后，这里会显示发送结果。"
				/>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>时间</TableHead>
								<TableHead>模板</TableHead>
								<TableHead>接收者</TableHead>
								<TableHead>状态</TableHead>
								<TableHead>错误</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{notifications.map((notification) => (
								<TableRow key={notification.id}>
									<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
										{formatTime(notification.sent_at ?? notification.created_at)}
									</TableCell>
									<TableCell className="font-medium">{notification.template_key}</TableCell>
									<TableCell className="max-w-48 truncate font-mono text-xs">
										{notification.target}
									</TableCell>
									<TableCell>
										<StatusBadge status={notification.status} />
									</TableCell>
									<TableCell className="max-w-64 truncate text-xs text-destructive">
										{notification.error || "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
