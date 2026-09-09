"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { createSemester, updateSemester } from "@/lib/api";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { toast } from "sonner";

type SemesterFormState = {
	name: string;
	start_date: string;
	default_seminar_weekday: number;
	default_seminar_start_time: string;
	default_seminar_end_time: string;
	default_seminar_tencent_id: string;
	default_seminar_tencent_link: string;
	weekly_report_app_token: string;
	weekly_report_table_id: string;
	weekly_report_url: string;
	seminar_app_token: string;
	seminar_table_id: string;
	seminar_url: string;
	seminar_leave_app_token: string;
	seminar_leave_table_id: string;
	seminar_leave_url: string;
	schedule_app_token: string;
	schedule_table_id: string;
	schedule_url: string;
};

const EMPTY_FORM: SemesterFormState = {
	name: "",
	start_date: "",
	default_seminar_weekday: 4,
	default_seminar_start_time: "1900",
	default_seminar_end_time: "2030",
	default_seminar_tencent_id: "",
	default_seminar_tencent_link: "",
	weekly_report_app_token: "",
	weekly_report_table_id: "",
	weekly_report_url: "",
	seminar_app_token: "",
	seminar_table_id: "",
	seminar_url: "",
	seminar_leave_app_token: "",
	seminar_leave_table_id: "",
	seminar_leave_url: "",
	schedule_app_token: "",
	schedule_table_id: "",
	schedule_url: "",
};

const BITABLE_FIELDS = [
	{ prefix: "seminar", label: "组会表" },
	{ prefix: "weekly_report", label: "周报表" },
	{ prefix: "seminar_leave", label: "请假表" },
	{ prefix: "schedule", label: "课表" },
] as const;

function fromSemester(semester: Semester): SemesterFormState {
	return {
		...EMPTY_FORM,
		name: semester.name,
		start_date: semester.start_date,
		default_seminar_weekday: semester.default_seminar_weekday,
		default_seminar_start_time: semester.default_seminar_start_time,
		default_seminar_end_time: semester.default_seminar_end_time,
		default_seminar_tencent_id: semester.default_seminar_tencent_id ?? "",
		default_seminar_tencent_link: semester.default_seminar_tencent_link ?? "",
		weekly_report_app_token: semester.weekly_report_app_token ?? "",
		weekly_report_table_id: semester.weekly_report_table_id ?? "",
		weekly_report_url: semester.weekly_report_url ?? "",
		seminar_app_token: semester.seminar_app_token ?? "",
		seminar_table_id: semester.seminar_table_id ?? "",
		seminar_url: semester.seminar_url ?? "",
		seminar_leave_app_token: semester.seminar_leave_app_token ?? "",
		seminar_leave_table_id: semester.seminar_leave_table_id ?? "",
		seminar_leave_url: semester.seminar_leave_url ?? "",
		schedule_app_token: semester.schedule_app_token ?? "",
		schedule_table_id: semester.schedule_table_id ?? "",
		schedule_url: semester.schedule_url ?? "",
	};
}

interface SemesterFormDialogProps {
	semester: Semester | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}

export function SemesterFormDialog({ semester, open, onOpenChange, onSaved }: SemesterFormDialogProps) {
	const [form, setForm] = useState<SemesterFormState>(EMPTY_FORM);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		setForm(semester ? fromSemester(semester) : EMPTY_FORM);
	}, [semester, open]);

	const patch = (partial: Partial<SemesterFormState>) => setForm((prev) => ({ ...prev, ...partial }));

	const save = async () => {
		if (!form.name.trim()) {
			toast.error("学期名称不能为空。");
			return;
		}
		if (!form.start_date) {
			toast.error("请填写开学日期（第 1 周周一）。");
			return;
		}
		const payload = {
			...form,
			name: form.name.trim(),
			default_seminar_tencent_id: form.default_seminar_tencent_id || null,
			default_seminar_tencent_link: form.default_seminar_tencent_link || null,
		};
		setIsSaving(true);
		try {
			if (semester) {
				await updateSemester(semester.id, payload);
			} else {
				await createSemester(payload);
			}
			toast.success(semester ? "学期已更新。" : "学期已创建。");
			onOpenChange(false);
			onSaved();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存学期失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{semester ? "编辑学期" : "新建学期"}</DialogTitle>
					<DialogDescription>
						学期参数与四张飞书多维表信息，同步与预告推送都依赖这里。
					</DialogDescription>
				</DialogHeader>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="semester-name">学期名称</Label>
						<Input
							id="semester-name"
							value={form.name}
							onChange={(event) => patch({ name: event.target.value })}
							placeholder="如：2026-Fall"
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="semester-start">开学日期（第 1 周周一）</Label>
						<Input
							id="semester-start"
							type="date"
							value={form.start_date}
							onChange={(event) => patch({ start_date: event.target.value })}
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label>默认组会星期</Label>
						<Select
							value={String(form.default_seminar_weekday)}
							onValueChange={(value) => patch({ default_seminar_weekday: Number(value) })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{WEEKDAY_NAMES.map((label, index) => (
									<SelectItem key={label} value={String(index + 1)}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="seminar-start-time">开始时间</Label>
							<Input
								id="seminar-start-time"
								value={form.default_seminar_start_time}
								onChange={(event) => patch({ default_seminar_start_time: event.target.value })}
								placeholder="1900"
								disabled={isSaving}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="seminar-end-time">结束时间</Label>
							<Input
								id="seminar-end-time"
								value={form.default_seminar_end_time}
								onChange={(event) => patch({ default_seminar_end_time: event.target.value })}
								placeholder="2030"
								disabled={isSaving}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tencent-id">腾讯会议号</Label>
						<Input
							id="tencent-id"
							value={form.default_seminar_tencent_id}
							onChange={(event) => patch({ default_seminar_tencent_id: event.target.value })}
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tencent-link">腾讯会议链接</Label>
						<Input
							id="tencent-link"
							value={form.default_seminar_tencent_link}
							onChange={(event) => patch({ default_seminar_tencent_link: event.target.value })}
							disabled={isSaving}
						/>
					</div>
				</div>

				<div className="space-y-4">
					<Label>飞书多维表</Label>
					{BITABLE_FIELDS.map(({ prefix, label }) => (
						<div key={prefix} className="grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-3">
							<div className="space-y-2 sm:col-span-3">
								<Label className="text-xs text-muted-foreground">{label}</Label>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-app-token`}>app_token</Label>
								<Input
									id={`${prefix}-app-token`}
									value={form[`${prefix}_app_token` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_app_token`]: event.target.value } as Partial<SemesterFormState>)
									}
									disabled={isSaving}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-table-id`}>table_id</Label>
								<Input
									id={`${prefix}-table-id`}
									value={form[`${prefix}_table_id` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_table_id`]: event.target.value } as Partial<SemesterFormState>)
									}
									disabled={isSaving}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-url`}>链接</Label>
								<Input
									id={`${prefix}-url`}
									value={form[`${prefix}_url` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_url`]: event.target.value } as Partial<SemesterFormState>)
									}
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
