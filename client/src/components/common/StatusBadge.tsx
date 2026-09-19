import { Badge } from "@/components/ui/badge";
import { JobStatus, NotificationStatus } from "@/lib/schema";

type BadgeStatus = JobStatus | NotificationStatus;

const STATUS_LABELS: Record<BadgeStatus, string> = {
	pending: "等待中",
	running: "进行中",
	completed: "已完成",
	failed: "失败",
	sent: "已发送",
};

const STATUS_CLASSES: Record<BadgeStatus, string> = {
	pending: "bg-muted text-muted-foreground",
	running: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
	completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
	failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
	sent: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
	return (
		<Badge variant="secondary" className={STATUS_CLASSES[status] ?? ""}>
			{STATUS_LABELS[status] ?? status}
		</Badge>
	);
}
