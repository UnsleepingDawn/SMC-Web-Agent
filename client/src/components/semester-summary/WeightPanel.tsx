"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	DEFAULT_WEIGHTS,
	METRIC_KEYS,
	METRIC_LABELS,
	type MetricKey,
	type MetricWeights,
} from "@/lib/semesterScore";

interface WeightPanelProps {
	weights: MetricWeights;
	onChange: (next: MetricWeights) => void;
	onReset: () => void;
}

/** Normalize a raw input to a non-negative number; blanks read as 0. */
function parseWeight(value: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.min(100, parsed);
}

/**
 * Three percentage inputs, one per metric. The total does not have to be 100:
 * the score is a weighted mean, so only the ratio between the weights matters.
 */
export function WeightPanel({ weights, onChange, onReset }: WeightPanelProps) {
	const total = METRIC_KEYS.reduce((sum, key) => sum + weights[key], 0);
	const isDefault = METRIC_KEYS.every((key) => weights[key] === DEFAULT_WEIGHTS[key]);

	const patch = (key: MetricKey, value: string) => {
		onChange({ ...weights, [key]: parseWeight(value) });
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle>综合得分权重</CardTitle>
						<CardDescription>
							调整三项指标在综合得分里的占比，排名与后 20% 会立即重算。
							{total > 0 ? `当前合计 ${total}%。` : "当前合计为 0，无法计算得分。"}
						</CardDescription>
					</div>
					<Button variant="outline" size="sm" onClick={onReset} disabled={isDefault}>
						<RotateCcw className="mr-2 h-4 w-4" />
						恢复默认
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 sm:grid-cols-3">
					{METRIC_KEYS.map((key) => (
						<div key={key} className="space-y-2">
							<Label htmlFor={`weight-${key}`}>{METRIC_LABELS[key]}（%）</Label>
							<Input
								id={`weight-${key}`}
								type="number"
								min={0}
								max={100}
								step={5}
								value={weights[key]}
								onChange={(event) => patch(key, event.target.value)}
							/>
						</div>
					))}
				</div>
				<p className="mt-4 text-xs text-muted-foreground">
					没有数据的指标（例如整学期没有组会出勤记录）会自动从加权中剔除，其余指标按比例重新归一化。
				</p>
			</CardContent>
		</Card>
	);
}
