"use client";

import { useState } from "react";
import { Loader2, Pencil, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MessagePreview } from "@/components/common/MessagePreview";
import { RecipientPicker } from "@/components/common/RecipientPicker";
import { previewSeminar, pushSeminar } from "@/lib/api";
import { PostMessage, Recipient, Seminar, Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { formatHhmm } from "@/lib/utils";
import { toast } from "sonner";

interface SeminarCardProps {
	seminar: Seminar;
	semester?: Semester | null;
	onEdit: (seminar: Seminar) => void;
	onChanged: () => void;
}

/**
 * This occurrence's window, as the preview post renders it: "14:00 - 15:30".
 * The slot's own times win; otherwise the semester default applies.
 */
function seminarTimeRange(seminar: Seminar, semester?: Semester | null): string {
	const start = formatHhmm(seminar.start_time ?? semester?.default_seminar_start_time);
	const end = formatHhmm(seminar.end_time ?? semester?.default_seminar_end_time);
	if (!start || !end) return "";
	return `${start} - ${end}`;
}

export function SeminarCard({ seminar, semester, onEdit, onChanged }: SeminarCardProps) {
	const [recipient, setRecipient] = useState<Recipient | null>(null);
	const [preview, setPreview] = useState<PostMessage | null>(null);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [isPushing, setIsPushing] = useState(false);
	const timeRange = seminarTimeRange(seminar, semester);

	const handlePreview = async () => {
		setIsPreviewing(true);
		try {
			const response = await previewSeminar(seminar.semester_id, seminar.week);
			setPreview(response.payload);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "渲染预告失败。");
		} finally {
			setIsPreviewing(false);
		}
	};

	const handlePush = async () => {
		if (!recipient) {
			toast.error("请选择要推送的接收者。");
			return;
		}
		setIsPushing(true);
		try {
			await pushSeminar(seminar.semester_id, seminar.week, {
				receive_id: recipient.receive_id,
				receive_id_type: recipient.receive_id_type,
			});
			toast.success("已提交推送任务。");
			onChanged();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "推送失败。");
		} finally {
			setIsPushing(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-1">
						<CardTitle className="text-lg">
							第 {seminar.week} 周 · {WEEKDAY_NAMES[seminar.weekday - 1] ?? ""}
							{timeRange ? ` · ${timeRange}` : ""}
						</CardTitle>
						<CardDescription>
							{seminar.room || "地点待定"}
							{seminar.offline_advisor ? ` · 线下指导老师：${seminar.offline_advisor}` : ""}
							{seminar.happened ? " · 已举行" : ""}
						</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						{seminar.presentations.length === 0 ? (
							<Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
								待安排
							</Badge>
						) : null}
						<Button variant="outline" size="sm" onClick={() => onEdit(seminar)}>
							<Pencil className="mr-2 h-4 w-4" />
							编辑
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{seminar.presentations.length > 0 ? (
					<ul className="space-y-3">
						{seminar.presentations.map((presentation) => (
							<li key={presentation.track} className="space-y-1 border-l-2 pl-3">
								<p className="text-xs text-muted-foreground">
									Track {presentation.track} · {presentation.presenter_name}
								</p>
								<p className="text-sm font-medium">{presentation.title}</p>
								{presentation.abstract ? (
									<p className="text-xs text-muted-foreground">{presentation.abstract}</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">还没有安排报告人。</p>
				)}

				{seminar.happened ? null : (
					<div className="space-y-3 border-t pt-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<div className="flex-1 space-y-2">
								<Label>接收者</Label>
								<RecipientPicker
									value={recipient}
									onChange={setRecipient}
									disabled={isPushing}
								/>
							</div>
							<div className="flex gap-2">
								<Button variant="outline" onClick={handlePreview} disabled={isPreviewing}>
									{isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
									预览
								</Button>
								<Button onClick={handlePush} disabled={isPushing}>
									{isPushing ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<Send className="mr-2 h-4 w-4" />
									)}
									推送预告
								</Button>
							</div>
						</div>
						{preview ? <MessagePreview message={preview} /> : null}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
