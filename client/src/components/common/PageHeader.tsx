import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
            <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                {description ? (
                    <p className="text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}
