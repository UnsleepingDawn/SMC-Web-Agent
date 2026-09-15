"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePresentations, updateSeminar } from "@/lib/api";
import { Seminar, SeminarPresentation } from "@/lib/schema";
import { toast } from "sonner";

function emptyPresentation(track: number): SeminarPresentation {
	return { track, presenter_name: "", title: "", abstract: "" };
}

interface SeminarEditorDialogProps {
	seminar: Seminar | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}

export function SeminarEditorDialog({ seminar, open, onOpenChange, onSaved }: SeminarEditorDialogProps) {
	const [room, setRoom] = useState("");
	const [offlineAdvisor, setOfflineAdvisor] = useState("");
	const [happened, setHappened] = useState(false);
	const [presentations, setPresentations] = useState<SeminarPresentation[]>([]);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!seminar) return;
		setRoom(seminar.room ?? "");
		setOfflineAdvisor(seminar.offline_advisor ?? "");
		setHappened(seminar.happened);
		setPresentations(
			seminar.presentations.length > 0
				? seminar.presentations.map((item) => ({ ...item }))
				: [emptyPresentation(1)],
		);
	}, [seminar]);

	const patchPresentation = (index: number, partial: Partial<SeminarPresentation>) => {
		setPresentations((prev) =>
			prev.map((item, i) => (i === index ? { ...item, ...partial } : item)),
		);
	};

	const save = async () => {
		if (!seminar) return;
		const tracks = presentations.map((item) => item.track);
		if (new Set(tracks).size !== tracks.length) {
			toast.error("Track 序号不能重复。");
			return;
		}
		if (presentations.some((item) => !item.presenter_name.trim() || !item.title.trim())) {
			toast.error("报告人和主题都不能为空。");
			return;
		}
		setIsSaving(true);
		try {
			await updateSeminar(seminar.id, {
				room: room || null,
				offline_advisor: offlineAdvisor || null,
				happened,
			});
			await updatePresentations(
				seminar.id,
				presentations.map((item) => ({
					...item,
					presenter_name: item.presenter_name.trim(),
					title: item.title.trim(),
				})),
			);
			toast.success("已保存组会安排。");
			onOpenChange(false);
			onSaved();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存组会失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>编辑组会</DialogTitle>
					<DialogDescription>
						{seminar ? `第 ${seminar.week} 周 · Track 沿用组会表的「顺序」值` : ""}
					</DialogDescription>
				</DialogHeader>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="room">线下地点</Label>
						<Input
							id="room"
							value={room}
							onChange={(event) => setRoom(event.target.value)}
							placeholder="如：实验楼 302"
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="offline_advisor">线下指导老师</Label>
						<Input
							id="offline_advisor"
							value={offlineAdvisor}
							onChange={(event) => setOfflineAdvisor(event.target.value)}
							placeholder="如：王老师"
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="happened">状态</Label>
						<Input
							id="happened"
							value={happened ? "已举行" : "预告中"}
							readOnly
							className="bg-muted"
						/>
					</div>
				</div>

				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<Label>报告安排</Label>
						<Button
							variant="outline"
							size="sm"
							disabled={isSaving}
							onClick={() =>
								setPresentations((prev) => [
									...prev,
									// Track 沿用组会表的「顺序」值，可能跳号，所以取最大值递增
									// 而不是用长度，避免撞上已有编号。
									emptyPresentation(
										prev.reduce((max, item) => Math.max(max, item.track), 0) + 1,
									),
								])
							}
						>
							<Plus className="mr-2 h-4 w-4" />
							添加 Track
						</Button>
					</div>

					{presentations.map((presentation, index) => (
						<div key={index} className="space-y-3 rounded-md border p-4">
							<div className="flex items-center gap-3">
								<div className="w-24 space-y-2">
									<Label>Track</Label>
									<Input
										type="number"
										min={1}
										value={presentation.track}
										onChange={(event) =>
											patchPresentation(index, { track: Number(event.target.value) })
										}
										disabled={isSaving}
									/>
								</div>
								<div className="flex-1 space-y-2">
									<Label>报告人</Label>
									<Input
										value={presentation.presenter_name}
										onChange={(event) =>
											patchPresentation(index, { presenter_name: event.target.value })
										}
										disabled={isSaving}
									/>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="mt-6"
									disabled={isSaving || presentations.length === 1}
									onClick={() =>
										setPresentations((prev) => prev.filter((_, i) => i !== index))
									}
									aria-label="删除该 Track"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
							<div className="space-y-2">
								<Label>主题</Label>
								<Input
									value={presentation.title}
									onChange={(event) =>
										patchPresentation(index, { title: event.target.value })
									}
									disabled={isSaving}
								/>
							</div>
							<div className="space-y-2">
								<Label>简介</Label>
								<Textarea
									value={presentation.abstract ?? ""}
									onChange={(event) =>
										patchPresentation(index, { abstract: event.target.value })
									}
									rows={2}
									disabled={isSaving}
								/>
							</div>
						</div>
					))}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
						取消
					</Button>
					<Button onClick={save} disabled={isSaving}>
						{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						保存
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
