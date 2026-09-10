"use client";

interface AttendanceBarChartProps {
	data: { name: string; absent: number; late: number }[];
}

/** A dependency-free grouped bar chart for the weekly attendance counts. */
export function AttendanceBarChart({ data }: AttendanceBarChartProps) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">本周没有考勤记录。</p>;
	}

	const max = Math.max(1, ...data.map((item) => Math.max(item.absent, item.late)));

	return (
		<div className="space-y-3">
			<div className="flex items-end gap-4 overflow-x-auto pb-2">
				{data.map((item) => (
					<div key={item.name} className="flex w-14 shrink-0 flex-col items-center gap-1">
						<div className="flex h-40 items-end gap-1">
							<div
								className="w-4 rounded-t bg-rose-500"
								style={{ height: `${(item.absent / max) * 100}%` }}
								title={`缺卡 ${item.absent}`}
							/>
							<div
								className="w-4 rounded-t bg-amber-500"
								style={{ height: `${(item.late / max) * 100}%` }}
								title={`迟到 ${item.late}`}
							/>
						</div>
						<span className="max-w-14 truncate text-xs text-muted-foreground" title={item.name}>
							{item.name}
						</span>
					</div>
				))}
			</div>
			<div className="flex gap-4 text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-rose-500" />
					缺卡
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-3 rounded bg-amber-500" />
					迟到
				</span>
			</div>
		</div>
	);
}
