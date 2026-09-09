import { cn } from "@/lib/utils";

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center",
                className,
            )}
        >
            {icon ? <div className="text-muted-foreground">{icon}</div> : null}
            <div className="space-y-1">
                <p className="font-medium">{title}</p>
                {description ? (
                    <p className="max-w-md text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {action}
        </div>
    );
}
